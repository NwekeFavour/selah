"""All room rules live here. Views stay thin; every change runs in one transaction
with the room row locked, so two people can never both take the last speaker spot.
"""
import hashlib
import hmac
import secrets
from dataclasses import dataclass, field
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from . import livekit
from .models import Announcement, Participant, Question, Room

CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # no look-alike characters
SESSION_SALT = "selah.session"
LISTENER = Participant.Role.LISTENER
SPEAKER = Participant.Role.SPEAKER


class RoomError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


@dataclass
class Effects:
    """Things to tell LiveKit after the database change has committed."""
    permissions: dict = field(default_factory=dict)  # identity -> can_publish
    remove: list = field(default_factory=list)


def cfg(name):
    return settings.SELAH[name]


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


# ---- Sessions ---------------------------------------------------------------

def make_session(room, participant):
    return signing.dumps({"r": room.code, "i": participant.identity}, salt=SESSION_SALT)


def read_session(token):
    try:
        return signing.loads(token, salt=SESSION_SALT, max_age=cfg("SESSION_MAX_AGE"))
    except signing.BadSignature:
        return None


# ---- Snapshot ---------------------------------------------------------------

def _person(p):
    return {
        "identity": p.identity,
        "name": p.name,
        "avatar": p.avatar,
        "connected": p.connected,
    }


def snapshot(room):
    ps = list(room.participants.filter(banned=False))
    host = next((p for p in ps if p.is_host), None)
    guests = [p for p in ps if not p.is_host]
    speakers = sorted((p for p in guests if p.role == SPEAKER), key=lambda p: p.role_since)
    queue = sorted((p for p in guests if p.role == LISTENER and p.queued_at), key=lambda p: p.queued_at)
    return {
        "version": room.version,
        "title": room.title,
        "ended": room.ended,
        "mode": room.mode,
        "host": _person(host) if host else {
            "identity": "",
            "name": "Host",
            "avatar": "",
            "connected": False,
        },
        "speakers": [_person(p) for p in speakers],
        "queue": [_person(p) for p in queue],
        "participants": [
            {
                **_person(p),
                "role": p.role,
                "queued": bool(p.queued_at),
                "connected": p.connected,
            }
            for p in guests
        ],
        "max_speakers": room.speaker_limit,
        "listeners": sum(1 for p in guests if p.connected and p.role == LISTENER),
        "ends_at": room.ends_at.isoformat(),
        "questions_enabled": room.questions_enabled,
        "anonymous_questions_enabled": room.anonymous_questions_enabled,
        "announcements": [
            {
                "id": announcement.pk,
                "source_question_id": announcement.question_id,
                "text": announcement.text,
                "anonymous": announcement.anonymous,
                "author": (
                    "Anonymous"
                    if announcement.anonymous
                    else announcement.question.sender.name
                    if announcement.question_id
                    else "Host"
                ),
                "created_at": announcement.created_at.isoformat(),
            }
            for announcement in room.announcements.filter(active=True)
            .select_related("question__sender")
            .order_by("-created_at")
        ],
    }


def _bump(room):
    Room.objects.filter(pk=room.pk).update(version=F("version") + 1)
    room.refresh_from_db(fields=["version"])
    return snapshot(room)


def _flush(room, snap, fx):
    livekit.get_client().apply(room.code, snap, fx.permissions, fx.remove)
    return snap


# ---- Helpers ----------------------------------------------------------------

def _room_ended(room, now=None):
    now = now or timezone.now()
    return room.ended or (room.opened_at is not None and room.ends_at <= now)


def _lock(code):
    try:
        room = Room.objects.select_for_update().get(code=code.lower())
    except Room.DoesNotExist:
        raise RoomError("Meeting not found.", 404)
    if _room_ended(room):
        raise RoomError("This meeting has ended.", 410)
    return room


def room_status(code):
    try:
        room = Room.objects.only("ended", "opened_at", "ends_at").get(code=code.lower())
    except Room.DoesNotExist:
        raise RoomError("Meeting not found.", 404)
    return {"ended": _room_ended(room)}


def _participant(room, identity, status=404):
    p = room.participants.filter(identity=identity, banned=False).first()
    if not p:
        raise RoomError("Participant not found.", status)
    return p


def _require_host(actor):
    if not actor.is_host:
        raise RoomError("Only the host can do that.", 403)


def _speaker_count(room):
    return room.participants.filter(role=SPEAKER, is_host=False, banned=False).count()


