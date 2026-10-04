from decimal import Decimal
from django.db import transaction
from django.db.models import Prefetch, Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import Course, Quiz, QuizAnswer, QuizAttempt, User
from ..permissions import IsAdminRole
from ..serializers import QuizReadSerializer, QuizSerializer
from .analysis import analyze_attempt, level_for
from .models import AdvisorAnalysis, AdvisorAuditLog, AdvisorRecommendation, AdvisorSkill, CourseSkill, LearningField
from .serializers import AdvisorAttemptSerializer, AdvisorSkillSerializer, AuditSerializer, CourseSkillSerializer, LearningFieldSerializer


def admin(user):
    return user.is_authenticated and user.role == User.Role.ADMIN


class AdminWriteMixin:
    def get_permissions(self):
        return [IsAuthenticated()] if self.action in ["list", "retrieve"] else [IsAdminRole()]


class LearningFieldViewSet(AdminWriteMixin, viewsets.ModelViewSet):
    queryset = LearningField.objects.prefetch_related("skills")
    serializer_class = LearningFieldSerializer
    def get_queryset(self):
        qs = super().get_queryset()
        return qs if admin(self.request.user) else qs.filter(is_active=True)


class AdvisorSkillViewSet(viewsets.ModelViewSet):
    queryset = AdvisorSkill.objects.select_related("field")
    serializer_class = AdvisorSkillSerializer
    permission_classes = [IsAdminRole]


class CourseSkillViewSet(viewsets.ModelViewSet):
    queryset = CourseSkill.objects.select_related("course", "skill", "skill__field").order_by("course__title", "skill__name")
    serializer_class = CourseSkillSerializer
    permission_classes = [IsAdminRole]


class AdvisorQuizViewSet(viewsets.ModelViewSet):
    def get_permissions(self):
        return [IsAuthenticated()] if self.action in ["list", "retrieve", "submit"] else [IsAdminRole()]
    def get_serializer_class(self):
        return QuizSerializer if self.action in ["create", "update", "partial_update"] else QuizReadSerializer
    def get_queryset(self):
        qs = Quiz.objects.exclude(quiz_type=Quiz.QuizType.COURSE).select_related("target_field", "course").prefetch_related("questions")
        if not admin(self.request.user):
            qs = qs.filter(is_published=True)
        kind = self.request.query_params.get("type")
        field = self.request.query_params.get("field")
        if kind:
            qs = qs.filter(quiz_type=kind)
        if field:
            qs = qs.filter(target_field_id=field)
        return qs.order_by("-created_at")

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        quiz = self.get_object()
        if admin(request.user):
            return Response({"detail": "Only Students submit Advisor attempts."}, status=403)
        if QuizAttempt.objects.filter(student=request.user, quiz=quiz).exists():
            return Response({"detail": "You have already attempted this quiz."}, status=400)
        submitted = request.data.get("answers", {})
        with transaction.atomic():
            attempt = QuizAttempt.objects.create(quiz=quiz, student=request.user, analysis_status=QuizAttempt.AnalysisStatus.SUBMITTED)
            score = maximum = Decimal("0")
            for question in quiz.questions.all():
                answer_text = str(submitted.get(str(question.pk), "")).strip()
                maximum += Decimal(question.points)
                objective = question.question_type in {question.QuestionType.MULTIPLE_CHOICE, question.QuestionType.TRUE_FALSE}
                correct = objective and answer_text.casefold() == question.correct_answer.strip().casefold()
                awarded = Decimal(question.points) if correct else Decimal("0")
                score += awarded
                QuizAnswer.objects.create(attempt=attempt, question=question, answer=answer_text, is_correct=correct, awarded_points=awarded)
            attempt.score, attempt.max_score = score, maximum
            attempt.percentage = (score / maximum * 100).quantize(Decimal("0.01")) if maximum else 0
            attempt.save(update_fields=["score", "max_score", "percentage", "updated_at"])
        try:
            analyze_attempt(attempt.pk, request.user)
        except Exception:
            pass
        attempt.refresh_from_db()
        return Response(AdvisorAttemptSerializer(attempt, context={"request": request}).data, status=status.HTTP_201_CREATED)


class AdvisorAttemptViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AdvisorAttemptSerializer
    permission_classes = [IsAuthenticated]
    def get_queryset(self):
        qs = QuizAttempt.objects.exclude(quiz__quiz_type=Quiz.QuizType.COURSE).select_related("student", "quiz", "advisor_analysis", "advisor_analysis__strongest_field").prefetch_related(
            "advisor_analysis__recommendations__course",
            Prefetch(
                "answers",
                queryset=QuizAnswer.objects.select_related(
                    "question__learning_field", "question__advisor_skill"
                ).order_by("question__order", "question_id"),
            ),
        )
        if not admin(self.request.user):
            qs = qs.filter(student=self.request.user)
        state = self.request.query_params.get("status")
        quiz = self.request.query_params.get("quiz")
        quiz_type = self.request.query_params.get("type")
        search = self.request.query_params.get("search", "").strip()
        if quiz:
            qs = qs.filter(quiz_id=quiz)
        if quiz_type:
            qs = qs.filter(quiz__quiz_type=quiz_type)
        if search:
            qs = qs.filter(
                Q(student__email__icontains=search)
                | Q(student__first_name__icontains=search)
                | Q(student__last_name__icontains=search)
            )
        if state:
            states = [value.strip() for value in state.split(",") if value.strip()]
            qs = qs.filter(analysis_status__in=states)
        return qs.order_by("-completed_at")

    @action(detail=False, methods=["get"], permission_classes=[IsAdminRole])
    def summary(self, request):
        advisor_attempts = QuizAttempt.objects.exclude(quiz__quiz_type=Quiz.QuizType.COURSE)
        actionable = [
            QuizAttempt.AnalysisStatus.SUBMITTED,
            QuizAttempt.AnalysisStatus.ANALYSIS_FAILED,
            QuizAttempt.AnalysisStatus.DRAFT_READY,
        ]
        recent = advisor_attempts.select_related("student", "quiz").order_by("-completed_at")[:5]
        return Response({
            "learning_fields": LearningField.objects.count(),
            "active_skills": AdvisorSkill.objects.filter(is_active=True).count(),
            "mapped_courses": CourseSkill.objects.values("course_id").distinct().count(),
            "awaiting_review": advisor_attempts.filter(analysis_status__in=actionable).count(),
            "recent_activity": [
                {
                    "id": attempt.pk,
                    "student": attempt.student_id,
                    "student_name": attempt.student.get_full_name().strip() or attempt.student.email.split("@", 1)[0],
                    "student_email": attempt.student.email,
                    "quiz_title": attempt.quiz.title,
                    "quiz_type": attempt.quiz.quiz_type,
                    "analysis_status": attempt.analysis_status,
                    "completed_at": attempt.completed_at,
                }
                for attempt in recent
            ],
        })

    @action(detail=True, methods=["post"], permission_classes=[IsAdminRole])
    def analyze(self, request, pk=None):
        try:
            analyze_attempt(self.get_object().pk, request.user)
        except Exception as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(self.get_serializer(self.get_object()).data)

    @action(detail=True, methods=["patch"], permission_classes=[IsAdminRole])
    def draft(self, request, pk=None):
        attempt = self.get_object()
        if attempt.analysis_status != QuizAttempt.AnalysisStatus.DRAFT_READY:
            return Response({"detail": "Only a ready draft can be edited."}, status=400)
        analysis = attempt.advisor_analysis
        before = {k: getattr(analysis, k) for k in ["summary", "strongest_skills", "field_scores", "strengths", "gaps"]}
        for key in before:
            if key in request.data:
                setattr(analysis, key, request.data[key])
        if "strongest_field" in request.data:
            analysis.strongest_field_id = request.data["strongest_field"] or None
        if "recommendations" in request.data:
            analysis.recommendations.all().delete()
            eligible = {c.id: c for c in Course.objects.filter(status=Course.Status.PUBLISHED).exclude(enrollments__student=attempt.student)}
            for item in request.data.get("recommendations") or []:
                course = eligible.get(int(item.get("course", 0)))
                if course and item.get("match_type") in AdvisorRecommendation.MatchType.values:
                    AdvisorRecommendation.objects.create(analysis=analysis, course=course, match_type=item["match_type"], reason=str(item.get("reason", ""))[:2000])
        analysis.reviewed_by = request.user
        analysis.save()
        AdvisorAuditLog.objects.create(analysis=analysis, actor=request.user, action="ADMIN_EDITED", changes={"before": before, "after": request.data})
        return Response(self.get_serializer(attempt).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminRole])
    def publish(self, request, pk=None):
        with transaction.atomic():
            # PostgreSQL cannot apply FOR UPDATE to the nullable side of the
            # outer join produced by the reverse one-to-one advisor_analysis
            # relation. Lock only the attempt row and load the analysis after.
            attempt = QuizAttempt.objects.select_for_update().select_related("quiz").get(pk=self.get_object().pk)
            if attempt.analysis_status != QuizAttempt.AnalysisStatus.DRAFT_READY:
                return Response({"detail": "Analyze and review this attempt before publishing."}, status=400)
            try:
                analysis = attempt.advisor_analysis
            except AdvisorAnalysis.DoesNotExist:
                return Response({"detail": "This attempt has no analyzed draft to publish."}, status=400)
            attempt.analysis_status = QuizAttempt.AnalysisStatus.PUBLISHED
            attempt.published_at = timezone.now()
            attempt.save(update_fields=["analysis_status", "published_at", "updated_at"])
            AdvisorAuditLog.objects.create(analysis=analysis, actor=request.user, action="PUBLISHED", changes={})
        return Response(self.get_serializer(attempt).data)

    @action(detail=True, methods=["get"], permission_classes=[IsAdminRole])
    def audit(self, request, pk=None):
        attempt = self.get_object()
        if not hasattr(attempt, "advisor_analysis"):
            return Response([])
        return Response(AuditSerializer(attempt.advisor_analysis.audit_logs.all(), many=True).data)
