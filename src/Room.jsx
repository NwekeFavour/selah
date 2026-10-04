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
import { Track, Participant } from "livekit-client";
import { api } from "./api";
export default function Room({ code, join, onLeave }) {
  return (
    <LiveKitRoom
      serverUrl={join.livekit_url}
      token={join.token}
      connect
      audio={false}
      video={false}
      onDisconnected={onLeave}
      className="h-full"
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
  const participants = useParticipants();

  // Server broadcasts the full snapshot on every change; ignore stale ones.
  const applySnapshot = useCallback((next) => {
    if (next.version > version.current) {
      version.current = next.version;
      setSnap(next);
    }
  }, []);

  useDataChannel("qara.state", (msg) => {
    try {
      applySnapshot(JSON.parse(new TextDecoder().decode(msg.payload)));
    } catch {
      /* ignore malformed message */
    }
  });

  // Re-sync over REST on mount (covers reconnects and missed broadcasts).
  useEffect(() => {
    api.state(code, join.session).then(applySnapshot).catch(() => {});
  }, [code, join.session, applySnapshot]);

  const me = join.identity;
  const role =
    snap.host.identity === me ? "host" : snap.speakers.some((p) => p.identity === me) ? "speaker" : "listener";
  const inQueue = snap.queue.some((p) => p.identity === me);
  const canSpeak = role === "host" || role === "speaker";

  // Do an action, then apply the snapshot the server returns.
  async function act(fn) {
    setError("");
    try {
      applySnapshot(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  }

  const onStage = [snap.host, ...snap.speakers];
  const listenerCount = Math.max(participants.length - onStage.length, 0);
  const micOn = localParticipant.isMicrophoneEnabled;

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-black tracking-tight">Qara</h1>
        <p className="text-sm text-mute">
          {snap.speakers.length}/{snap.max_speakers} speaking · {listenerCount} listening
        </p>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[1fr_320px]">
        <section aria-label="On the floor" className="grid auto-rows-fr gap-3 sm:grid-cols-2">
          <Tiles people={onStage} hostId={snap.host.identity} />
        </section>

        <aside aria-label="Speaking queue" className="flex min-h-0 flex-col rounded-lg border border-line bg-panel">
          <h2 className="border-b border-line px-4 py-3 font-bold">
            Waiting to speak ({snap.queue.length})
          </h2>
          {snap.queue.length === 0 ? (
            <p className="p-4 text-sm text-mute">No hands raised yet.</p>
          ) : (
            <ol className="flex-1 overflow-y-auto">
              {snap.queue.map((p, i) => (
                <li key={p.identity} className="flex items-center gap-2 border-b border-line px-4 py-2 last:border-0">
                  <span className="w-5 text-sm text-mute">{i + 1}</span>
                  <span className="flex-1 truncate">{p.name}{p.identity === me && " (you)"}</span>
                  {role === "host" && (
                    <>
                      <button
                        className="rounded bg-floor px-2 py-1 text-sm font-medium text-white"
                        onClick={() => act(() => api.grant(code, join.session, p.identity))}
                      >
                        Give floor
                      </button>
                      <button
                        className="rounded border border-line px-2 py-1 text-sm"
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
        </aside>
      </div>

      {error && <p role="alert" className="text-sm text-alert">{error}</p>}

      <footer className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel p-3">
        {role === "listener" &&
          (inQueue ? (
            <button className="rounded-md border border-line px-4 py-2 font-medium"
              onClick={() => act(() => api.lowerHand(code, join.session))}>
              Lower hand
            </button>
          ) : (
            <button className="rounded-md bg-ink px-4 py-2 font-medium text-paper"
              onClick={() => act(() => api.raiseHand(code, join.session))}>
              Raise hand
            </button>
          ))}

        {canSpeak && (
          <>
            <button
              className="rounded-md bg-floor px-4 py-2 font-medium text-white"
              onClick={() => localParticipant.setMicrophoneEnabled(!micOn).catch((e) => setError(String(e.message ?? e)))}
            >
              {micOn ? "Mute mic" : "Turn on mic"}
            </button>
            <button
              className="rounded-md border border-line px-4 py-2 font-medium"
              onClick={() => localParticipant.setCameraEnabled(!localParticipant.isCameraEnabled).catch((e) => setError(String(e.message ?? e)))}
            >
              {localParticipant.isCameraEnabled ? "Stop camera" : "Start camera"}
            </button>
          </>
        )}
        {role === "speaker" && (
          <button className="rounded-md border border-line px-4 py-2 font-medium"
            onClick={() => act(() => api.release(code, join.session, me))}>
            Finish speaking
          </button>
        )}
        {role === "host" && snap.speakers.length > 0 && (
          <span className="flex flex-wrap items-center gap-2 text-sm text-mute">
            Take the floor back from:
            {snap.speakers.map((p) => (
              <button key={p.identity} className="rounded border border-line px-2 py-1 text-ink"
                onClick={() => act(() => api.release(code, join.session, p.identity))}>
                {p.name}
              </button>
            ))}
          </span>
        )}

        <button className="ml-auto rounded-md border border-line px-4 py-2 text-alert" onClick={onLeave}>
          Leave
        </button>
      </footer>
    </div>
  );
}

function Tiles({ people, hostId }) {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  const participants = useParticipants();
  return (
    <>
      {people.map((p) => {
        const ref = tracks.find((t) => t.participant.identity === p.identity);
        const participant = participants.find((x) => x.identity === p.identity);
        return (
          <Tile key={p.identity} person={p} isHost={p.identity === hostId} participant={participant}>
            {ref && isTrackReference(ref) ? (
              <VideoTrack trackRef={ref} className="h-full w-full object-cover" />
            ) : null}
          </Tile>
        );
      })}
    </>
  );
}

function Tile({ person, isHost, participant, children }) {
  // The teal ring marks whoever is actually talking right now.
  const speaking = useIsSpeaking(participant);
  return (
    <div className={`relative flex min-h-40 items-center justify-center overflow-hidden rounded-lg bg-ink/90 transition-shadow ${
      speaking ? "ring-4 ring-floor" : "ring-1 ring-line"}`}>
      {children ?? <span className="text-4xl font-black text-paper/70">{person.name.slice(0, 1).toUpperCase()}</span>}
      <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-sm text-white">
        {person.name}{isHost && " · host"}
      </span>
    </div>
  );
}
