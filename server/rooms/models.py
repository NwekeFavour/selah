from django.db import models
from django.utils import timezone


class Room(models.Model):
    class Mode(models.TextChoices):
        APPROVAL = "approval", "Host approval"
        OPEN = "open", "Open floor"

    code = models.CharField(max_length=12, unique=True)
    title = models.CharField(max_length=80, blank=True)
    mode = models.CharField(max_length=10, choices=Mode.choices, default=Mode.APPROVAL)
    speaker_limit = models.PositiveSmallIntegerField(default=10)
    host_key_hash = models.CharField(max_length=64)  # the host key itself is never stored
    version = models.PositiveIntegerField(default=0)  # bumped on every state change
    ended = models.BooleanField(default=False)
    opened_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    ends_at = models.DateTimeField()

    def __str__(self):
        return f"{self.code} ({self.title or 'untitled'})"


class Participant(models.Model):
    class Role(models.TextChoices):
        LISTENER = "listener"
        SPEAKER = "speaker"

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="participants")
    identity = models.CharField(max_length=32)      # public id, shown to everyone, used in LiveKit
    secret_hash = models.CharField(max_length=64)   # hash of the browser's private guest id
    name = models.CharField(max_length=40)
    avatar = models.CharField(max_length=7, blank=True, default="")
    is_host = models.BooleanField(default=False)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.LISTENER)
    role_since = models.DateTimeField(default=timezone.now)
    queued_at = models.DateTimeField(null=True, blank=True)  # set while waiting in the queue
    connected = models.BooleanField(default=True)
    disconnected_at = models.DateTimeField(null=True, blank=True)
    banned = models.BooleanField(default=False)
    livekit_sid = models.CharField(max_length=64, blank=True, default="")   # newest LiveKit session seen
    session_joined_at = models.BigIntegerField(default=0)                   # when that session joined (unix seconds)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["room", "identity"], name="uniq_room_identity"),
            models.UniqueConstraint(fields=["room", "secret_hash"], name="uniq_room_secret"),
        ]

    @property
    def is_authenticated(self):  # lets DRF treat a Participant as a logged-in user
        return True

    def __str__(self):
        return f"{self.name} in {self.room.code}"