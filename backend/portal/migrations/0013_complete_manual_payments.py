from decimal import Decimal

from django.db import migrations, models
import django.db.models.deletion


def backfill_payment_snapshots(apps, schema_editor):
    Payment = apps.get_model("portal", "Payment")
    PaymentMethodConfig = apps.get_model("portal", "PaymentMethodConfig")
    configs = {}
    for config in PaymentMethodConfig.objects.order_by("id"):
        configs.setdefault(config.method, config)
    for payment in Payment.objects.select_related("course").order_by("id"):
        config = configs.get(payment.method)
        if config is None:
            config = PaymentMethodConfig.objects.create(
                method=payment.method,
                display_name=f"Legacy {payment.method.replace('_', ' ').title()}",
                account_details="Legacy payment configuration",
                instructions="Created while migrating historical payments.",
                is_active=False,
            )
            configs[payment.method] = config
        payment.payment_method_id = config.pk
        payment.method_display_name = config.display_name
        payment.account_details_snapshot = config.account_details
        payment.account_holder_snapshot = config.account_holder
        payment.course_price_snapshot = payment.course.price
        payment.transaction_id_normalized = payment.transaction_id.strip().upper()
        payment.save(update_fields=[
            "payment_method", "method_display_name", "account_details_snapshot",
            "account_holder_snapshot", "course_price_snapshot", "transaction_id_normalized",
        ])


class Migration(migrations.Migration):
    dependencies = [("portal", "0012_course_bdt_price_constraints")]
    operations = [
        migrations.AlterField(
            model_name="paymentmethodconfig", name="method",
            field=models.CharField(choices=[("BKASH", "bKash"), ("NAGAD", "Nagad"), ("BANK_PAY", "Bank Pay")], db_index=True, max_length=12),
        ),
        migrations.RemoveConstraint(model_name="payment", name="unique_payment_reference_per_method"),
        migrations.AddField(model_name="payment", name="payment_method", field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.PROTECT, related_name="payments", to="portal.paymentmethodconfig")),
        migrations.AddField(model_name="payment", name="method_display_name", field=models.CharField(blank=True, max_length=80)),
        migrations.AddField(model_name="payment", name="account_details_snapshot", field=models.TextField(blank=True)),
        migrations.AddField(model_name="payment", name="account_holder_snapshot", field=models.CharField(blank=True, max_length=160)),
        migrations.AddField(model_name="payment", name="transaction_id_normalized", field=models.CharField(blank=True, editable=False, max_length=120)),
        migrations.AddField(model_name="payment", name="course_price_snapshot", field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=10)),
        migrations.RunPython(backfill_payment_snapshots, migrations.RunPython.noop),
        migrations.AlterField(model_name="payment", name="payment_method", field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="payments", to="portal.paymentmethodconfig")),
        migrations.AlterField(model_name="payment", name="method_display_name", field=models.CharField(max_length=80)),
        migrations.AlterField(model_name="payment", name="account_details_snapshot", field=models.TextField()),
        migrations.AlterField(model_name="payment", name="transaction_id_normalized", field=models.CharField(editable=False, max_length=120)),
        migrations.AlterField(model_name="payment", name="course_price_snapshot", field=models.DecimalField(decimal_places=2, max_digits=10)),
        migrations.AddConstraint(model_name="payment", constraint=models.UniqueConstraint(fields=("method", "transaction_id_normalized"), name="unique_payment_reference_per_method_ci")),
    ]
