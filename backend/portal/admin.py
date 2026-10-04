from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.utils.translation import gettext_lazy as _
from .models import (
    AIProviderConfig, ActivityLog, Course,
    CourseCategory, EmailNotification, Enrollment, LearningMaterial,
    MaterialProgress, Question, Quiz, QuizAnswer, QuizAttempt, User,
    InstructorApplication, PaymentMethodConfig, Payment, Certificate,
    AdvisorAnalysis, AdvisorAuditLog, AdvisorRecommendation, AdvisorSkill, CourseSkill, LearningField,
)


@admin.register(User)
class PortalUserAdmin(UserAdmin):
    ordering = ["email"]
    list_display = ["email", "first_name", "last_name", "role", "is_active"]
    search_fields = ["email", "first_name", "last_name", "student_id"]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        (_("Personal info"), {"fields": ("first_name", "last_name", "role", "student_id", "department", "phone", "bio", "avatar")}),
        (_("Permissions"), {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        (_("Important dates"), {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = ((None, {"classes": ("wide",), "fields": ("email", "password1", "password2", "role")}),)


for model in [CourseCategory, Course, LearningMaterial, Enrollment, MaterialProgress,
              Quiz, Question, QuizAttempt, QuizAnswer,
              InstructorApplication, PaymentMethodConfig, Payment, Certificate,
              AIProviderConfig, EmailNotification, ActivityLog,
              LearningField, AdvisorSkill, CourseSkill, AdvisorAnalysis,
              AdvisorRecommendation, AdvisorAuditLog]:
    admin.site.register(model)
