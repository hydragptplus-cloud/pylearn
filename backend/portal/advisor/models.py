from django.conf import settings
from django.db import models


class LearningField(models.Model):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        app_label = "portal"
        ordering = ["order", "name"]


class AdvisorSkill(models.Model):
    field = models.ForeignKey(LearningField, on_delete=models.CASCADE, related_name="skills")
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        app_label = "portal"
        constraints = [models.UniqueConstraint(fields=["field", "name"], name="unique_advisor_skill")]


class CourseSkill(models.Model):
    course = models.ForeignKey("portal.Course", on_delete=models.CASCADE, related_name="advisor_skill_mappings")
    skill = models.ForeignKey(AdvisorSkill, on_delete=models.CASCADE, related_name="course_mappings")
    coverage = models.PositiveSmallIntegerField(default=100)

    class Meta:
        app_label = "portal"
        constraints = [models.UniqueConstraint(fields=["course", "skill"], name="unique_course_advisor_skill")]


class AdvisorAnalysis(models.Model):
    class Level(models.TextChoices):
        BEGINNER = "BEGINNER", "Beginner"
        INTERMEDIATE = "INTERMEDIATE", "Intermediate"
        ADVANCED = "ADVANCED", "Advanced"

    attempt = models.OneToOneField("portal.QuizAttempt", on_delete=models.CASCADE, related_name="advisor_analysis")
    summary = models.TextField(blank=True)
    strongest_field = models.ForeignKey(LearningField, on_delete=models.PROTECT, null=True, blank=True, related_name="strongest_results")
    strongest_skills = models.JSONField(default=list)
    field_scores = models.JSONField(default=list)
    strengths = models.JSONField(default=list)
    gaps = models.JSONField(default=list)
    level = models.CharField(max_length=20, choices=Level.choices, blank=True)
    ai_payload = models.JSONField(default=dict)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="reviewed_advisor_analyses")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "portal"


class AdvisorRecommendation(models.Model):
    class MatchType(models.TextChoices):
        ADVANCED = "ADVANCED", "Advanced"
        EXACT_MATCH = "EXACT_MATCH", "Exact match"
        BEST_RELATED = "BEST_RELATED", "Best related"

    analysis = models.ForeignKey(AdvisorAnalysis, on_delete=models.CASCADE, related_name="recommendations")
    course = models.ForeignKey("portal.Course", on_delete=models.PROTECT, related_name="advisor_recommendations")
    match_type = models.CharField(max_length=20, choices=MatchType.choices)
    reason = models.TextField()

    class Meta:
        app_label = "portal"


class AdvisorAuditLog(models.Model):
    analysis = models.ForeignKey(AdvisorAnalysis, on_delete=models.CASCADE, related_name="audit_logs")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    action = models.CharField(max_length=40)
    changes = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "portal"
        ordering = ["-created_at"]
