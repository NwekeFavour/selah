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
import { Track } from "livekit-client";
import Selah from "./assets/selah.webp";
import ThemeToggle from "./component/themeToggle";
import { toast } from "sonner";
import { api } from "./api";
import { Avatar } from "./avatar";
import { avatarBg, avatarFromIdentity } from "./avatarData";

const MODES = { approval: "Host approval", open: "Open floor" };
const MAX_SPEAKERS = 10; // the server enforces the real limit
const REACTIONS = ["❤️", "👏", "😂", "✨", "🔥", "🙌"];

// ---- Icons (inline SVG, no extra dependency) --------------------------------
const ICONS = {
  mic: (
    <>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </>
  ),
  micOff: (
    <>
      <line x1="2" x2="22" y1="2" y2="22" />
      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
      <path d="M5 10v2a7 7 0 0 0 12 5" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </>
  ),
  video: (
    <>
      <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </>
  ),
  videoOff: (
    <>
      <path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196" />
      <path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
      <path d="m2 2 20 20" />
    </>
  ),
  hand: (
    <>
      <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
      <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </>
  ),
  phone: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
  ),
  power: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  x: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m4.9 4.9 14.2 14.2" />
    </>
  ),
  stepDown: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v8" />
      <path d="m8 12 4 4 4-4" />
    </>
  ),
  userMinus: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="22" x2="16" y1="11" y2="11" />
    </>
  ),
};

