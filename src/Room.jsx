import { useCallback, useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
} from "@livekit/components-react";
import { api } from "./api";
import RoomRuntime from "./RoomRuntime";

export default function Room({
  code,
  join,
  onLeave,
  onDisconnected,
  onMeetingEnded,
}) {
  const [endingAt, setEndingAt] = useState(null);
  const [endingNow, setEndingNow] = useState(0);
  const endingAtRef = useRef(null);

  const beginMeetingEnding = useCallback(() => {
    if (endingAtRef.current !== null) return;
    const deadline = Date.now() + 3000;
    endingAtRef.current = deadline;
    setEndingNow(Date.now());
    setEndingAt(deadline);
  }, []);

  const handleLiveKitDisconnected = useCallback(async () => {
    if (endingAtRef.current !== null) return;
    try {
      const { ended } = await api.meetingStatus(code);
      if (ended) {
        beginMeetingEnding();
        return;
      }
    } catch {
      onDisconnected();
      return;
    }
    onDisconnected();
  }, [beginMeetingEnding, code, onDisconnected]);

  useEffect(() => {
    const meetingTitle = join.snapshot.title.trim();
    document.title = meetingTitle ? `${meetingTitle} | Selah` : "Selah";
    return () => {
      document.title = "Selah";
    };
  }, [join.snapshot.title]);

  useEffect(() => {
    const deadline = Date.parse(join.snapshot.ends_at ?? "");
    if (!Number.isFinite(deadline)) return undefined;
    const timer = window.setTimeout(
      beginMeetingEnding,
      Math.max(0, deadline - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [beginMeetingEnding, join.snapshot.ends_at]);

  useEffect(() => {
    if (endingAt === null) return undefined;
    const tick = window.setInterval(() => setEndingNow(Date.now()), 100);
    const finish = window.setTimeout(
      onMeetingEnded,
      Math.max(0, endingAt - Date.now()),
    );
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(finish);
    };
  }, [endingAt, onMeetingEnded]);

  const endingSeconds =
    endingAt === null
      ? 0
      : Math.max(1, Math.ceil((endingAt - endingNow) / 1000));

  return (
    <>
      {/* Light only. `room-theme` + data-theme="light" are kept so any existing light-mode CSS still applies. */}
      <div className="room-theme min-h-screen bg-[#F2F2F7]" data-theme="light">
        <LiveKitRoom
          serverUrl={join.livekit_url}
          token={join.token}
          connect={endingAt === null}
          audio={false}
          video={false}
          options={{
            audioCaptureDefaults: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          }}
          onDisconnected={handleLiveKitDisconnected}
          className="min-h-screen bg-[#F2F2F7] text-slate-900 antialiased md:h-screen"
        >   
          <RoomAudioRenderer />
          <StartAudio
            label="Tap to resume call audio"
            className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6495c4]"
          />
          <RoomRuntime
            code={code}
            join={join}
            onLeave={onLeave}
            onMeetingEnded={beginMeetingEnding}
          />
        </LiveKitRoom>
      </div>
      {endingAt !== null && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/40 p-5 backdrop-blur-md"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="meeting-ended-title"
          aria-describedby="meeting-ended-description"
        >
          <div className="meeting-ending-dialog w-full max-w-md rounded-3xl border border-white/40 bg-white/90 px-7 py-8 text-center shadow-2xl backdrop-blur-xl">
            <div className="meeting-ending-countdown mx-auto grid h-20 w-20 place-items-center rounded-full bg-red-50 text-4xl font-bold tabular-nums text-red-600 ring-8 ring-red-100/70">
              <span role="timer" aria-live="assertive">
                {endingSeconds}
              </span>
            </div>
            <h1
              id="meeting-ended-title"
              className="mt-6 text-xl font-bold tracking-tight text-slate-900"
            >
              This meeting has ended
            </h1>
            <p
              id="meeting-ended-description"
              className="mt-2 text-sm leading-relaxed text-slate-600"
            >
              You’re being disconnected from the call and will be taken back in
              a moment.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
