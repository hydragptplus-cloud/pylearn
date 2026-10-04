from pathlib import Path
from decimal import Decimal
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.hashers import make_password
from django.core.exceptions import ImproperlyConfigured
from django.db.models import Q
from django.utils.text import slugify
from rest_framework import serializers
from PIL import Image, UnidentifiedImageError
from .models import (
    ActivityLog, Course, CourseCategory,
    EmailNotification, Enrollment, LearningMaterial, Question, Quiz, QuizAttempt,
    User, InstructorApplication, PaymentMethodConfig, Payment, Certificate,
)


def file_url(value):
    if not value:
        return None
    try:
        return value.url
    except Exception:
        return None


class SafeImageField(serializers.ImageField):
    def to_representation(self, value):
        return file_url(value)


def validate_uploaded_image(value, allowed_content_types, label):
    if getattr(value, "content_type", "") not in allowed_content_types:
        raise serializers.ValidationError(f"{label} must be a JPEG, PNG, WebP, or GIF image.")
    position = value.tell() if hasattr(value, "tell") else None
    try:
        image = Image.open(value)
        image.verify()
    except (UnidentifiedImageError, OSError) as exc:
        raise serializers.ValidationError(f"{label} is not a valid image file.") from exc
    finally:
        if hasattr(value, "seek"):
            value.seek(position or 0)
    return value


class UserSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    avatar = SafeImageField(required=False)

    class Meta:
        model = User
        fields = ["id", "email", "name", "first_name", "last_name", "role", "is_active", "must_change_password", "avatar", "bio", "phone", "student_id", "department", "date_joined"]
        read_only_fields = ["id", "email", "role", "is_active", "must_change_password", "student_id", "date_joined", "name"]

    def get_name(self, obj):
        return obj.get_full_name() or obj.email

    def validate_avatar(self, value):
        if value.size > settings.AVATAR_MAX_UPLOAD_SIZE:
            raise serializers.ValidationError("Avatar exceeds the configured upload limit.")
        allowed_content_types = {"image/jpeg", "image/png", "image/webp", "image/gif"}
        return validate_uploaded_image(value, allowed_content_types, "Avatar")

    def update(self, instance, validated_data):
        old_avatar_name = instance.avatar.name if instance.avatar else ""
        try:
            instance = super().update(instance, validated_data)
        except ImproperlyConfigured as exc:
            raise serializers.ValidationError({"avatar": str(exc)}) from exc
        if old_avatar_name and "avatar" in validated_data and instance.avatar.name != old_avatar_name:
            instance.avatar.storage.delete(old_avatar_name)
        return instance


class RegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ["email", "password", "first_name", "last_name", "department"]

    def create(self, validated_data):
        return User.objects.create_user(role=User.Role.STUDENT, **validated_data)


class AdminUserSerializer(UserSerializer):
    class Meta(UserSerializer.Meta):
        read_only_fields = ["id", "email", "student_id", "date_joined", "name"]


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = CourseCategory
        fields = ["id", "name", "slug"]
        read_only_fields = ["slug"]

    def create(self, validated_data):
        validated_data["slug"] = slugify(validated_data["name"])
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "name" in validated_data:
            validated_data["slug"] = slugify(validated_data["name"])
        return super().update(instance, validated_data)


class MaterialSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()
    completed = serializers.SerializerMethodField()

    class Meta:
        model = LearningMaterial
        fields = ["id", "course", "title", "description", "material_type", "file", "note_content", "order", "download_url", "completed", "created_at"]
        read_only_fields = ["download_url", "completed", "created_at"]
        extra_kwargs = {"file": {"write_only": True, "required": False}}

    def get_download_url(self, obj):
        return f"/backend-api/materials/{obj.pk}/download/" if obj.file else None

    def get_completed(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated or request.user.role != User.Role.STUDENT:
            return False
        return obj.progress_records.filter(enrollment__student=request.user).exists()

    def validate_file(self, value):
        if value.size > settings.MAX_UPLOAD_SIZE:
            raise serializers.ValidationError("File exceeds the configured upload limit.")
        extension = Path(value.name).suffix.lower()
        allowed = {".pdf", ".mp4", ".webm", ".mov", ".txt", ".md", ".doc", ".docx"}
        if extension not in allowed:
            raise serializers.ValidationError("Unsupported material file type.")
        return value

    def validate(self, attrs):
        kind = attrs.get("material_type", getattr(self.instance, "material_type", None))
        file = attrs.get("file", getattr(self.instance, "file", None))
        note = attrs.get("note_content", getattr(self.instance, "note_content", ""))
        if kind == LearningMaterial.MaterialType.NOTE and not file and not note:
            raise serializers.ValidationError("A note requires text content or a file.")
        if kind in [LearningMaterial.MaterialType.PDF, LearningMaterial.MaterialType.VIDEO] and not file:
            raise serializers.ValidationError("This material type requires a file.")
        if file:
            extension = Path(file.name).suffix.lower()
            allowed_by_type = {
                LearningMaterial.MaterialType.PDF: {".pdf"},
                LearningMaterial.MaterialType.VIDEO: {".mp4", ".webm", ".mov"},
                LearningMaterial.MaterialType.NOTE: {".txt", ".md", ".doc", ".docx", ".pdf"},
            }
            if extension not in allowed_by_type.get(kind, set()):
                raise serializers.ValidationError("The uploaded file does not match the selected material type.")
        return attrs


class CourseSerializer(serializers.ModelSerializer):
    category_detail = CategorySerializer(source="category", read_only=True)
    materials = serializers.SerializerMethodField()
    enrollment_count = serializers.IntegerField(source="enrollments.count", read_only=True)
    is_enrolled = serializers.SerializerMethodField()
    thumbnail = SafeImageField(required=False)
    instructor_name = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = ["id", "course_code", "title", "description", "category", "category_detail", "level", "status", "duration_hours", "thumbnail", "instructor", "instructor_name", "course_type", "price", "currency", "materials", "enrollment_count", "is_enrolled", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]

    def validate_course_code(self, value):
        value = (value or "").strip().upper()
        if not value:
            return ""
        if len(value) > 20:
            raise serializers.ValidationError("Course code must be 20 characters or fewer.")
        if not all(ch.isalnum() or ch in {"-"} for ch in value):
            raise serializers.ValidationError("Course code may contain only letters, numbers, and hyphens.")
        return value

    def validate_thumbnail(self, value):
        if value.size > settings.COURSE_THUMBNAIL_MAX_UPLOAD_SIZE:
            raise serializers.ValidationError("Course image exceeds the configured upload limit.")
        allowed_content_types = {"image/jpeg", "image/png", "image/webp", "image/gif"}
        return validate_uploaded_image(value, allowed_content_types, "Course image")

    def get_instructor_name(self, obj):
        return (obj.instructor.get_full_name() or obj.instructor.email) if obj.instructor else "PyLearn Admin"

    def validate(self, attrs):
        attrs = super().validate(attrs)
        kind = attrs.get("course_type", getattr(self.instance, "course_type", Course.CourseType.FREE))
        price = attrs.get("price", getattr(self.instance, "price", Decimal("0.00")))
        if kind == Course.CourseType.PAID and price <= 0:
            raise serializers.ValidationError({"price": "Paid courses require a price greater than zero."})
        if kind == Course.CourseType.FREE:
            attrs["price"] = Decimal("0.00")
        return attrs

    def create(self, validated_data):
        try:
            return super().create(validated_data)
        except ImproperlyConfigured as exc:
            raise serializers.ValidationError({"thumbnail": str(exc)}) from exc

    def update(self, instance, validated_data):
        old_thumbnail_name = instance.thumbnail.name if instance.thumbnail else ""
        try:
            instance = super().update(instance, validated_data)
        except ImproperlyConfigured as exc:
            raise serializers.ValidationError({"thumbnail": str(exc)}) from exc
        if old_thumbnail_name and "thumbnail" in validated_data and instance.thumbnail.name != old_thumbnail_name:
            instance.thumbnail.storage.delete(old_thumbnail_name)
        return instance

    def get_materials(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return []
        allowed = request.user.role == User.Role.ADMIN or obj.instructor_id == request.user.pk or self.get_is_enrolled(obj)
        return MaterialSerializer(obj.materials.all(), many=True, context=self.context).data if allowed else []

    def get_is_enrolled(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated or request.user.role != User.Role.STUDENT:
            return False
        prefetched = getattr(obj, "_prefetched_objects_cache", {}).get("enrollments")
        if prefetched is not None:
            return any(enrollment.student_id == request.user.pk for enrollment in prefetched)
        return obj.enrollments.filter(student=request.user).exists()


class EnrollmentSerializer(serializers.ModelSerializer):
    course_detail = CourseSerializer(source="course", read_only=True)
    student_detail = UserSerializer(source="student", read_only=True)
    progress = serializers.SerializerMethodField()

    class Meta:
        model = Enrollment
        fields = ["id", "student", "student_detail", "course", "course_detail", "enrolled_at", "progress"]
        read_only_fields = ["student", "enrolled_at", "progress"]

    def get_progress(self, obj):
        total = obj.course.materials.count()
        return round((obj.material_progress.count() / total) * 100, 2) if total else 0


class QuestionWriteSerializer(serializers.ModelSerializer):
    correct_answer = serializers.CharField(required=False, allow_blank=True, max_length=500)

    class Meta:
        model = Question
        fields = ["id", "question_type", "prompt", "topic", "learning_field", "advisor_skill", "options", "correct_answer", "grading_rubric", "points", "order"]

    def validate(self, attrs):
        qtype = attrs.get("question_type")
        options = attrs.get("options", [])
        if attrs.get("points", 1) < 1:
            raise serializers.ValidationError({"points": "Every question must be worth at least one point."})
        if qtype == Question.QuestionType.MULTIPLE_CHOICE and len(options) < 2:
            raise serializers.ValidationError("Multiple-choice questions require at least two options.")
        if qtype in [Question.QuestionType.SHORT_ANSWER, Question.QuestionType.LONG_ANSWER]:
            attrs["correct_answer"] = attrs.get("correct_answer", "")
        return attrs


class QuestionAttemptSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = ["id", "question_type", "prompt", "topic", "learning_field", "advisor_skill", "options", "points", "order"]


class QuizSerializer(serializers.ModelSerializer):
    questions = QuestionWriteSerializer(many=True, required=False)
    course_title = serializers.CharField(source="course.title", read_only=True)

    class Meta:
        model = Quiz
        fields = ["id", "course", "course_title", "title", "description", "passing_score", "is_initial_assessment", "quiz_type", "target_field", "is_published", "results_published", "questions", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]

    def create(self, validated_data):
        questions = validated_data.pop("questions", [])
        quiz = Quiz.objects.create(**validated_data)
        for question in questions:
            Question.objects.create(quiz=quiz, **question)
        return quiz

    def validate(self, attrs):
        if attrs.get("is_initial_assessment", getattr(self.instance, "is_initial_assessment", False)):
            attrs["quiz_type"] = Quiz.QuizType.SKILL_DISCOVERY
        kind = attrs.get("quiz_type", getattr(self.instance, "quiz_type", Quiz.QuizType.COURSE))
        target = attrs.get("target_field", getattr(self.instance, "target_field", None))
        if kind == Quiz.QuizType.SKILL_DEVELOPMENT and not target:
            raise serializers.ValidationError("Skill Development requires a target field.")
        if kind == Quiz.QuizType.SKILL_DISCOVERY:
            attrs["target_field"] = None
        if kind == Quiz.QuizType.COURSE and not attrs.get("course", getattr(self.instance, "course", None)):
            raise serializers.ValidationError("Course quizzes require a course.")
        questions = attrs.get("questions", [])
        if kind != Quiz.QuizType.COURSE:
            for question in questions:
                if question.get("question_type") in [Question.QuestionType.SHORT_ANSWER, Question.QuestionType.LONG_ANSWER] and not question.get("grading_rubric") and not question.get("correct_answer"):
                    raise serializers.ValidationError("Written Advisor questions require a reference answer or grading rubric.")
                if kind == Quiz.QuizType.SKILL_DEVELOPMENT:
                    if not question.get("learning_field") or not question.get("advisor_skill"):
                        raise serializers.ValidationError("Every Skill Development question requires a learning field and measured skill.")
                    if question["learning_field"] != target or question["advisor_skill"].field_id != target.pk:
                        raise serializers.ValidationError("Skill Development questions and skills must belong to the target field.")
        return attrs

    def update(self, instance, validated_data):
        questions = validated_data.pop("questions", None)
        instance = super().update(instance, validated_data)
        if questions is not None:
            instance.questions.all().delete()
            for question in questions:
                Question.objects.create(quiz=instance, **question)
        return instance


class QuizReadSerializer(serializers.ModelSerializer):
    questions = QuestionAttemptSerializer(many=True, read_only=True)
    course_title = serializers.CharField(source="course.title", read_only=True)
    user_attempted = serializers.SerializerMethodField()
    user_passed = serializers.SerializerMethodField()
    latest_attempt_percentage = serializers.SerializerMethodField()
    latest_attempt_analysis_status = serializers.SerializerMethodField()
    recommended_courses = serializers.SerializerMethodField()
    detailed_results = serializers.SerializerMethodField()

    class Meta:
        model = Quiz
        fields = ["id", "course", "course_title", "title", "description", "passing_score", "is_initial_assessment", "quiz_type", "target_field", "is_published", "results_published", "questions", "user_attempted", "user_passed", "latest_attempt_percentage", "latest_attempt_analysis_status", "recommended_courses", "detailed_results", "created_at", "updated_at"]

    def latest_user_attempt(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated or request.user.role != User.Role.STUDENT:
            return None
        cache = getattr(self, "_latest_attempt_cache", {})
        if obj.pk not in cache:
            cache[obj.pk] = obj.attempts.filter(student=request.user).order_by("-completed_at").first()
            self._latest_attempt_cache = cache
        return cache[obj.pk]

    def get_user_attempted(self, obj):
        return self.latest_user_attempt(obj) is not None

    def get_user_passed(self, obj):
        attempt = self.latest_user_attempt(obj)
        return bool(attempt and attempt.passed)

    def get_latest_attempt_percentage(self, obj):
        attempt = self.latest_user_attempt(obj)
        return attempt.percentage if attempt else None

    def get_latest_attempt_analysis_status(self, obj):
        attempt = self.latest_user_attempt(obj)
        return attempt.analysis_status if attempt else None

    def get_recommended_courses(self, obj):
        request = self.context.get("request")
        attempt = self.latest_user_attempt(obj)
        if not request or not obj.is_initial_assessment or not attempt or not attempt.passed:
            return []
        
        if not attempt.recommended_courses:
            return []

        rec_courses_data = []
        course_ids = [rec.get("course_id") for rec in attempt.recommended_courses[:1] if rec.get("course_id")]
        
        courses = (
            Course.objects.filter(pk__in=course_ids, status=Course.Status.PUBLISHED)
            .exclude(enrollments__student=request.user)
            .select_related("category")
            .prefetch_related("materials", "enrollments")
            .distinct()
        )
        courses_by_id = {c.pk: c for c in courses}
        
        for rec in attempt.recommended_courses[:1]:
            course_id = rec.get("course_id")
            if course_id in courses_by_id:
                course_data = CourseSerializer(courses_by_id[course_id], context=self.context).data
                course_data["recommendation_reason"] = rec.get("reason")
                rec_courses_data.append(course_data)
                break
                
        return rec_courses_data

    def get_detailed_results(self, obj):
        if obj.is_initial_assessment or obj.quiz_type != Quiz.QuizType.COURSE:
            return None
        attempt = self.latest_user_attempt(obj)
        if not attempt:
            return None
        
        results = {}
        for ans in attempt.answers.select_related('question').all():
            results[str(ans.question_id)] = {
                "is_correct": ans.is_correct,
                "correct_answer": ans.question.correct_answer,
                "submitted_answer": ans.answer
            }
        return results


class QuizAttemptSerializer(serializers.ModelSerializer):
    quiz_title = serializers.CharField(source="quiz.title", read_only=True)

    class Meta:
        model = QuizAttempt
        fields = ["id", "quiz", "quiz_title", "score", "max_score", "percentage", "passed", "analysis_status", "completed_at"]


class InstructorApplicationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = InstructorApplication
        fields = ["id", "reference", "full_name", "email", "password", "phone", "bachelor_degree", "master_degree", "years_experience", "expertise", "teaching_background", "status", "admin_note", "created_at", "reviewed_at", "instructor_account"]
        read_only_fields = ["id", "reference", "status", "admin_note", "created_at", "reviewed_at", "instructor_account"]

    def validate_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email=email).exists():
            raise serializers.ValidationError("An account already exists for this email.")
        if InstructorApplication.objects.filter(email=email, status=InstructorApplication.Status.PENDING).exclude(pk=getattr(self.instance, "pk", None)).exists():
            raise serializers.ValidationError("A pending application already exists for this email.")
        return email

    def create(self, validated_data):
        password = validated_data.pop("password")
        validated_data["password_hash"] = make_password(password)
        return super().create(validated_data)

class PaymentMethodConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentMethodConfig
        fields = ["id", "method", "display_name", "account_details", "account_holder", "instructions", "is_active"]


class PaymentSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    course_title = serializers.CharField(source="course.title", read_only=True)
    payment_method_detail = PaymentMethodConfigSerializer(source="payment_method", read_only=True)
    reviewer_name = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = [
            "id", "student", "student_name", "course", "course_title", "payment_method",
            "payment_method_detail", "method", "method_display_name", "account_details_snapshot",
            "account_holder_snapshot", "sender_details", "transaction_id", "course_price_snapshot",
            "amount", "currency", "payment_date", "proof", "status", "admin_note", "reviewed_by",
            "reviewer_name", "created_at", "reviewed_at",
        ]
        read_only_fields = [
            "student", "method", "method_display_name", "account_details_snapshot",
            "account_holder_snapshot", "course_price_snapshot", "currency", "status", "admin_note",
            "reviewed_by", "reviewer_name", "created_at", "reviewed_at",
        ]
        extra_kwargs = {"proof": {"write_only": True}}

    def get_student_name(self, obj):
        return obj.student.get_full_name() or obj.student.email

    def get_reviewer_name(self, obj):
        if not obj.reviewed_by:
            return ""
        return obj.reviewed_by.get_full_name() or obj.reviewed_by.email

    def validate_proof(self, value):
        if value.size > settings.PAYMENT_PROOF_MAX_UPLOAD_SIZE:
            raise serializers.ValidationError("Payment proof exceeds the configured upload limit.")
        return validate_uploaded_image(value, {"image/jpeg", "image/png", "image/webp"}, "Payment proof")

    def validate(self, attrs):
        course = attrs.get("course")
        payment_method = attrs.get("payment_method")
        request = self.context.get("request")
        student = request.user if request and request.user.is_authenticated else None
        sender_details = str(attrs.get("sender_details", "")).strip()
        transaction_id = str(attrs.get("transaction_id", "")).strip()
        if not sender_details:
            raise serializers.ValidationError({"sender_details": "Sender or account details are required."})
        if not transaction_id:
            raise serializers.ValidationError({"transaction_id": "Transaction or reference ID is required."})
        attrs["sender_details"] = sender_details
        attrs["transaction_id"] = transaction_id
        if not payment_method or not payment_method.is_active:
            raise serializers.ValidationError({"payment_method": "Select an active payment account."})
        if course and (course.course_type != Course.CourseType.PAID or course.status != Course.Status.PUBLISHED):
            raise serializers.ValidationError("Payments are only accepted for published paid courses.")
        if course and attrs.get("amount") != course.price:
            raise serializers.ValidationError({"amount": "Payment amount must match the course price."})
        if student and course and Enrollment.objects.filter(student=student, course=course).exists():
            raise serializers.ValidationError("You are already enrolled in this course.")
        if student and course and Payment.objects.filter(student=student, course=course, status=Payment.Status.PENDING).exists():
            raise serializers.ValidationError("A payment for this course is already pending review.")
        if Payment.objects.filter(method=payment_method.method, transaction_id_normalized=transaction_id.upper()).exists():
            raise serializers.ValidationError({"transaction_id": "This transaction reference was already submitted for this payment method."})
        return attrs

    def create(self, validated_data):
        payment_method = validated_data["payment_method"]
        course = validated_data["course"]
        validated_data.update(
            method=payment_method.method,
            method_display_name=payment_method.display_name,
            account_details_snapshot=payment_method.account_details,
            account_holder_snapshot=payment_method.account_holder,
            course_price_snapshot=course.price,
            currency="BDT",
        )
        return super().create(validated_data)


class CertificateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Certificate
        fields = ["id", "student", "course", "verification_number", "student_name", "course_title", "instructor_name", "eligibility_snapshot", "issued_at", "revoked_at", "revocation_reason"]
        read_only_fields = fields


class NotificationSerializer(serializers.ModelSerializer):
    recipient_name = serializers.SerializerMethodField()

    class Meta:
        model = EmailNotification
        fields = ["id", "recipient", "recipient_name", "event_type", "subject", "summary", "status", "attempted_at", "created_at"]

    def get_recipient_name(self, obj):
        return obj.recipient.get_full_name() or obj.recipient.email


class AdminNotificationSerializer(NotificationSerializer):
    class Meta(NotificationSerializer.Meta):
        fields = NotificationSerializer.Meta.fields + ["error_message"]


class ActivitySerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = ActivityLog
        fields = ["id", "actor", "actor_name", "action", "entity", "entity_id", "details", "created_at"]

    def get_actor_name(self, obj):
        return (obj.actor.get_full_name() or obj.actor.email) if obj.actor else "System"
