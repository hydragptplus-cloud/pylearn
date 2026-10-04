import os
import sys

import django
from django.core.management import call_command
from django.db import connections


os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pylearn.settings")
django.setup()

call_command("collectstatic", interactive=False, verbosity=1)
call_command("migrate", interactive=False, verbosity=1)
connections.close_all()

port = os.getenv("PORT", "8000")
if os.getenv("DJANGO_DEBUG", "false").lower() in ("true", "1", "yes"):
    from django.core.management import execute_from_command_line

    execute_from_command_line(["manage.py", "runserver", f"0.0.0.0:{port}"])
    raise SystemExit(0)

if sys.platform == "win32":
    from waitress import serve

    from pylearn.wsgi import application

    serve(application, host="0.0.0.0", port=int(port))
    raise SystemExit(0)

os.execvp(
    "gunicorn",
    [
        "gunicorn",
        "pylearn.wsgi:application",
        "--bind",
        f"0.0.0.0:{port}",
    ],
)
