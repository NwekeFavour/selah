from django.contrib import admin

from .models import Participant, Room


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("code", "title", "mode", "version", "ended", "created_at", "ends_at")
    readonly_fields = ("host_key_hash",)


@admin.register(Participant)
class ParticipantAdmin(admin.ModelAdmin):
    list_display = ("name", "room", "is_host", "role", "queued_at", "connected", "banned")
    readonly_fields = ("secret_hash",)
