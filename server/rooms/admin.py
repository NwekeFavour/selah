from django.contrib import admin

from .models import Announcement, Participant, Question, Room


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("code", "title", "mode", "version", "ended", "questions_enabled", "created_at", "ends_at")
    readonly_fields = ("host_key_hash",)


@admin.register(Participant)
class ParticipantAdmin(admin.ModelAdmin):
    list_display = ("name", "room", "is_host", "role", "queued_at", "connected", "banned", "blocked_from_questions")
    readonly_fields = ("secret_hash",)


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("room", "kind", "status", "anonymous", "created_at")
    readonly_fields = ("text", "sender", "room", "created_at")


@admin.register(Announcement)
class AnnouncementAdmin(admin.ModelAdmin):
    list_display = ("room", "active", "anonymous", "created_at")
