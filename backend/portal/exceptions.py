from django.db.models.deletion import ProtectedError
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is None and isinstance(exc, ProtectedError):
        protected_models = set()
        for obj in getattr(exc, "protected_objects", []):
            model_name = obj._meta.verbose_name_plural.title()
            protected_models.add(model_name)

        deps = ", ".join(sorted(protected_models)) if protected_models else "dependent records"

        view = context.get("view")
        entity_name = "item"
        if view and hasattr(view, "get_queryset"):
            try:
                model_cls = view.get_queryset().model
                entity_name = model_cls._meta.verbose_name.lower()
            except Exception:
                pass

        deps_lower = deps.lower()
        if "certificate" in deps_lower:
            if entity_name == "user":
                message = (
                    "Cannot delete this user account because issued certificates are linked to it. "
                    "To maintain academic and verification integrity, certificates must be revoked first, "
                    "or you can deactivate the account instead."
                )
            elif entity_name == "course":
                message = (
                    "Cannot delete this course because students have already earned certificates or completed payments for it. "
                    "To preserve student records, archive or unpublish this course instead."
                )
            else:
                message = (
                    f"Cannot delete this {entity_name} because it is referenced by existing {deps}. "
                    "Please revoke or remove those records first."
                )
        elif "payment" in deps_lower:
            message = (
                f"Cannot delete this {entity_name} because existing payment transactions are attached to it. "
                "Financial records must be preserved for accounting integrity."
            )
        elif "course" in deps_lower:
            message = (
                f"Cannot delete this {entity_name} because active courses are assigned to it. "
                "Please reassign or remove the associated courses first."
            )
        else:
            message = (
                f"Cannot delete this {entity_name} because it is referenced by protected {deps}. "
                "Please remove or reassign the associated records first."
            )

        return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)

    return response
