from rest_framework import serializers
from ..models import QuizAttempt, Question
from .models import AdvisorAnalysis, AdvisorAuditLog, AdvisorRecommendation, AdvisorSkill, CourseSkill, LearningField


class AdvisorSkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = AdvisorSkill
        fields = "__all__"


class LearningFieldSerializer(serializers.ModelSerializer):
    skills = AdvisorSkillSerializer(many=True, read_only=True)
    class Meta:
        model = LearningField
        fields = ["id", "name", "slug", "description", "is_active", "order", "skills"]


class CourseSkillSerializer(serializers.ModelSerializer):
    course_title = serializers.CharField(source="course.title", read_only=True)
    skill_name = serializers.CharField(source="skill.name", read_only=True)
    field = serializers.IntegerField(source="skill.field_id", read_only=True)
    field_name = serializers.CharField(source="skill.field.name", read_only=True)

    def validate_coverage(self, value):
        if not 1 <= value <= 100:
            raise serializers.ValidationError("Coverage must be between 1 and 100 percent.")
        return value

    def validate(self, attrs):
        course = attrs.get("course", getattr(self.instance, "course", None))
        skill = attrs.get("skill", getattr(self.instance, "skill", None))
        if course and skill:
            duplicate = CourseSkill.objects.filter(course=course, skill=skill)
            if self.instance:
                duplicate = duplicate.exclude(pk=self.instance.pk)
            if duplicate.exists():
                raise serializers.ValidationError({"detail": "This course is already mapped to the selected skill."})
        return attrs

    class Meta:
        model = CourseSkill
        fields = ["id", "course", "course_title", "field", "field_name", "skill", "skill_name", "coverage"]
        validators = []


class RecommendationSerializer(serializers.ModelSerializer):
    course_title = serializers.CharField(source="course.title", read_only=True)
    class Meta:
        model = AdvisorRecommendation
        fields = ["id", "course", "course_title", "match_type", "reason"]


class AnalysisSerializer(serializers.ModelSerializer):
    strongest_field_name = serializers.CharField(source="strongest_field.name", read_only=True)
    strongest_skill_names = serializers.SerializerMethodField()
    strengths = serializers.SerializerMethodField()
    gaps = serializers.SerializerMethodField()
    recommendations = RecommendationSerializer(many=True, read_only=True)

    def _normalize_list(self, raw):
        if isinstance(raw, str):
            return [line.strip() for line in raw.split("\n") if line.strip()]
        if isinstance(raw, list):
            res = []
            for item in raw:
                if isinstance(item, str) and item.strip():
                    res.append(item.strip())
                elif isinstance(item, dict):
                    name = item.get("name") or item.get("skill") or item.get("description") or str(item)
                    if name:
                        res.append(str(name).strip())
            return res
        return []

    def get_strongest_skill_names(self, obj):
        if isinstance(obj.strongest_skills, list):
            names = []
            id_list = [k for k in obj.strongest_skills if isinstance(k, int)]
            if id_list:
                id_map = dict(AdvisorSkill.objects.filter(pk__in=id_list).values_list("pk", "name"))
            else:
                id_map = {}
            for item in obj.strongest_skills:
                if isinstance(item, int) and item in id_map:
                    names.append(id_map[item])
                elif isinstance(item, str) and item.strip():
                    names.append(item.strip())
                elif isinstance(item, dict):
                    name = item.get("name") or item.get("skill") or str(item)
                    if name:
                        names.append(str(name).strip())
            return names
        if isinstance(obj.strongest_skills, str) and obj.strongest_skills.strip():
            return [obj.strongest_skills.strip()]
        return []

    def get_strengths(self, obj):
        return self._normalize_list(obj.strengths)

    def get_gaps(self, obj):
        return self._normalize_list(obj.gaps)

    class Meta:
        model = AdvisorAnalysis
        exclude = ["ai_payload"]


