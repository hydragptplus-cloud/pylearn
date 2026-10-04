import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from dotenv import load_dotenv
from django.core.exceptions import ImproperlyConfigured


BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(name, default=False):
    return os.getenv(name, str(default)).lower() in {"1", "true", "yes", "on"}


SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "development-only-change-me")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = [v.strip() for v in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if v.strip()]
CSRF_TRUSTED_ORIGINS = [v.strip() for v in os.getenv("CSRF_TRUSTED_ORIGINS", "http://localhost:3000").split(",") if v.strip()]

if not DEBUG:
    if not os.getenv("DJANGO_SECRET_KEY") or SECRET_KEY == "development-only-change-me":
        raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set to a unique secret in production.")
    if "*" in ALLOWED_HOSTS:
        raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS must not contain '*' in production.")
    if not ALLOWED_HOSTS:
        raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS must list the production backend hosts.")
    if not os.getenv("DJANGO_DATABASE_URL"):
        raise ImproperlyConfigured("DJANGO_DATABASE_URL is required in production.")
    if env_bool("USE_SQLITE", False):
        raise ImproperlyConfigured("USE_SQLITE=true is not allowed in production.")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "portal",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "portal.middleware.RequestIdAndSecurityHeadersMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "pylearn.urls"
TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates",
    "DIRS": [],
    "APP_DIRS": True,
    "OPTIONS": {"context_processors": [
        "django.template.context_processors.request",
        "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages",
    ]},
}]
WSGI_APPLICATION = "pylearn.wsgi.application"

database_url = os.getenv("DJANGO_DATABASE_URL")
if env_bool("USE_SQLITE", False) or (DEBUG and not database_url):
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "test.sqlite3"}}
else:
    parsed = urlparse(database_url)
    query = parse_qs(parsed.query)
    sslmode = query.get("sslmode", ["require" if not DEBUG else "prefer"])[0]
    DATABASES = {"default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": parsed.path.lstrip("/"),
        "USER": parsed.username or "postgres",
        "PASSWORD": parsed.password or "",
        "HOST": parsed.hostname or "localhost",
        "PORT": parsed.port or 5432,
        # Development server threads must release scarce pooler sessions after each request.
        "CONN_MAX_AGE": 0 if DEBUG else 60,
        "OPTIONS": {"sslmode": sslmode},
    }}

AUTH_USER_MODEL = "portal.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
LANGUAGE_CODE = "en-us"
TIME_ZONE = os.getenv("DJANGO_TIME_ZONE", "Asia/Dhaka")
USE_I18N = True
USE_TZ = True
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = os.getenv("MEDIA_URL", "/media/")
if not MEDIA_URL.endswith("/"):
    MEDIA_URL += "/"
MEDIA_ROOT = BASE_DIR / "media"
AVATAR_MAX_UPLOAD_SIZE = int(os.getenv("AVATAR_MAX_UPLOAD_SIZE", str(5 * 1024 * 1024)))
COURSE_THUMBNAIL_MAX_UPLOAD_SIZE = int(os.getenv("COURSE_THUMBNAIL_MAX_UPLOAD_SIZE", str(8 * 1024 * 1024)))
PAYMENT_PROOF_MAX_UPLOAD_SIZE = int(os.getenv("PAYMENT_PROOF_MAX_UPLOAD_SIZE", str(8 * 1024 * 1024)))

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

media_storage_backend = os.getenv("MEDIA_STORAGE_BACKEND", "local").lower()

if media_storage_backend == "s3":
    STORAGES["default"] = {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "access_key": os.getenv("MEDIA_STORAGE_ACCESS_KEY_ID", os.getenv("ACCESS_KEY_ID", "")),
            "secret_key": os.getenv("MEDIA_STORAGE_SECRET_ACCESS_KEY", os.getenv("SECRET_ACCESS_KEY", "")),
            "bucket_name": os.getenv("MEDIA_STORAGE_BUCKET_NAME", os.getenv("BUCKET", "")),
            "region_name": os.getenv("MEDIA_STORAGE_REGION", os.getenv("REGION", "auto")),
            "endpoint_url": os.getenv("MEDIA_STORAGE_ENDPOINT_URL", os.getenv("ENDPOINT", "https://storage.railway.app")),
            "addressing_style": os.getenv("MEDIA_STORAGE_ADDRESSING_STYLE", "virtual"),
            "location": os.getenv("MEDIA_STORAGE_LOCATION", "media"),
            "default_acl": None,
            "file_overwrite": False,
            "querystring_auth": True,
        },
    }
elif media_storage_backend in {"vercel_blob", "blob"}:
    STORAGES["default"] = {
        "BACKEND": "portal.storage.VercelBlobStorage",
        "OPTIONS": {
            "access": os.getenv("MEDIA_STORAGE_ACCESS", os.getenv("MEDIA_STORAGE_ACCESS_MODE", "public")),
            "token": os.getenv("BLOB_READ_WRITE_TOKEN", ""),
            "store_id": os.getenv("BLOB_STORE_ID", ""),
            "public_url_base": os.getenv("MEDIA_STORAGE_PUBLIC_URL_BASE", os.getenv("VERCEL_BLOB_PUBLIC_URL_BASE", "")),
        },
    }
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = not DEBUG
SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", not DEBUG)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "31536000" if not DEBUG else "0"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", not DEBUG)
SECURE_HSTS_PRELOAD = env_bool("SECURE_HSTS_PRELOAD", not DEBUG)
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
X_FRAME_OPTIONS = "DENY"
PASSWORD_RESET_TIMEOUT = int(os.getenv("PASSWORD_RESET_TIMEOUT", "900"))

REST_FRAMEWORK = {
    "EXCEPTION_HANDLER": "portal.exceptions.custom_exception_handler",
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.getenv("THROTTLE_ANON_RATE", "100/hour"),
        "user": os.getenv("THROTTLE_USER_RATE", "1000/hour"),
        "auth": os.getenv("THROTTLE_AUTH_RATE", "10/minute"),
        "password_reset": os.getenv("THROTTLE_PASSWORD_RESET_RATE", "5/hour"),
        "ai": os.getenv("THROTTLE_AI_RATE", "20/hour"),
        "uploads": os.getenv("THROTTLE_UPLOAD_RATE", "60/hour"),
    },
}

EMAIL_BACKEND = "django.core.mail.backends.dummy.EmailBackend"
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "PyLearn <noreply@pylearn.local>")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
CERTIFICATE_LOGO_FILENAME = os.getenv("NEXT_PUBLIC_LOGO_LIGHT", "").strip()
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "")
FIREBASE_SERVICE_ACCOUNT_JSON = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "")
AI_CONFIG_ENCRYPTION_KEY = os.getenv("AI_CONFIG_ENCRYPTION_KEY", "")
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", str(100 * 1024 * 1024)))