def _promote(p, fx):
    p.role = SPEAKER
    p.queued_at = None
    p.role_since = timezone.now()
    p.save(update_fields=["role", "queued_at", "role_since"])
    fx.permissions[p.identity] = True


def _demote(p, fx):
    p.role = LISTENER
    p.queued_at = None
    p.role_since = timezone.now()
    p.save(update_fields=["role", "queued_at", "role_since"])
    fx.permissions[p.identity] = False
    Room.objects.filter(pk=p.room_id, screen_share_identity=p.identity).update(screen_share_identity="")


def _fill_open(room, fx):
    """Open floor: when spots free up, the queue moves up on its own."""
    if room.mode != Room.Mode.OPEN:
        return
    while _speaker_count(room) < room.speaker_limit:
        head = (
            room.participants.filter(role=LISTENER, is_host=False, banned=False, connected=True, queued_at__isnull=False)
            .order_by("queued_at")
            .first()
        )
        if not head:
            return
        _promote(head, fx)


# ---- Creating and joining ---------------------------------------------------

def create_room(title, mode):
    host_key = secrets.token_urlsafe(24)
    for _ in range(10):
        code = "-".join("".join(secrets.choice(CODE_ALPHABET) for _ in range(3)) for _ in range(3))
        if not Room.objects.filter(code=code).exists():
            break
    now = timezone.now()
    room = Room.objects.create(
        code=code,
        title=title,
        mode=mode,
        speaker_limit=cfg("MAX_SPEAKERS"),
        host_key_hash=_hash(host_key),
        created_at=now,
        ends_at=now + timedelta(minutes=cfg("MEETING_MINUTES")),
    )
    return room, host_key


def _open_room(room, opened_at=None):
    room.opened_at = opened_at or timezone.now()
    room.ends_at = room.opened_at + timedelta(minutes=cfg("MEETING_MINUTES"))
    room.save(update_fields=["opened_at", "ends_at"])


def join(code, display_name, guest_id, host_key=None, avatar=""):
    client = livekit.get_client()
    if not client.configured:
        raise RoomError("Video is not configured on the server yet.", 503)
    fx = Effects()
    with transaction.atomic():
        room = _lock(code)
        claims_host = bool(host_key) and hmac.compare_digest(_hash(host_key), room.host_key_hash)
        if not claims_host and room.opened_at is None:
            raise RoomError("The host has not opened this call yet. Please wait.", 425)
        if claims_host and room.opened_at is None:
            _open_room(room)
        secret = _hash(guest_id)
        p = room.participants.filter(secret_hash=secret).first()
        if p and p.banned:
            raise RoomError("You were removed from this meeting.", 403)
        if not p:
            if room.participants.filter(connected=True, banned=False).count() >= cfg("MAX_PARTICIPANTS"):
                raise RoomError("This meeting is full.", 403)
            p = Participant(
                room=room,
                identity=secrets.token_hex(8),
                secret_hash=secret,
                name=display_name,
                avatar=avatar,
            )
        p.name = display_name
        if not p.avatar and avatar:
            p.avatar = avatar
        p.connected = True
        p.disconnected_at = None
        if claims_host and not p.is_host:
            for previous in room.participants.filter(is_host=True):
                previous.is_host = False
                previous.save(update_fields=["is_host"])
                fx.permissions[previous.identity] = False
                if room.screen_share_identity == previous.identity:
                    room.screen_share_identity = ""
                    room.save(update_fields=["screen_share_identity"])
            p.is_host = True
            p.role = LISTENER
            p.queued_at = None
        p.save()
        snap = _bump(room)
        ttl = max(room.ends_at - timezone.now(), timedelta(0)) + timedelta(minutes=10)
        token = client.token(
            room.code, p.identity, p.name,
            can_publish=p.is_host or p.role == SPEAKER,
            is_admin=p.is_host,
            ttl=ttl,
        )
        session = make_session(room, p)
    _flush(room, snap, fx)
    return {
        "token": token,
        "livekit_url": settings.LIVEKIT_URL,
        "session": session,
        "identity": p.identity,
        "snapshot": snap,
    }


def get_state(participant):
    room = participant.room
    room.refresh_from_db()
    if room.ended or (room.opened_at is not None and room.ends_at <= timezone.now()):
        raise RoomError("This meeting has ended.", 410)
    return snapshot(room)


# ---- The floor --------------------------------------------------------------

