"""Thin wrapper around the LiveKit server SDK.

Everything that talks to LiveKit lives here so the room logic stays testable:
tests swap `get_client` for a fake.
"""
import json
import logging
from datetime import timedelta

from asgiref.sync import async_to_sync
from django.conf import settings
from livekit import api

log = logging.getLogger(__name__)

# The frontend listens for the room snapshot on this data topic.
STATE_TOPIC = "selah.state"


class LiveKit:
    @property
    def configured(self):
        return bool(settings.LIVEKIT_URL and settings.LIVEKIT_API_KEY and settings.LIVEKIT_API_SECRET)

    def token(self, room_code, identity, name, can_publish, is_admin, ttl: timedelta):
        """Access token the browser uses to connect. Listeners get can_publish=False."""
        grants = api.VideoGrants(
            room_join=True,
            room=room_code,
            can_subscribe=True,
            can_publish=can_publish,
            can_publish_data=True,
            room_admin=is_admin,
        )
        return (
            api.AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
            .with_identity(identity)
            .with_name(name)
            .with_grants(grants)
            .with_ttl(ttl)
            .to_jwt()
        )

    def apply(self, room_code, snapshot, permissions, remove):
        """Push permission changes, kicks and the new room snapshot to LiveKit.

        Failures are logged, never raised: the database is the source of truth
        and the next change re-sends the full snapshot.
        """
        if not self.configured:
            log.warning("LiveKit is not configured; skipping realtime update for %s", room_code)
            return
        try:
            async_to_sync(self._apply)(room_code, json.dumps(snapshot).encode(), permissions, remove)
        except Exception:
            log.exception("LiveKit update failed for room %s", room_code)

    async def _apply(self, room_code, payload, permissions, remove):
        lk = api.LiveKitAPI(settings.LIVEKIT_API_URL, settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
        try:
            for identity, can_publish in permissions.items():
                try:
                    await lk.room.update_participant(
                        api.UpdateParticipantRequest(
                            room=room_code,
                            identity=identity,
                            permission=api.ParticipantPermission(
                                can_subscribe=True, can_publish=can_publish, can_publish_data=True
                            ),
                        )
                    )
                except Exception:  # e.g. the participant has already left
                    log.warning("Could not update permissions for %s in %s", identity, room_code)
            for identity in remove:
                try:
                    await lk.room.remove_participant(api.RoomParticipantIdentity(room=room_code, identity=identity))
                except Exception:
                    log.warning("Could not remove %s from %s", identity, room_code)
            await lk.room.send_data(
                api.SendDataRequest(
                    room=room_code, data=payload, kind=api.DataPacket.Kind.RELIABLE, topic=STATE_TOPIC
                )
            )
        finally:
            await lk.aclose()

    def delete_room(self, room_code):
        if not self.configured:
            return
        try:
            async_to_sync(self._delete_room)(room_code)
        except Exception:
            log.exception("Could not delete LiveKit room %s", room_code)

    async def _delete_room(self, room_code):
        lk = api.LiveKitAPI(settings.LIVEKIT_API_URL, settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
        try:
            await lk.room.delete_room(api.DeleteRoomRequest(room=room_code))
        finally:
            await lk.aclose()

    def verify_webhook(self, body: str, auth_header: str):
        receiver = api.WebhookReceiver(api.TokenVerifier(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET))
        return receiver.receive(body, auth_header)


_client = None


def get_client():
    global _client
    if _client is None:
        _client = LiveKit()
    return _client
