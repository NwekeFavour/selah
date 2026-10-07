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
    questions_enabled = models.BooleanField(default=True)
    anonymous_questions_enabled = models.BooleanField(default=True)
    host_key_hash = models.CharField(max_length=64)  # the host key itself is never stored
    screen_share_identity = models.CharField(max_length=32, blank=True, default="")
    version = models.PositiveIntegerField(default=0)  # bumped on every state change
    ended = models.BooleanField(default=False)
    ended_at = models.DateTimeField(null=True, blank=True)
    opened_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    ends_at = models.DateTimeField()

    def __str__(self):
        return f"{self.code} ({self.title or 'untitled'})"


class Question(models.Model):
    class Kind(models.TextChoices):
        QUESTION = "question", "Question"
        SUGGESTION = "suggestion", "Suggestion"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ANSWERED = "answered", "Answered"
        DISMISSED = "dismissed", "Dismissed"

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="questions")
    sender = models.ForeignKey("Participant", on_delete=models.CASCADE, related_name="questions")
    text = models.CharField(max_length=500)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    anonymous = models.BooleanField(default=False)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    deleted_by_sender = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["room", "status", "created_at"])]


class Announcement(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="announcements")
    question = models.OneToOneField(
        Question, on_delete=models.CASCADE, related_name="announcement", null=True, blank=True
    )
    text = models.CharField(max_length=500)
    anonymous = models.BooleanField(default=False)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]


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
    blocked_from_questions = models.BooleanField(default=False)
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