def request_floor(code, identity):
    """Open floor promotes into a free spot; approval mode always queues for the host."""
    fx = Effects()
    with transaction.atomic():
        room = _lock(code)
        p = _participant(room, identity)
        if p.is_host or p.role == SPEAKER:
            return snapshot(room)
        free_spot = _speaker_count(room) < room.speaker_limit
        first_waiting = (
            room.participants.filter(
                role=LISTENER, is_host=False, banned=False, queued_at__isnull=False
            )
            .order_by("queued_at")
            .first()
        )
        if (
            room.mode == Room.Mode.OPEN
            and free_spot
            and (first_waiting is None or first_waiting.pk == p.pk)
        ):
            _promote(p, fx)
        elif not p.queued_at:
            p.queued_at = timezone.now()
            p.save(update_fields=["queued_at"])
        else:
            return snapshot(room)
        snap = _bump(room)
    return _flush(room, snap, fx)


def lower_hand(code, identity):
    with transaction.atomic():
        room = _lock(code)
        p = _participant(room, identity)
        if not p.queued_at:
            return snapshot(room)
        p.queued_at = None
        p.save(update_fields=["queued_at"])
        snap = _bump(room)
    return _flush(room, snap, Effects())


def grant(code, actor_identity, target_identity):
    fx = Effects()
    with transaction.atomic():
        room = _lock(code)
        _require_host(_participant(room, actor_identity))
        target = _participant(room, target_identity)
        if target.is_host:
            raise RoomError("The host is already on the floor.")
        if target.role == SPEAKER:
            return snapshot(room)
        if _speaker_count(room) >= room.speaker_limit:
            raise RoomError("The floor is full. Release a speaker first.", 409)
        _promote(target, fx)
        snap = _bump(room)
    return _flush(room, snap, fx)


def reject(code, actor_identity, target_identity):
    with transaction.atomic():
        room = _lock(code)
        _require_host(_participant(room, actor_identity))
        target = _participant(room, target_identity)
        if not target.queued_at:
            return snapshot(room)
        target.queued_at = None
        target.save(update_fields=["queued_at"])
        snap = _bump(room)
    return _flush(room, snap, Effects())


def release(code, actor_identity, target_identity):
    """The host takes the floor back, or a speaker hands it over themselves."""
    fx = Effects()
    with transaction.atomic():
        room = _lock(code)
        actor = _participant(room, actor_identity)
        target = _participant(room, target_identity)
        if not (actor.is_host or actor.pk == target.pk):
            raise RoomError("Only the host can do that.", 403)
        if target.role != SPEAKER:
            return snapshot(room)
        _demote(target, fx)
        _fill_open(room, fx)
        snap = _bump(room)
    return _flush(room, snap, fx)


def remove(code, actor_identity, target_identity):
    fx = Effects()
    with transaction.atomic():
        room = _lock(code)
        _require_host(_participant(room, actor_identity))
        target = _participant(room, target_identity)
        if target.is_host:
            raise RoomError("The host cannot be removed.")
        target.banned = True
        target.role = LISTENER
        target.queued_at = None
        target.save(update_fields=["banned", "role", "queued_at"])
        Room.objects.filter(pk=room.pk, screen_share_identity=target.identity).update(screen_share_identity="")
        fx.remove.append(target.identity)
        _fill_open(room, fx)
        snap = _bump(room)
    return _flush(room, snap, fx)


def update_settings(
    code,
    actor_identity,
    mode=None,
    speaker_limit=None,
    questions_enabled=None,
    anonymous_questions_enabled=None,
):
    fx = Effects()
    with transaction.atomic():
        room = _lock(code)
        _require_host(_participant(room, actor_identity))
        if mode:
            room.mode = mode
        if speaker_limit:
            room.speaker_limit = min(speaker_limit, cfg("MAX_SPEAKERS"))
        if questions_enabled is not None:
            room.questions_enabled = questions_enabled
        if anonymous_questions_enabled is not None:
            room.anonymous_questions_enabled = anonymous_questions_enabled
        room.save(update_fields=[
            "mode",
            "speaker_limit",
            "questions_enabled",
            "anonymous_questions_enabled",
        ])
        _fill_open(room, fx)
        snap = _bump(room)
    return _flush(room, snap, fx)


# ---- Private host questions -------------------------------------------------

