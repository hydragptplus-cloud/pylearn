"""Run the PyLearn frontend and backend together for local development."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "backend"


def frontend_backend_port() -> str:
    """Use the port configured in .env.local, falling back to port 8000."""
    env_file = ROOT / ".env.local"
    if env_file.exists():
        for raw_line in env_file.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if line.startswith("DJANGO_BACKEND_URL="):
                value = line.split("=", 1)[1].strip().strip('"\'')
                parsed = urlparse(value)
                if parsed.port:
                    return str(parsed.port)
    return "8000"


def stop(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return

    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    else:
        os.killpg(process.pid, signal.SIGTERM)


def main() -> int:
    backend_env = os.environ.copy()
    backend_env.update(
        {
            "PORT": frontend_backend_port(),
            "DJANGO_DEBUG": "true",
            "DJANGO_ALLOWED_HOSTS": "localhost,127.0.0.1",
            "CSRF_TRUSTED_ORIGINS": "http://localhost:3000,http://127.0.0.1:3000",
            "FRONTEND_URL": "http://localhost:3000",
        }
    )

    npm = "npm.cmd" if os.name == "nt" else "npm"
    process_options: dict[str, object] = {}
    if os.name == "nt":
        process_options["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        process_options["start_new_session"] = True

    print(f"Starting Django at http://127.0.0.1:{backend_env['PORT']}", flush=True)
    backend = subprocess.Popen(
        [sys.executable, "start.py"],
        cwd=BACKEND_DIR,
        env=backend_env,
        **process_options,
    )

    print("Starting Next.js at http://localhost:3000", flush=True)
    frontend = subprocess.Popen(
        [npm, "run", "dev"],
        cwd=ROOT,
        env=os.environ.copy(),
        **process_options,
    )

    processes = (backend, frontend)
    try:
        while all(process.poll() is None for process in processes):
            time.sleep(0.25)
    except KeyboardInterrupt:
        print("\nStopping PyLearn...", flush=True)
    finally:
        for process in processes:
            stop(process)
        for process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()

    failed = next((process.returncode for process in processes if process.returncode), 0)
    return failed or 0


if __name__ == "__main__":
    raise SystemExit(main())
