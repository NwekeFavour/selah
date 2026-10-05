import { useCallback, useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  isTrackReference,
  useDataChannel,
  useIsSpeaking,
  useLocalParticipant,
  useParticipants,
  useTracks,
} from "@livekit/components-react";
import Selah from "./assets/selah.webp";
import { Track } from "livekit-client";
import { api } from "./api";
import Tiles from "./roomTiles";

const MODES = { approval: "Host approval", open: "Open floor" };
const MAX_SPEAKERS = 10; // the server enforces the real limit

const btn =
  "rounded-lg px-4 py-2 text-sm font-semibold transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6495c4] disabled:opacity-50 motion-reduce:transition-none";
const dark = `${btn} bg-slate-900 text-white hover:bg-[#6495c4]`;
const teal = `${btn} bg-[#2E9E8F] text-white hover:bg-[#25857a]`;
const plain = `${btn} border border-slate-300 bg-white text-slate-800 hover:border-slate-900`;

export default function Room({ code, join, onLeave, onDisconnected }) {
  return (
    <LiveKitRoom
      serverUrl={join.livekit_url}
      token={join.token}
      connect
      audio={false}
      video={false}
      onDisconnected={onDisconnected}
      className="min-h-screen bg-slate-50 text-slate-900"
    >
      <RoomAudioRenderer />
      <Stage code={code} join={join} onLeave={onLeave} />
    </LiveKitRoom>
  );
}

