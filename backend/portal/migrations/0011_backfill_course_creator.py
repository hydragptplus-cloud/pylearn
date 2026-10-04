from django.db import migrations


def backfill_course_creator(apps, schema_editor):
    User = apps.get_model("portal", "User")
    Course = apps.get_model("portal", "Course")
    admin = User.objects.filter(role="ADMIN").order_by("date_joined", "id").first()
    if admin:
        Course.objects.filter(created_by__isnull=True, instructor__isnull=True).update(created_by=admin)


class Migration(migrations.Migration):
    dependencies = [("portal", "0010_platform_domains")]
    operations = [migrations.RunPython(backfill_course_creator, migrations.RunPython.noop)]
