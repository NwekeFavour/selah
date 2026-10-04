# Qara web

Vite + React + TypeScript + Tailwind v4 + LiveKit.

    npm install
    cp .env.example .env   # set VITE_API_URL
    npm run dev

## Routes
- `/`        create a Qara (host)
- `/r/:code` join a Qara (guest enters a name)

## Backend contract (Django, under VITE_API_URL)
- POST `/rooms/`            {title} -> {code, host_key}
- POST `/rooms/:code/join/` {display_name, guest_id, host_key?} -> {token, livekit_url, session, identity, snapshot}
- GET  `/rooms/:code/state/`            -> snapshot
- POST `/rooms/:code/hand/` | `/hand/lower/`            -> snapshot
- POST `/rooms/:code/floor/grant/` | `/reject/` | `/release/`  {identity} -> snapshot

REST calls send `Authorization: Bearer <session>`. The server also broadcasts the
full snapshot on LiveKit data topic `qara.state` after every change.
Snapshot: {version, host, speakers[], queue[], max_speakers, ends_at}.
Role is derived from the snapshot (host / in speakers / listener), never from the client.