def _question_data(question, for_host):
    data = {
        "id": question.pk,
        "text": question.text,
        "kind": question.kind,
        "status": question.status,
        "anonymous": question.anonymous,
        "created_at": question.created_at.isoformat(),
    }
    if for_host:
        data["author"] = "Anonymous" if question.anonymous else question.sender.name
    return data


def _question_room(code):
    try:
        return Room.objects.select_for_update().get(code=code.lower())
    except Room.DoesNotExist:
        raise RoomError("Meeting not found.", 404)


def submit_question(code, actor_identity, text, kind, anonymous=False):
    with transaction.atomic():
        room = _question_room(code)
        if _room_ended(room):
            raise RoomError("This meeting has ended.", 410)
        participant = _participant(room, actor_identity)
        if not room.questions_enabled:
            raise RoomError("The host turned off questions.", 403)
        if participant.blocked_from_questions:
            raise RoomError("You cannot send questions in this meeting.", 403)
        if anonymous and not room.anonymous_questions_enabled:
            raise RoomError("Anonymous questions are disabled by the host.", 403)
        now = timezone.now()
        questions = Question.objects.filter(room=room, sender=participant)
        if questions.count() >= 5:
            raise RoomError("You have reached the five-question limit for this meeting.", 429)
        if questions.filter(created_at__gte=now - timedelta(seconds=20)).exists():
            raise RoomError("Please wait 20 seconds before sending another question.", 429)
        question = Question.objects.create(
            room=room,
            sender=participant,
            text=text,
            kind=kind,
            anonymous=anonymous,
        )
        return _question_data(question, for_host=False)


def list_my_questions(code, actor_identity):
    room = Room.objects.filter(code=code.lower()).first()
    if not room:
        raise RoomError("Meeting not found.", 404)
    participant = _participant(room, actor_identity)
    return [
        _question_data(question, for_host=False)
        for question in Question.objects.filter(
            room=room, sender=participant, deleted_by_sender=False
        )
    ]


def delete_my_question(code, actor_identity, question_id):
    with transaction.atomic():
        room = _question_room(code)
        participant = _participant(room, actor_identity)
        question = Question.objects.filter(
            room=room, sender=participant, pk=question_id, deleted_by_sender=False
        ).first()
        if not question:
            raise RoomError("Question not found.", 404)
        question.deleted_by_sender = True
        question.save(update_fields=["deleted_by_sender"])
    return {"deleted": True}


def edit_my_question(code, actor_identity, question_id, text):
    with transaction.atomic():
        room = _question_room(code)
        if _room_ended(room):
            raise RoomError("This meeting has ended.", 410)
        participant = _participant(room, actor_identity)
        question = Question.objects.filter(
            room=room,
            sender=participant,
            pk=question_id,
            deleted_by_sender=False,
            status=Question.Status.PENDING,
            announcement__isnull=True,
        ).first()
        if not question:
            raise RoomError("Only your pending, unpublished messages can be edited.", 409)
        question.text = text
        question.save(update_fields=["text"])
    return _question_data(question, for_host=False)


def list_questions_for_host(code, actor_identity):
    room = Room.objects.filter(code=code.lower()).first()
    if not room:
        raise RoomError("Meeting not found.", 404)
    _require_host(_participant(room, actor_identity))
    questions = Question.objects.filter(room=room, deleted_by_sender=False).select_related("sender")
    return [_question_data(question, for_host=True) for question in questions]


def moderate_question(code, actor_identity, question_id, action):
    with transaction.atomic():
        room = _question_room(code)
        _require_host(_participant(room, actor_identity))
        question = Question.objects.filter(
            room=room, pk=question_id, deleted_by_sender=False
        ).select_related("sender").first()
        if not question:
            raise RoomError("Question not found.", 404)
        question.status = action
        question.save(update_fields=["status"])
    return _question_data(question, for_host=True)


def block_question_sender(code, actor_identity, question_id):
    with transaction.atomic():
        room = _question_room(code)
        _require_host(_participant(room, actor_identity))
        question = Question.objects.filter(
            room=room, pk=question_id, deleted_by_sender=False
        ).select_related("sender").first()
        if not question:
            raise RoomError("Question not found.", 404)
        question.sender.blocked_from_questions = True
        question.sender.save(update_fields=["blocked_from_questions"])
    return {"blocked": True}


