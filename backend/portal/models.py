from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.core.validators import MinValueValidator
from django.utils.text import slugify
from decimal import Decimal
import uuid


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("role", User.Role.ADMIN)
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Admin"
        STUDENT = "STUDENT", "Student"
        INSTRUCTOR = "INSTRUCTOR", "Instructor"

    username = None
    email = models.EmailField(unique=True, db_index=True)
    role = models.CharField(max_length=12, choices=Role.choices, default=Role.STUDENT, db_index=True)
    must_change_password = models.BooleanField(default=False)
    avatar = models.ImageField(upload_to="avatars/%Y/%m/", blank=True)
    bio = models.TextField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    student_id = models.CharField(max_length=30, blank=True, unique=True, null=True)
    department = models.CharField(max_length=120, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []
    objects = UserManager()


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class CourseCategory(TimeStampedModel):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True)

    def __str__(self):
        return self.name


class Course(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PUBLISHED = "PUBLISHED", "Published"
        ARCHIVED = "ARCHIVED", "Archived"

    class Level(models.TextChoices):
        BEGINNER = "BEGINNER", "Beginner"
        INTERMEDIATE = "INTERMEDIATE", "Intermediate"
        ADVANCED = "ADVANCED", "Advanced"

    class CourseType(models.TextChoices):
        FREE = "FREE", "Free"
        PAID = "PAID", "Paid"

    title = models.CharField(max_length=220, db_index=True)
    course_code = models.CharField(max_length=20, unique=True, null=True, blank=True, db_index=True)
    description = models.TextField()
    category = models.ForeignKey(CourseCategory, on_delete=models.PROTECT, related_name="courses")
    level = models.CharField(max_length=20, choices=Level.choices, default=Level.BEGINNER)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True)
    duration_hours = models.PositiveIntegerField(default=0)
    thumbnail = models.ImageField(upload_to="courses/%Y/%m/", blank=True)
    instructor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="instructor_courses", limit_choices_to={"role": User.Role.INSTRUCTOR})
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_courses")
    course_type = models.CharField(max_length=8, choices=CourseType.choices, default=CourseType.FREE, db_index=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0.00"), validators=[MinValueValidator(Decimal("0.00"))])
    currency = models.CharField(max_length=3, default="BDT", editable=False)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(price__gte=Decimal("0.00")),
                name="course_price_non_negative",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(course_type="FREE", price=Decimal("0.00"))
                    | models.Q(course_type="PAID", price__gt=Decimal("0.00"))
                ),
                name="course_type_matches_price",
            ),
            models.CheckConstraint(
                condition=models.Q(currency="BDT"),
                name="course_currency_is_bdt",
            ),
        ]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if self.course_type == self.CourseType.FREE:
            self.price = Decimal("0.00")
        if not self.course_code:
            self.course_code = self.generate_course_code()
        else:
            self.course_code = self.course_code.strip().upper()
        super().save(*args, **kwargs)

    def generate_course_code(self):
        source = self.category.slug if self.category_id and self.category else self.title
        prefix = "".join(part[:3] for part in slugify(source).split("-")[:1]).upper()
        if len(prefix) < 3:
            prefix = (prefix + "".join(ch for ch in self.title.upper() if ch.isalnum()))[:3]
        prefix = (prefix or "CRS")[:3]
        level_numbers = {
            self.Level.BEGINNER: "101",
            self.Level.INTERMEDIATE: "201",
            self.Level.ADVANCED: "301",
        }
        base = f"{prefix}-{level_numbers.get(self.level, '101')}"
        candidate = base
        suffix = 2
        while Course.objects.filter(course_code=candidate).exclude(pk=self.pk).exists():
            candidate = f"{base}-{suffix}"
            suffix += 1
        return candidate


class LearningMaterial(TimeStampedModel):
    class MaterialType(models.TextChoices):
        PDF = "PDF", "PDF"
        VIDEO = "VIDEO", "Video"
        NOTE = "NOTE", "Note"

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="materials")
    title = models.CharField(max_length=220, db_index=True)
    description = models.TextField(blank=True)
    material_type = models.CharField(max_length=10, choices=MaterialType.choices)
    file = models.FileField(upload_to="materials/%Y/%m/", blank=True)
    note_content = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "created_at"]
        indexes = [models.Index(fields=["course", "order"])]


class Enrollment(TimeStampedModel):
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name="enrollments")
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="enrollments")
    enrolled_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["student", "course"], name="unique_student_course")]
        indexes = [models.Index(fields=["student", "course"])]


