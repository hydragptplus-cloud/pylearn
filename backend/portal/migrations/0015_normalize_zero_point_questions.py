from django.db import migrations


def normalize_zero_point_questions(apps, schema_editor):
    Question = apps.get_model("portal", "Question")
    Question.objects.filter(points=0).update(points=1)


class Migration(migrations.Migration):
    dependencies = [("portal", "0014_instructor_application_password_hash")]

    operations = [migrations.RunPython(normalize_zero_point_questions, migrations.RunPython.noop)]
