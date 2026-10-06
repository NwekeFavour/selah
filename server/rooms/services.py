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
from .models import Participant, Room

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
    """Promote into a free spot unless an earlier request is waiting; otherwise queue."""
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
        if free_spot and (first_waiting is None or first_waiting.pk == p.pk):
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
        fx.remove.append(target.identity)
        _fill_open(room, fx)
        snap = _bump(room)
    return _flush(room, snap, fx)


def update_settings(code, actor_identity, mode=None, speaker_limit=None):
    fx = Effects()
    with transaction.atomic():
        room = _lock(code)
        _require_host(_participant(room, actor_identity))
        if mode:
            room.mode = mode
        if speaker_limit:
            room.speaker_limit = min(speaker_limit, cfg("MAX_SPEAKERS"))
        room.save(update_fields=["mode", "speaker_limit"])
        _fill_open(room, fx)
        snap = _bump(room)
    return _flush(room, snap, fx)


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
        snap = _bump(room)
    return _flush(room, snap, fx)


def end_room(code, identity):
    """End a room for everyone. Only the current host may do this."""
    with transaction.atomic():
        room = _lock(code)
        actor = _participant(room, identity)
        _require_host(actor)
        room.ended = True
        room.save(update_fields=["ended"])
        now = timezone.now()
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
        Room.objects.filter(pk=room.pk).update(ended=True)
        livekit.get_client().delete_room(room.code)
        done += 1
    holding = (
        Participant.objects.filter(connected=False, disconnected_at__isnull=False, banned=False, room__ended=False)
        .filter(Q(role=SPEAKER) | Q(queued_at__isnull=False))
        .values_list("room_id", flat=True)
        .distinct()
    )
    for room_id in list(holding):
        done += _expire(room_id, now)
    return done