def invite_question_sender(code, actor_identity, question_id):
    room = Room.objects.filter(code=code.lower()).first()
    if not room:
        raise RoomError("Meeting not found.", 404)
    _require_host(_participant(room, actor_identity))
    question = Question.objects.filter(
        room=room,
        pk=question_id,
        deleted_by_sender=False,
        announcement__isnull=False,
    ).select_related("sender").first()
    if not question:
        raise RoomError("Show the question to everyone before inviting its sender to speak.", 409)
    return grant(code, actor_identity, question.sender.identity)


def create_announcement(code, actor_identity, text, question_id=None):
    with transaction.atomic():
        room = _question_room(code)
        _require_host(_participant(room, actor_identity))
        if _room_ended(room):
            raise RoomError("This meeting has ended.", 410)
        if Announcement.objects.filter(room=room, active=True).count() >= 5:
            raise RoomError("Remove an existing announcement before adding another.", 409)
        if question_id:
            question = Question.objects.filter(
                room=room, pk=question_id, deleted_by_sender=False
            ).select_related("sender").first()
            if not question:
                raise RoomError("Question not found.", 404)
            announcement, created = Announcement.objects.get_or_create(
                question=question,
                defaults={
                    "room": room,
                    "text": question.text,
                    "anonymous": question.anonymous,
                },
            )
            if not created:
                raise RoomError("This question has already been shown to everyone.", 409)
            question.status = Question.Status.ANSWERED
            question.save(update_fields=["status"])
        else:
            announcement = Announcement.objects.create(room=room, text=text)
        snap = _bump(room)
    _flush(room, snap, Effects())
    return {"id": announcement.pk, "snapshot": snap}


def delete_announcement(code, actor_identity, announcement_id):
    with transaction.atomic():
        room = _question_room(code)
        _require_host(_participant(room, actor_identity))
        announcement = Announcement.objects.filter(room=room, pk=announcement_id).first()
        if not announcement:
            raise RoomError("Announcement not found.", 404)
        announcement.delete()
        snap = _bump(room)
    _flush(room, snap, Effects())
    return snap


def edit_announcement(code, actor_identity, announcement_id, text):
    with transaction.atomic():
        room = _question_room(code)
        _require_host(_participant(room, actor_identity))
        if _room_ended(room):
            raise RoomError("This meeting has ended.", 410)
        announcement = Announcement.objects.filter(room=room, pk=announcement_id).first()
        if not announcement:
            raise RoomError("Announcement not found.", 404)
        announcement.text = text
        announcement.save(update_fields=["text"])
        if announcement.question_id:
            Question.objects.filter(pk=announcement.question_id).update(text=text)
        snap = _bump(room)
    _flush(room, snap, Effects())
    return snap


def question_export_rows(code, actor_identity):
    room = Room.objects.filter(code=code.lower()).first()
    if not room:
        raise RoomError("Meeting not found.", 404)
    _require_host(_participant(room, actor_identity))
    return [
        {
            "text": question.text,
            "kind": question.get_kind_display(),
            "author": "Anonymous" if question.anonymous else question.sender.name,
            "status": question.get_status_display(),
            "created_at": question.created_at.isoformat(),
        }
        for question in Question.objects.filter(room=room, deleted_by_sender=False)
        .select_related("sender")
        .order_by("created_at")
    ]


def start_screen_share(code, identity):
    with transaction.atomic():
        room = _lock(code)
        participant = _participant(room, identity)
        if not participant.is_host and participant.role != SPEAKER:
            raise RoomError("Only the host or a speaker on the floor can share their screen.", 403)
        if not participant.connected:
            raise RoomError("Reconnect to the meeting before sharing your screen.", 409)
        if room.screen_share_identity and room.screen_share_identity != identity:
            current = room.participants.filter(
                identity=room.screen_share_identity,
                connected=True,
                banned=False,
            ).first()
            if current and (current.is_host or current.role == SPEAKER):
                raise RoomError(
                    f"{current.name} is already sharing their screen. Please wait until they finish.",
                    409,
                )
            room.screen_share_identity = ""
        room.screen_share_identity = identity
        room.save(update_fields=["screen_share_identity"])
        return {"identity": participant.identity, "name": participant.name}


def stop_screen_share(code, identity):
    with transaction.atomic():
        room = _lock(code)
        _participant(room, identity)
        if room.screen_share_identity == identity:
            room.screen_share_identity = ""
            room.save(update_fields=["screen_share_identity"])
    return {"stopped": True}


# ---- Connection tracking (LiveKit webhooks) and the grace period -------------