class PublishedAdvisorAnswerSerializer(serializers.Serializer):
    question_id = serializers.IntegerField(source="question.id")
    prompt = serializers.CharField(source="question.prompt")
    question_type = serializers.CharField(source="question.question_type")
    topic = serializers.CharField(source="question.topic")
    field = serializers.IntegerField(source="question.learning_field_id", allow_null=True)
    field_name = serializers.CharField(source="question.learning_field.name", allow_null=True)
    skill = serializers.IntegerField(source="question.advisor_skill_id", allow_null=True)
    skill_name = serializers.CharField(source="question.advisor_skill.name", allow_null=True)
    options = serializers.JSONField(source="question.options")
    max_points = serializers.IntegerField(source="question.points")
    submitted_answer = serializers.CharField(source="answer")
    awarded_points = serializers.DecimalField(max_digits=7, decimal_places=2)
    is_correct = serializers.SerializerMethodField()
    correct_answer = serializers.SerializerMethodField()
    ai_feedback = serializers.SerializerMethodField()

    @staticmethod
    def _objective(obj):
        return obj.question.question_type in {
            Question.QuestionType.MULTIPLE_CHOICE,
            Question.QuestionType.TRUE_FALSE,
        }

    def get_is_correct(self, obj):
        return obj.is_correct if self._objective(obj) else None

    def get_correct_answer(self, obj):
        return obj.question.correct_answer if self._objective(obj) else None

    def get_ai_feedback(self, obj):
        return None if self._objective(obj) else obj.ai_feedback


class AdvisorAttemptSerializer(serializers.ModelSerializer):
    student = serializers.SerializerMethodField()
    student_name = serializers.SerializerMethodField()
    student_email = serializers.SerializerMethodField()
    quiz_title = serializers.CharField(source="quiz.title", read_only=True)
    quiz_type = serializers.CharField(source="quiz.quiz_type", read_only=True)
    analysis = serializers.SerializerMethodField()
    analysis_error = serializers.SerializerMethodField()
    answers = serializers.SerializerMethodField()
    score = serializers.SerializerMethodField()
    max_score = serializers.SerializerMethodField()
    percentage = serializers.SerializerMethodField()
    class Meta:
        model = QuizAttempt
        fields = ["id", "student", "student_name", "student_email", "quiz", "quiz_title", "quiz_type", "score", "max_score", "percentage", "analysis_status", "analysis_error", "completed_at", "analyzed_at", "published_at", "analysis", "answers"]

    def _admin_request(self):
        request = self.context.get("request")
        return bool(request and request.user.role == "ADMIN")

    def get_student(self, obj):
        return obj.student_id if self._admin_request() else None

    def get_student_name(self, obj):
        if not self._admin_request():
            return None
        return obj.student.get_full_name().strip() or obj.student.email.split("@", 1)[0]

    def get_student_email(self, obj):
        return obj.student.email if self._admin_request() else None

    def _can_view_result(self, obj):
        request = self.context.get("request")
        return request and (request.user.role == "ADMIN" or obj.analysis_status == QuizAttempt.AnalysisStatus.PUBLISHED)

    def get_analysis(self, obj):
        if not hasattr(obj, "advisor_analysis") or not self._can_view_result(obj):
            return None
        return AnalysisSerializer(obj.advisor_analysis).data

    def get_analysis_error(self, obj):
        request = self.context.get("request")
        return obj.analysis_error if request and request.user.role == "ADMIN" else ""

    def get_score(self, obj):
        return str(obj.score) if self._can_view_result(obj) else None

    def get_max_score(self, obj):
        return str(obj.max_score) if self._can_view_result(obj) else None

    def get_percentage(self, obj):
        return str(obj.percentage) if self._can_view_result(obj) else None

    def get_answers(self, obj):
        if not self._can_view_result(obj):
            return []
        return PublishedAdvisorAnswerSerializer(obj.answers.all(), many=True).data


class AuditSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.email", read_only=True)
    class Meta:
        model = AdvisorAuditLog
        fields = ["id", "actor_name", "action", "changes", "created_at"]