class MaterialProgress(models.Model):
    enrollment = models.ForeignKey(Enrollment, on_delete=models.CASCADE, related_name="material_progress")
    material = models.ForeignKey(LearningMaterial, on_delete=models.CASCADE, related_name="progress_records")
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["enrollment", "material"], name="unique_material_progress")]


class InstructorApplication(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    reference = models.CharField(max_length=20, unique=True, editable=False, db_index=True)
    full_name = models.CharField(max_length=180)
    email = models.EmailField(db_index=True)
    phone = models.CharField(max_length=40)
    bachelor_degree = models.CharField(max_length=220)
    master_degree = models.CharField(max_length=220, blank=True)
    years_experience = models.PositiveIntegerField(null=True, blank=True)
    expertise = models.TextField(blank=True)
    teaching_background = models.TextField()
    password_hash = models.CharField(max_length=128, editable=False)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="reviewed_instructor_applications")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    admin_note = models.TextField(blank=True)
    instructor_account = models.OneToOneField(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="instructor_application")

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["email"], condition=models.Q(status="PENDING"), name="one_pending_instructor_application_per_email")]

    def save(self, *args, **kwargs):
        self.email = self.email.strip().lower()
        if not self.reference:
            self.reference = f"INS-{uuid.uuid4().hex[:10].upper()}"
        super().save(*args, **kwargs)


class PaymentMethodConfig(TimeStampedModel):
    class Method(models.TextChoices):
        BKASH = "BKASH", "bKash"
        NAGAD = "NAGAD", "Nagad"
        BANK_PAY = "BANK_PAY", "Bank Pay"

    method = models.CharField(max_length=12, choices=Method.choices, db_index=True)
    display_name = models.CharField(max_length=80)
    account_details = models.TextField()
    account_holder = models.CharField(max_length=160, blank=True)
    instructions = models.TextField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)


class Payment(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name="payments", limit_choices_to={"role": User.Role.STUDENT})
    course = models.ForeignKey(Course, on_delete=models.PROTECT, related_name="payments")
    payment_method = models.ForeignKey(PaymentMethodConfig, on_delete=models.PROTECT, related_name="payments")
    method = models.CharField(max_length=12, choices=PaymentMethodConfig.Method.choices, db_index=True)
    method_display_name = models.CharField(max_length=80)
    account_details_snapshot = models.TextField()
    account_holder_snapshot = models.CharField(max_length=160, blank=True)
    sender_details = models.CharField(max_length=220)
    transaction_id = models.CharField(max_length=120)
    transaction_id_normalized = models.CharField(max_length=120, editable=False)
    course_price_snapshot = models.DecimalField(max_digits=10, decimal_places=2)
    amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    currency = models.CharField(max_length=3, default="BDT", editable=False)
    payment_date = models.DateField()
    proof = models.ImageField(upload_to="payment-proofs/%Y/%m/")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="reviewed_payments")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    admin_note = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["method", "transaction_id_normalized"], name="unique_payment_reference_per_method_ci"),
            models.UniqueConstraint(fields=["student", "course"], condition=models.Q(status="PENDING"), name="one_pending_payment_per_course"),
        ]

    def save(self, *args, **kwargs):
        self.transaction_id = self.transaction_id.strip()
        self.transaction_id_normalized = self.transaction_id.upper()
        super().save(*args, **kwargs)


class Certificate(TimeStampedModel):
    student = models.ForeignKey(User, on_delete=models.PROTECT, related_name="certificates")
    course = models.ForeignKey(Course, on_delete=models.PROTECT, related_name="certificates")
    verification_number = models.CharField(max_length=40, unique=True, editable=False, db_index=True)
    student_name = models.CharField(max_length=180)
    course_title = models.CharField(max_length=220)
    instructor_name = models.CharField(max_length=180, blank=True)
    eligibility_snapshot = models.JSONField(default=dict)
    issued_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="revoked_certificates")
    revocation_reason = models.TextField(blank=True)

    class Meta:
        ordering = ["-issued_at"]
        constraints = [models.UniqueConstraint(fields=["student", "course"], name="one_certificate_per_student_course")]

    def save(self, *args, **kwargs):
        if not self.verification_number:
            self.verification_number = f"PYL-{uuid.uuid4().hex[:16].upper()}"
        super().save(*args, **kwargs)


