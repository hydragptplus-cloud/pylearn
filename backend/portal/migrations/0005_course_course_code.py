from django.db import migrations, models
from django.utils.text import slugify


def generate_code(course, Course):
    source = course.category.slug if course.category_id and course.category else course.title
    prefix = "".join(part[:3] for part in slugify(source).split("-")[:1]).upper()
    if len(prefix) < 3:
        prefix = (prefix + "".join(ch for ch in course.title.upper() if ch.isalnum()))[:3]
    prefix = (prefix or "CRS")[:3]
    level_numbers = {
        "BEGINNER": "101",
        "INTERMEDIATE": "201",
        "ADVANCED": "301",
    }
    base = f"{prefix}-{level_numbers.get(course.level, '101')}"
    candidate = base
    suffix = 2
    while Course.objects.filter(course_code=candidate).exclude(pk=course.pk).exists():
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


def populate_course_codes(apps, schema_editor):
    Course = apps.get_model("portal", "Course")
    for course in Course.objects.select_related("category").order_by("id"):
        if not course.course_code:
            course.course_code = generate_code(course, Course)
            course.save(update_fields=["course_code"])


class Migration(migrations.Migration):

    dependencies = [
        ("portal", "0004_remove_assignmentsubmission_assignment_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="course",
            name="course_code",
            field=models.CharField(blank=True, db_index=True, max_length=20, null=True, unique=True),
        ),
        migrations.RunPython(populate_course_codes, migrations.RunPython.noop),
    ]
