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
    python manage.py test       # 19 tests, no LiveKit server needed

Point the frontend at it with `VITE_API_URL=http://localhost:8000/api`.

## LiveKit setup

1. Create a project on LiveKit Cloud. Copy the URL (`wss://...`), API key and secret into `.env`.
2. Add a webhook in the LiveKit dashboard: `https://<your-api-host>/api/livekit/webhook/`
   (events: participant joined and participant left). This is how the server notices dropped connections.
3. The webhook must be reachable from the internet; use a tunnel such as ngrok when testing locally.

## API

| Method and path | Who | What |
|---|---|---|
| POST `/api/rooms/` | anyone | `{title?, mode?}` -> `{code, host_key}` |
| POST `/api/rooms/:code/join/` | anyone | `{display_name, guest_id, host_key?}` -> `{token, livekit_url, session, identity, snapshot}` |
| GET `/api/rooms/:code/state/` | member | current snapshot |
| POST `/api/rooms/:code/hand/` | member | request the floor (speak now in an open room with a free spot, otherwise join the queue) |
| POST `/api/rooms/:code/hand/lower/` | member | leave the queue |
| POST `/api/rooms/:code/floor/grant/` | host | `{identity}` give someone the floor (409 if full) |
| POST `/api/rooms/:code/floor/reject/` | host | `{identity}` decline a hand |
| POST `/api/rooms/:code/floor/release/` | host or that speaker | `{identity}` end a turn |
| POST `/api/rooms/:code/floor/remove/` | host | `{identity}` remove and block from the meeting |
| POST `/api/rooms/:code/settings/` | host | `{mode?, speaker_limit?}` change the mode or speaker limit mid-meeting |
| POST `/api/livekit/webhook/` | LiveKit | signed connection events |

Members send `Authorization: Bearer <session>`. Errors look like `{"detail": "..."}`.

## How it keeps the room honest

- Listeners get tokens with `can_publish=false`. Only the server flips that flag, so nobody can speak
  without being granted a spot.
- Every change runs in one transaction with the room row locked, so two people cannot take the last spot.
- After each change the server bumps `version` and broadcasts the full snapshot on the data topic `qara.state`.
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