def _track(code, identity, sid, joined_at, connected):
    """Apply a LiveKit connect/disconnect event.

    A browser refresh makes two sessions for the same person: the old one leaving and the new one
    joining, and the events can arrive in either order. Each event carries its session id and the time
    that session joined, so we only let the newest session decide whether the person is connected.
    """
    with transaction.atomic():
        room = Room.objects.select_for_update().filter(code=code).first()
        if not room:
            return
        p = room.participants.filter(identity=identity).first()
        if not p:
            return
        if connected and joined_at < p.session_joined_at:
            return  # a join from an older session
        if not connected and p.livekit_sid and sid != p.livekit_sid and joined_at <= p.session_joined_at:
            return  # an older session leaving; the newer one is still connected
        if joined_at >= p.session_joined_at:
            p.livekit_sid = sid
            p.session_joined_at = joined_at
        p.connected = connected
        p.disconnected_at = None if connected else timezone.now()
        p.save(update_fields=["livekit_sid", "session_joined_at", "connected", "disconnected_at"])
        if not connected and room.screen_share_identity == identity:
            room.screen_share_identity = ""
            room.save(update_fields=["screen_share_identity"])
        if connected and p.is_host and room.opened_at is None:
            _open_room(room)
        snap = _bump(room)
    _flush(room, snap, Effects())


def mark_connected(code, identity, sid="", joined_at=0):
    _track(code, identity, sid, joined_at, True)


def mark_disconnected(code, identity, sid="", joined_at=0):
    _track(code, identity, sid, joined_at, False)


def leave_room(code, identity):
    """Mark an authenticated participant as disconnected after an intentional leave."""
    fx = Effects()
    with transaction.atomic():
        room = _lock(code)
        participant = _participant(room, identity)
        if not participant.connected:
            return snapshot(room)
        participant.connected = False
        participant.disconnected_at = timezone.now()
        participant.save(update_fields=["connected", "disconnected_at"])
        if room.screen_share_identity == identity:
            room.screen_share_identity = ""
            room.save(update_fields=["screen_share_identity"])
        snap = _bump(room)
    return _flush(room, snap, fx)


def end_room(code, identity):
    """End a room for everyone. Only the current host may do this."""
    with transaction.atomic():
        room = _lock(code)
        actor = _participant(room, identity)
        _require_host(actor)
        room.ended = True
        room.screen_share_identity = ""
        now = timezone.now()
        room.ended_at = now
        room.save(update_fields=["ended", "ended_at", "screen_share_identity"])
        room.participants.filter(connected=True, banned=False).update(
            connected=False,
            disconnected_at=now,
        )
        snap = _bump(room)
    _flush(room, snap, Effects())
    livekit.get_client().delete_room(room.code)
    return snap


def _expire(room_id, now):
    fx = Effects()
    with transaction.atomic():
        room = Room.objects.select_for_update().get(pk=room_id)
        changed = False
        for p in room.participants.filter(connected=False, disconnected_at__isnull=False, banned=False):
            waited = (now - p.disconnected_at).total_seconds()
            if p.role == SPEAKER and waited >= cfg("SPEAKER_GRACE_SECONDS"):
                _demote(p, fx)
                changed = True
            elif p.queued_at and waited >= cfg("QUEUE_GRACE_SECONDS"):
                p.queued_at = None
                p.save(update_fields=["queued_at"])
                changed = True
        if not changed:
            return 0
        _fill_open(room, fx)
        snap = _bump(room)
    _flush(room, snap, fx)
    return 1


def sweep_once(now=None):
    """Run every few seconds: release spots held by people who did not come back,
    and close meetings that reached their time limit."""
    now = now or timezone.now()
    done = 0
    for room in Room.objects.filter(ended=False, opened_at__isnull=False, ends_at__lte=now):
        Room.objects.filter(pk=room.pk).update(ended=True, ended_at=now)
        livekit.get_client().delete_room(room.code)
        done += 1
    retention_cutoff = now - timedelta(days=7)
    expired_rooms = Room.objects.filter(ended_at__lte=retention_cutoff)
    Question.objects.filter(room__in=expired_rooms).delete()
    Announcement.objects.filter(room__in=expired_rooms).delete()
    holding = (
        Participant.objects.filter(connected=False, disconnected_at__isnull=False, banned=False, room__ended=False)
        .filter(Q(role=SPEAKER) | Q(queued_at__isnull=False))
        .values_list("room_id", flat=True)
        .distinct()
    )
    for room_id in list(holding):
        done += _expire(room_id, now)
    return done