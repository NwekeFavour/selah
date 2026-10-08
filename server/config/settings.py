import os
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")
   

def env(name, default=""):
    return os.environ.get(name, default)


DEBUG = env("DJANGO_DEBUG", "1") == "1"
SECRET_KEY = env("DJANGO_SECRET_KEY", "dev-only-insecure-key")
if not DEBUG and SECRET_KEY == "dev-only-insecure-key":
    raise ImproperlyConfigured("Set DJANGO_SECRET_KEY when DJANGO_DEBUG is off.")
SELAH_SERVICE_KEY = env("SELAH_SERVICE_KEY")

ALLOWED_HOSTS = [h.strip() for h in env("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h.strip()]
CORS_ALLOWED_ORIGINS = [o.strip() for o in env("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
CORS_ALLOW_CREDENTIALS = True

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "rooms",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]

DATABASE_URL = env("DATABASE_URL").strip()
if DATABASE_URL.startswith(("http://", "https://")):
    raise ImproperlyConfigured(
        "DATABASE_URL must be a database connection string (postgresql://...), not an https:// project URL. "
        "Leave it empty to use local SQLite."
    )
if DATABASE_URL:
    DATABASES = {
        "default": dj_database_url.parse(
            DATABASE_URL,
            conn_max_age=0,
            conn_health_checks=True,
        )
    }
else:
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
STATIC_URL = "static/"
USE_TZ = True
TIME_ZONE = "UTC"

REST_FRAMEWORK = {
    # Each view declares its own auth; guests have no Django user.
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": [],
    "UNAUTHENTICATED_USER": None,
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {
        "create": "20/hour",
        "join": "60/min",
        "floor": "120/min",
        "status": "120/min",
        "questions": "60/min",
    },
}

# LiveKit
LIVEKIT_URL = env("LIVEKIT_URL")  # wss://... (what browsers use)
LIVEKIT_API_URL = env("LIVEKIT_API_URL") or LIVEKIT_URL.replace("wss://", "https://").replace("ws://", "http://")
LIVEKIT_API_KEY = env("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = env("LIVEKIT_API_SECRET")

# Selah product limits. Keep in step with the numbers on the landing page.
SELAH = {
    "MAX_PARTICIPANTS": 100,
    "MAX_SPEAKERS": 10,
    "MEETING_MINUTES": 60,
    "QUEUE_GRACE_SECONDS": 45,    # a disconnected listener keeps their queue place this long
    "SPEAKER_GRACE_SECONDS": 15,  # a disconnected speaker keeps the floor this long
    "SESSION_MAX_AGE": 60 * 60 * 12,
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}