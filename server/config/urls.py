from django.contrib import admin
from django.urls import include, path
from app import views as app_running

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("rooms.urls")),
    path("", app_running.ServerIsRunning)
]
