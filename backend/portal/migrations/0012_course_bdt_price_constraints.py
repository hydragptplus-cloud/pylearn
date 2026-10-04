from decimal import Decimal

from django.db import migrations, models


def normalize_course_prices(apps, schema_editor):
    Course = apps.get_model("portal", "Course")
    Course.objects.exclude(currency="BDT").update(currency="BDT")
    Course.objects.filter(course_type="FREE").exclude(price=Decimal("0.00")).update(price=Decimal("0.00"))
    Course.objects.filter(course_type="PAID", price__lte=Decimal("0.00")).update(
        course_type="FREE", price=Decimal("0.00")
    )


class Migration(migrations.Migration):
    dependencies = [("portal", "0011_backfill_course_creator")]

    operations = [
        migrations.RunPython(normalize_course_prices, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="course",
            constraint=models.CheckConstraint(
                condition=models.Q(("price__gte", Decimal("0.00"))),
                name="course_price_non_negative",
            ),
        ),
        migrations.AddConstraint(
            model_name="course",
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(("course_type", "FREE"), ("price", Decimal("0.00")))
                    | models.Q(("course_type", "PAID"), ("price__gt", Decimal("0.00")))
                ),
                name="course_type_matches_price",
            ),
        ),
        migrations.AddConstraint(
            model_name="course",
            constraint=models.CheckConstraint(
                condition=models.Q(("currency", "BDT")),
                name="course_currency_is_bdt",
            ),
        ),
    ]
