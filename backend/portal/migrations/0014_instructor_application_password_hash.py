from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("portal", "0013_complete_manual_payments")]

    operations = [
        migrations.AddField(
            model_name="instructorapplication",
            name="password_hash",
            field=models.CharField(default="", editable=False, max_length=128),
            preserve_default=False,
        ),
    ]