class Quiz(TimeStampedModel):
    class QuizType(models.TextChoices):
        COURSE = "COURSE", "Course quiz"
        SKILL_DISCOVERY = "SKILL_DISCOVERY", "Skill Discovery"
        SKILL_DEVELOPMENT = "SKILL_DEVELOPMENT", "Skill Development"

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="quizzes", null=True, blank=True)
    title = models.CharField(max_length=220)
    description = models.TextField(blank=True)
    passing_score = models.PositiveIntegerField(default=60)
    is_initial_assessment = models.BooleanField(default=False)
    quiz_type = models.CharField(max_length=24, choices=QuizType.choices, default=QuizType.COURSE, db_index=True)
    target_field = models.ForeignKey("LearningField", on_delete=models.PROTECT, null=True, blank=True, related_name="development_quizzes")
    is_published = models.BooleanField(default=False, db_index=True)
    results_published = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        if self.is_initial_assessment:
            self.quiz_type = self.QuizType.SKILL_DISCOVERY
            if kwargs.get("update_fields") is not None:
                kwargs["update_fields"] = set(kwargs["update_fields"]) | {"quiz_type"}
        super().save(*args, **kwargs)


class Question(TimeStampedModel):
    class QuestionType(models.TextChoices):
        MULTIPLE_CHOICE = "MULTIPLE_CHOICE", "Multiple choice"
        TRUE_FALSE = "TRUE_FALSE", "True or false"
        SHORT_ANSWER = "SHORT_ANSWER", "Short answer"
        LONG_ANSWER = "LONG_ANSWER", "Long answer"

    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="questions")
    question_type = models.CharField(max_length=20, choices=QuestionType.choices)
    prompt = models.TextField()
    topic = models.CharField(max_length=160, db_index=True)
    learning_field = models.ForeignKey("LearningField", on_delete=models.PROTECT, null=True, blank=True, related_name="questions")
    advisor_skill = models.ForeignKey("AdvisorSkill", on_delete=models.PROTECT, null=True, blank=True, related_name="questions")
    grading_rubric = models.TextField(blank=True)
    options = models.JSONField(default=list, blank=True)
    correct_answer = models.CharField(max_length=500, blank=True)
    points = models.PositiveIntegerField(default=1)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]


class QuizAttempt(TimeStampedModel):
    class AnalysisStatus(models.TextChoices):
        NOT_REQUIRED = "NOT_REQUIRED", "Not required"
        SUBMITTED = "SUBMITTED", "Awaiting analysis"
        ANALYZING = "ANALYZING", "Analyzing"
        DRAFT_READY = "DRAFT_READY", "Draft ready"
        ANALYSIS_FAILED = "ANALYSIS_FAILED", "Analysis failed"
        PUBLISHED = "PUBLISHED", "Published"

    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="attempts")
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name="quiz_attempts")
    score = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    max_score = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    passed = models.BooleanField(default=False)
    recommended_courses = models.JSONField(default=list)
    analysis_status = models.CharField(max_length=20, choices=AnalysisStatus.choices, default=AnalysisStatus.NOT_REQUIRED, db_index=True)
    analysis_error = models.TextField(blank=True)
    analyzed_at = models.DateTimeField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["student", "quiz", "-completed_at"])]


class QuizAnswer(models.Model):
    attempt = models.ForeignKey(QuizAttempt, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="answers")
    answer = models.TextField(blank=True)
    is_correct = models.BooleanField(default=False)
    awarded_points = models.DecimalField(max_digits=7, decimal_places=2, default=0)
    ai_feedback = models.TextField(blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["attempt", "question"], name="unique_attempt_answer")]


class AIProviderConfig(TimeStampedModel):
    class Provider(models.TextChoices):
        OPENAI = "OPENAI", "OpenAI"
        GEMINI = "GEMINI", "Gemini"
        GENERIC = "GENERIC", "OpenAI-compatible"

    provider = models.CharField(max_length=20, choices=Provider.choices)
    model = models.CharField(max_length=160)
    base_url = models.URLField(blank=True)
    encrypted_api_key = models.TextField()
    is_active = models.BooleanField(default=True)


class EmailNotification(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        SENT = "SENT", "Sent"
        FAILED = "FAILED", "Failed"

    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name="email_notifications")
    event_type = models.CharField(max_length=80, db_index=True)
    subject = models.CharField(max_length=255)
    summary = models.TextField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    attempted_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]


class ActivityLog(models.Model):
    actor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="activity_logs")
    action = models.CharField(max_length=80, db_index=True)
    entity = models.CharField(max_length=80)
    entity_id = models.CharField(max_length=80, blank=True)
    details = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]


# Advisor models live in their own domain module while remaining part of the
# portal Django app so migrations and permissions stay unified.
from .advisor.models import (  # noqa: E402,F401
    AdvisorAnalysis, AdvisorAuditLog, AdvisorRecommendation, AdvisorSkill,
    CourseSkill, LearningField,
)
