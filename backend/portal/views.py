from decimal import Decimal, InvalidOperation
import base64
import json
import mimetypes
import uuid
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Avg, Count, Q
from django.http import FileResponse
from django.http import HttpResponse
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from .models import (
    AIProviderConfig, ActivityLog, Course,
    CourseCategory, EmailNotification, Enrollment, LearningMaterial, MaterialProgress,
    Question, Quiz, QuizAnswer, QuizAttempt, User, InstructorApplication,
    PaymentMethodConfig, Payment, Certificate,
)
from .permissions import IsAdminOrInstructorRole, IsAdminRole
from .serializers import (
    ActivitySerializer, AdminNotificationSerializer, AdminUserSerializer,
    CategorySerializer, CourseSerializer, EnrollmentSerializer, file_url,
    MaterialSerializer, NotificationSerializer, QuestionAttemptSerializer,
    QuizAttemptSerializer, QuizReadSerializer, QuizSerializer, RegistrationSerializer,
    UserSerializer, InstructorApplicationSerializer, PaymentMethodConfigSerializer,
    PaymentSerializer, CertificateSerializer,
)
from .services import (
    AIProviderError, encrypt_key, log_activity, masked_key, normalize_ai_model, queue_email,
    retry_email, generate_assessment_recommendations,
)
from .throttles import AuthRateThrottle, PasswordResetRateThrottle
from .advisor.analysis import analyze_attempt
from .certificate_renderer import render_certificate_pdf


def is_admin(user):
    return user.is_authenticated and user.role == User.Role.ADMIN


def is_instructor(user):
    return user.is_authenticated and user.role == User.Role.INSTRUCTOR


def can_manage_course(user, course):
    if is_instructor(user):
        return course.instructor_id == user.pk
    if is_admin(user):
        return course.instructor_id is None
    return False


def issue_certificate_if_eligible(student, course):
    enrollment = Enrollment.objects.filter(student=student, course=course).first()
    if not enrollment:
        return None
    material_ids = set(course.materials.values_list("id", flat=True))
    completed_ids = set(enrollment.material_progress.values_list("material_id", flat=True))
    quizzes = list(course.quizzes.filter(is_published=True, quiz_type=Quiz.QuizType.COURSE))
    passed_quiz_ids = set(QuizAttempt.objects.filter(student=student, quiz__in=quizzes, passed=True).values_list("quiz_id", flat=True))
    if not material_ids or completed_ids != material_ids or any(quiz.pk not in passed_quiz_ids for quiz in quizzes):
        return None
    instructor_name = (course.instructor.get_full_name() or course.instructor.email) if course.instructor else "PyLearn Admin"
    certificate, _ = Certificate.objects.get_or_create(student=student, course=course, defaults={
        "student_name": student.get_full_name() or student.email,
        "course_title": course.title,
        "instructor_name": instructor_name,
        "eligibility_snapshot": {"materials": len(material_ids), "quizzes": len(quizzes)},
    })
    return certificate


def initial_assessment_recommendations(request, attempt):
    answers = list(
        attempt.answers.select_related("question").order_by("question__order", "question_id")
    )
    correct_topics = [
        answer.question.topic.strip()
        for answer in answers
        if answer.is_correct and answer.question.topic and answer.question.topic.strip()
    ]

    performance = {
        "score": str(attempt.score),
        "max_score": str(attempt.max_score),
        "percentage": str(attempt.percentage),
        "passed": attempt.passed,
        "answers": [
            {
                "topic": answer.question.topic,
                "question": answer.question.prompt,
                "selected_answer": answer.answer,
                "correct_answer": answer.question.correct_answer,
                "is_correct": answer.is_correct,
            }
            for answer in answers
        ],
        "correct": [
            {
                "topic": answer.question.topic,
                "question": answer.question.prompt,
                "selected_answer": answer.answer,
                "correct_answer": answer.question.correct_answer,
            }
            for answer in answers
            if answer.is_correct
        ],
        "incorrect": [
            {
                "topic": answer.question.topic,
                "question": answer.question.prompt,
                "selected_answer": answer.answer,
                "correct_answer": answer.question.correct_answer,
            }
            for answer in answers
            if not answer.is_correct
        ],
    }

    available = (
        Course.objects.filter(status=Course.Status.PUBLISHED)
        .exclude(enrollments__student=request.user)
        .select_related("category")
        .prefetch_related("materials", "enrollments")
        .distinct()
    )
    available_courses = [
        {
            "id": course.pk,
            "title": course.title,
            "description": course.description,
            "category": course.category.name if course.category else "",
            "level": course.level,
        }
        for course in available
    ]
    courses_by_id = {course.pk: course for course in available}

    try:
        raw_recommendations = generate_assessment_recommendations(request.user, performance, available_courses)
    except Exception:
        raw_recommendations = []

    recommendations = []
    for rec in raw_recommendations:
        if not isinstance(rec, dict):
            continue
        try:
            course_id = int(rec.get("course_id"))
        except (TypeError, ValueError):
            continue
        if course_id not in courses_by_id:
            continue
        recommendations.append({
            "course_id": course_id,
            "reason": str(rec.get("reason") or "Best match for your Skill discovery results.")[:500],
        })
        break

    attempt.recommended_courses = recommendations
    attempt.save(update_fields=["recommended_courses", "updated_at"])

    rec_courses_data = []
    for rec in recommendations:
        course_id = rec.get("course_id")
        if course_id in courses_by_id:
            course_data = CourseSerializer(courses_by_id[course_id], context={"request": request}).data
            course_data["recommendation_reason"] = rec.get("reason")
            rec_courses_data.append(course_data)

    return correct_topics, rec_courses_data


@api_view(["GET"])
@permission_classes([AllowAny])
def question_type_choices(request):
    return Response([
        {"value": value, "label": label}
        for value, label in Question.QuestionType.choices
    ])