function Icon({ name, className = "h-[18px] w-[18px]", style }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

// Round control button, FaceTime style. Icon only, label lives in aria-label + tooltip.
const TONES = {
  glass: "bg-white text-[#1C1C1E] hover:bg-white/90",
  dark: "bg-[#1C1C1E] text-white hover:bg-[#2C2C2E]",
  green: "bg-[#34C759] text-white hover:bg-[#2fb552]",
  amber: "bg-[#FF9F0A] text-white hover:bg-[#e68f09]",
  red: "bg-[#FF3B30] text-white hover:bg-[#e8352b]",
};

function Control({ label, onClick, tone = "glass", disabled, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm transition duration-200 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007AFF] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100 ${TONES[tone]}`}
    >
      {children}
    </button>
  );
}

function SmallBtn({ label, onClick, disabled, className = "", children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition active:scale-95 focus-visible:outline-2 focus-visible:outline-[#007AFF] disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

function PersonAvatar({ p, className = "h-9 w-9" }) {
  return (
    <span
      className={`${className} shrink-0 overflow-hidden rounded-full`}
      style={{ background: avatarBg(p.avatar || avatarFromIdentity(p.identity)) }}
    >
      <Avatar code={p.avatar || avatarFromIdentity(p.identity)} className="h-full w-full" />
    </span>
  );
}

// ---- Stage tiles (main view + thumbnails) -----------------------------------
function TileFrame({ person, variant, isHost, isMe, muted, speaking, video }) {
  const main = variant === "main";
  const name = `${person.name}${isMe ? " (you)" : ""}`;
  return (
    <div
      className={`relative h-full w-full overflow-hidden ${
        speaking ? "ring-2 ring-inset ring-[#1F8F78]" : ""
      } ${main ? "rounded-2xl" : "rounded-xl"}`}
      style={{ background: avatarBg(person.avatar || avatarFromIdentity(person.identity)) }}
    >
      {video ?? (
        <div className="flex h-full w-full items-center justify-center">
          <PersonAvatar p={person} className={main ? "h-36 w-36 sm:h-48 sm:w-48" : "h-10 w-10 sm:h-14 sm:w-14"} />
        </div>
      )}

      {main ? (
        <>
          <div className="absolute left-4 top-4 flex items-center gap-2">
            <span className="rounded-lg bg-black/45 px-3 py-1 text-[13px] font-medium text-white backdrop-blur-sm">
              {name}
            </span>
            {isHost && (
              <span className="rounded-lg bg-[#6495c4] px-2.5 py-1 text-[12px] font-semibold text-white">Host</span>
            )}
          </div>
          {muted && (
            <span className="absolute bottom-4 left-4 flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white">
              <Icon name="micOff" className="h-4 w-4" />
            </span>
          )}
        </>
      ) : (
        <>
          <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/55 to-transparent px-1.5 pb-1 pt-4 text-[10px] font-medium text-white">
            {isMe ? "You" : person.name}
          </span>
          {muted ? (
            <span className="absolute right-1 top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-red-500 text-white">
              <Icon name="micOff" className="h-2.5 w-2.5" />
            </span>
          ) : speaking ? (
            <span className="absolute right-1 top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#22C55E] text-white">
              <Icon name="mic" className="h-2.5 w-2.5" />
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}

// useIsSpeaking throws without a real participant, so only use it once they are connected.
function LiveTile({ participant, ...rest }) {
  const speaking = useIsSpeaking(participant);
  return <TileFrame {...rest} speaking={speaking} />;
}

function PersonTile({ person, variant, hostId, me, tracks, participants }) {
  const camRef = tracks.find(
    (t) => t.source === Track.Source.Camera && t.participant.identity === person.identity,
  );
  const micRef = tracks.find(
    (t) => t.source === Track.Source.Microphone && t.participant.identity === person.identity,
  );
  const participant = participants.find((x) => x.identity === person.identity);
  const hasVideo = camRef && isTrackReference(camRef) && !camRef.publication.isMuted;
  const muted = !(micRef && isTrackReference(micRef) && !micRef.publication.isMuted);
  const props = {
    person,
    variant,
    isHost: person.identity === hostId,
    isMe: person.identity === me,
    muted,
    video: hasVideo ? <VideoTrack trackRef={camRef} className="h-full w-full object-cover" /> : null,
  };
  return participant ? (
    <LiveTile participant={participant} {...props} />
  ) : (
    <TileFrame speaking={false} {...props} />
  );
}

// Status line for people on the floor: reflects their real mic state, not just their role.
function StatusText({ muted, speaking, isHostRow }) {
  return (
    <>
      {isHostRow && (
        <>
          <span className="text-[#6495c4]">Host</span>
          <span className="text-slate-300"> · </span>
        </>
      )}
      {muted ? (
        <span className="text-slate-400">Muted</span>
      ) : speaking ? (
        <span className="text-[#22A55B]">Speaking</span>
      ) : (
        <span className="text-slate-500">Mic on</span>
      )}
    </>
  );
}

function LiveMicStatus({ participant, ...rest }) {
  const speaking = useIsSpeaking(participant);
  return <StatusText {...rest} speaking={speaking} />;
}

function MicStatus({ person, isHostRow, tracks, participants }) {
  const micRef = tracks.find(
    (t) => t.source === Track.Source.Microphone && t.participant.identity === person.identity,
  );
  const participant = participants.find((x) => x.identity === person.identity);
  const muted = !(micRef && isTrackReference(micRef) && !micRef.publication.isMuted);
  return participant ? (
    <LiveMicStatus participant={participant} muted={muted} isHostRow={isHostRow} />
  ) : (
    <StatusText muted={muted} speaking={false} isHostRow={isHostRow} />
  );
}

export default function Room({ code, join, onLeave, onDisconnected, onMeetingEnded }) {
  const [theme, setTheme] = useState(() => (
    localStorage.getItem("selah.room.theme") === "dark" ? "dark" : "light"
  ));

  useEffect(() => {
    localStorage.setItem("selah.room.theme", theme);
  }, [theme]);

  return (
    <div className="room-theme min-h-screen bg-[#EEF1F5]" data-theme={theme}>
      <LiveKitRoom
        serverUrl={join.livekit_url}
        token={join.token}
        connect
        audio={false}
        video={false}
        onDisconnected={onDisconnected}
        className="min-h-screen bg-[#EEF1F5] text-slate-900 antialiased md:h-screen"
      >
        <RoomAudioRenderer />
        <Stage
          code={code}
          join={join}
          theme={theme}
          onToggleTheme={() => setTheme((current) => current === "dark" ? "light" : "dark")}
          onLeave={onLeave}
          onMeetingEnded={onMeetingEnded}
        />
      </LiveKitRoom>
    </div>
  );
}

function PersonRow({ p, sub, subClass = "text-slate-400", me, left, right }) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-white px-3 py-2">
      {left}
      <PersonAvatar p={p} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-slate-900">
          {p.name}
          {p.identity === me && " (you)"}
        </span>
        <span className={`block text-[12px] ${subClass}`}>{sub}</span>
      </span>
      {right}
    </li>
  );
}

function Stage({ code, join, theme, onToggleTheme, onLeave, onMeetingEnded }) {
  const [snap, setSnap] = useState(join.snapshot);
  const version = useRef(join.snapshot.version);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [ending, setEnding] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [reactions, setReactions] = useState([]);
  const [pinnedId, setPinnedId] = useState(null); // local only: whose tile this viewer wants in the main view
  const [tab, setTab] = useState("people");
  const warnedMeeting = useRef(null);
  const [hostNotice, setHostNotice] = useState(() =>
    join.snapshot.host.identity &&
    !join.snapshot.host.connected &&
    join.snapshot.host.identity !== join.identity
      ? "The host is unavailable. The meeting will continue, and the host can rejoin."
      : "",
  );
  const previousHostConnected = useRef(join.snapshot.host.connected);
  const reactionTimers = useRef(new Set());
  const { localParticipant } = useLocalParticipant();
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.Microphone, withPlaceholder: true },
  ]);
  const participants = useParticipants();

  const addReaction = useCallback((emoji, senderIdentity = join.identity) => {
    const sender = [snap.host, ...snap.participants].find(
      (person) => person.identity === senderIdentity,
    );
    const reaction = {
      id: crypto.randomUUID(),
      emoji,
      senderName: sender?.name ?? "Someone",
      left: 8 + Math.random() * 78,
    };
    setReactions((current) => [...current, reaction]);
    const timer = window.setTimeout(() => {
      setReactions((current) => current.filter(({ id }) => id !== reaction.id));
      reactionTimers.current.delete(timer);
    }, 3400);
    reactionTimers.current.add(timer);
  }, [join.identity, snap]);

  useEffect(() => () => {
    reactionTimers.current.forEach((timer) => window.clearTimeout(timer));
    reactionTimers.current.clear();
  }, []);

  const handleReactionMessage = useCallback((msg) => {
    try {
      const data = JSON.parse(new TextDecoder().decode(msg.payload));
      if (data && REACTIONS.includes(data.emoji) && msg.from?.identity !== join.identity) {
        addReaction(data.emoji, msg.from?.identity);
      }
    } catch {
      /* ignore malformed reaction */
    }
  }, [addReaction, join.identity]);

  const { send: sendReaction } = useDataChannel("selah.reaction", handleReactionMessage);

  useEffect(() => {
    if (!snap.ends_at) return undefined;
    const deadline = new Date(snap.ends_at).getTime();
    if (!Number.isFinite(deadline)) return undefined;

    const warningKey = `${code}:${snap.ends_at}`;
    if (warnedMeeting.current === warningKey) return undefined;

    const warningAt = deadline - 10 * 60 * 1000;
    const timer = window.setTimeout(() => {
      if (warnedMeeting.current === warningKey) return;
      warnedMeeting.current = warningKey;
      const minutesRemaining = Math.max(1, Math.ceil((deadline - Date.now()) / 60000));
      toast.info(
        minutesRemaining <= 1
          ? "This meeting ends in less than a minute"
          : `This meeting ends in ${minutesRemaining} minutes`,
        { description: "The meeting will automatically end when its time limit is reached." },
      );
    }, Math.max(0, warningAt - Date.now()));

    return () => window.clearTimeout(timer);
  }, [code, snap.ends_at]);

  // The server broadcasts the full room state on every change; ignore stale ones.
  const applySnapshot = useCallback((next) => {
    if (next.version > version.current) {
      if (next.ended) {
        if (next.host.identity !== join.identity) {
          toast.info("This Selah has ended", {
            description: "The meeting is over. Thanks for joining us.",
          });
        }
        onMeetingEnded();
        return;
      }
      const wasHostConnected = previousHostConnected.current;
      const hostConnected = next.host.connected;
      if (wasHostConnected && !hostConnected && next.host.identity !== join.identity) {
        setHostNotice("The host is unavailable. The meeting will continue, and the host can rejoin.");
      } else if (hostConnected) {
        setHostNotice("");
      }
      previousHostConnected.current = hostConnected;
      version.current = next.version;
      setSnap(next);
    }
  }, [join.identity, onMeetingEnded]);

  function fail(e) {
    if (e?.status === 410) return onMeetingEnded();
    if (e?.status === 401 || e?.status === 403) return onLeave();
    setError(e instanceof Error ? e.message : "Something went wrong");
  }

  useDataChannel("selah.state", (msg) => {
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

  async function react(emoji) {
    addReaction(emoji);
    setReactionPickerOpen(false);
    try {
      await sendReaction(new TextEncoder().encode(JSON.stringify({ emoji })), {
        topic: "selah.reaction",
        reliable: false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send reaction.");
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

  async function leaveCall() {
    if (leaving) return;
    setLeaving(true);
    setError("");
    try {
      const next = await api.leave(code, join.session);
      applySnapshot(next);
      onLeave();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not leave the meeting. Please try again.");
      setLeaving(false);
    }
  }

  function endMeeting() {
    if (ending) return;
    toast("End this meeting for everyone?", {
      description: "Everyone in the call will be disconnected.",
      duration: Infinity,
      action: {
        label: "End meeting",
        onClick: () => void confirmEndMeeting(),
      },
      cancel: {
        label: "Cancel",
      },
    });
  }

  async function confirmEndMeeting() {
    if (ending) return;
    setEnding(true);
    setError("");
    try {
      const next = await api.end(code, join.session);
      toast.success("Meeting ended");
      applySnapshot(next);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not end the meeting. Please try again.";
      setError(message);
      toast.error(message);
      setEnding(false);
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
  const onStage = [snap.host, ...snap.speakers].filter((person) => person.connected);
  const activeParticipants = snap.participants.filter((person) => person.connected);
  const activeQueue = snap.queue.filter((person) =>
    activeParticipants.some((participant) => participant.identity === person.identity),
  );

  // Main view: whoever this viewer picked (if still on the floor), otherwise the host.
  const mainPerson = onStage.find((p) => p.identity === pinnedId) ?? onStage[0];
  const thumbs = onStage.filter((p) => p.identity !== mainPerson?.identity);
  const stageIds = new Set(onStage.map((p) => p.identity));
  const listeners = activeParticipants.filter((p) => !stageIds.has(p.identity));
  const peopleCount = onStage.length + listeners.length;

  const toggle = (fn) => () => fn().catch((e) => setError(String(e.message ?? e)));
  const tileProps = { hostId: snap.host.identity, me, tracks, participants };

  const tabBtn = (key, label, count, alert) => (
    <button
      type="button"
      aria-pressed={tab === key}
      onClick={() => setTab(key)}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition motion-reduce:transition-none ${
        tab === key ? "bg-[#6495c4] text-[#fff]" : "text-slate-400 hover:text-slate-700"
      }`}
    >
      {label} ({count})
      {alert && <span className="h-2 w-2 rounded-full bg-[#F59E0B]" aria-hidden="true" />}
    </button>
  );

  return (
    <div className="mx-auto grid min-h-screen max-w-375 bg-white md:h-full md:min-h-0 md:grid-cols-[minmax(0,1fr)_360px] md:shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
      {/* ---------------- Left: header, stage, controls ---------------- */}
      <div className="flex min-h-0 flex-col gap-4 p-4 md:p-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src={Selah} alt="Selah" className="w-25" />
            <span className="rounded-full bg-[#6495c4] px-3 py-1 text-[12px] font-semibold text-[#fff]">
              {MODES[snap.mode]}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <p className="flex items-center gap-2 text-[13px] text-slate-500">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              Live
              <span className="text-slate-300">|</span>
              <span><b className="font-semibold text-slate-800">{snap.speakers.length}/{snap.max_speakers}</b> Speakers</span>
              <span className="text-slate-300">|</span>
              <span><b className="font-semibold text-slate-800">{snap.listeners}</b> listening</span>
            </p>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
        </header>

        {isHost && (
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
            <div role="group" aria-label="Floor mode" className="flex rounded-xl bg-slate-100 p-0.5">
              {Object.entries(MODES).map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={snap.mode === key}
                  onClick={() => act(() => api.updateSettings(code, join.session, { mode: key }))}
                  className={`rounded-[10px] px-3.5 py-1.5 text-[12px] font-semibold transition motion-reduce:transition-none ${
                    snap.mode === key ? "bg-[#6495c4] text-[#fff] shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[12px] text-slate-500">
              Speakers up to
              <select
                value={snap.max_speakers}
                onChange={(e) =>
                  act(() => api.updateSettings(code, join.session, { speaker_limit: Number(e.target.value) }))
                }
                className="rounded-lg border border-[#E4E8EE] bg-white px-2 py-1 text-[12px] font-semibold text-slate-800 outline-none focus-visible:outline-2 focus-visible:outline-[#1F8F78]"
              >
                {Array.from({ length: MAX_SPEAKERS }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {hostNotice && (
          <p role="status" aria-live="polite" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] font-medium text-amber-900">
            {hostNotice}
          </p>
        )}

        {isSpeaker && !micOn && (
          <p role="status" className="flex items-center gap-2 rounded-xl bg-[#E3F3EE] px-4 py-2.5 text-[13px] font-medium text-[#1F8F78]">
            <Icon name="mic" className="h-4 w-4" />
            You have the floor. Turn on your mic to speak.
          </p>
        )}

        {/* Stage: main view with other speakers stacked over its right edge */}
        <section aria-label="On the floor" className="relative min-h-[320px] flex-1 overflow-hidden rounded-2xl bg-slate-100 md:min-h-0">
          {mainPerson ? (
            <>
              <div className="absolute inset-0">
                <PersonTile key={mainPerson.identity} person={mainPerson} variant="main" {...tileProps} />
              </div>
              {thumbs.length > 0 && (
                <div className="absolute bottom-3 right-3 top-3 flex flex-col gap-2 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {thumbs.map((p) => (
                    <button
                      key={p.identity}
                      type="button"
                      aria-label={`Show ${p.name} in the main view`}
                      title={`Show ${p.name} in the main view`}
                      onClick={() => setPinnedId(p.identity)}
                      className="h-16 w-16 shrink-0 appearance-none rounded-xl bg-transparent! p-0 shadow-md transition hover:scale-[1.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F8F78] motion-reduce:transition-none motion-reduce:hover:scale-100 sm:h-24 sm:w-24"
                    >
                      <PersonTile person={p} variant="thumb" {...tileProps} />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-[14px] text-slate-400">
              Nobody is on the floor yet.
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
            {reactions.map((reaction) => (
              <span
                key={reaction.id}
                className="room-reaction-float absolute bottom-6 flex flex-col items-center gap-1"
                style={{ left: `${reaction.left}%` }}
              >
                <span className="text-2xl leading-none drop-shadow-[0_2px_8px_rgba(15,23,42,0.4)]">
                  {reaction.emoji}
                </span>
                <span className="max-w-28 truncate text-xs font-semibold text-white drop-shadow-[0_1px_4px_rgba(15,23,42,0.9)]">
                  {reaction.senderName}
                </span>
              </span>
            ))}
          </div>
        </section>

        {error && (
          <p role="alert" className="text-center text-[13px] font-medium text-red-500">
            {error}
          </p>
        )}

        {/* Controls */}
        <footer className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
          <div />
          <div className="flex flex-wrap items-start justify-center gap-3">
            <div className="relative">
              <Control
                label="Send a reaction"
                tone={reactionPickerOpen ? "green" : "glass"}
                onClick={() => setReactionPickerOpen((open) => !open)}
              >
                <span aria-hidden="true" className="text-xl leading-none">✨</span>
              </Control>
              {reactionPickerOpen && (
                <div
                  role="group"
                  aria-label="Choose a reaction"
                  className="absolute bottom-full left-1/2 z-30 mb-3 flex -translate-x-1/2 gap-1.5 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur"
                >
                  {REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      aria-label={`React ${emoji}`}
                      onClick={() => react(emoji)}
                      className="grid h-10 w-10 place-items-center rounded-xl text-2xl transition hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6495c4] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!canSpeak &&
              (canJoinNow ? (
                <Control label="Join the floor and turn on mic" tone="green" onClick={joinFloor}>
                  <Icon name="mic" />
                </Control>
              ) : inQueue ? (
                <Control label="Lower hand" tone="amber" onClick={() => act(() => api.lowerHand(code, join.session))}>
                  <Icon name="hand" />
                </Control>
              ) : (
                <Control label="Raise hand" tone="dark" onClick={() => act(() => api.raiseHand(code, join.session))}>
                  <Icon name="hand" />
                </Control>
              ))}

            {canSpeak && (
              <>
                <Control
                  label={micOn ? "Mute mic" : "Turn on mic"}
                  tone={micOn ? "glass" : "dark"}
                  onClick={toggle(() => localParticipant.setMicrophoneEnabled(!micOn))}
                >
                  <Icon name={micOn ? "mic" : "micOff"} />
                </Control>
                <Control
                  label={cameraOn ? "Stop camera" : "Start camera"}
                  tone={cameraOn ? "glass" : "dark"}
                  onClick={toggle(() => localParticipant.setCameraEnabled(!cameraOn))}
                >
                  <Icon name={cameraOn ? "video" : "videoOff"} />
                </Control>
              </>
            )}

            {isSpeaker && (
              <Control label="Finish speaking" onClick={() => act(() => api.release(code, join.session, me))}>
                <Icon name="stepDown" />
              </Control>
            )}
          </div>
          <div className="flex items-start justify-end gap-3">
            {isHost && (
              <Control label="End meeting for everyone" tone="dark" onClick={endMeeting} disabled={ending}>
                <Icon name="power" />
              </Control>
            )}
            <Control label="Leave meeting" tone="red" onClick={leaveCall} disabled={leaving}>
              <Icon name="phone" style={{ transform: "rotate(135deg)" }} />
            </Control>
          </div>
        </footer>
      </div>

      {/* ---------------- Right: people + raised hands ---------------- */}
      <aside
        aria-label="Meeting participants"
        className="m-3 flex max-h-[480px] min-h-0 flex-col gap-3 rounded-2xl bg-[#F5F7FA] p-3 md:m-3 md:ml-0 md:max-h-none"
      >
        <div role="group" aria-label="Panel" className="flex rounded-2xl bg-white p-1 shadow-sm">
          {tabBtn("people", "People", peopleCount, false)}
          {tabBtn("hands", "Hands", activeQueue.length, isHost && activeQueue.length > 0)}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "people" ? (
            <div className="flex flex-col gap-3">
              <section aria-label="On the floor">
                <h2 className="px-1 pb-1.5 text-[12px] font-semibold text-slate-400">Speakers ({onStage.length})</h2>
                {onStage.length === 0 ? (
                  <p className="px-1 text-[13px] text-slate-400">Nobody is on the floor yet.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {onStage.map((p) => {
                      const hostRow = p.identity === snap.host.identity;
                      return (
                        <PersonRow
                          key={p.identity}
                          p={p}
                          me={me}
                          sub={
                            <MicStatus
                              person={p}
                              isHostRow={hostRow}
                              tracks={tracks}
                              participants={participants}
                            />
                          }
                          subClass=""
                          right={
                            isHost && !hostRow && (
                              <SmallBtn
                                label={`Remove ${p.name} from the floor`}
                                onClick={() => act(() => api.release(code, join.session, p.identity))}
                                className="bg-[#FF3B30]/10 text-[#FF3B30]"
                              >
                                <Icon name="userMinus" className="h-4 w-4" />
                              </SmallBtn>
                            )
                          }
                        />
                      );
                    })}
                  </ul>
                )}
              </section>

              <section aria-label="Listening">
                <h2 className="px-1 pb-1.5 text-[12px] font-semibold text-slate-400">Participants ({listeners.length})</h2>
                {listeners.length === 0 ? (
                  <p className="px-1 text-[13px] text-slate-400">No other participants yet.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {listeners.map((p) => {
                      const waiting = p.queued || snap.queue.some((q) => q.identity === p.identity);
                      return (
                        <PersonRow
                          key={p.identity}
                          p={p}
                          me={me}
                          sub={waiting ? "Hand raised" : "Listening"}
                          subClass={waiting ? "text-[#B7791F]" : "text-slate-400"}
                          right={waiting && <Icon name="hand" className="h-4 w-4 text-[#F59E0B]" />}
                        />
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          ) : (
            <section aria-label="Speaking queue">
              {activeQueue.length === 0 ? (
                <p className="px-1 pt-1 text-[13px] text-slate-400">
                  {snap.mode === "open" && !floorFull
                    ? "No one is waiting. Free spots can be taken straight away."
                    : "No hands raised yet."}
                </p>
              ) : (
                <ol className="flex flex-col gap-1.5">
                  {activeQueue.map((p, i) => (
                    <PersonRow
                      key={p.identity}
                      p={p}
                      me={me}
                      sub={`Waiting · #${i + 1}`}
                      subClass="text-[#B7791F]"
                      right={
                        isHost && (
                          <div className="flex gap-1.5">
                            <SmallBtn
                              label={floorFull ? "The floor is full. Release a speaker first." : `Give floor to ${p.name}`}
                              disabled={floorFull}
                              onClick={() => act(() => api.grant(code, join.session, p.identity))}
                              className="bg-[#34C759] text-white"
                            >
                              <Icon name="check" className="h-4 w-4" />
                            </SmallBtn>
                            <SmallBtn
                              label={`Decline ${p.name}`}
                              onClick={() => act(() => api.reject(code, join.session, p.identity))}
                              className="bg-[#767680]/15 text-[#3A3A3C]"
                            >
                              <Icon name="x" className="h-4 w-4" />
                            </SmallBtn>
                          </div>
                        )
                      }
                    />
                  ))}
                </ol>
              )}
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}