function Stage({ code, join, onLeave }) {
  const [snap, setSnap] = useState(join.snapshot);
  const version = useRef(join.snapshot.version);
  const [error, setError] = useState("");
  const { localParticipant } = useLocalParticipant();

  // The server broadcasts the full room state on every change; ignore stale ones.
  const applySnapshot = useCallback((next) => {
    if (next.version > version.current) {
      version.current = next.version;
      setSnap(next);
    }
  }, []);

  function fail(e) {
    if (e?.status === 410) return onLeave(); // the meeting has ended
    setError(e instanceof Error ? e.message : "Something went wrong");
  }

  useDataChannel("qara.state", (msg) => {
    try {
      applySnapshot(JSON.parse(new TextDecoder().decode(msg.payload)));
    } catch {
      /* ignore malformed message */
    }
  });

  // Re-sync over REST on mount (covers reconnects and missed broadcasts).
  useEffect(() => {
    api.state(code, join.session).then(applySnapshot).catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, join.session, applySnapshot]);

  async function act(fn) {
    setError("");
    try {
      applySnapshot(await fn());
    } catch (e) {
      fail(e);
    }
  }

  async function joinFloor() {
    setError("");
    try {
      const next = await api.raiseHand(code, join.session);
      applySnapshot(next);
      if (next.speakers.some((p) => p.identity === me)) {
        await localParticipant.setMicrophoneEnabled(true);
      }
    } catch (e) {
      fail(e);
    }
  }

  const me = join.identity;
  const isHost = snap.host.identity === me;
  const isSpeaker = snap.speakers.some((p) => p.identity === me);
  const inQueue = snap.queue.some((p) => p.identity === me);
  const canSpeak = isHost || isSpeaker;
  const floorFull = snap.speakers.length >= snap.max_speakers;
  const queueHead = snap.queue[0]?.identity;
  const canJoinNow = !floorFull && (!queueHead || queueHead === me);
  const micOn = localParticipant.isMicrophoneEnabled;
  const cameraOn = localParticipant.isCameraEnabled;
  const onStage = [snap.host, ...snap.speakers];

  const toggle = (fn) => () => fn().catch((e) => setError(String(e.message ?? e)));

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <img src={Selah} alt="Selah" className="w-25" />
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
            {MODES[snap.mode]}
          </span>
        </div>
        <p className="text-sm text-slate-500">
          {snap.speakers.length} of {snap.max_speakers} on the floor · {snap.listeners} listening
        </p>
      </header>

      {isHost && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-3 text-sm">
          <div role="group" aria-label="Floor mode" className="flex rounded-full bg-slate-100 p-1">
            {Object.entries(MODES).map(([key, label]) => (
              <button
                key={key}
                aria-pressed={snap.mode === key}
                onClick={() => act(() => api.updateSettings(code, join.session, { mode: key }))}
                className={`rounded-full px-4 py-1.5 font-semibold transition motion-reduce:transition-none ${
                  snap.mode === key ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-slate-600">
            Speakers up to
            <select
              value={snap.max_speakers}
              onChange={(e) => act(() => api.updateSettings(code, join.session, { speaker_limit: Number(e.target.value) }))}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-slate-900"
            >
              {Array.from({ length: MAX_SPEAKERS }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {isSpeaker && !micOn && (
        <p role="status" className="rounded-xl bg-[#D5F0EB] px-4 py-3 text-sm font-medium text-[#1f7a6d]">
          You have the floor. Turn on your mic to speak.
        </p>
      )}

      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[1fr_320px]">
        <section aria-label="On the floor" className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Tiles people={onStage} hostId={snap.host.identity} />
        </section>

        <aside aria-label="Meeting participants" className="flex min-h-0 flex-col gap-4">
          <section className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-100 px-4 py-3 font-semibold">
              Participants ({snap.participants.length})
            </h2>
            {snap.participants.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No other participants yet.</p>
            ) : (
              <ul className="max-h-64 overflow-y-auto">
                {snap.participants.map((p) => {
                  const status = !p.connected
                    ? "Unavailable"
                    : p.role === "speaker"
                      ? "Speaking"
                      : p.queued
                        ? "Waiting"
                        : "Listening";
                  return (
                    <li key={p.identity} className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 last:border-0">
                      <span className="flex-1 truncate text-sm font-medium">
                        {p.name}
                        {p.identity === me && " (you)"}
                      </span>
                      <span className="text-xs text-slate-500">{status}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-label="Speaking queue" className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-100 px-4 py-3 font-semibold">Waiting to speak ({snap.queue.length})</h2>
            {snap.queue.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">
                {snap.mode === "open" && !floorFull ? "No one is waiting. Free spots can be taken straight away." : "No hands raised yet."}
              </p>
            ) : (
              <ol className="max-h-64 overflow-y-auto">
                {snap.queue.map((p, i) => (
                  <li key={p.identity} className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 last:border-0">
                    <span className="w-5 text-sm text-slate-400">{i + 1}</span>
                    <span className="flex-1 truncate text-sm font-medium">
                      {p.name}
                      {p.identity === me && " (you)"}
                    </span>
                    {isHost && (
                      <>
                        <button
                          className="rounded-md bg-[#2E9E8F] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
                          disabled={floorFull}
                          title={floorFull ? "The floor is full. Release a speaker first." : undefined}
                          onClick={() => act(() => api.grant(code, join.session, p.identity))}
                        >
                          Give floor
                        </button>
                        <button
                          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs"
                          onClick={() => act(() => api.reject(code, join.session, p.identity))}
                        >
                          Decline
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>

      {error && (
        <p role="alert" className="text-sm text-[#E5484D]">
          {error}
        </p>
      )}

      <footer className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
        {!canSpeak &&
          (canJoinNow ? (
            <button className={teal} onClick={joinFloor}>
              Join the floor &amp; turn on mic
            </button>
          ) : inQueue ? (
            <button className={plain} onClick={() => act(() => api.lowerHand(code, join.session))}>
              Lower hand
            </button>
          ) : (
            <button className={dark} onClick={() => act(() => api.raiseHand(code, join.session))}>
              Raise hand
            </button>
          ))}

        {canSpeak && (
          <>
            <button className={teal} onClick={toggle(() => localParticipant.setMicrophoneEnabled(!micOn))}>
              {micOn ? "Mute mic" : "Turn on mic"}
            </button>
            <button className={plain} onClick={toggle(() => localParticipant.setCameraEnabled(!cameraOn))}>
              {cameraOn ? "Stop camera" : "Start camera"}
            </button>
          </>
        )}

        {isSpeaker && (
          <button className={plain} onClick={() => act(() => api.release(code, join.session, me))}>
            Finish speaking
          </button>
        )}

        {isHost && snap.speakers.length > 0 && (
          <span className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            Take the floor back from:
            {snap.speakers.map((p) => (
              <button
                key={p.identity}
                className="rounded-md border border-slate-300 px-2.5 py-1 text-slate-900 hover:border-slate-900"
                onClick={() => act(() => api.release(code, join.session, p.identity))}
              >
                {p.name}
              </button>
            ))}
          </span>
        )}

        <button className={`${plain} ml-auto text-[#E5484D]`} onClick={onLeave}>
          Leave
        </button>
      </footer>
    </div>
  );
}

// ---- Speaker tiles ----------------------------------------------------------

// function Tiles({ people, hostId }) {
//   const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
//   const participants = useParticipants();

//   return (
//     <>
//       {people.map((p) => {
//         const ref = tracks.find((t) => t.participant.identity === p.identity);
//         const participant = participants.find((x) => x.identity === p.identity);
//         const video =
//           ref && isTrackReference(ref) ? <VideoTrack trackRef={ref} className="h-full w-full object-cover" /> : null;
//         const isHost = p.identity === hostId;

//         // The server lists someone as a speaker before their browser reaches LiveKit, and
//         // useIsSpeaking throws without a real participant, so only use it once they are connected.
//         return participant ? (
//           <LiveTile key={p.identity} person={p} isHost={isHost} participant={participant}>
//             {video}
//           </LiveTile>
//         ) : (
//           <TileFrame key={p.identity} person={p} isHost={isHost}>
//             {video}
//           </TileFrame>
//         );
//       })}
//     </>
//   );
// }

function LiveTile({ participant, ...rest }) {
  const speaking = useIsSpeaking(participant);
  return <TileFrame {...rest} speaking={speaking} />;
}

function TileFrame({ person, isHost, speaking = false, children }) {
  // The teal ring marks whoever is talking right now.
  return (
    <div
      className={`relative flex min-h-40 items-center justify-center overflow-hidden rounded-2xl bg-slate-800 transition-shadow motion-reduce:transition-none ${
        speaking ? "ring-4 ring-[#2E9E8F]" : "ring-1 ring-slate-300"
      }`}
    >
      {children ?? <span className="text-4xl font-black text-white/70">{person.name.slice(0, 1).toUpperCase()}</span>}
      <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2.5 py-0.5 text-sm text-white">
        {person.name}
        {isHost && " · host"}
      </span>
    </div>
  );
}