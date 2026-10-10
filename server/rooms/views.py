import functools
import csv
import hmac
import io
import logging
import secrets

from django.conf import settings
from django.http import HttpResponse
from rest_framework import status
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import livekit, services
from .models import Participant, Question
from .serializers import (
    AnnouncementSerializer,
    ClaimHostSerializer,
    CreateSerializer,
    IdentitySerializer,
    JoinSerializer,
    QuestionActionSerializer,
    QuestionCreateSerializer,
    SettingsSerializer,
    TextUpdateSerializer,
)
from .services import RoomError

log = logging.getLogger(__name__)
ROOM_CREDENTIAL_COOKIE_AGE = 60 * 60 * 24 * 30


class CreateThrottle(ScopedRateThrottle):
    def allow_request(self, request, view):
        service_key = request.headers.get("X-Service-Key", "")
        configured_key = settings.SELAH_SERVICE_KEY
        if service_key and configured_key and hmac.compare_digest(service_key, configured_key):
            return True
        return super().allow_request(request, view)


def _room_cookie_name(kind, code):
    return f"selah_{kind}_{code.lower()}"


def _set_room_cookie(response, kind, code, value, max_age):
    response.set_cookie(
        _room_cookie_name(kind, code),
        value,
        max_age=max_age,
        path=f"/api/rooms/{code}/",
        httponly=True,
        secure=not settings.DEBUG,
        samesite="Lax" if settings.DEBUG else "None",
    )


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
    throttle_classes = [CreateThrottle]
    throttle_scope = "create"

    def post(self, request):
        data = CreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        room, host_key = services.create_room(data.validated_data["title"], data.validated_data["mode"])
        response = Response(
            {"code": room.code, "host_key": host_key},
            status=status.HTTP_201_CREATED,
        )
        _set_room_cookie(response, "host", room.code, host_key, ROOM_CREDENTIAL_COOKIE_AGE)
        return response