@api_view(["GET"])
@permission_classes([AllowAny])
def csrf(request):
    return Response({"csrfToken": get_token(request)})


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def register(request):
    serializer = RegistrationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    login(request, user)
    log_activity(user, "REGISTER", "user", user.pk, "Student registered")
    return Response({"user": UserSerializer(user).data}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def login_view(request):
    user = authenticate(request, username=str(request.data.get("email", "")).lower(), password=request.data.get("password"))
    if not user:
        return Response({"detail": "Invalid email or password."}, status=status.HTTP_401_UNAUTHORIZED)
    if not user.is_active:
        return Response({"detail": "This account is inactive."}, status=status.HTTP_403_FORBIDDEN)
    login(request, user)
    log_activity(user, "LOGIN", "session", details="User signed in")
    return Response({"user": UserSerializer(user).data})


@api_view(["POST"])
def logout_view(request):
    actor = request.user
    logout(request)
    log_activity(actor, "LOGOUT", "session", details="User signed out")
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([AllowAny])
def me(request):
    if not request.user.is_authenticated:
        if request.method == "GET":
            return Response({"user": None})
        return Response(
            {"detail": "Authentication credentials were not provided."},
            status=status.HTTP_403_FORBIDDEN,
        )
    if request.method == "PATCH":
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_activity(request.user, "UPDATE", "profile", request.user.pk, "Profile updated")
    if request.method == "DELETE":
        log_activity(request.user, "DELETE", "account", request.user.pk, "User requested account deletion")
        request.user.delete()
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)
    return Response({"user": UserSerializer(request.user).data})


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetRateThrottle])
def password_reset_request(request):
    user = User.objects.filter(email=str(request.data.get("email", "")).lower(), is_active=True).first()
    if user:
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        link = f"{settings.FRONTEND_URL}/reset-password/{uid}/{token}"
        queue_email(user, "PASSWORD_RESET", "Reset your PyLearn password", f"Use this link to reset your password: {link}")
    return Response({"detail": "If the account exists, reset instructions have been sent."})


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetRateThrottle])
def password_reset_confirm(request):
    try:
        user = User.objects.get(pk=force_str(urlsafe_base64_decode(request.data.get("uid", ""))))
    except (User.DoesNotExist, ValueError, TypeError, OverflowError):
        return Response({"detail": "Invalid reset link."}, status=status.HTTP_400_BAD_REQUEST)
    if not default_token_generator.check_token(user, request.data.get("token", "")):
        return Response({"detail": "Invalid or expired reset link."}, status=status.HTTP_400_BAD_REQUEST)
    password = request.data.get("password", "")
    try:
        validate_password(password, user=user)
    except DjangoValidationError as exc:
        return Response({"detail": " ".join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
    user.set_password(password)
    user.save(update_fields=["password"])
    return Response({"detail": "Password updated."})


@api_view(["POST"])
def change_password(request):
    current = str(request.data.get("current_password", ""))
    new_password = str(request.data.get("new_password", ""))
    if not request.user.check_password(current):
        return Response({"detail": "Current password is incorrect."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        validate_password(new_password, request.user)
    except DjangoValidationError as exc:
        return Response({"detail": " ".join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
    request.user.set_password(new_password)
    request.user.must_change_password = False
    request.user.save(update_fields=["password", "must_change_password"])
    login(request, request.user)
    return Response({"detail": "Password updated."})


def firebase_service_account():
    raw = settings.FIREBASE_SERVICE_ACCOUNT_JSON.strip()
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        try:
            decoded = base64.b64decode(raw, validate=True).decode("utf-8")
            return json.loads(decoded)
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError("FIREBASE_SERVICE_ACCOUNT_JSON must contain JSON or base64-encoded JSON.") from exc


def verify_firebase_id_token(raw_token):
    if not firebase_admin._apps:
        service_account = firebase_service_account()
        project_id = settings.FIREBASE_PROJECT_ID or (service_account or {}).get("project_id", "")
        options = {"projectId": project_id} if project_id else None
        if service_account:
            credential = credentials.Certificate(service_account)
            firebase_admin.initialize_app(credential, options=options)
        else:
            firebase_admin.initialize_app(options=options)
    return firebase_auth.verify_id_token(raw_token, check_revoked=True)


@api_view(["POST"])
@permission_classes([AllowAny])
def firebase_login(request):
    raw_token = str(request.data.get("id_token", "")).strip()
    if not raw_token:
        return Response({"detail": "Firebase ID token is required."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        profile = verify_firebase_id_token(raw_token)
    except (ValueError, firebase_auth.InvalidIdTokenError, firebase_auth.ExpiredIdTokenError,
            firebase_auth.RevokedIdTokenError, firebase_auth.CertificateFetchError):
        return Response({"detail": "Google sign-in token is invalid or expired."}, status=status.HTTP_401_UNAUTHORIZED)
    if not profile.get("email_verified"):
        return Response({"detail": "Google email must be verified."}, status=status.HTTP_400_BAD_REQUEST)
    if (profile.get("firebase") or {}).get("sign_in_provider") != "google.com":
        return Response({"detail": "This endpoint only accepts Google sign-in."}, status=status.HTTP_400_BAD_REQUEST)
    email = str(profile.get("email", "")).strip().lower()
    if not email:
        return Response({"detail": "Google account did not provide an email address."}, status=status.HTTP_400_BAD_REQUEST)
    existing = User.objects.filter(email=email).first()
    if existing and existing.role != User.Role.STUDENT:
        return Response({"detail": "Instructor and admin accounts must use email and password."}, status=status.HTTP_403_FORBIDDEN)
    intent = str(request.data.get("intent", "login")).lower()
    if not existing and intent != "register":
        return Response({"detail": "No student account uses this Google email. Create an account first."}, status=status.HTTP_404_NOT_FOUND)
    department = str(request.data.get("department", "")).strip()
    if not existing and not department:
        return Response({"detail": "Department is required to create a student account."}, status=status.HTTP_400_BAD_REQUEST)
    user = existing
    if not user:
        full_name = str(profile.get("name", "")).strip()
        first_name = str(profile.get("given_name") or full_name.split(" ", 1)[0]).strip()
        last_name = str(profile.get("family_name") or (full_name.split(" ", 1)[1] if " " in full_name else "")).strip()
        user = User.objects.create_user(
            email=email,
            password=None,
            role=User.Role.STUDENT,
            first_name=first_name,
            last_name=last_name,
            department=department,
        )
    user.backend = "django.contrib.auth.backends.ModelBackend"
    login(request, user)
    return Response(UserSerializer(user).data)


class InstructorApplicationViewSet(viewsets.ModelViewSet):
    serializer_class = InstructorApplicationSerializer
    queryset = InstructorApplication.objects.select_related("instructor_account", "reviewed_by")
    lookup_field = "reference"

    def get_permissions(self):
        if self.action in ["create", "retrieve"]:
            return [AllowAny()]
        return [IsAdminRole()]

    def retrieve(self, request, *args, **kwargs):
        application = self.get_object()
        if not is_admin(request.user) and application.email != str(request.query_params.get("email", "")).strip().lower():
            return Response({"detail": "Application was not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(application).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminRole])
    def approve(self, request, reference=None):
        application = self.get_object()
        if application.status != InstructorApplication.Status.PENDING:
            return Response({"detail": "Only pending applications can be approved."}, status=status.HTTP_400_BAD_REQUEST)
        if not application.password_hash:
            return Response({"detail": "This application has no saved applicant password and must be resubmitted."}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            names = application.full_name.split(maxsplit=1)
            account, _ = User.objects.get_or_create(email=application.email, defaults={"first_name": names[0], "last_name": names[1] if len(names) > 1 else ""})
            if account.role not in [User.Role.STUDENT, User.Role.INSTRUCTOR]:
                return Response({"detail": "This email belongs to a protected account."}, status=status.HTTP_400_BAD_REQUEST)
            account.role = User.Role.INSTRUCTOR
            account.phone = application.phone
            account.is_active = True
            account.must_change_password = False
            account.password = application.password_hash
            account.save()
            application.status = InstructorApplication.Status.APPROVED
            application.instructor_account = account
            application.reviewed_by = request.user
            application.reviewed_at = timezone.now()
            application.admin_note = str(request.data.get("admin_note", ""))
            application.save()
        return Response(self.get_serializer(application).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminRole])
    def reject(self, request, reference=None):
        application = self.get_object()
        if application.status != InstructorApplication.Status.PENDING:
            return Response({"detail": "Only pending applications can be rejected."}, status=status.HTTP_400_BAD_REQUEST)
        note = str(request.data.get("admin_note", "")).strip()
        if not note:
            return Response({"detail": "A rejection reason is required."}, status=status.HTTP_400_BAD_REQUEST)
        application.status = InstructorApplication.Status.REJECTED
        application.admin_note = note
        application.reviewed_by = request.user
        application.reviewed_at = timezone.now()
        application.save()
        return Response(self.get_serializer(application).data)


class PaymentMethodConfigViewSet(viewsets.ModelViewSet):
    serializer_class = PaymentMethodConfigSerializer
    queryset = PaymentMethodConfig.objects.all()
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        if is_admin(self.request.user):
            return self.queryset.order_by("method", "display_name")
        if self.request.user.role == User.Role.STUDENT:
            return self.queryset.filter(is_active=True).order_by("method", "display_name")
        return self.queryset.none()

    def get_permissions(self):
        return [IsAuthenticated()] if self.action in ["list", "retrieve"] else [IsAdminRole()]


def payment_amount_query(query):
    """Match decimal amounts independently of database text formatting."""
    condition = Q(amount__icontains=query)
    try:
        amount = Decimal(query)
        if amount.is_finite() and abs(amount) < Decimal("10000000000"):
            condition |= Q(amount=amount)
    except InvalidOperation:
        pass
    return condition


class PaymentViewSet(viewsets.ModelViewSet):
    serializer_class = PaymentSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        qs = Payment.objects.select_related("student", "course", "payment_method", "reviewed_by")
        if is_admin(self.request.user):
            query = str(self.request.query_params.get("q", "")).strip()
            requested_status = str(self.request.query_params.get("status", "")).upper()
            requested_method = str(self.request.query_params.get("method", "")).upper()
            if requested_status and requested_status not in Payment.Status.values:
                raise ValidationError("Status must be PENDING, APPROVED, or REJECTED.")
            if requested_method and requested_method not in PaymentMethodConfig.Method.values:
                raise ValidationError("Method must be BKASH, NAGAD, or BANK_PAY.")
            if requested_status in Payment.Status.values:
                qs = qs.filter(status=requested_status)
            if requested_method in PaymentMethodConfig.Method.values:
                qs = qs.filter(method=requested_method)
            if query:
                qs = qs.filter(
                    Q(transaction_id__icontains=query)
                    | Q(student__email__icontains=query)
                    | Q(student__first_name__icontains=query)
                    | Q(student__last_name__icontains=query)
                    | Q(student__student_id__icontains=query)
                    | Q(course__title__icontains=query)
                    | Q(course__course_code__icontains=query)
                    | Q(sender_details__icontains=query)
                    | Q(method_display_name__icontains=query)
                    | Q(account_details_snapshot__icontains=query)
                    | Q(account_holder_snapshot__icontains=query)
                    | payment_amount_query(query)
                    | Q(payment_date__icontains=query)
                    | Q(admin_note__icontains=query)
                )
            return qs.distinct()
        if self.request.user.role == User.Role.STUDENT:
            return qs.filter(student=self.request.user)
        return qs.none()

    def perform_create(self, serializer):
        if self.request.user.role != User.Role.STUDENT:
            raise ValidationError("Only students can submit payments.")
        serializer.save(student=self.request.user)

    def create(self, request, *args, **kwargs):
        try:
            with transaction.atomic():
                return super().create(request, *args, **kwargs)
        except IntegrityError:
            return Response(
                {"detail": "This payment duplicates a pending submission or transaction reference."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=["get"], permission_classes=[IsAdminRole])
    def proof(self, request, pk=None):
        payment = self.get_object()
        if not payment.proof:
            return Response({"detail": "No payment proof is available."}, status=status.HTTP_404_NOT_FOUND)
        content_type = mimetypes.guess_type(payment.proof.name)[0] or "application/octet-stream"
        response = FileResponse(payment.proof.open("rb"), content_type=content_type)
        response["Content-Disposition"] = f'inline; filename="payment-proof-{payment.pk}"'
        response["Cache-Control"] = "private, no-store, max-age=0"
        response["Pragma"] = "no-cache"
        return response

    @action(detail=True, methods=["post"], permission_classes=[IsAdminRole])
    def review(self, request, pk=None):
        decision = str(request.data.get("decision", "")).upper()
        if decision not in [Payment.Status.APPROVED, Payment.Status.REJECTED]:
            return Response({"detail": "Decision must be APPROVED or REJECTED."}, status=status.HTTP_400_BAD_REQUEST)
        note = str(request.data.get("admin_note", "")).strip()
        if decision == Payment.Status.REJECTED and not note:
            return Response({"detail": "A rejection reason is required."}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            payment = get_object_or_404(
                Payment.objects.select_for_update(of=("self",)).select_related("student", "course"),
                pk=pk,
            )
            if payment.status != Payment.Status.PENDING:
                return Response({"detail": "This payment was already reviewed."}, status=status.HTTP_400_BAD_REQUEST)
            payment.status = decision
            payment.admin_note = note
            payment.reviewed_by = request.user
            payment.reviewed_at = timezone.now()
            payment.save(update_fields=["status", "admin_note", "reviewed_by", "reviewed_at", "updated_at"])
            if decision == Payment.Status.APPROVED:
                Enrollment.objects.get_or_create(student=payment.student, course=payment.course)
        return Response(self.get_serializer(payment).data)


class CertificateViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CertificateSerializer
    lookup_field = "verification_number"

    def get_queryset(self):
        qs = Certificate.objects.select_related("student", "course")
        if is_admin(self.request.user):
            return qs
        if is_instructor(self.request.user):
            return qs.filter(course__instructor=self.request.user)
        for enrollment in Enrollment.objects.filter(student=self.request.user).select_related("course"):
            issue_certificate_if_eligible(self.request.user, enrollment.course)
        return qs.filter(student=self.request.user)

    @action(detail=True, methods=["get"])
    def download(self, request, verification_number=None):
        certificate = self.get_object()
        response = HttpResponse(render_certificate_pdf(certificate), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="pylearn-{certificate.verification_number}.pdf"'
        return response

    @action(detail=True, methods=["post"], permission_classes=[IsAdminRole])
    def revoke(self, request, verification_number=None):
        certificate = self.get_object()
        reason = str(request.data.get("reason", "")).strip()
        if not reason:
            return Response({"detail": "A revocation reason is required."}, status=status.HTTP_400_BAD_REQUEST)
        certificate.revoked_at = timezone.now(); certificate.revoked_by = request.user; certificate.revocation_reason = reason
        certificate.save(update_fields=["revoked_at", "revoked_by", "revocation_reason", "updated_at"])
        log_activity(request.user, "REVOKE", "certificate", certificate.pk, reason)
        return Response(self.get_serializer(certificate).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminRole])
    def regenerate(self, request, verification_number=None):
        certificate = self.get_object()
        certificate.verification_number = f"PYL-{uuid.uuid4().hex[:16].upper()}"
        certificate.revoked_at = None; certificate.revoked_by = None; certificate.revocation_reason = ""
        certificate.save(update_fields=["verification_number", "revoked_at", "revoked_by", "revocation_reason", "updated_at"])
        log_activity(request.user, "REGENERATE", "certificate", certificate.pk, certificate.verification_number)
        return Response(self.get_serializer(certificate).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def verify_certificate(request, verification_number):
    certificate = get_object_or_404(Certificate, verification_number=verification_number)
    return Response(CertificateSerializer(certificate).data)


class UserViewSet(viewsets.ModelViewSet):
    serializer_class = AdminUserSerializer
    queryset = User.objects.all().order_by("-date_joined")
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_permissions(self):
        return [IsAuthenticated()] if self.action == "list" and is_instructor(self.request.user) else [IsAdminRole()]

    def get_queryset(self):
        qs = User.objects.all().order_by("-date_joined")
        if is_instructor(self.request.user):
            qs = qs.filter(role=User.Role.STUDENT, enrollments__course__instructor=self.request.user).distinct()
        role = self.request.query_params.get("role")
        return qs.filter(role=role) if role else qs

    def perform_update(self, serializer):
        old_active = serializer.instance.is_active
        user = serializer.save()
        log_activity(self.request.user, "UPDATE", "user", user.pk, f"Updated {user.email}")
        if old_active != user.is_active:
            queue_email(user, "ACCOUNT_STATUS", "Your PyLearn account status changed", f"Your account is now {'active' if user.is_active else 'inactive'}.")

    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "You cannot delete your own administrator account. Another administrator must perform this action if necessary."})
        log_activity(self.request.user, "DELETE", "user", instance.pk, instance.email)
        instance.delete()


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = CourseCategory.objects.all().order_by("name")
    serializer_class = CategorySerializer

    def get_permissions(self):
        if self.action in ["list", "retrieve"]:
            return [IsAuthenticated()]
        if self.action == "create":
            return [IsAdminOrInstructorRole()]
        return [IsAdminRole()]


class CourseViewSet(viewsets.ModelViewSet):
    serializer_class = CourseSerializer

    def get_queryset(self):
        qs = Course.objects.select_related("category", "instructor").prefetch_related("materials", "enrollments")
        if is_instructor(self.request.user):
            qs = qs.filter(instructor=self.request.user)
        elif not is_admin(self.request.user):
            qs = qs.filter(status=Course.Status.PUBLISHED)
        category = self.request.query_params.get("category")
        search = self.request.query_params.get("search")
        if category:
            qs = qs.filter(category_id=category)
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(description__icontains=search))
        return qs.order_by("-created_at")

    def get_permissions(self):
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        if is_instructor(self.request.user):
            course = serializer.save(instructor=self.request.user, created_by=self.request.user)
        elif is_admin(self.request.user):
            course = serializer.save(created_by=self.request.user)
        else:
            raise ValidationError("Only admins and instructors create courses.")
        log_activity(self.request.user, "CREATE", "course", course.pk, course.title)

    def perform_update(self, serializer):
        if not can_manage_course(self.request.user, serializer.instance):
            raise PermissionDenied("Instructor courses are read-only for administrators.")
        course = serializer.save(instructor=self.request.user) if is_instructor(self.request.user) else serializer.save()
        log_activity(self.request.user, "UPDATE", "course", course.pk, course.title)

    def perform_destroy(self, instance):
        if not can_manage_course(self.request.user, instance):
            raise PermissionDenied("Instructor courses are read-only for administrators.")
        instance.delete()


class MaterialViewSet(viewsets.ModelViewSet):
    serializer_class = MaterialSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    throttle_scope = "uploads"

    def get_queryset(self):
        qs = LearningMaterial.objects.select_related("course")
        if is_instructor(self.request.user):
            qs = qs.filter(course__instructor=self.request.user)
        elif not is_admin(self.request.user):
            qs = qs.filter(course__status=Course.Status.PUBLISHED, course__enrollments__student=self.request.user)
        course = self.request.query_params.get("course")
        return qs.filter(course_id=course) if course else qs

    def get_permissions(self):
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        if not can_manage_course(self.request.user, serializer.validated_data["course"]):
            raise PermissionDenied("Instructor courses are read-only for administrators.")
        serializer.save()

    def perform_update(self, serializer):
        course = serializer.validated_data.get("course", serializer.instance.course)
        if not can_manage_course(self.request.user, course):
            raise PermissionDenied("Instructor courses are read-only for administrators.")
        serializer.save()

    def perform_destroy(self, instance):
        if not can_manage_course(self.request.user, instance.course):
            raise PermissionDenied("Instructor courses are read-only for administrators.")
        instance.delete()

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        material = self.get_object()
        if not material.file:
            return Response({"detail": "This material has no downloadable file."}, status=status.HTTP_404_NOT_FOUND)
        file_handle = material.file.open("rb")
        if request.user.role == User.Role.STUDENT and material.material_type == LearningMaterial.MaterialType.PDF:
            enrollment = get_object_or_404(Enrollment, student=request.user, course=material.course)
            _, created = MaterialProgress.objects.get_or_create(enrollment=enrollment, material=material)
            if created:
                issue_certificate_if_eligible(request.user, material.course)
        return FileResponse(file_handle, as_attachment=True, filename=material.file.name.rsplit("/", 1)[-1])

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        if request.user.role != User.Role.STUDENT:
            return Response({"detail": "Only Students track material completion."}, status=status.HTTP_403_FORBIDDEN)
        material = self.get_object()
        enrollment = get_object_or_404(Enrollment, student=request.user, course=material.course)
        if request.data.get("completed") is False:
            MaterialProgress.objects.filter(enrollment=enrollment, material=material).delete()
            return Response({"completed": False})
        if material.material_type == LearningMaterial.MaterialType.PDF:
            if not MaterialProgress.objects.filter(enrollment=enrollment, material=material).exists():
                return Response(
                    {"detail": "Download this PDF before completing it."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            return Response({"completed": True})
        MaterialProgress.objects.get_or_create(enrollment=enrollment, material=material)
        issue_certificate_if_eligible(request.user, material.course)
        return Response({"completed": True})


class EnrollmentViewSet(viewsets.ModelViewSet):
    serializer_class = EnrollmentSerializer
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        qs = Enrollment.objects.select_related("student", "course", "course__category").prefetch_related("course__materials", "course__enrollments", "material_progress").order_by("-enrolled_at", "-id")
        if is_admin(self.request.user):
            return qs
        if is_instructor(self.request.user):
            return qs.filter(course__instructor=self.request.user)
        return qs.filter(student=self.request.user)

    def perform_create(self, serializer):
        if self.request.user.role != User.Role.STUDENT:
            raise PermissionDenied("Only Students enroll themselves.")
        course = serializer.validated_data["course"]
        if course.status != Course.Status.PUBLISHED:
            raise ValidationError("Only published courses are available.")
        if course.course_type == Course.CourseType.PAID:
            raise ValidationError("Submit payment and wait for admin approval to enroll in this paid course.")
        if Enrollment.objects.filter(student=self.request.user, course=course).exists():
            raise ValidationError("You are already enrolled in this course.")
        enrollment = serializer.save(student=self.request.user)
        log_activity(self.request.user, "ENROLL", "course", course.pk, course.title)


class QuizViewSet(viewsets.ModelViewSet):
    serializer_class = QuizSerializer

    def get_serializer_class(self):
        return QuizSerializer if self.action in ["create", "update", "partial_update"] else QuizReadSerializer

    def get_queryset(self):
        qs = Quiz.objects.select_related("course").prefetch_related("questions")
        if is_instructor(self.request.user):
            qs = qs.filter(course__instructor=self.request.user, quiz_type=Quiz.QuizType.COURSE)
        elif not is_admin(self.request.user):
            qs = qs.filter(
                Q(is_initial_assessment=True) | Q(quiz_type=Quiz.QuizType.SKILL_DEVELOPMENT) | Q(course__enrollments__student=self.request.user),
                is_published=True,
            ).distinct()
        return qs.order_by("-created_at")

    def get_permissions(self):
        return [IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        serializer = QuizSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        course = serializer.validated_data.get("course")
        if course and not can_manage_course(request.user, course):
            raise PermissionDenied("Instructor courses are read-only for administrators.")
        if is_instructor(request.user) and (not course or course.instructor_id != request.user.pk or serializer.validated_data.get("quiz_type") != Quiz.QuizType.COURSE):
            raise ValidationError("Instructors can create course quizzes only for their own courses.")
        if not (is_admin(request.user) or is_instructor(request.user)):
            raise ValidationError("Only admins and instructors create quizzes.")
        quiz = serializer.save()
        return Response(QuizReadSerializer(quiz, context={"request": request}).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        quiz = self.get_object()
        if quiz.course and not can_manage_course(request.user, quiz.course):
            raise PermissionDenied("Instructor courses are read-only for administrators.")
        if not quiz.course and not is_admin(request.user):
            raise ValidationError("You cannot edit this quiz.")
        if quiz.results_published:
            raise ValidationError("Published quiz results lock this quiz from editing.")
        serializer = QuizSerializer(quiz, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        quiz = serializer.save()
        return Response(QuizReadSerializer(quiz, context={"request": request}).data)

    def perform_destroy(self, instance):
        if instance.course and not can_manage_course(self.request.user, instance.course):
            raise PermissionDenied("Instructor courses are read-only for administrators.")
        if not instance.course and not is_admin(self.request.user):
            raise PermissionDenied("You cannot delete this quiz.")
        instance.delete()

    def retrieve(self, request, *args, **kwargs):
        quiz = self.get_object()
        if is_admin(request.user):
            return Response(QuizReadSerializer(quiz, context={"request": request}).data)
        data = QuizReadSerializer(quiz, context={"request": request}).data
        data["questions"] = QuestionAttemptSerializer(quiz.questions.all(), many=True).data
        return Response(data)

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        if not is_admin(request.user):
            rows = response.data.get("results", []) if isinstance(response.data, dict) else response.data
            for row, quiz in zip(rows, self.filter_queryset(self.get_queryset())):
                row["questions"] = QuestionAttemptSerializer(quiz.questions.all(), many=True).data
        return response

    @action(detail=True, methods=["post"])
    def attempt(self, request, pk=None):
        quiz = self.get_object()
        if request.user.role != User.Role.STUDENT:
            return Response({"detail": "Only Students submit quiz attempts."}, status=status.HTTP_403_FORBIDDEN)
        is_advisor = quiz.is_initial_assessment or quiz.quiz_type in [Quiz.QuizType.SKILL_DISCOVERY, Quiz.QuizType.SKILL_DEVELOPMENT]
        if not is_advisor:
            get_object_or_404(Enrollment, student=request.user, course=quiz.course)
        if quiz.attempts.filter(student=request.user).exists():
            return Response({"detail": "You have already attempted this quiz."}, status=status.HTTP_400_BAD_REQUEST)
        submitted = request.data.get("answers", {})
        with transaction.atomic():
            attempt = QuizAttempt.objects.create(quiz=quiz, student=request.user, analysis_status=QuizAttempt.AnalysisStatus.SUBMITTED if is_advisor else QuizAttempt.AnalysisStatus.NOT_REQUIRED)
            score, maximum = Decimal("0"), Decimal("0")
            for question in quiz.questions.all():
                answer = str(submitted.get(str(question.pk), submitted.get(question.pk, ""))).strip()

                maximum += Decimal(question.points)
                if question.question_type == Question.QuestionType.LONG_ANSWER:
                    QuizAnswer.objects.create(attempt=attempt, question=question, answer=answer, is_correct=False, awarded_points=Decimal("0"))
                    continue

                if question.question_type in [Question.QuestionType.MULTIPLE_CHOICE, Question.QuestionType.SHORT_ANSWER]:
                    normalized_answer = " ".join(answer.split()).casefold()
                    allowed_answers = [" ".join(item.split()).casefold() for item in str(question.correct_answer).split("|") if item.strip()]
                    correct = normalized_answer in allowed_answers
                elif question.question_type == Question.QuestionType.TRUE_FALSE:
                    correct = answer.casefold() == str(question.correct_answer or "").strip().casefold()
                else:
                    correct = answer.casefold() == question.correct_answer.strip().casefold()

                points = Decimal(question.points if correct else 0)
                score += points
                QuizAnswer.objects.create(attempt=attempt, question=question, answer=answer, is_correct=correct, awarded_points=points)

            percentage = (score / maximum * 100).quantize(Decimal("0.01")) if maximum else Decimal("0")
            attempt.score, attempt.max_score, attempt.percentage = score, maximum, percentage
            attempt.passed = percentage >= quiz.passing_score
            attempt.save(update_fields=["score", "max_score", "percentage", "passed", "updated_at"])
        if not is_advisor and quiz.course_id:
            issue_certificate_if_eligible(request.user, quiz.course)
        if is_advisor:
            try:
                analyze_attempt(attempt.pk, request.user)
            except Exception:
                # The analysis service stores a safe failure state. The attempt
                # remains available for an Admin to retry after configuration.
                pass
            attempt.refresh_from_db()
            data = QuizAttemptSerializer(attempt).data
        else:
            data = QuizAttemptSerializer(attempt).data
            detailed_results = {}
            for ans in attempt.answers.all():
                detailed_results[str(ans.question_id)] = {
                    "is_correct": ans.is_correct,
                    "correct_answer": ans.question.correct_answer,
                    "submitted_answer": ans.answer
                }
            data["detailed_results"] = detailed_results
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def reveal_answers(self, request, pk=None):
        quiz = self.get_object()
        password = request.data.get("password", "")
        user = authenticate(request, username=request.user.email, password=password)
        if user is None or user.pk != request.user.pk or not (is_admin(user) or (quiz.course and can_manage_course(user, quiz.course))):
            return Response({"detail": "Course manager password is required to reveal answers."}, status=status.HTTP_403_FORBIDDEN)
        return Response({
            "questions": [
                {"id": question.pk, "correct_answer": question.correct_answer}
                for question in quiz.questions.all()
            ]
        })

    @action(detail=True, methods=["get"])
    def results(self, request, pk=None):
        quiz = self.get_object()
        qs = quiz.attempts.select_related("student")
        if not (is_admin(request.user) or (is_instructor(request.user) and quiz.course and quiz.course.instructor_id == request.user.pk)):
            if not quiz.results_published:
                return Response({"detail": "Results have not been published."}, status=status.HTTP_403_FORBIDDEN)
            qs = qs.filter(student=request.user)
        return Response(QuizAttemptSerializer(qs, many=True).data)

    @action(detail=True, methods=["post"])
    def publish_results(self, request, pk=None):
        quiz = self.get_object()
        if (quiz.course and not can_manage_course(request.user, quiz.course)) or (not quiz.course and not is_admin(request.user)):
            return Response({"detail": "Instructor quiz results are managed by the instructor."}, status=status.HTTP_403_FORBIDDEN)
        if quiz.is_initial_assessment or quiz.quiz_type != Quiz.QuizType.COURSE:
            return Response({"detail": "Advisor results are reviewed and published per attempt."}, status=status.HTTP_400_BAD_REQUEST)
        quiz.results_published = True
        quiz.save(update_fields=["results_published", "updated_at"])
        for attempt in quiz.attempts.select_related("student"):
            queue_email(attempt.student, "QUIZ_RESULT", f"Quiz result published: {quiz.title}", f"Your score is {attempt.percentage}%.")
        return Response(QuizReadSerializer(quiz, context={"request": request}).data)


class SearchView(APIView):
    page_size = 20

    def _page(self, request, queryset, serializer):
        try:
            page = max(1, int(request.query_params.get("page", 1)))
        except (TypeError, ValueError):
            raise ValidationError({"page": "Page must be a positive integer."})
        total = queryset.count()
        start = (page - 1) * self.page_size
        rows = list(queryset[start:start + self.page_size])
        return {
            "count": total,
            "page": page,
            "page_size": self.page_size,
            "pages": max(1, (total + self.page_size - 1) // self.page_size),
            "results": [serializer(row) for row in rows],
        }

    @staticmethod
    def _name(user):
        return user.get_full_name() or user.email

    def _course(self, request, course):
        owned = is_instructor(request.user) and course.instructor_id == request.user.pk
        enrolled = hasattr(course, "search_enrolled") and bool(course.search_enrolled)
        action = "Manage course" if owned or is_admin(request.user) else "Continue learning" if enrolled else "View course"
        return {
            "id": course.pk, "kind": "courses", "title": course.title,
            "subtitle": course.course_code or "Course", "description": course.description,
            "badges": [course.category.name, course.level, course.status, course.course_type],
            "href": f"/courses/{course.pk}", "action": action,
        }

    def _material(self, request, material):
        return {
            "id": material.pk, "kind": "materials", "title": material.title,
            "subtitle": material.course.title, "description": material.description or material.note_content[:180],
            "badges": [material.material_type, material.course.course_code or "Course"],
            "href": f"/courses/{material.course_id}", "action": "Open material",
        }

    def _quiz(self, request, quiz):
        return {
            "id": quiz.pk, "kind": "quizzes", "title": quiz.title,
            "subtitle": quiz.course.title if quiz.course else quiz.get_quiz_type_display(),
            "description": quiz.description, "badges": [quiz.get_quiz_type_display(), "Published" if quiz.is_published else "Draft"],
            "href": f"/quizzes/{quiz.pk}", "action": "Manage quiz" if is_admin(request.user) or is_instructor(request.user) else "Take quiz",
        }

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        tab = request.query_params.get("tab", "all")
        category = request.query_params.get("category", "")
        status_filter = request.query_params.get("status", "")
        material_type = request.query_params.get("material_type", "")
        level = request.query_params.get("level", "")
        course_type = request.query_params.get("course_type", "")
        user_role = request.query_params.get("user_role", "")
        payment_status = request.query_params.get("payment_status", "")
        application_status = request.query_params.get("application_status", "")
        role = request.user.role

        course_q = Q(title__icontains=query) | Q(description__icontains=query) | Q(course_code__icontains=query) | Q(category__name__icontains=query)
        material_q = Q(title__icontains=query) | Q(description__icontains=query) | Q(note_content__icontains=query) | Q(course__title__icontains=query) | Q(course__course_code__icontains=query)
        quiz_q = Q(title__icontains=query) | Q(description__icontains=query) | Q(course__title__icontains=query) | Q(course__course_code__icontains=query)

        courses = Course.objects.select_related("category", "instructor").annotate(
            search_enrolled=Count("enrollments", filter=Q(enrollments__student=request.user))
        )
        materials = LearningMaterial.objects.select_related("course")
        quizzes = Quiz.objects.select_related("course")

        if role == User.Role.STUDENT:
            courses = courses.filter(status=Course.Status.PUBLISHED)
            materials = materials.filter(course__status=Course.Status.PUBLISHED, course__enrollments__student=request.user)
            quizzes = quizzes.filter(is_published=True).filter(Q(course__isnull=True) | Q(course__enrollments__student=request.user))
            allowed_tabs = ["all", "courses", "materials", "quizzes", "enrollments", "learning_paths"]
        elif role == User.Role.INSTRUCTOR:
            courses = courses.filter(instructor=request.user)
            materials = materials.filter(course__instructor=request.user)
            quizzes = quizzes.filter(course__instructor=request.user)
            allowed_tabs = ["all", "courses", "materials", "quizzes", "students"]
        else:
            allowed_tabs = ["all", "courses", "materials", "quizzes", "users", "enrollments", "payments", "certificates", "applications"]

        if tab not in allowed_tabs:
            raise ValidationError({"tab": "This result type is not available for your role."})
        if category:
            courses = courses.filter(category_id=category)
            materials = materials.filter(course__category_id=category)
            quizzes = quizzes.filter(course__category_id=category)
        if level:
            courses = courses.filter(level=level)
        if course_type:
            courses = courses.filter(course_type=course_type)
        if status_filter:
            courses = courses.filter(status=status_filter)
        if material_type:
            materials = materials.filter(material_type=material_type)
        if query:
            courses = courses.filter(course_q)
            materials = materials.filter(material_q)
            quizzes = quizzes.filter(quiz_q)

        groups = {
            "courses": (courses.distinct().order_by("-updated_at"), lambda row: self._course(request, row)),
            "materials": (materials.distinct().order_by("-updated_at"), lambda row: self._material(request, row)),
            "quizzes": (quizzes.distinct().order_by("-updated_at"), lambda row: self._quiz(request, row)),
        }

        if role == User.Role.STUDENT:
            enrollments = Enrollment.objects.filter(student=request.user).select_related("course")
            attempts = QuizAttempt.objects.filter(student=request.user, analysis_status=QuizAttempt.AnalysisStatus.PUBLISHED).select_related("quiz", "advisor_analysis")
            if query:
                enrollments = enrollments.filter(Q(course__title__icontains=query) | Q(course__course_code__icontains=query))
                attempts = attempts.filter(Q(quiz__title__icontains=query) | Q(advisor_analysis__summary__icontains=query))
            groups["enrollments"] = (enrollments.order_by("-enrolled_at"), lambda row: {
                "id": row.pk, "kind": "enrollments", "title": row.course.title, "subtitle": "My learning",
                "description": "Continue your enrolled course.", "badges": [row.course.course_code or "Course"],
                "href": f"/courses/{row.course_id}", "action": "Continue learning",
            })
            groups["learning_paths"] = (attempts.order_by("-completed_at"), lambda row: {
                "id": row.pk, "kind": "learning_paths", "title": row.quiz.title, "subtitle": "Published learning path",
                "description": getattr(getattr(row, "advisor_analysis", None), "summary", "") or "View your personalized learning recommendations.", "badges": [row.get_analysis_status_display()],
                "href": "/learning-path", "action": "View learning path",
            })
        elif role == User.Role.INSTRUCTOR:
            students = User.objects.filter(role=User.Role.STUDENT, enrollments__course__instructor=request.user).distinct()
            if query:
                students = students.filter(Q(email__icontains=query) | Q(first_name__icontains=query) | Q(last_name__icontains=query) | Q(student_id__icontains=query))
            groups["students"] = (students.order_by("first_name", "last_name"), lambda row: {
                "id": row.pk, "kind": "students", "title": self._name(row), "subtitle": row.student_id or row.email,
                "description": row.email, "badges": ["Student"], "href": "/progress", "action": "View student progress",
            })
        else:
            users = User.objects.all()
            enrollments = Enrollment.objects.select_related("student", "course")
            payments = Payment.objects.select_related("student", "course")
            certificates = Certificate.objects.select_related("student", "course")
            applications = InstructorApplication.objects.all()
            if user_role:
                users = users.filter(role=user_role)
            if payment_status:
                payments = payments.filter(status=payment_status)
            if application_status:
                applications = applications.filter(status=application_status)
            if query:
                users = users.filter(Q(email__icontains=query) | Q(first_name__icontains=query) | Q(last_name__icontains=query) | Q(student_id__icontains=query))
                enrollments = enrollments.filter(Q(student__email__icontains=query) | Q(course__title__icontains=query) | Q(course__course_code__icontains=query))
                payments = payments.filter(
                    Q(transaction_id__icontains=query)
                    | Q(student__email__icontains=query)
                    | Q(student__first_name__icontains=query)
                    | Q(student__last_name__icontains=query)
                    | Q(student__student_id__icontains=query)
                    | Q(course__title__icontains=query)
                    | Q(course__course_code__icontains=query)
                    | Q(sender_details__icontains=query)
                    | Q(method_display_name__icontains=query)
                    | Q(account_holder_snapshot__icontains=query)
                    | payment_amount_query(query)
                    | Q(payment_date__icontains=query)
                    | Q(admin_note__icontains=query)
                )
                certificates = certificates.filter(Q(verification_number__icontains=query) | Q(student_name__icontains=query) | Q(course_title__icontains=query))
                applications = applications.filter(Q(reference__icontains=query) | Q(full_name__icontains=query) | Q(email__icontains=query))
            groups.update({
                "users": (users.order_by("-date_joined"), lambda row: {"id": row.pk, "kind": "users", "title": self._name(row), "subtitle": row.email, "description": row.department, "badges": [row.role, "Active" if row.is_active else "Inactive"], "href": "/users", "action": "Manage user"}),
                "enrollments": (enrollments.order_by("-enrolled_at"), lambda row: {"id": row.pk, "kind": "enrollments", "title": self._name(row.student), "subtitle": row.course.title, "description": f"Enrolled {row.enrolled_at.date()}", "badges": [row.course.course_code or "Course"], "href": "/enrollments", "action": "View enrollment"}),
                "payments": (payments.order_by("-created_at"), lambda row: {"id": row.pk, "kind": "payments", "title": row.transaction_id, "subtitle": self._name(row.student), "description": row.course.title, "badges": [row.status, f"{row.amount} BDT"], "href": "/payments", "action": "Review payment"}),
                "certificates": (certificates.order_by("-issued_at"), lambda row: {"id": row.pk, "kind": "certificates", "title": row.verification_number, "subtitle": row.student_name, "description": row.course_title, "badges": ["Revoked" if row.revoked_at else "Valid"], "href": "/certificates", "action": "View certificate"}),
                "applications": (applications.order_by("-created_at"), lambda row: {"id": row.pk, "kind": "applications", "title": row.reference, "subtitle": row.full_name, "description": row.email, "badges": [row.status], "href": "/instructor-applications", "action": "Review application"}),
            })

        requested = allowed_tabs[1:] if tab == "all" else [tab]
        payload = {}
        for name in requested:
            queryset, serializer = groups[name]
            page_data = self._page(request, queryset, serializer)
            if tab == "all":
                page_data["results"] = page_data["results"][:5]
            payload[name] = page_data
        return Response({
            "query": query, "role": role, "tab": tab, "available_tabs": allowed_tabs,
            "groups": payload,
            "courses": payload.get("courses", {}).get("results", []),
            "materials": payload.get("materials", {}).get("results", []),
        })


def progress_payload(student, instructor=None):
    enrollments = Enrollment.objects.filter(student=student)
    if instructor:
        enrollments = enrollments.filter(course__instructor=instructor)
    enrollments = enrollments.select_related("course").prefetch_related("course__materials", "material_progress")
    quiz_attempts = (
        QuizAttempt.objects.filter(student=student, quiz__results_published=True)
        .select_related("quiz", "quiz__course")
        .prefetch_related("answers__question")
    )
    if instructor:
        quiz_attempts = quiz_attempts.filter(quiz__course__instructor=instructor)
    courses = []
    for enrollment in enrollments:
        total = enrollment.course.materials.count()
        completed = enrollment.material_progress.count()
        required_quizzes = enrollment.course.quizzes.filter(is_published=True, quiz_type=Quiz.QuizType.COURSE)
        quiz_total = required_quizzes.count()
        quizzes_passed = required_quizzes.filter(attempts__student=student, attempts__passed=True).distinct().count()
        certificate = Certificate.objects.filter(student=student, course=enrollment.course).first()
        certificate_eligible = bool(total and completed == total and quizzes_passed == quiz_total)
        if certificate_eligible and not certificate:
            certificate = issue_certificate_if_eligible(student, enrollment.course)
        courses.append({
            "course_id": enrollment.course_id,
            "course_code": enrollment.course.course_code,
            "title": enrollment.course.title,
            "completed_materials": completed,
            "total_materials": total,
            "completion": round(completed / total * 100, 2) if total else 0,
            "quizzes_passed": quizzes_passed,
            "quiz_total": quiz_total,
            "certificate_eligible": certificate_eligible,
            "certificate_number": certificate.verification_number if certificate else None,
        })
    weak_topics = []
    for attempt in quiz_attempts.order_by("-completed_at", "-id"):
        incorrect_answers = [
            answer
            for answer in attempt.answers.all()
            if not answer.is_correct
        ]
        if not incorrect_answers:
            continue
        weak_topics.append({
            "attempt_id": attempt.pk,
            "quiz_id": attempt.quiz_id,
            "quiz_title": attempt.quiz.title,
            "course_title": attempt.quiz.course.title if attempt.quiz.course_id else "",
            "incorrect_count": len(incorrect_answers),
            "questions": [
                {
                    "question_id": answer.question_id,
                    "prompt": answer.question.prompt,
                    "topic": answer.question.topic,
                    "submitted_answer": answer.answer,
                    "correct_answer": answer.question.correct_answer,
                }
                for answer in incorrect_answers
            ],
        })
        if len(weak_topics) >= 10:
            break
    return {
        "student": UserSerializer(student).data,
        "courses": courses,
        "quiz_average": round(quiz_attempts.aggregate(value=Avg("percentage"))["value"] or 0),
        "weak_topics": weak_topics,
    }


def student_progress_summaries(user):
    students = User.objects.filter(role=User.Role.STUDENT).order_by("first_name", "last_name", "email")
    instructor = user if is_instructor(user) else None
    if instructor:
        students = students.filter(enrollments__course__instructor=instructor).distinct()

    summaries = []
    for student in students:
        report = progress_payload(student, instructor=instructor)
        courses = report["courses"]
        completed_materials = sum(course["completed_materials"] for course in courses)
        total_materials = sum(course["total_materials"] for course in courses)
        quizzes_passed = sum(course["quizzes_passed"] for course in courses)
        quiz_total = sum(course["quiz_total"] for course in courses)
        certificates_eligible = sum(1 for course in courses if course["certificate_eligible"] or course["certificate_number"])
        certificates_issued = sum(1 for course in courses if course["certificate_number"])
        overall_completion = round(completed_materials / total_materials * 100, 2) if total_materials else 0
        summaries.append({
            "student": report["student"],
            "enrolled_courses": len(courses),
            "completed_materials": completed_materials,
            "total_materials": total_materials,
            "quizzes_passed": quizzes_passed,
            "quiz_total": quiz_total,
            "certificates_eligible": certificates_eligible,
            "certificates_issued": certificates_issued,
            "overall_completion": overall_completion,
            "status": "ON_TRACK" if overall_completion >= 50 else "NEEDS_ATTENTION",
        })
    return summaries


def student_dashboard_payload(request):
    enrollments = (
        Enrollment.objects.filter(student=request.user)
        .select_related("course__category")
        .prefetch_related("course__materials", "material_progress")
        .order_by("-enrolled_at")
    )
    courses = []
    completed_materials = 0
    for enrollment in enrollments:
        materials = list(enrollment.course.materials.all())
        completed = len(enrollment.material_progress.all())
        total = len(materials)
        completed_materials += completed
        thumbnail = file_url(enrollment.course.thumbnail) or ""
        if thumbnail.startswith("/"):
            thumbnail = request.build_absolute_uri(thumbnail)
        courses.append({
            "course_id": enrollment.course_id,
            "course_code": enrollment.course.course_code,
            "title": enrollment.course.title,
            "description": enrollment.course.description,
            "category": enrollment.course.category.name,
            "level": enrollment.course.get_level_display(),
            "thumbnail": thumbnail,
            "completed_materials": completed,
            "total_materials": total,
            "completion": round(completed / total * 100, 2) if total else 0,
        })

    published_attempts = QuizAttempt.objects.filter(
        student=request.user,
        quiz__results_published=True,
    )
    quiz_average = round(published_attempts.aggregate(value=Avg("percentage"))["value"] or 0)
    recent_results = [
        {
            "id": attempt.pk,
            "quiz_id": attempt.quiz_id,
            "quiz_title": attempt.quiz.title,
            "course_title": attempt.quiz.course.title,
            "percentage": attempt.percentage,
            "passed": attempt.passed,
            "completed_at": attempt.completed_at,
        }
        for attempt in published_attempts.select_related("quiz__course").order_by("-completed_at")[:3]
    ]

    return {
        "statistics": {
            "enrolled_courses": len(courses),
            "completed_materials": completed_materials,
            "quiz_average": quiz_average,
        },
        "courses": courses,
        "recent_results": recent_results,
    }


class ProgressView(APIView):
    def get(self, request):
        student_id = request.query_params.get("student")
        if (is_admin(request.user) or is_instructor(request.user)) and not student_id:
            return Response(student_progress_summaries(request.user))
        if is_admin(request.user) and student_id:
            student = get_object_or_404(User, pk=request.query_params["student"], role=User.Role.STUDENT)
        elif is_instructor(request.user) and student_id:
            student = get_object_or_404(
                User.objects.filter(role=User.Role.STUDENT, enrollments__course__instructor=request.user).distinct(),
                pk=student_id,
            )
        else:
            student = request.user
        return Response(progress_payload(student, instructor=request.user if is_instructor(request.user) else None))


class DashboardView(APIView):
    def get(self, request):
        if request.user.role == User.Role.STUDENT:
            return Response(student_dashboard_payload(request))
        if is_instructor(request.user):
            courses = Course.objects.filter(instructor=request.user)
            recent_activities = ActivityLog.objects.filter(actor=request.user).select_related("actor")[:20]
            return Response({
                "statistics": {
                    "courses": courses.count(),
                    "published_courses": courses.filter(status=Course.Status.PUBLISHED).count(),
                    "draft_courses": courses.filter(status=Course.Status.DRAFT).count(),
                    "quizzes": Quiz.objects.filter(course__instructor=request.user).count(),
                    "students": User.objects.filter(role=User.Role.STUDENT, enrollments__course__instructor=request.user).distinct().count(),
                },
                "recent_activities": ActivitySerializer(recent_activities, many=True).data,
            })
        return Response({
            "statistics": {
                "users": User.objects.count(), "students": User.objects.filter(role=User.Role.STUDENT).count(),
                "instructors": User.objects.filter(role=User.Role.INSTRUCTOR).count(),
                "pending_applications": InstructorApplication.objects.filter(status=InstructorApplication.Status.PENDING).count(),
                "courses": Course.objects.count(), "enrollments": Enrollment.objects.count(),
                "quizzes": Quiz.objects.count(), "pending_payments": Payment.objects.filter(status=Payment.Status.PENDING).count(),
                "certificates": Certificate.objects.filter(revoked_at__isnull=True).count(),
            },
            "recent_activities": ActivitySerializer(ActivityLog.objects.select_related("actor")[:20], many=True).data,
        })


class AIConfigView(APIView):
    permission_classes = [IsAdminRole]
    throttle_scope = "ai"

    def get(self, request):
        config = AIProviderConfig.objects.filter(is_active=True).order_by("-updated_at").first()
        if not config:
            return Response(None)
        return Response({"id": config.pk, "provider": config.provider, "model": config.model, "base_url": config.base_url, "api_key": masked_key(config), "is_active": config.is_active})

    def post(self, request):
        provider = request.data.get("provider")
        if provider not in AIProviderConfig.Provider.values:
            return Response({"detail": "Unsupported AI provider."}, status=status.HTTP_400_BAD_REQUEST)
        active_config = AIProviderConfig.objects.filter(is_active=True).order_by("-updated_at").first()
        api_key = str(request.data.get("api_key", "")).strip()
        model = normalize_ai_model(provider, request.data.get("model", ""))
        if not api_key and not active_config:
            return Response({"detail": "API key is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not model:
            return Response({"detail": "Model is required."}, status=status.HTTP_400_BAD_REQUEST)
        base_url = str(request.data.get("base_url", "")).strip()
        if provider == AIProviderConfig.Provider.GENERIC and not base_url:
            return Response({"detail": "A base URL is required for a generic provider."}, status=status.HTTP_400_BAD_REQUEST)
        if api_key:
            try:
                encrypted_key = encrypt_key(api_key)
            except ValueError as exc:
                return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        else:
            encrypted_key = active_config.encrypted_api_key

        if active_config:
            active_config.provider = provider
            active_config.model = model
            active_config.base_url = base_url
            active_config.encrypted_api_key = encrypted_key
            active_config.is_active = True
            active_config.save(update_fields=["provider", "model", "base_url", "encrypted_api_key", "is_active", "updated_at"])
            config = active_config
            response_status = status.HTTP_200_OK
        else:
            AIProviderConfig.objects.update(is_active=False)
            config = AIProviderConfig.objects.create(
                provider=provider, model=model, base_url=base_url, encrypted_api_key=encrypted_key, is_active=True
            )
            response_status = status.HTTP_201_CREATED
        log_activity(request.user, "CONFIGURE", "ai_provider", config.pk, provider)
        return Response(
            {"id": config.pk, "provider": provider, "model": config.model, "base_url": config.base_url, "api_key": masked_key(config), "is_active": True},
            status=response_status,
        )


class NotificationView(APIView):
    def get(self, request):
        qs = EmailNotification.objects.filter(recipient=request.user)
        return Response(NotificationSerializer(qs, many=True).data)


class AdminNotificationView(APIView):
    permission_classes = [IsAdminRole]

    def get(self, request):
        return Response(AdminNotificationSerializer(EmailNotification.objects.select_related("recipient")[:200], many=True).data)

    def post(self, request, notification_id):
        record = get_object_or_404(EmailNotification, pk=notification_id, status=EmailNotification.Status.FAILED)
        retry_email(record)
        return Response(AdminNotificationSerializer(record).data)
