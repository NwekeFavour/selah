# Selah API

Django + Django REST Framework backend for Selah. It owns the room rules (who is a speaker, who is
waiting, the speaker cap) and tells LiveKit who may publish audio and video.

## Run it locally

    python -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    cp .env.example .env        # fill in LIVEKIT_* (see below)
    python manage.py migrate
    python manage.py runserver  # http://localhost:8000
    python manage.py sweep      # second terminal: releases spots after the grace period, ends meetings
    python manage.py test       # 27 tests, no LiveKit server needed

Point the frontend at it with `VITE_API_URL=http://localhost:8000/api`.

For Supabase, prefer its transaction-mode pooler for application traffic if the
session-mode pooler is reaching its connection limit. Django closes database
connections after each request so this app does not hold pool slots idle.

When a meeting is created, copy its invite link and use **Enter as host** to open it now.
If you close the creation dialog, the meeting stays saved under **Your meetings on this browser**;
reopen it there later. An unopened link remains valid until the host joins, and the 60-minute meeting
limit starts when the host opens it. Host access is stored in that browser, so opening the invite link
on another device joins as a guest unless the host credential is available there.

On their first join to each meeting, the host and each participant choose a generated avatar.
That choice is locked for that participant for the meeting and is shared in the server's room state.

## LiveKit setup

1. Create a project on LiveKit Cloud. Copy the URL (`wss://...`), API key and secret into `.env`.
2. Add a webhook in the LiveKit dashboard: `https://<your-api-host>/api/livekit/webhook/`
   (events: participant joined and participant left). This is how the server notices dropped connections.
3. The webhook must be reachable from the internet; use a tunnel such as ngrok when testing locally.

Screen sharing in production requires the frontend to run over HTTPS and the room snapshot's
`LIVEKIT_URL` to use `wss://`. Set `VITE_API_URL` to the deployed API and include the exact frontend
origin in `CORS_ALLOWED_ORIGINS`. If the frontend is embedded in an iframe, the embedding page must
allow screen capture (for example, `allow="display-capture"`).

## API

| Method and path | Who | What |
|---|---|---|
| POST `/api/rooms/` | anyone or trusted service | `{title?, mode?}` -> `{code, host_key}`; trusted services send `X-Service-Key` |
| POST `/api/rooms/:code/claim-host/` | host with key | `{host_key}` -> `{code}` and sets an HttpOnly host cookie |
| POST `/api/rooms/:code/join/` | anyone | `{display_name, guest_id, host_key?}` -> `{token, livekit_url, session, identity, snapshot}` |
| GET `/api/rooms/:code/status/` | anyone | `{ended}` (also treats elapsed meetings as ended) |
| GET `/api/rooms/:code/state/` | member | current snapshot |
| POST `/api/rooms/:code/leave/` | member | mark this participant disconnected and broadcast the updated snapshot |
| POST `/api/rooms/:code/end/` | host | end the meeting for everyone and disconnect all participants |
| POST `/api/rooms/:code/hand/` | member | request the floor (host approval always queues for host approval; open floor admits into an available spot or queues when full) |
| POST `/api/rooms/:code/hand/lower/` | member | leave the queue |
| POST `/api/rooms/:code/floor/grant/` | host | `{identity}` give someone the floor (409 if full) |
| POST `/api/rooms/:code/floor/reject/` | host | `{identity}` decline a hand |
| POST `/api/rooms/:code/floor/release/` | host or that speaker | `{identity}` end a turn |
| POST `/api/rooms/:code/floor/mute-all/` | host | mute published audio tracks for all connected speakers |
| POST `/api/rooms/:code/floor/remove/` | host | `{identity}` remove and block from the meeting |
| POST `/api/rooms/:code/settings/` | host | `{mode?, speaker_limit?}` change the mode or speaker limit mid-meeting |
| POST `/api/livekit/webhook/` | LiveKit | signed connection events |

Members send `Authorization: Bearer <session>`. Errors look like `{"detail": "..."}`.

## Rekap integration

Rekap's backend creates Selah rooms server-to-server so its organizers do not share the
per-IP `create` limit. Set the same strong, private `SELAH_SERVICE_KEY` in both deployments.
Rekap sends it only from its backend as `X-Service-Key`; never expose it in the browser.
Requests without a valid service key still use the normal `20/hour` create throttle.

Configure Rekap's backend with:

- `SELAH_API_URL`: Selah API origin, for example `https://selah.example.com/api`
- `SELAH_WEB_URL`: Selah frontend origin, for example `https://selah.example.com`
- `SELAH_SERVICE_KEY`: the same secret configured on Selah

For each event, Rekap should create the room by calling
`POST {SELAH_API_URL}/rooms/` with `X-Service-Key: {SELAH_SERVICE_KEY}` and a JSON body
such as `{"title":"Event title","mode":"approval"}`. Persist the returned `code` and
`host_key` server-side, associated with the event. When an organizer starts the meeting,
Rekap's authenticated `GET /events/:id/selah/host-link` endpoint should return a URL of
the form `{SELAH_WEB_URL}/{code}#host={URL-encoded-host_key}`. Selah exchanges this
fragment for an HttpOnly host cookie before enabling host controls, then removes the
credential from the address bar. Return this host URL only to an authorized organizer;
do not log or expose the host key in client-side API responses or analytics.

The Rekap dashboard can show its **Start meeting** action when the event's
`onlinePlatform` or `online_platform` is `selah`; opening the returned URL starts the
host flow. In Selah production, include the Selah frontend origin in
`CORS_ALLOWED_ORIGINS` and serve the frontend over HTTPS so the host cookie is secure.

## How it keeps the room honest

- Listeners get tokens with `can_publish=false`. Only the server flips that flag, so nobody can speak
  without being granted a spot.
- Every change runs in one transaction with the room row locked, so two people cannot take the last spot.
- After each change the server bumps `version` and broadcasts the full snapshot on the data topic `selah.state`.
  The frontend ignores older versions. (Rename the topic in `rooms/livekit.py` and `Room.jsx` together.)
- The identity everyone sees is a random public id. The browser's private guest id is only stored as a hash,
  so knowing someone's identity does not let you take over their place.
- The host key is only stored as a hash. Whoever joins with it becomes host; the previous host steps down.
- A dropped speaker keeps the floor for 15 seconds, a dropped listener keeps their queue place for 45 seconds
  (`SELAH` in `config/settings.py`).

## Deploy notes

- Run `gunicorn config.wsgi` behind HTTPS, and `python manage.py sweep` as a second always-on process
  (for example two systemd units).
- Set `DJANGO_DEBUG=0`, a real `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` and
  `DATABASE_URL` (your Supabase Postgres connection string).

## Not built yet

- Mute from the host (needs the participant's track list from LiveKit), host sign-in with Supabase Auth,
  and a periodic check that LiveKit permissions match the database.
- Not yet tested against a live LiveKit server: token creation was checked offline; the realtime calls
  (update participant, send data, webhooks) are written to the SDK's API but need a first real run.
