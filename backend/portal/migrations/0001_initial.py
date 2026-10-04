import django.core.validators
import django.db.models.deletion
import django.utils.timezone
import portal.models
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('auth', '0012_alter_user_first_name_max_length'),
    ]

    operations = [
        migrations.CreateModel(
            name='AIProviderConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('provider', models.CharField(choices=[('OPENAI', 'OpenAI'), ('GEMINI', 'Gemini'), ('GENERIC', 'OpenAI-compatible')], max_length=20)),
                ('model', models.CharField(max_length=160)),
                ('base_url', models.URLField(blank=True)),
                ('encrypted_api_key', models.TextField()),
                ('is_active', models.BooleanField(default=True)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='Course',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('title', models.CharField(db_index=True, max_length=220)),
                ('description', models.TextField()),
                ('level', models.CharField(choices=[('BEGINNER', 'Beginner'), ('INTERMEDIATE', 'Intermediate'), ('ADVANCED', 'Advanced')], default='BEGINNER', max_length=20)),
                ('status', models.CharField(choices=[('DRAFT', 'Draft'), ('PUBLISHED', 'Published'), ('ARCHIVED', 'Archived')], db_index=True, default='DRAFT', max_length=20)),
                ('duration_hours', models.PositiveIntegerField(default=0)),
                ('thumbnail', models.URLField(blank=True)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='CourseCategory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=120, unique=True)),
                ('slug', models.SlugField(max_length=140, unique=True)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='User',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('password', models.CharField(max_length=128, verbose_name='password')),
                ('last_login', models.DateTimeField(blank=True, null=True, verbose_name='last login')),
                ('is_superuser', models.BooleanField(default=False, help_text='Designates that this user has all permissions without explicitly assigning them.', verbose_name='superuser status')),
                ('first_name', models.CharField(blank=True, max_length=150, verbose_name='first name')),
                ('last_name', models.CharField(blank=True, max_length=150, verbose_name='last name')),
                ('is_staff', models.BooleanField(default=False, help_text='Designates whether the user can log into this admin site.', verbose_name='staff status')),
                ('is_active', models.BooleanField(default=True, help_text='Designates whether this user should be treated as active. Unselect this instead of deleting accounts.', verbose_name='active')),
                ('date_joined', models.DateTimeField(default=django.utils.timezone.now, verbose_name='date joined')),
                ('email', models.EmailField(db_index=True, max_length=254, unique=True)),
                ('role', models.CharField(choices=[('ADMIN', 'Admin'), ('STUDENT', 'Student')], db_index=True, default='STUDENT', max_length=10)),
                ('avatar', models.URLField(blank=True)),
                ('bio', models.TextField(blank=True)),
                ('phone', models.CharField(blank=True, max_length=40)),
                ('student_id', models.CharField(blank=True, max_length=30, null=True, unique=True)),
                ('department', models.CharField(blank=True, max_length=120)),
                ('groups', models.ManyToManyField(blank=True, help_text='The groups this user belongs to. A user will get all permissions granted to each of their groups.', related_name='user_set', related_query_name='user', to='auth.group', verbose_name='groups')),
                ('user_permissions', models.ManyToManyField(blank=True, help_text='Specific permissions for this user.', related_name='user_set', related_query_name='user', to='auth.permission', verbose_name='user permissions')),
            ],
            options={
                'verbose_name': 'user',
                'verbose_name_plural': 'users',
                'abstract': False,
            },
            managers=[
                ('objects', portal.models.UserManager()),
            ],
        ),
        migrations.CreateModel(
            name='ActivityLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(db_index=True, max_length=80)),
                ('entity', models.CharField(max_length=80)),
                ('entity_id', models.CharField(blank=True, max_length=80)),
                ('details', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('actor', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='activity_logs', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='Assignment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('title', models.CharField(db_index=True, max_length=220)),
                ('description', models.TextField()),
                ('instructions', models.TextField(blank=True)),
                ('max_score', models.PositiveIntegerField(default=100, validators=[django.core.validators.MinValueValidator(1)])),
                ('deadline', models.DateTimeField(db_index=True)),
                ('submission_mode', models.CharField(choices=[('TEXT', 'Text'), ('FILE', 'File'), ('BOTH', 'Text and file')], default='TEXT', max_length=10)),
                ('is_published', models.BooleanField(db_index=True, default=False)),
                ('course', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='assignments', to='portal.course')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.AddField(
            model_name='course',
            name='category',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='courses', to='portal.coursecategory'),
        ),
        migrations.CreateModel(
            name='EmailNotification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('event_type', models.CharField(db_index=True, max_length=80)),
                ('subject', models.CharField(max_length=255)),
                ('summary', models.TextField()),
                ('status', models.CharField(choices=[('PENDING', 'Pending'), ('SENT', 'Sent'), ('FAILED', 'Failed')], db_index=True, default='PENDING', max_length=10)),
                ('attempted_at', models.DateTimeField(blank=True, null=True)),
                ('error_message', models.TextField(blank=True)),
                ('recipient', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='email_notifications', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='Enrollment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('enrolled_at', models.DateTimeField(auto_now_add=True)),
                ('course', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='enrollments', to='portal.course')),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='enrollments', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='LearningMaterial',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('title', models.CharField(db_index=True, max_length=220)),
                ('description', models.TextField(blank=True)),
                ('material_type', models.CharField(choices=[('PDF', 'PDF'), ('VIDEO', 'Video'), ('NOTE', 'Note')], max_length=10)),
                ('file', models.FileField(blank=True, upload_to='materials/%Y/%m/')),
                ('note_content', models.TextField(blank=True)),
                ('order', models.PositiveIntegerField(default=0)),
                ('course', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='materials', to='portal.course')),
            ],
            options={
                'ordering': ['order', 'created_at'],
            },
        ),
        migrations.CreateModel(
            name='MaterialProgress',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('completed_at', models.DateTimeField(auto_now_add=True)),
                ('enrollment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='material_progress', to='portal.enrollment')),
                ('material', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='progress_records', to='portal.learningmaterial')),
            ],
        ),
        migrations.CreateModel(
            name='Quiz',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('title', models.CharField(max_length=220)),
                ('description', models.TextField(blank=True)),
                ('passing_score', models.PositiveIntegerField(default=60)),
                ('is_initial_assessment', models.BooleanField(default=False)),
                ('is_published', models.BooleanField(db_index=True, default=False)),
                ('results_published', models.BooleanField(default=False)),
                ('course', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='quizzes', to='portal.course')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='Question',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('question_type', models.CharField(choices=[('MULTIPLE_CHOICE', 'Multiple choice'), ('TRUE_FALSE', 'True or false'), ('SHORT_ANSWER', 'Short answer')], max_length=20)),
                ('prompt', models.TextField()),
                ('topic', models.CharField(db_index=True, max_length=160)),
                ('options', models.JSONField(blank=True, default=list)),
                ('correct_answer', models.CharField(max_length=500)),
                ('points', models.PositiveIntegerField(default=1)),
                ('order', models.PositiveIntegerField(default=0)),
                ('quiz', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='questions', to='portal.quiz')),
            ],
            options={
                'ordering': ['order', 'id'],
            },
        ),
        migrations.CreateModel(
            name='QuizAttempt',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('score', models.DecimalField(decimal_places=2, default=0, max_digits=8)),
                ('max_score', models.DecimalField(decimal_places=2, default=0, max_digits=8)),
                ('percentage', models.DecimalField(decimal_places=2, default=0, max_digits=5)),
                ('passed', models.BooleanField(default=False)),
                ('completed_at', models.DateTimeField(auto_now_add=True)),
                ('quiz', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attempts', to='portal.quiz')),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='quiz_attempts', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='QuizAnswer',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('answer', models.TextField(blank=True)),
                ('is_correct', models.BooleanField(default=False)),
                ('awarded_points', models.DecimalField(decimal_places=2, default=0, max_digits=7)),
                ('question', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='answers', to='portal.question')),
                ('attempt', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='answers', to='portal.quizattempt')),
            ],
        ),
        migrations.CreateModel(
            name='StudyPlan',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('provider', models.CharField(max_length=40)),
                ('summary', models.TextField()),
                ('weak_topics', models.JSONField(default=list)),
                ('recommendations', models.JSONField(default=list)),
                ('schedule', models.JSONField(default=list)),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='study_plans', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='AssignmentSubmission',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('text', models.TextField(blank=True)),
                ('file', models.FileField(blank=True, upload_to='submissions/%Y/%m/')),
                ('submitted_at', models.DateTimeField(auto_now=True)),
                ('score', models.DecimalField(blank=True, decimal_places=2, max_digits=7, null=True)),
                ('feedback', models.TextField(blank=True)),
                ('graded_at', models.DateTimeField(blank=True, null=True)),
                ('assignment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='submissions', to='portal.assignment')),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='assignment_submissions', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('assignment', 'student'), name='unique_assignment_submission')],
            },
        ),
        migrations.AddIndex(
            model_name='enrollment',
            index=models.Index(fields=['student', 'course'], name='portal_enro_student_c2bb0d_idx'),
        ),
        migrations.AddConstraint(
            model_name='enrollment',
            constraint=models.UniqueConstraint(fields=('student', 'course'), name='unique_student_course'),
        ),
        migrations.AddIndex(
            model_name='learningmaterial',
            index=models.Index(fields=['course', 'order'], name='portal_lear_course__5e5bf4_idx'),
        ),
        migrations.AddConstraint(
            model_name='materialprogress',
            constraint=models.UniqueConstraint(fields=('enrollment', 'material'), name='unique_material_progress'),
        ),
        migrations.AddIndex(
            model_name='quizattempt',
            index=models.Index(fields=['student', 'quiz', '-completed_at'], name='portal_quiz_student_b87676_idx'),
        ),
        migrations.AddConstraint(
            model_name='quizanswer',
            constraint=models.UniqueConstraint(fields=('attempt', 'question'), name='unique_attempt_answer'),
        ),
    ]
