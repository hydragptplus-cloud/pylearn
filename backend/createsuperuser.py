#!/usr/bin/env python
from __future__ import annotations

import os
import secrets


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pylearn.settings")

    import django

    django.setup()

    from django.contrib.auth import get_user_model

    User = get_user_model()

    email = (
        os.getenv("DJANGO_SUPERUSER_EMAIL")
        or os.getenv("DJANGO_SUPERUSER_USERNAME")
        or "admin@pylearn.local"
    ).strip().lower()
    password = os.getenv("DJANGO_SUPERUSER_PASSWORD", "").strip()
    debug = os.getenv("DJANGO_DEBUG", "true").lower() == "true"

    if not password:
        if not debug:
            raise RuntimeError("DJANGO_SUPERUSER_PASSWORD is required when DJANGO_DEBUG=false.")
        password = secrets.token_urlsafe(24)

    user, created = User.objects.get_or_create(
        email=email,
        defaults={
            "role": User.Role.ADMIN,
            "is_staff": True,
            "is_superuser": True,
        },
    )

    changed = created

    if user.role != User.Role.ADMIN:
        user.role = User.Role.ADMIN
        changed = True

    if not user.is_staff:
        user.is_staff = True
        changed = True

    if not user.is_superuser:
        user.is_superuser = True
        changed = True

    if created or password:
        user.set_password(password)
        changed = True

    if changed:
        user.save()

    if created:
        print(f"Created admin user: {email}")
    else:
        print(f"Admin user already exists: {email}")

    if not os.getenv("DJANGO_SUPERUSER_PASSWORD", "").strip():
        print("Generated a local development password. Set DJANGO_SUPERUSER_PASSWORD explicitly for production.")


if __name__ == "__main__":
    main()
