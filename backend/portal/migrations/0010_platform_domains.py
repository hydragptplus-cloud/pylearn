import django.core.validators
import django.db.models.deletion
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("portal", "0009_learning_path_advisor")]

    operations = [
        migrations.CreateModel(name="PaymentMethodConfig", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)),
            ("method", models.CharField(choices=[("BKASH", "bKash"), ("NAGAD", "Nagad"), ("BANK_PAY", "Bank Pay")], max_length=12, unique=True)),
            ("display_name", models.CharField(max_length=80)), ("account_details", models.TextField()),
            ("account_holder", models.CharField(blank=True, max_length=160)), ("instructions", models.TextField(blank=True)),
            ("is_active", models.BooleanField(db_index=True, default=True)),
        ]),
        migrations.AddField(model_name="course", name="course_type", field=models.CharField(choices=[("FREE", "Free"), ("PAID", "Paid")], db_index=True, default="FREE", max_length=8)),
        migrations.AddField(model_name="course", name="created_by", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="created_courses", to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name="course", name="currency", field=models.CharField(default="BDT", editable=False, max_length=3)),
        migrations.AddField(model_name="course", name="instructor", field=models.ForeignKey(blank=True, limit_choices_to={"role": "INSTRUCTOR"}, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="instructor_courses", to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name="course", name="price", field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=10, validators=[django.core.validators.MinValueValidator(Decimal("0.00"))])),
        migrations.AddField(model_name="user", name="must_change_password", field=models.BooleanField(default=False)),
        migrations.AlterField(model_name="user", name="role", field=models.CharField(choices=[("ADMIN", "Admin"), ("STUDENT", "Student"), ("INSTRUCTOR", "Instructor")], db_index=True, default="STUDENT", max_length=12)),
        migrations.CreateModel(name="Certificate", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)),
            ("verification_number", models.CharField(db_index=True, editable=False, max_length=40, unique=True)),
            ("student_name", models.CharField(max_length=180)), ("course_title", models.CharField(max_length=220)),
            ("instructor_name", models.CharField(blank=True, max_length=180)), ("eligibility_snapshot", models.JSONField(default=dict)),
            ("issued_at", models.DateTimeField(auto_now_add=True)), ("revoked_at", models.DateTimeField(blank=True, null=True)),
            ("revocation_reason", models.TextField(blank=True)),
            ("course", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="certificates", to="portal.course")),
            ("revoked_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="revoked_certificates", to=settings.AUTH_USER_MODEL)),
            ("student", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="certificates", to=settings.AUTH_USER_MODEL)),
        ], options={"ordering": ["-issued_at"]}),
        migrations.CreateModel(name="InstructorApplication", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)),
            ("reference", models.CharField(db_index=True, editable=False, max_length=20, unique=True)),
            ("full_name", models.CharField(max_length=180)), ("email", models.EmailField(db_index=True, max_length=254)),
            ("phone", models.CharField(max_length=40)), ("bachelor_degree", models.CharField(max_length=220)),
            ("master_degree", models.CharField(blank=True, max_length=220)), ("years_experience", models.PositiveIntegerField(blank=True, null=True)),
            ("expertise", models.TextField(blank=True)), ("teaching_background", models.TextField()),
            ("status", models.CharField(choices=[("PENDING", "Pending"), ("APPROVED", "Approved"), ("REJECTED", "Rejected")], db_index=True, default="PENDING", max_length=10)),
            ("reviewed_at", models.DateTimeField(blank=True, null=True)), ("admin_note", models.TextField(blank=True)),
            ("instructor_account", models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="instructor_application", to=settings.AUTH_USER_MODEL)),
            ("reviewed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="reviewed_instructor_applications", to=settings.AUTH_USER_MODEL)),
        ], options={"ordering": ["-created_at"]}),
        migrations.CreateModel(name="Payment", fields=[
            ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
            ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)),
            ("method", models.CharField(choices=[("BKASH", "bKash"), ("NAGAD", "Nagad"), ("BANK_PAY", "Bank Pay")], db_index=True, max_length=12)),
            ("sender_details", models.CharField(max_length=220)), ("transaction_id", models.CharField(max_length=120)),
            ("amount", models.DecimalField(decimal_places=2, max_digits=10, validators=[django.core.validators.MinValueValidator(Decimal("0.01"))])),
            ("currency", models.CharField(default="BDT", editable=False, max_length=3)), ("payment_date", models.DateField()),
            ("proof", models.ImageField(upload_to="payment-proofs/%Y/%m/")),
            ("status", models.CharField(choices=[("PENDING", "Pending"), ("APPROVED", "Approved"), ("REJECTED", "Rejected")], db_index=True, default="PENDING", max_length=10)),
            ("reviewed_at", models.DateTimeField(blank=True, null=True)), ("admin_note", models.TextField(blank=True)),
            ("course", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="payments", to="portal.course")),
            ("reviewed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="reviewed_payments", to=settings.AUTH_USER_MODEL)),
            ("student", models.ForeignKey(limit_choices_to={"role": "STUDENT"}, on_delete=django.db.models.deletion.CASCADE, related_name="payments", to=settings.AUTH_USER_MODEL)),
        ], options={"ordering": ["-created_at"]}),
        migrations.DeleteModel(name="StudyPlan"),
        migrations.AddConstraint(model_name="certificate", constraint=models.UniqueConstraint(fields=("student", "course"), name="one_certificate_per_student_course")),
        migrations.AddConstraint(model_name="instructorapplication", constraint=models.UniqueConstraint(condition=models.Q(("status", "PENDING")), fields=("email",), name="one_pending_instructor_application_per_email")),
        migrations.AddConstraint(model_name="payment", constraint=models.UniqueConstraint(fields=("method", "transaction_id"), name="unique_payment_reference_per_method")),
        migrations.AddConstraint(model_name="payment", constraint=models.UniqueConstraint(condition=models.Q(("status", "PENDING")), fields=("student", "course"), name="one_pending_payment_per_course")),
    ]
