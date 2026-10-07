# selah web

Vite + React + TypeScript + Tailwind v4 + LiveKit.

    npm install
    cp .env.example .env   # set VITE_API_URL
    npm run dev

## Routes
- `/`        create a selah (host)
- `/r/:code` join a selah (guest enters a name)

On Vercel, `vercel.json` rewrites room links to the Vite app entry point so shared `/r/:code` URLs load correctly when opened directly.

## Backend contract (Django, under VITE_API_URL)
- POST `/rooms/`            {title} -> {code}; host access is set as an HttpOnly cookie
- POST `/rooms/:code/join/` {display_name, avatar?} -> {token, livekit_url, session, identity, snapshot}; guest and host credentials use room-scoped HttpOnly cookies
- GET  `/rooms/:code/status/`            -> {ended} (public room status)
- GET  `/rooms/:code/state/`            -> snapshot
- POST `/rooms/:code/hand/` | `/hand/lower/`            -> snapshot
- POST `/rooms/:code/floor/grant/` | `/reject/` | `/release/`  {identity} -> snapshot
- POST `/rooms/:code/screen-share/start/` | `/stop/` reserves/releases the room's single screen share for a floor speaker
- POST `/rooms/:code/questions/` submits a private message; GET lists only the authenticated participant's submissions; PATCH `/questions/:id/` lets its sender edit a pending, unpublished message
- PATCH `/rooms/:code/announcements/:id/` lets the host edit an announcement; published messages remain linked to their original private submission
- GET `/rooms/:code/questions/inbox/` and `/questions/export/` are host-only; moderation, blocking, publication, and announcement routes are also authenticated

The browser stores meeting titles and UI preferences in localStorage, but does not persist host keys or guest identifiers there. Host keys and per-room guest identifiers are held in tab-scoped sessionStorage as a fallback for browsers that block cross-site cookies; room credentials are also set as HttpOnly cookies where supported. Credential cookies require credentialed CORS requests; configure `CORS_ALLOWED_ORIGINS` with the exact frontend origins used by the app.

Questions are stored privately on the server, capped at five per participant per meeting and one every 20 seconds. The host can switch questions and anonymous submissions off; the API enforces both settings. Questions and announcements are removed by the room sweeper seven days after the meeting ends. Only host-published questions and host-written announcements appear in the shared room snapshot.

REST calls send `Authorization: Bearer <session>`. The server also broadcasts the
full snapshot on LiveKit data topic `selah.state` after every change.
Snapshot: {version, host, speakers[], queue[], max_speakers, ends_at}.
Role is derived from the snapshot (host / in speakers / listener), never from the client.
