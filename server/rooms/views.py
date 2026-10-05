import functools
import logging

from django.conf import settings
from rest_framework import status
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import livekit, services
from .models import Participant
from .serializers import CreateSerializer, IdentitySerializer, JoinSerializer, SettingsSerializer
from .services import RoomError

log = logging.getLogger(__name__)


class SessionAuthentication(BaseAuthentication):
    """`Authorization: Bearer <session>` as issued by the join endpoint."""

    def authenticate(self, request):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return None
        token = header[7:]
        data = services.read_session(token)
        code = request.parser_context["kwargs"].get("code", "").lower()
        if not data or data["r"] != code:
            raise AuthenticationFailed("Your session is not valid for this meeting.")
        participant = (
            Participant.objects.select_related("room")
            .filter(room__code=code, identity=data["i"], banned=False)
            .first()
        )
        if not participant:
            raise AuthenticationFailed("You are not part of this meeting.")
        return participant, token


def handled(fn):
    """Turn RoomError into a clean {"detail": ...} response."""

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except RoomError as e:
            return Response({"detail": e.message}, status=e.status)

    return wrapper


class CreateRoom(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "create"

    def post(self, request):
        data = CreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        room, host_key = services.create_room(data.validated_data["title"], data.validated_data["mode"])
        return Response({"code": room.code, "host_key": host_key}, status=status.HTTP_201_CREATED)


class JoinRoom(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "join"

    @handled
    def post(self, request, code):
        data = JoinSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        return Response(services.join(code, v["display_name"], v["guest_id"], v.get("host_key") or None))


class FloorView(APIView):
    """Base for everything a participant does once they have joined."""

    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_scope = "floor"


class RoomState(FloorView):
    @handled
    def get(self, request, code):
        return Response(services.get_state(request.user))


class RaiseHand(FloorView):
    @handled
    def post(self, request, code):
        return Response(services.request_floor(code, request.user.identity))


class LowerHand(FloorView):
    @handled
    def post(self, request, code):
        return Response(services.lower_hand(code, request.user.identity))


class _TargetView(FloorView):
    action = None

    @handled
    def post(self, request, code):
        data = IdentitySerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(self.action(code, request.user.identity, data.validated_data["identity"]))


class Grant(_TargetView):
    action = staticmethod(services.grant)


class Reject(_TargetView):
    action = staticmethod(services.reject)


class Release(_TargetView):
    action = staticmethod(services.release)


class Remove(_TargetView):
    action = staticmethod(services.remove)


class RoomSettings(FloorView):
    @handled
    def post(self, request, code):
        data = SettingsSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        return Response(services.update_settings(code, request.user.identity, v.get("mode"), v.get("speaker_limit")))


class LiveKitWebhook(APIView):
    """LiveKit calls this when people connect or drop. The body is signed, so verify it."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = []

    def post(self, request):
        try:
            event = livekit.get_client().verify_webhook(
                request.body.decode(), request.headers.get("Authorization", "")
            )
        except Exception:
            return Response(status=status.HTTP_401_UNAUTHORIZED)
        room = getattr(event.room, "name", "")
        who = event.participant
        identity = getattr(who, "identity", "")
        if room and identity and event.event in ("participant_joined", "participant_left"):
            sid = getattr(who, "sid", "")
            joined_at = getattr(who, "joined_at", 0) or event.created_at
            if event.event == "participant_left":
                services.mark_disconnected(room, identity, sid, joined_at)
            else:
                services.mark_connected(room, identity, sid, joined_at)
        return Response(status=status.HTTP_204_NO_CONTENT)