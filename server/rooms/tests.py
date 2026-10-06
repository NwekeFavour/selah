from datetime import timedelta
from unittest.mock import patch

from django.conf import settings
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from . import services
from .models import Participant, Room


class FakeLiveKit:
    """Stands in for LiveKit so the rules can be tested without a server."""

    configured = True

    def __init__(self):
        self.calls = []
        self.deleted = []

    def token(self, room_code, identity, name, can_publish, is_admin, ttl):
        return f"tok|{identity}|publish={can_publish}|admin={is_admin}"

    def apply(self, room_code, snapshot, permissions, remove):
        self.calls.append({"perm": dict(permissions), "remove": list(remove), "snap": snapshot})

    def delete_room(self, code):
        self.deleted.append(code)

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

    # -- helpers
    def create(self, mode="approval"):
        r = self.api.post("/api/rooms/", {"title": "Panel", "mode": mode}, format="json")
        self.assertEqual(r.status_code, 201)
        return r.json()

    def join(self, code, name="Guest", guest=None, host_key=None, avatar=None):
        self.n += 1
        body = {"display_name": name, "guest_id": guest or f"guest-id-{self.n:04d}-xxxx"}
        if host_key:
            body["host_key"] = host_key
        if avatar is not None:
            body["avatar"] = avatar
        r = self.api.post(f"/api/rooms/{code}/join/", body, format="json")
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

    def test_guest_waits_until_host_opens_call(self):
        room = self.create()
        waiting = self.join(room["code"], "Guest")
        self.assertEqual(waiting.status_code, 425)
        self.assertEqual(waiting.json()["detail"], "The host has not opened this call yet. Please wait.")

        host = self.join(room["code"], "Host", host_key=room["host_key"])
        self.assertEqual(host.status_code, 200)
        joined = self.join(room["code"], "Guest")
        self.assertEqual(joined.status_code, 200)

    def test_free_spots_allow_self_promotion_and_host_only_actions(self):
        code, host, (a, b) = self.setup_room(guests=2)
        self.assertEqual(self.act(b, "floor/grant/", {"identity": a["identity"]}).status_code, 403)
        r = self.act(a, "hand/")
        self.assertEqual([p["identity"] for p in r.json()["speakers"]], [a["identity"]])
        self.assertEqual(r.json()["queue"], [])
        self.assertTrue(self.lk.last_perm()[a["identity"]])
        r = self.act(b, "hand/")
        self.assertEqual([p["identity"] for p in r.json()["speakers"]], [a["identity"], b["identity"]])

    def test_queued_listener_can_take_free_spot_in_queue_order(self):
        code, host, (a, b) = self.setup_room("approval", guests=2)
        self.act(host, "settings/", {"speaker_limit": 1})
        self.act(a, "hand/")
        queued = self.act(b, "hand/")
        self.assertEqual([p["identity"] for p in queued.json()["queue"]], [b["identity"]])

        self.act(a, "floor/release/", {"identity": a["identity"]})
        r = self.act(b, "hand/")
        self.assertEqual([p["identity"] for p in r.json()["speakers"]], [b["identity"]])
        self.assertEqual(r.json()["queue"], [])

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

    def test_remove_bans(self):
        code, host, (a,) = self.setup_room(guests=1)
        r = self.act(host, "floor/remove/", {"identity": a["identity"]})
        self.assertEqual(r.status_code, 200)
        self.assertIn(a["identity"], self.lk.calls[-1]["remove"])
        again = self.api.post(f"/api/rooms/{code}/join/", {"display_name": "G0", "guest_id": "guest-id-0002-xxxx"}, format="json")
        self.assertEqual(again.status_code, 403)

    def test_rejoin_keeps_identity_and_queue_place(self):
        code, host, _ = self.setup_room(guests=0)
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
        r = self.api.post(f"/api/rooms/{room['code']}/join/", {"display_name": "   ", "guest_id": "guest-id-9999-xxxx"}, format="json")
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