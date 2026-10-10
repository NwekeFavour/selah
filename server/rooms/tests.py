from datetime import timedelta
from unittest.mock import patch

from django.conf import settings
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from . import services
from .models import Announcement, Participant, Question, Room


class FakeLiveKit:
    """Stands in for LiveKit so the rules can be tested without a server."""

    configured = True

    def __init__(self):
        self.calls = []
        self.deleted = []
        self.muted = []

    def token(self, room_code, identity, name, can_publish, is_admin, ttl):
        return f"tok|{identity}|publish={can_publish}|admin={is_admin}"

    def apply(self, room_code, snapshot, permissions, remove):
        self.calls.append({"perm": dict(permissions), "remove": list(remove), "snap": snapshot})

    def delete_room(self, code):
        self.deleted.append(code)

    def mute_speakers(self, code, identities):
        self.muted.append((code, list(identities)))

    def verify_webhook(self, body, auth):
        raise ValueError("bad signature")

    def last_perm(self):
        merged = {}
        for c in self.calls:
            merged.update(c["perm"])
        return merged


@override_settings(LIVEKIT_URL="wss://test.livekit.cloud")
class RoomTests(TestCase):
    def setUp(self):
        cache.clear()  # request-rate counters live in the cache; start each test fresh
        self.lk = FakeLiveKit()
        patcher = patch("rooms.livekit.get_client", return_value=self.lk)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.api = APIClient()
        self.n = 0
        self.guest_clients = {}

    # -- helpers
    def create(self, mode="approval"):
        r = self.api.post("/api/rooms/", {"title": "Panel", "mode": mode}, format="json")
        self.assertEqual(r.status_code, 201)
        room = r.json()
        return room

    def join(self, code, name="Guest", guest=None, host_key=None, avatar=None):
        self.n += 1
        identity = guest or f"guest-id-{self.n:04d}-xxxx"
        client = self.guest_clients.setdefault((code, identity), APIClient())
        if host_key:
            client.cookies[f"selah_host_{code}"] = host_key
        client.cookies[f"selah_guest_{code}"] = identity
        body = {"display_name": name}
        if avatar is not None:
            body["avatar"] = avatar
        r = client.post(f"/api/rooms/{code}/join/", body, format="json")
        return r

    def person(self, code, name="Guest", host_key=None, guest=None, avatar=None):
        r = self.join(code, name, guest, host_key, avatar)
        self.assertEqual(r.status_code, 200, r.content)
        d = r.json()
        d["code"] = code
        d["guest"] = guest
        if host_key:
            services.mark_connected(code, d["identity"], f"sid-{d['identity']}", 1)
        return d

    def act(self, who, path, body=None, method="post"):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {who['session']}")
        return getattr(c, method)(f"/api/rooms/{who['code']}/{path}", body or {}, format="json")

    def setup_room(self, mode="approval", guests=3):
        room = self.create(mode)
        host = self.person(room["code"], "Host", host_key=room["host_key"])
        people = [self.person(room["code"], f"G{i}") for i in range(guests)]
        return room["code"], host, people

    # -- tests
    def test_create_join_and_tokens(self):
        code, host, (g,) = self.setup_room(guests=1)
        self.assertEqual(host["snapshot"]["host"]["identity"], host["identity"])
        self.assertEqual(g["snapshot"]["participants"], [{
            "identity": g["identity"],
            "name": "G0",
            "avatar": "",
            "role": "listener",
            "queued": False,
            "connected": True,
        }])
        self.assertIn("publish=True|admin=True", host["token"])
        self.assertIn("publish=False|admin=False", g["token"])
        self.assertEqual(host["livekit_url"], "wss://test.livekit.cloud")

    def test_room_credentials_are_http_only_cookies(self):
        created = self.api.post("/api/rooms/", {"title": "Panel"}, format="json")
        room_code = created.json()["code"]
        self.assertIn("host_key", created.json())
        host_cookie = created.cookies[f"selah_host_{room_code}"]
        self.assertTrue(host_cookie["httponly"])
        self.assertEqual(host_cookie["path"], f"/api/rooms/{room_code}/")

        host = self.join(room_code, "Host", host_key=host_cookie.value)
        self.assertEqual(host.status_code, 200)
        guest_cookie = host.cookies[f"selah_guest_{room_code}"]
        self.assertTrue(guest_cookie["httponly"])
        self.assertNotIn(guest_cookie.value, host.content.decode())

    def test_claim_host_sets_cookie_without_joining_room(self):
        room = self.create()
        response = self.api.post(
            f"/api/rooms/{room['code']}/claim-host/",
            {"host_key": room["host_key"]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"code": room["code"]})
        cookie = response.cookies[f"selah_host_{room['code']}"]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["path"], f"/api/rooms/{room['code']}/")
        self.assertFalse(Participant.objects.filter(room__code=room["code"]).exists())

    def test_claim_host_rejects_invalid_key(self):
        room = self.create()
        response = self.api.post(
            f"/api/rooms/{room['code']}/claim-host/",
            {"host_key": "not-the-host-key"},
            format="json",
        )

        self.assertEqual(response.status_code, 403)

    @override_settings(SELAH_SERVICE_KEY="rekap-service-key")
    def test_service_key_bypasses_create_ip_throttle(self):
        client = APIClient()
        for _ in range(21):
            response = client.post(
                "/api/rooms/",
                {"title": "Panel"},
                format="json",
                HTTP_X_SERVICE_KEY="rekap-service-key",
            )
            self.assertEqual(response.status_code, 201)

    def test_host_can_join_with_tab_scoped_key_when_cookie_is_unavailable(self):
        room = self.create()
        response = APIClient().post(
            f"/api/rooms/{room['code']}/join/",
            {
                "display_name": "Host",
                "guest_id": "ignored-client-value",
                "host_key": room["host_key"],
            },
            format="json",
            HTTP_ORIGIN="http://localhost:5173",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("publish=True|admin=True", response.json()["token"])

    def test_host_key_fallback_rejects_untrusted_origin(self):
        room = self.create()
        response = APIClient().post(
            f"/api/rooms/{room['code']}/join/",
            {"display_name": "Host", "host_key": room["host_key"]},
            format="json",
            HTTP_ORIGIN="https://malicious.example",
        )
        self.assertEqual(response.status_code, 403)

    def test_guest_id_fallback_reuses_same_participant_without_cookies(self):
        room = self.create()
        host = self.join(room["code"], "Host", host_key=room["host_key"])
        self.assertEqual(host.status_code, 200)
        guest_id = "stable-tab-guest-identifier"
        client = APIClient()
        path = f"/api/rooms/{room['code']}/join/"

        first = client.post(
            path,
            {"display_name": "Daniel", "guest_id": guest_id},
            format="json",
        )
        client.cookies.pop(f"selah_guest_{room['code']}", None)
        second = client.post(
            path,
            {"display_name": "Daniel", "guest_id": guest_id},
            format="json",
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json()["identity"], second.json()["identity"])
        self.assertEqual(len(second.json()["snapshot"]["participants"]), 1)

    @override_settings(DEBUG=False)
    def test_room_credentials_are_secure_in_production(self):
        created = self.api.post("/api/rooms/", {"title": "Panel"}, format="json")
        cookie = created.cookies[f"selah_host_{created.json()['code']}"]
        self.assertTrue(cookie["secure"])
        self.assertEqual(cookie["samesite"], "None")

    def test_legacy_guest_id_body_does_not_resume_participant(self):
        room = self.create()
        response = APIClient().post(
            f"/api/rooms/{room['code']}/join/",
            {
                "display_name": "Host",
                "guest_id": "legacy-guest-identifier",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 425)

    def test_room_cookie_auth_rejects_untrusted_origins(self):
        room = self.create()
        client = APIClient()
        client.cookies[f"selah_host_{room['code']}"] = room["host_key"]
        response = client.post(
            f"/api/rooms/{room['code']}/join/",
            {"display_name": "Host"},
            format="json",
            HTTP_ORIGIN="https://malicious.example",
        )
        self.assertEqual(response.status_code, 403)

    def test_guest_waits_until_host_opens_call(self):
        room = self.create()
        waiting = self.join(room["code"], "Guest")
        self.assertEqual(waiting.status_code, 425)
        self.assertEqual(waiting.json()["detail"], "The host has not opened this call yet. Please wait.")

        host = self.join(room["code"], "Host", host_key=room["host_key"])
        self.assertEqual(host.status_code, 200)
        joined = self.join(room["code"], "Guest")
        self.assertEqual(joined.status_code, 200)

    def test_open_floor_free_spots_allow_self_promotion_and_host_only_actions(self):
        code, host, (a, b) = self.setup_room("open", guests=2)
        self.assertEqual(self.act(b, "floor/grant/", {"identity": a["identity"]}).status_code, 403)
        r = self.act(a, "hand/")
        self.assertEqual([p["identity"] for p in r.json()["speakers"]], [a["identity"]])
        self.assertEqual(r.json()["queue"], [])
        self.assertTrue(self.lk.last_perm()[a["identity"]])
        r = self.act(b, "hand/")
        self.assertEqual([p["identity"] for p in r.json()["speakers"]], [a["identity"], b["identity"]])

    def test_host_approval_requires_host_grant_even_when_floor_is_free(self):
        code, host, (a, b) = self.setup_room("approval", guests=2)
        self.act(host, "settings/", {"speaker_limit": 1})
        first_request = self.act(a, "hand/")
        self.assertEqual(first_request.json()["speakers"], [])
        self.assertEqual([p["identity"] for p in first_request.json()["queue"]], [a["identity"]])
        self.act(host, "floor/grant/", {"identity": a["identity"]})

        queued = self.act(b, "hand/")
        self.assertEqual([p["identity"] for p in queued.json()["queue"]], [b["identity"]])

        self.act(a, "floor/release/", {"identity": a["identity"]})
        r = self.act(b, "hand/")
        self.assertEqual(r.json()["speakers"], [])
        self.assertEqual([p["identity"] for p in r.json()["queue"]], [b["identity"]])

        granted = self.act(host, "floor/grant/", {"identity": b["identity"]})
        self.assertEqual([p["identity"] for p in granted.json()["speakers"]], [b["identity"]])
        self.assertEqual(granted.json()["queue"], [])

    def test_speaker_cap_enforced(self):
        code, host, (a, b, c) = self.setup_room(guests=3)
        self.act(host, "settings/", {"speaker_limit": 2})
        self.assertEqual(self.act(host, "floor/grant/", {"identity": a["identity"]}).status_code, 200)
        self.assertEqual(self.act(host, "floor/grant/", {"identity": b["identity"]}).status_code, 200)
        r = self.act(host, "floor/grant/", {"identity": c["identity"]})
        self.assertEqual(r.status_code, 409)
        self.assertIn("full", r.json()["detail"])
        self.act(host, "floor/release/", {"identity": a["identity"]})
        self.assertFalse(self.lk.last_perm()[a["identity"]])
        self.assertEqual(self.act(host, "floor/grant/", {"identity": c["identity"]}).status_code, 200)

    def test_only_host_or_speakers_can_reserve_screen_share(self):
        code, host, (speaker, listener) = self.setup_room(guests=2)
        self.act(host, "floor/grant/", {"identity": speaker["identity"]})

        denied = self.act(listener, "screen-share/start/")
        host_share = self.act(host, "screen-share/start/")
        speaker_blocked = self.act(speaker, "screen-share/start/")

        self.assertEqual(denied.status_code, 403)
        self.assertEqual(
            denied.json()["detail"],
            "Only the host or a speaker on the floor can share their screen.",
        )
        self.assertEqual(host_share.status_code, 200)
        self.assertEqual(host_share.json(), {"identity": host["identity"], "name": "Host"})
        self.assertEqual(speaker_blocked.status_code, 409)
        self.assertIn("Host is already sharing", speaker_blocked.json()["detail"])
        self.assertEqual(self.act(host, "screen-share/stop/").status_code, 200)
        allowed = self.act(speaker, "screen-share/start/")

        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.json(), {"identity": speaker["identity"], "name": "G0"})

    def test_only_one_speaker_can_reserve_screen_share_at_a_time(self):
        code, host, (first, second) = self.setup_room(guests=2)
        self.act(host, "floor/grant/", {"identity": first["identity"]})
        self.act(host, "floor/grant/", {"identity": second["identity"]})

        self.assertEqual(self.act(first, "screen-share/start/").status_code, 200)
        conflict = self.act(second, "screen-share/start/")

        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(
            conflict.json()["detail"],
            "G0 is already sharing their screen. Please wait until they finish.",
        )
        self.assertEqual(self.act(first, "screen-share/stop/").status_code, 200)
        self.assertEqual(self.act(second, "screen-share/start/").status_code, 200)

    def test_screen_share_reservation_clears_when_speaker_leaves_floor_or_disconnects(self):
        code, host, (speaker, other) = self.setup_room(guests=2)
        self.act(host, "floor/grant/", {"identity": speaker["identity"]})
        self.act(host, "floor/grant/", {"identity": other["identity"]})

        self.act(speaker, "screen-share/start/")
        self.act(host, "floor/release/", {"identity": speaker["identity"]})
        self.assertEqual(self.act(other, "screen-share/start/").status_code, 200)

        services.mark_disconnected(code, other["identity"], "screen-share-session", 100)
        self.assertEqual(Room.objects.get(code=code).screen_share_identity, "")

    def test_cannot_exceed_global_max(self):
        code, host, _ = self.setup_room(guests=0)
        r = self.act(host, "settings/", {"speaker_limit": 99})
        self.assertEqual(r.json()["max_speakers"], settings.SELAH["MAX_SPEAKERS"])

    def test_open_floor_autogrants_then_queues_then_fills(self):
        code, host, (a, b, c) = self.setup_room("open")
        self.act(host, "settings/", {"speaker_limit": 2})
        self.assertEqual(len(self.act(a, "hand/").json()["speakers"]), 1)
        self.assertTrue(self.lk.last_perm()[a["identity"]])
        r = self.act(b, "hand/")
        self.assertEqual(len(r.json()["speakers"]), 2)
        r = self.act(c, "hand/")  # floor is full: waits
        self.assertEqual([p["identity"] for p in r.json()["queue"]], [c["identity"]])
        r = self.act(a, "floor/release/", {"identity": a["identity"]})  # speakers can step down themselves
        self.assertEqual(r.status_code, 200)
        self.assertEqual({p["identity"] for p in r.json()["speakers"]}, {b["identity"], c["identity"]})
        self.assertEqual(r.json()["queue"], [])

    def test_open_floor_respects_queue_order(self):
        code, host, (a, b, c) = self.setup_room("open")
        self.act(host, "settings/", {"speaker_limit": 2})
        self.act(a, "hand/")
        self.act(b, "hand/")
        self.act(c, "hand/")  # queued
        Participant.objects.filter(identity=c["identity"]).update(connected=False, disconnected_at=timezone.now())
        self.act(a, "floor/release/", {"identity": a["identity"]})  # c is away, so nobody is promoted
        d = self.person(code, "Late")
        r = self.act(d, "hand/")  # a spot is free but c is still waiting: d must not jump ahead
        self.assertEqual([p["identity"] for p in r.json()["queue"]][:1], [c["identity"]])

    def test_guest_cannot_release_someone_else(self):
        code, host, (a, b) = self.setup_room(guests=2)
        self.act(host, "floor/grant/", {"identity": a["identity"]})
        self.assertEqual(self.act(b, "floor/release/", {"identity": a["identity"]}).status_code, 403)
        self.assertEqual(self.act(host, "floor/release/", {"identity": a["identity"]}).status_code, 200)

    def test_only_host_can_mute_all_speakers(self):
        code, host, (speaker, listener) = self.setup_room(guests=2)
        self.act(host, "floor/grant/", {"identity": speaker["identity"]})

        denied = self.act(listener, "floor/mute-all/")
        response = self.act(host, "floor/mute-all/")

        self.assertEqual(denied.status_code, 403)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"muted": 1})
        self.assertEqual(self.lk.muted, [(code, [speaker["identity"]])])

    def test_remove_bans(self):
        code, host, (a,) = self.setup_room(guests=1)
        r = self.act(host, "floor/remove/", {"identity": a["identity"]})
        self.assertEqual(r.status_code, 200)
        self.assertIn(a["identity"], self.lk.calls[-1]["remove"])
        again = self.join(code, "G0", guest="guest-id-0002-xxxx")
        self.assertEqual(again.status_code, 403)

    def test_rejoin_keeps_identity_and_queue_place(self):
        code, host, _ = self.setup_room("open", guests=0)
        blocker = self.person(code, "Current speaker")
        self.act(host, "settings/", {"speaker_limit": 1})
        self.act(blocker, "hand/")
        guest_id = "my-private-guest-id"
        a = self.person(code, "Ada", guest=guest_id)
        self.act(a, "hand/")
        services.mark_disconnected(code, a["identity"], "sidA", 100)
        raw = self.join(code, "Ada", guest=guest_id)
        self.assertNotIn(guest_id.encode(), raw.content)  # the private id is never echoed back
        a2 = raw.json()
        self.assertEqual(a2["identity"], a["identity"])
        self.assertEqual([p["identity"] for p in a2["snapshot"]["queue"]], [a["identity"]])

    def test_avatar_is_saved_once_per_participant_and_shared_in_snapshot(self):
        room = self.create()
        host = self.person(room["code"], "Host", host_key=room["host_key"], avatar="1234502")
        self.assertEqual(host["snapshot"]["host"]["avatar"], "1234502")
        guest_id = "avatar-test-guest"
        guest = self.person(room["code"], "Ada", guest=guest_id, avatar="7654321")
        self.assertEqual(guest["snapshot"]["participants"][0]["avatar"], "7654321")
        again = self.join(room["code"], "Ada", guest=guest_id, avatar="1234502").json()
        self.assertEqual(again["snapshot"]["participants"][0]["avatar"], "7654321")

    def test_avatar_validation_rejects_out_of_palette_codes(self):
        room = self.create()
        response = self.join(room["code"], "Host", host_key=room["host_key"], avatar="9999999")
        self.assertEqual(response.status_code, 400)

    def test_grace_period_releases_places(self):
        code, host, (a, b) = self.setup_room("approval", guests=2)
        self.act(host, "settings/", {"speaker_limit": 1})
        self.act(host, "floor/grant/", {"identity": b["identity"]})
        self.act(a, "hand/")
        services.mark_disconnected(code, a["identity"], "sidA", 100)
        services.mark_disconnected(code, b["identity"], "sidB", 100)
        now = timezone.now()
        services.sweep_once(now + timedelta(seconds=5))
        snap = services.snapshot(Room.objects.get(code=code))
        self.assertEqual(len(snap["queue"]), 1)
        self.assertEqual(len(snap["speakers"]), 1)
        services.sweep_once(now + timedelta(seconds=20))  # speaker grace (15s) is over, queue grace (45s) is not
        snap = services.snapshot(Room.objects.get(code=code))
        self.assertEqual((len(snap["queue"]), len(snap["speakers"])), (1, 0))
        self.assertFalse(self.lk.last_perm()[b["identity"]])
        services.sweep_once(now + timedelta(seconds=60))
        snap = services.snapshot(Room.objects.get(code=code))
        self.assertEqual(len(snap["queue"]), 0)

    def test_refresh_old_session_leaving_is_ignored(self):
        code, host, (a,) = self.setup_room(guests=1)
        services.mark_connected(code, a["identity"], "sidA", 100)
        services.mark_connected(code, a["identity"], "sidB", 200)      # browser refreshed: new session joins
        services.mark_disconnected(code, a["identity"], "sidA", 100)   # the old session's leave arrives after
        self.assertTrue(Participant.objects.get(identity=a["identity"]).connected)

    def test_refresh_leave_before_join_still_ends_connected(self):
        code, host, (a,) = self.setup_room(guests=1)
        services.mark_connected(code, a["identity"], "sidA", 100)
        services.mark_disconnected(code, a["identity"], "sidA", 100)   # old session leaves first
        self.assertFalse(Participant.objects.get(identity=a["identity"]).connected)
        services.mark_connected(code, a["identity"], "sidB", 200)      # then the new session joins
        self.assertTrue(Participant.objects.get(identity=a["identity"]).connected)

    def test_leave_of_unseen_newer_session_wins_over_late_older_join(self):
        code, host, (a,) = self.setup_room(guests=1)
        services.mark_disconnected(code, a["identity"], "sidB", 200)   # newest session already gone
        services.mark_connected(code, a["identity"], "sidA", 100)      # late join from an older session
        self.assertFalse(Participant.objects.get(identity=a["identity"]).connected)

    def test_speaker_disconnect_broadcasts_unavailable_status(self):
        code, host, (speaker,) = self.setup_room(guests=1)
        self.act(host, "floor/grant/", {"identity": speaker["identity"]})
        self.lk.calls.clear()

        services.mark_disconnected(code, speaker["identity"], "speaker-session", 100)

        participant = Participant.objects.get(identity=speaker["identity"])
        self.assertFalse(participant.connected)
        self.assertTrue(self.lk.calls)
        latest = self.lk.calls[-1]["snap"]["participants"]
        self.assertEqual(
            next(p for p in latest if p["identity"] == speaker["identity"])["connected"],
            False,
        )

    def test_host_disconnect_broadcasts_unavailable_status(self):
        code, host, _ = self.setup_room(guests=0)
        self.lk.calls.clear()

        services.mark_disconnected(code, host["identity"], f"sid-{host['identity']}", 1)

        self.assertFalse(Participant.objects.get(identity=host["identity"]).connected)
        latest = self.lk.calls[-1]["snap"]
        self.assertFalse(latest["host"]["connected"])

    def test_intentional_leave_marks_participant_disconnected_and_broadcasts(self):
        code, host, (guest,) = self.setup_room(guests=1)
        self.lk.calls.clear()

        response = self.act(guest, "leave/")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(Participant.objects.get(identity=guest["identity"]).connected)
        self.assertFalse(response.json()["participants"][0]["connected"])
        self.assertFalse(self.lk.calls[-1]["snap"]["participants"][0]["connected"])

    def test_intentional_leave_requires_a_valid_room_session(self):
        code, host, (guest,) = self.setup_room(guests=1)

        response = APIClient().post(f"/api/rooms/{code}/leave/", {}, format="json")

        self.assertIn(response.status_code, (401, 403))
        self.assertTrue(Participant.objects.get(identity=guest["identity"]).connected)

    def test_host_can_end_meeting_for_everyone(self):
        code, host, (guest,) = self.setup_room(guests=1)
        self.lk.calls.clear()

        response = self.act(host, "end/")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ended"])
        self.assertTrue(Room.objects.get(code=code).ended)
        self.assertFalse(Participant.objects.get(identity=host["identity"]).connected)
        self.assertFalse(Participant.objects.get(identity=guest["identity"]).connected)
        self.assertEqual(self.lk.deleted, [code])
        self.assertTrue(self.lk.calls[-1]["snap"]["ended"])
        self.assertEqual(self.join(code).status_code, 410)

    def test_only_host_can_end_meeting(self):
        code, host, (guest,) = self.setup_room(guests=1)

        response = self.act(guest, "end/")

        self.assertEqual(response.status_code, 403)
        self.assertFalse(Room.objects.get(code=code).ended)
        self.assertEqual(self.lk.deleted, [])

    def test_questions_are_private_and_host_inbox_is_host_only(self):
        code, host, (guest,) = self.setup_room(guests=1)
        guest_client = APIClient()
        guest_client.credentials(HTTP_AUTHORIZATION=f"Bearer {guest['session']}")
        submitted = guest_client.post(
            f"/api/rooms/{code}/questions/",
            {"text": "Private question", "kind": "question", "anonymous": True},
            format="json",
        )
        self.assertEqual(submitted.status_code, 201)
        self.assertTrue(submitted.json()["anonymous"])

        inbox = self.act(host, f"questions/inbox/", method="get")
        self.assertEqual(inbox.status_code, 200)
        self.assertEqual(inbox.json()[0]["author"], "Anonymous")
        denied = self.act(guest, "questions/inbox/", method="get")
        self.assertEqual(denied.status_code, 403)
        public_state = self.act(guest, "state/", method="get").json()
        self.assertEqual(public_state["title"], "Panel")
        self.assertEqual(public_state["announcements"], [])
        self.assertNotIn(
            "Private question",
            str([call["snap"] for call in self.lk.calls]),
        )

    def test_questions_setting_anonymity_limit_and_sender_deletion(self):
        code, host, (guest,) = self.setup_room(guests=1)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {guest['session']}")
        path = f"/api/rooms/{code}/questions/"

        self.act(host, "settings/", {"anonymous_questions_enabled": False})
        denied_anonymous = client.post(
            path,
            {"text": "Please keep this private", "kind": "question", "anonymous": True},
            format="json",
        )
        self.assertEqual(denied_anonymous.status_code, 403)

        first = client.post(
            path,
            {"text": "First question", "kind": "question", "anonymous": False},
            format="json",
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(
            client.delete(f"{path}{first.json()['id']}/").status_code,
            200,
        )
        self.assertEqual(client.get(path).json(), [])

        self.act(host, "settings/", {"questions_enabled": False})
        paused = client.post(
            path,
            {"text": "Stale form", "kind": "suggestion", "anonymous": False},
            format="json",
        )
        self.assertEqual(paused.status_code, 403)
        self.assertEqual(paused.json()["detail"], "The host turned off questions.")
        snapshot = self.act(guest, "state/", method="get").json()
        self.assertFalse(snapshot["questions_enabled"])

    def test_question_limits_and_owner_checks(self):
        code, host, (guest, other) = self.setup_room(guests=2)
        guest_client = APIClient()
        guest_client.credentials(HTTP_AUTHORIZATION=f"Bearer {guest['session']}")
        other_client = APIClient()
        other_client.credentials(HTTP_AUTHORIZATION=f"Bearer {other['session']}")
        path = f"/api/rooms/{code}/questions/"
        created = []
        for index in range(5):
            Question.objects.filter(room__code=code).update(
                created_at=timezone.now() - timedelta(seconds=21)
            )
            response = guest_client.post(
                path,
                {"text": f"Question {index}", "kind": "question"},
                format="json",
            )
            self.assertEqual(response.status_code, 201)
            created.append(response.json()["id"])

        blocked = guest_client.post(
            path,
            {"text": "Too many", "kind": "question"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(other_client.delete(f"{path}{created[0]}/").status_code, 404)

    def test_participant_can_edit_only_own_pending_unpublished_message(self):
        code, host, (guest, other) = self.setup_room(guests=2)
        guest_client = APIClient()
        guest_client.credentials(HTTP_AUTHORIZATION=f"Bearer {guest['session']}")
        other_client = APIClient()
        other_client.credentials(HTTP_AUTHORIZATION=f"Bearer {other['session']}")
        host_client = APIClient()
        host_client.credentials(HTTP_AUTHORIZATION=f"Bearer {host['session']}")
        path = f"/api/rooms/{code}/questions/"

        submitted = guest_client.post(path, {"text": "Original message"}, format="json")
        self.assertEqual(submitted.status_code, 201)
        question_id = submitted.json()["id"]
        self.assertEqual(submitted.json()["kind"], "question")
        self.assertEqual(
            other_client.patch(f"{path}{question_id}/", {"text": "Not yours"}, format="json").status_code,
            409,
        )
        edited = guest_client.patch(
            f"{path}{question_id}/",
            {"text": "Updated message"},
            format="json",
        )
        self.assertEqual(edited.status_code, 200)
        self.assertEqual(edited.json()["text"], "Updated message")
        self.assertEqual(
            host_client.post(f"{path}{question_id}/publish/", {}, format="json").status_code,
            201,
        )
        rejected = guest_client.patch(
            f"{path}{question_id}/",
            {"text": "Change after publishing"},
            format="json",
        )
        self.assertEqual(rejected.status_code, 409)

    def test_host_can_edit_announcements_and_linked_public_messages(self):
        code, host, (guest,) = self.setup_room(guests=1)
        guest_client = APIClient()
        guest_client.credentials(HTTP_AUTHORIZATION=f"Bearer {guest['session']}")
        host_client = APIClient()
        host_client.credentials(HTTP_AUTHORIZATION=f"Bearer {host['session']}")
        question_path = f"/api/rooms/{code}/questions/"
        submitted = guest_client.post(
            question_path,
            {"text": "Published original", "anonymous": True},
            format="json",
        )
        question_id = submitted.json()["id"]
        host_client.post(f"{question_path}{question_id}/publish/", {}, format="json")
        announcement = Announcement.objects.get(question_id=question_id)

        forbidden = guest_client.patch(
            f"/api/rooms/{code}/announcements/{announcement.pk}/",
            {"text": "Unauthorized"},
            format="json",
        )
        self.assertEqual(forbidden.status_code, 403)
        updated = host_client.patch(
            f"/api/rooms/{code}/announcements/{announcement.pk}/",
            {"text": "Edited by host"},
            format="json",
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["announcements"][0]["text"], "Edited by host")
        self.assertEqual(Question.objects.get(pk=question_id).text, "Edited by host")
        self.assertTrue(updated.json()["announcements"][0]["anonymous"])

        standalone = host_client.post(
            f"/api/rooms/{code}/announcements/",
            {"text": "Standalone"},
            format="json",
        )
        standalone_id = Announcement.objects.get(room__code=code, question__isnull=True).pk
        updated_standalone = host_client.patch(
            f"/api/rooms/{code}/announcements/{standalone_id}/",
            {"text": "Standalone edited"},
            format="json",
        )
        self.assertEqual(updated_standalone.status_code, 200)
        self.assertIn("Standalone edited", str(updated_standalone.json()["announcements"]))

    def test_moderation_publish_invite_and_export_preserve_anonymity(self):
        code, host, (guest,) = self.setup_room(guests=1)
        guest_client = APIClient()
        guest_client.credentials(HTTP_AUTHORIZATION=f"Bearer {guest['session']}")
        host_client = APIClient()
        host_client.credentials(HTTP_AUTHORIZATION=f"Bearer {host['session']}")
        path = f"/api/rooms/{code}/questions/"
        submitted = guest_client.post(
            path,
            {"text": "I would like to share a thought", "kind": "suggestion", "anonymous": True},
            format="json",
        )
        question_id = submitted.json()["id"]
        inbox = host_client.get(f"{path}inbox/").json()
        self.assertEqual(inbox[0]["author"], "Anonymous")
        self.assertNotIn("identity", inbox[0])

        published = host_client.post(
            f"{path}{question_id}/publish/",
            {},
            format="json",
        )
        self.assertEqual(published.status_code, 201)
        announcement = published.json()["announcements"][0]
        self.assertTrue(announcement["anonymous"])
        self.assertEqual(announcement["author"], "Anonymous")
        self.assertEqual(announcement["text"], "I would like to share a thought")
        invited = host_client.post(f"{path}{question_id}/invite/", {}, format="json")
        self.assertEqual(invited.status_code, 200)
        self.assertEqual(invited.json()["speakers"][0]["identity"], guest["identity"])

        exported = host_client.get(f"{path}export/")
        self.assertEqual(exported.status_code, 200)
        self.assertIn("Anonymous", exported.content.decode())
        self.assertNotIn(guest["identity"], exported.content.decode())

        for index in range(4):
            pinned = host_client.post(
                f"/api/rooms/{code}/announcements/",
                {"text": f"Host announcement {index}"},
                format="json",
            )
            self.assertEqual(pinned.status_code, 201)
        overflow = host_client.post(
            f"/api/rooms/{code}/announcements/",
            {"text": "Too many announcements"},
            format="json",
        )
        self.assertEqual(overflow.status_code, 409)

    def test_question_block_and_seven_day_retention(self):
        code, host, (guest,) = self.setup_room(guests=1)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {guest['session']}")
        path = f"/api/rooms/{code}/questions/"
        posted = client.post(
            path,
            {"text": "Please help", "kind": "question"},
            format="json",
        )
        question_id = posted.json()["id"]
        self.assertEqual(self.act(host, f"questions/{question_id}/block/").status_code, 200)
        blocked = client.post(
            path,
            {"text": "Another question", "kind": "question"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(blocked.json()["detail"], "You cannot send questions in this meeting.")

        room = Room.objects.get(code=code)
        question = Question.objects.get(pk=question_id)
        Announcement.objects.create(
            room=room,
            question=question,
            text=question.text,
            anonymous=question.anonymous,
        )
        room.ended = True
        room.ended_at = timezone.now() - timedelta(days=8)
        room.save(update_fields=["ended", "ended_at"])
        services.sweep_once()
        self.assertFalse(Question.objects.filter(room=room).exists())
        self.assertFalse(Announcement.objects.filter(room=room).exists())

    def test_meeting_ends_at_time_limit(self):
        code, host, _ = self.setup_room(guests=0)
        services.sweep_once(timezone.now() + timedelta(minutes=settings.SELAH["MEETING_MINUTES"] + 1))
        self.assertEqual(self.lk.deleted, [code])
        self.assertEqual(self.join(code).status_code, 410)

    def test_unopened_meeting_expires_only_after_host_opens_it(self):
        room = self.create()
        services.sweep_once(timezone.now() + timedelta(days=2))
        self.assertEqual(self.lk.deleted, [])
        unopened = Room.objects.get(code=room["code"])
        self.assertFalse(unopened.ended)
        self.assertIsNone(unopened.opened_at)
        self.assertEqual(self.join(room["code"]).status_code, 425)

        host = self.person(room["code"], "Host", host_key=room["host_key"])
        opened = Room.objects.get(code=room["code"])
        self.assertEqual(
            opened.ends_at,
            opened.opened_at + timedelta(minutes=settings.SELAH["MEETING_MINUTES"]),
        )
        self.assertEqual(host["snapshot"]["ends_at"], opened.ends_at.isoformat())
        services.sweep_once(opened.ends_at + timedelta(seconds=1))
        self.assertEqual(self.lk.deleted, [room["code"]])

    def test_room_capacity(self):
        with override_settings(SELAH={**settings.SELAH, "MAX_PARTICIPANTS": 2}):
            room = self.create()
            self.person(room["code"], "Host", host_key=room["host_key"])
            self.assertEqual(self.join(room["code"]).status_code, 200)
            self.assertEqual(self.join(room["code"]).status_code, 403)

    def test_sessions_are_scoped_and_signed(self):
        code, host, (a,) = self.setup_room(guests=1)
        other = self.create()
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {a['session']}")
        self.assertIn(c.get(f"/api/rooms/{other['code']}/state/").status_code, (401, 403))
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {a['session']}x")
        self.assertIn(c.get(f"/api/rooms/{code}/state/").status_code, (401, 403))
        self.assertIn(APIClient().get(f"/api/rooms/{code}/state/").status_code, (401, 403))

    def test_host_key_is_checked(self):
        room = self.create()
        self.person(room["code"], "Host", host_key=room["host_key"])
        g = self.person(room["code"], "Sneaky", host_key="not-the-key")
        self.assertNotEqual(g["snapshot"]["host"]["identity"], g["identity"])
        self.assertIn("publish=False", g["token"])

    def test_new_host_key_login_replaces_old_host(self):
        room = self.create()
        h1 = self.person(room["code"], "Phone", host_key=room["host_key"])
        h2 = self.person(room["code"], "Laptop", host_key=room["host_key"])
        self.assertEqual(h2["snapshot"]["host"]["identity"], h2["identity"])
        self.assertFalse(self.lk.last_perm()[h1["identity"]])

    def test_validation_and_cleaning(self):
        self.assertEqual(self.api.post("/api/rooms/", {"mode": "chaos"}, format="json").status_code, 400)
        room = self.create()
        r = self.join(room["code"], "   ", guest="guest-id-9999-xxxx")
        self.assertEqual(r.status_code, 400)
        self.person(room["code"], "Host", host_key=room["host_key"])
        p = self.person(room["code"], "  Ada \n\t Obi  ")
        self.assertEqual(Participant.objects.get(identity=p["identity"]).name, "Ada Obi")
        self.assertEqual(self.join("nope-nope-nop").status_code, 404)

    def test_version_only_goes_up(self):
        code, host, (a, b) = self.setup_room(guests=2)
        self.act(host, "settings/", {"speaker_limit": 1})
        self.act(b, "hand/")
        v1 = self.act(a, "hand/").json()["version"]
        v2 = self.act(a, "hand/lower/").json()["version"]
        self.assertGreater(v2, v1)
        self.assertEqual(self.act(a, "state/", method="get").json()["version"], v2)

    def test_public_room_status_reports_active_and_ended(self):
        room = self.create()
        path = f"/api/rooms/{room['code']}/status/"

        active = self.api.get(path)
        self.assertEqual(active.status_code, 200)
        self.assertEqual(active.json(), {"ended": False})

        host = self.person(room["code"], "Host", host_key=room["host_key"])
        self.act(host, "end/")

        ended = self.api.get(path)
        self.assertEqual(ended.status_code, 200)
        self.assertEqual(ended.json(), {"ended": True})

    def test_public_room_status_reports_elapsed_meeting_as_ended(self):
        room = self.create()
        meeting = Room.objects.get(code=room["code"])
        meeting.opened_at = timezone.now() - timedelta(minutes=2)
        meeting.ends_at = timezone.now() - timedelta(minutes=1)
        meeting.save(update_fields=["opened_at", "ends_at"])

        response = self.api.get(f"/api/rooms/{room['code']}/status/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ended": True})

    def test_webhook_rejects_unsigned_calls(self):
        r = self.api.post("/api/livekit/webhook/", "{}", content_type="application/json")
        self.assertEqual(r.status_code, 401)