class ClaimHost(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "join"

    @handled
    def post(self, request, code):
        data = ClaimHostSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        host_key = data.validated_data["host_key"]
        origin = request.headers.get("Origin")
        if origin and origin not in settings.CORS_ALLOWED_ORIGINS:
            return Response({"detail": "Origin not allowed."}, status=status.HTTP_403_FORBIDDEN)
        room = services.verify_host_key(code, host_key)
        response = Response({"code": room.code})
        _set_room_cookie(response, "host", room.code, host_key, ROOM_CREDENTIAL_COOKIE_AGE)
        return response


class JoinRoom(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "join"

    @handled
    def post(self, request, code):
        host_cookie = request.COOKIES.get(_room_cookie_name("host", code), "")
        guest_cookie = request.COOKIES.get(_room_cookie_name("guest", code), "")
        origin = request.headers.get("Origin")
        data = JoinSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        host_key = v.get("host_key") or host_cookie
        if (
            host_key or guest_cookie or v.get("guest_id")
        ) and origin and origin not in settings.CORS_ALLOWED_ORIGINS:
            return Response({"detail": "Origin not allowed."}, status=status.HTTP_403_FORBIDDEN)
        cookie_guest_id = guest_cookie if 8 <= len(guest_cookie) <= 100 else ""
        guest_id = cookie_guest_id or v.get("guest_id") or secrets.token_urlsafe(32)
        result = services.join(
            code,
            v["display_name"],
            guest_id,
            host_key or None,
            v.get("avatar", ""),
        )
        response = Response(result)
        _set_room_cookie(response, "guest", code, guest_id, settings.SELAH["SESSION_MAX_AGE"])
        return response


class RoomStatus(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "status"

    @handled
    def get(self, request, code):
        return Response(services.room_status(code))


class FloorView(APIView):
    """Base for everything a participant does once they have joined."""

    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_scope = "floor"


class RoomState(FloorView):
    @handled
    def get(self, request, code):
        return Response(services.get_state(request.user))


class LeaveRoom(FloorView):
    @handled
    def post(self, request, code):
        return Response(services.leave_room(code, request.user.identity))


class EndRoom(FloorView):
    @handled
    def post(self, request, code):
        return Response(services.end_room(code, request.user.identity))


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


class MuteAllSpeakers(FloorView):
    @handled
    def post(self, request, code):
        return Response(services.mute_all_speakers(code, request.user.identity))


class Remove(_TargetView):
    action = staticmethod(services.remove)


class RoomSettings(FloorView):
    @handled
    def post(self, request, code):
        data = SettingsSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        return Response(services.update_settings(
            code,
            request.user.identity,
            v.get("mode"),
            v.get("speaker_limit"),
            v.get("questions_enabled"),
            v.get("anonymous_questions_enabled"),
        ))


class QuestionCollection(FloorView):
    throttle_scope = "questions"

    @handled
    def get(self, request, code):
        return Response(services.list_my_questions(code, request.user.identity))

    @handled
    def post(self, request, code):
        data = QuestionCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        return Response(
            services.submit_question(
                code,
                request.user.identity,
                v["text"],
                Question.Kind.QUESTION,
                v["anonymous"],
            ),
            status=status.HTTP_201_CREATED,
        )


class MyQuestionDetail(FloorView):
    throttle_scope = "questions"

    @handled
    def delete(self, request, code, question_id):
        return Response(services.delete_my_question(code, request.user.identity, question_id))

    @handled
    def patch(self, request, code, question_id):
        data = TextUpdateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(services.edit_my_question(
            code,
            request.user.identity,
            question_id,
            data.validated_data["text"],
        ))


class HostQuestionInbox(FloorView):
    throttle_scope = "questions"

    @handled
    def get(self, request, code):
        return Response(services.list_questions_for_host(code, request.user.identity))


class HostQuestionAction(FloorView):
    throttle_scope = "questions"

    @handled
    def post(self, request, code, question_id):
        data = QuestionActionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(services.moderate_question(
            code,
            request.user.identity,
            question_id,
            data.validated_data["action"],
        ))


class BlockQuestionSender(FloorView):
    throttle_scope = "questions"

    @handled
    def post(self, request, code, question_id):
        return Response(services.block_question_sender(code, request.user.identity, question_id))


class InviteQuestionSender(FloorView):
    throttle_scope = "questions"

    @handled
    def post(self, request, code, question_id):
        return Response(services.invite_question_sender(code, request.user.identity, question_id))


class QuestionExport(FloorView):
    throttle_scope = "questions"

    @handled
    def get(self, request, code):
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Question or suggestion", "Type", "Name", "Status", "Submitted at"])
        for question in services.question_export_rows(code, request.user.identity):
            cells = [
                question["text"],
                question["kind"],
                question["author"],
                question["status"],
                question["created_at"],
            ]
            writer.writerow([
                f"'{cell}" if cell.startswith(("=", "+", "-", "@", "\t", "\r")) else cell
                for cell in cells
            ])
        response = HttpResponse(output.getvalue(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="selah-{code}-questions.csv"'
        return response


class HostAnnouncements(FloorView):
    throttle_scope = "questions"

    @handled
    def post(self, request, code):
        data = AnnouncementSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        result = services.create_announcement(
            code,
            request.user.identity,
            data.validated_data["text"],
        )
        return Response(result["snapshot"], status=status.HTTP_201_CREATED)


class PublishQuestion(FloorView):
    throttle_scope = "questions"

    @handled
    def post(self, request, code, question_id):
        result = services.create_announcement(
            code,
            request.user.identity,
            "",
            question_id=question_id,
        )
        return Response(result["snapshot"], status=status.HTTP_201_CREATED)


class DeleteAnnouncement(FloorView):
    throttle_scope = "questions"

    @handled
    def delete(self, request, code, announcement_id):
        return Response(services.delete_announcement(code, request.user.identity, announcement_id))

    @handled
    def patch(self, request, code, announcement_id):
        data = TextUpdateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(services.edit_announcement(
            code,
            request.user.identity,
            announcement_id,
            data.validated_data["text"],
        ))


class StartScreenShare(FloorView):
    @handled
    def post(self, request, code):
        return Response(services.start_screen_share(code, request.user.identity))


class StopScreenShare(FloorView):
    @handled
    def post(self, request, code):
        return Response(services.stop_screen_share(code, request.user.identity))


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