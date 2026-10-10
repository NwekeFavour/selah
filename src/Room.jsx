import { useCallback, useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
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
import { ApiError, api } from "./api";
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
  screenShare: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8m-4-4v4m-3-9 3-3 3 3m-3-3v6" />
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

function Control({
  label,
  onClick,
  tone = "glass",
  disabled,
  busy = false,
  shortcut,
  children,
}) {
  return (
    <button
      type="button"
      aria-label={busy ? `${label}, in progress` : label}
      title={label}
      aria-keyshortcuts={shortcut}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm transition duration-200 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007AFF] disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100 ${TONES[tone]}`}
    >
      {busy ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-[18px] w-[18px] animate-spin motion-reduce:animate-none"
          fill="none"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeOpacity="0.3"
            strokeWidth="3"
          />
          <path
            d="M21 12a9 9 0 0 0-9-9"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        children
      )}
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

function InlineSpinner({ className = "h-3.5 w-3.5" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`${className} animate-spin motion-reduce:animate-none`}
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PersonAvatar({ p, className = "h-9 w-9" }) {
  return (
    <span
      className={`${className} shrink-0 overflow-hidden rounded-full`}
      style={{
        background: avatarBg(p.avatar || avatarFromIdentity(p.identity)),
      }}
    >
      <Avatar
        code={p.avatar || avatarFromIdentity(p.identity)}
        className="h-full w-full"
      />
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
      style={{
        background: avatarBg(
          person.avatar || avatarFromIdentity(person.identity),
        ),
      }}
    >
      {video ?? (
        <div className="flex h-full w-full items-center justify-center">
          <PersonAvatar
            p={person}
            className={
              main ? "h-36 w-36 sm:h-48 sm:w-48" : "h-10 w-10 sm:h-14 sm:w-14"
            }
          />
        </div>
      )}

      {main ? (
        <>
          <div className="absolute left-4 top-4 flex items-center gap-2">
            <span className="rounded-lg bg-black/45 px-3 py-1 text-[13px] font-medium text-white backdrop-blur-sm">
              {name}
            </span>
            {isHost && (
              <span className="rounded-lg bg-[#6495c4] px-2.5 py-1 text-[12px] font-semibold text-white">
                Host
              </span>
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
    (t) =>
      t.source === Track.Source.Camera &&
      t.participant.identity === person.identity,
  );
  const micRef = tracks.find(
    (t) =>
      t.source === Track.Source.Microphone &&
      t.participant.identity === person.identity,
  );
  const participant = participants.find((x) => x.identity === person.identity);
  const hasVideo =
    camRef && isTrackReference(camRef) && !camRef.publication.isMuted;
  const muted = !(
    micRef &&
    isTrackReference(micRef) &&
    !micRef.publication.isMuted
  );
  const props = {
    person,
    variant,
    isHost: person.identity === hostId,
    isMe: person.identity === me,
    muted,
    video: hasVideo ? (
      <VideoTrack trackRef={camRef} className="h-full w-full object-cover" />
    ) : null,
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
    (t) =>
      t.source === Track.Source.Microphone &&
      t.participant.identity === person.identity,
  );
  const participant = participants.find((x) => x.identity === person.identity);
  const muted = !(
    micRef &&
    isTrackReference(micRef) &&
    !micRef.publication.isMuted
  );
  return participant ? (
    <LiveMicStatus
      participant={participant}
      muted={muted}
      isHostRow={isHostRow}
    />
  ) : (
    <StatusText muted={muted} speaking={false} isHostRow={isHostRow} />
  );
}

export default function Room({
  code,
  join,
  onLeave,
  onDisconnected,
  onMeetingEnded,
}) {
  const [theme, setTheme] = useState(() =>
    localStorage.getItem("selah.room.theme") === "dark" ? "dark" : "light",
  );
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
    localStorage.setItem("selah.room.theme", theme);
  }, [theme]);

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
    <div className="room-theme min-h-screen bg-[#EEF1F5]" data-theme={theme}>
      <LiveKitRoom
        serverUrl={join.livekit_url}
        token={join.token}
        connect={endingAt === null}
        audio={false}
        video={false}
        onDisconnected={handleLiveKitDisconnected}
        className="min-h-screen bg-[#EEF1F5] text-slate-900 antialiased md:h-screen"
      >
        <RoomAudioRenderer />
        <StartAudio
          label="Tap to resume call audio"
          className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6495c4]"
        />
        <Stage
          code={code}
          join={join}
          theme={theme}
          onToggleTheme={() =>
            setTheme((current) => (current === "dark" ? "light" : "dark"))
          }
          onLeave={onLeave}
          onMeetingEnded={beginMeetingEnding}
        />
      </LiveKitRoom>
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

function AnnouncementText({ text }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, index) =>
    /^https?:\/\//i.test(part) ? (
      <a
        key={index}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2"
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}

function PinnedAnnouncement({
  announcement,
  isHost,
  onRemove,
  onSave,
  label = "Pinned announcement",
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(announcement.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const shouldCollapse = announcement.text.length > 180;
  let preview = announcement.text.slice(0, 180);

  if (shouldCollapse) {
    const lastWhitespace = Math.max(
      preview.lastIndexOf(" "),
      preview.lastIndexOf("\n"),
    );

    if (lastWhitespace > 0) {
      preview = preview.slice(0, lastWhitespace);
    }

    const partialUrl = [
      ...announcement.text.matchAll(/https?:\/\/\S+/g),
    ].find(
      (match) =>
        match.index < preview.length &&
        match.index + match[0].length > preview.length,
    );

    if (partialUrl) {
      preview = preview.slice(0, partialUrl.index).trimEnd();
    }
  }

  const detailsId = `announcement-${announcement.id}`;
  const authorName = announcement.author || "Participant";

  return (
    <article className="group py-4">
      <div className="flex items-start gap-3">
        {/* Author avatar */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-bold text-slate-600">
          {authorName.charAt(0).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          {/* Comment header */}
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-slate-900">
              {authorName}
            </span>

            <span className="text-xs text-slate-400">
              shared a message
            </span>

            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              {label}
            </span>

            {/* Host controls */}
            {isHost && !editing && (
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setText(announcement.text);
                    setEditing(true);
                    setError("");
                  }}
                  aria-label="Edit shared message"
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <Icon name="pencil" className="h-4 w-4" />
                </button>

                <SmallBtn
                  label="Remove announcement"
                  onClick={() => onRemove(announcement.id)}
                  className="bg-transparent text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Icon name="x" className="h-4 w-4" />
                </SmallBtn>
              </div>
            )}
          </div>

          {/* Comment content */}
          {editing ? (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                setError("");

                try {
                  await onSave(announcement.id, text);
                  setEditing(false);
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Could not edit announcement.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <textarea
                aria-label="Edit shared message"
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={500}
                rows={3}
                className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 text-slate-700 outline-none transition focus:border-[#d47a3e] focus:ring-2 focus:ring-[#d47a3e]/10"
              />

              {error && (
                <p role="alert" className="mt-1 text-xs text-red-600">
                  {error}
                </p>
              )}

              <div className="mt-2 flex gap-2">
                <button
                  type="submit"
                  disabled={busy || !text.trim()}
                  className="rounded-lg bg-[#d47a3e] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#bd6832] disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save changes"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setText(announcement.text);
                    setError("");
                  }}
                  className="rounded-lg px-3 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="rounded-2xl rounded-tl-sm border border-slate-100 bg-slate-50 px-4 py-3">
                <p
                  id={detailsId}
                  className="whitespace-pre-wrap break-words text-[13px] leading-6 text-slate-700"
                >
                  <AnnouncementText
                    text={expanded ? announcement.text : preview}
                  />
                  {shouldCollapse && !expanded ? "…" : ""}
                </p>

                {shouldCollapse && (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={detailsId}
                    onClick={() => setExpanded((value) => !value)}
                    className="mt-2 text-xs font-semibold text-[#b96530] transition hover:text-[#8f4b25]"
                  >
                    {expanded ? "Show less" : "Read full message"}
                  </button>
                )}
              </div>

              {/* Subtle comment footer */}
              <div className="mt-2 flex items-center gap-3">
                <span className="text-[11px] text-slate-400">
                  Shared with participants
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function MeetingCountdown({ endsAt }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  if (!endsAt) return null;
  const deadline = new Date(endsAt).getTime();
  if (!Number.isFinite(deadline)) return null;

  const remainingSeconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  const hours = String(Math.floor(remainingSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((remainingSeconds % 3600) / 60)).padStart(
    2,
    "0",
  );
  const seconds = String(remainingSeconds % 60).padStart(2, "0");
  const urgent = remainingSeconds <= 10 * 60;

  return (
    <span
      role="timer"
      aria-label={`Meeting time remaining: ${hours} hours, ${minutes} minutes, ${seconds} seconds`}
      className={`whitespace-nowrap text-[12px] font-bold leading-tight ${urgent ? "animate-pulse text-red-600 motion-reduce:animate-none" : "text-slate-800"}`}
    >
      {hours}:{minutes}:{seconds}
    </span>
  );
}

function Stage({ code, join, theme, onToggleTheme, onLeave, onMeetingEnded }) {
  const [snap, setSnap] = useState(join.snapshot);
  const version = useRef(join.snapshot.version);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [ending, setEnding] = useState(false);
  const [floorBusy, setFloorBusy] = useState(false);
  const [busyActions, setBusyActions] = useState({});
  const [confirmation, setConfirmation] = useState(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const [screenShareBusy, setScreenShareBusy] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [reactions, setReactions] = useState([]);
  const [pinnedId, setPinnedId] = useState(null); // local only: whose tile this viewer wants in the main view
  const [announcementIndex, setAnnouncementIndex] = useState(0);
  const [tab, setTab] = useState("people");
  const [questionInbox, setQuestionInbox] = useState([]);
  const [myQuestions, setMyQuestions] = useState([]);
  const [askOpen, setAskOpen] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [anonymousQuestion, setAnonymousQuestion] = useState(false);
  const [questionBusy, setQuestionBusy] = useState(false);
  const [questionError, setQuestionError] = useState("");
  const [questionSent, setQuestionSent] = useState(false);
  const [questionUnread, setQuestionUnread] = useState(0);
  const [announcementText, setAnnouncementText] = useState("");
  const [announcementBusy, setAnnouncementBusy] = useState(false);
  const seenQuestionIds = useRef(new Set());
  const initialInboxLoaded = useRef(false);
  const lastQuestionToastAt = useRef(0);
  const warnedMeeting = useRef(null);
  const announcementPointerStart = useRef(null);
  const [hostNotice, setHostNotice] = useState(() =>
    join.snapshot.host.identity &&
    !join.snapshot.host.connected &&
    join.snapshot.host.identity !== join.identity
      ? "The host is unavailable. The meeting will continue, and the host can rejoin."
      : "",
  );
  const previousHostConnected = useRef(join.snapshot.host.connected);
  const reactionTimers = useRef(new Set());
  const screenShareReserved = useRef(false);
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant();
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.Microphone, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);
  const participants = useParticipants();

  useEffect(() => {
    if (!error) return undefined;
    const timeout = window.setTimeout(() => setError(""), 5000);
    return () => window.clearTimeout(timeout);
  }, [error]);

  const addReaction = useCallback(
    (emoji, senderIdentity = join.identity) => {
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
        setReactions((current) =>
          current.filter(({ id }) => id !== reaction.id),
        );
        reactionTimers.current.delete(timer);
      }, 3400);
      reactionTimers.current.add(timer);
    },
    [join.identity, snap],
  );

  useEffect(
    () => () => {
      reactionTimers.current.forEach((timer) => window.clearTimeout(timer));
      reactionTimers.current.clear();
    },
    [],
  );

  useEffect(() => {
    if (isScreenShareEnabled || !screenShareReserved.current) return;
    screenShareReserved.current = false;
    api.stopScreenShare(code, join.session).catch((e) => {
      screenShareReserved.current = true;
      setError(
        e instanceof Error
          ? e.message
          : "Could not stop screen sharing. Please try again.",
      );
    });
  }, [code, isScreenShareEnabled, join.session]);

  const handleReactionMessage = useCallback(
    (msg) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(msg.payload));
        if (
          data &&
          REACTIONS.includes(data.emoji) &&
          msg.from?.identity !== join.identity
        ) {
          addReaction(data.emoji, msg.from?.identity);
        }
      } catch {
        /* ignore malformed reaction */
      }
    },
    [addReaction, join.identity],
  );

  const { send: sendReaction } = useDataChannel(
    "selah.reaction",
    handleReactionMessage,
  );

  useEffect(() => {
    if (!snap.ends_at) return undefined;
    const deadline = new Date(snap.ends_at).getTime();
    if (!Number.isFinite(deadline)) return undefined;

    const warningKey = `${code}:${snap.ends_at}`;
    if (warnedMeeting.current === warningKey) return undefined;

    const warningAt = deadline - 10 * 60 * 1000;
    const timer = window.setTimeout(
      () => {
        if (warnedMeeting.current === warningKey) return;
        warnedMeeting.current = warningKey;
        const minutesRemaining = Math.max(
          1,
          Math.ceil((deadline - Date.now()) / 60000),
        );
        toast.info(
          minutesRemaining <= 1
            ? "This meeting ends in less than a minute"
            : `This meeting ends in ${minutesRemaining} minutes`,
          {
            description:
              "The meeting will automatically end when its time limit is reached.",
          },
        );
      },
      Math.max(0, warningAt - Date.now()),
    );

    return () => window.clearTimeout(timer);
  }, [code, snap.ends_at]);

  // The server broadcasts the full room state on every change; ignore stale ones.
  const applySnapshot = useCallback(
    (next) => {
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
        if (
          wasHostConnected &&
          !hostConnected &&
          next.host.identity !== join.identity
        ) {
          setHostNotice(
            "The host is unavailable. The meeting will continue, and the host can rejoin.",
          );
        } else if (hostConnected) {
          setHostNotice("");
        }
        previousHostConnected.current = hostConnected;
        version.current = next.version;
        setSnap(next);
      }
    },
    [join.identity, onMeetingEnded],
  );

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

  async function act(fn, busyKey) {
    if (busyKey && busyActions[busyKey]) return;
    setError("");
    if (busyKey) {
      setBusyActions((current) => ({ ...current, [busyKey]: true }));
    }
    try {
      const result = await fn();
      if (result?.version !== undefined) applySnapshot(result);
      return result;
    } catch (e) {
      fail(e);
    } finally {
      if (busyKey) {
        setBusyActions((current) => ({ ...current, [busyKey]: false }));
      }
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

  async function updateFloor(request, enableMicrophone = false) {
    if (floorBusy) return;
    setFloorBusy(true);
    setError("");
    try {
      const next = await request();
      applySnapshot(next);
      if (
        enableMicrophone &&
        next.speakers.some((p) => p.identity === me)
      ) {
        await localParticipant.setMicrophoneEnabled(true);
      }
    } catch (e) {
      fail(e);
    } finally {
      setFloorBusy(false);
    }
  }

  function joinFloor() {
    return updateFloor(() => api.raiseHand(code, join.session), true);
  }

  function raiseHand() {
    return updateFloor(() => api.raiseHand(code, join.session));
  }

  function lowerHand() {
    return updateFloor(() => api.lowerHand(code, join.session));
  }

  function requestConfirmation({
    title,
    message,
    confirmLabel = "Confirm",
    busyLabel = "Working…",
    onConfirm,
  }) {
    setConfirmation({ title, message, confirmLabel, busyLabel, onConfirm });
  }

  async function confirmRequestedAction() {
    const onConfirm = confirmation?.onConfirm;
    if (!onConfirm || confirmationBusy) return;
    setConfirmationBusy(true);
    try {
      await onConfirm();
      setConfirmation(null);
    } finally {
      setConfirmationBusy(false);
    }
  }

  function leaveCall() {
    requestConfirmation({
      title: "Leave this meeting?",
      message: "You will leave the call. You can rejoin while the meeting is still open.",
      confirmLabel: "Leave meeting",
      onConfirm: performLeaveCall,
    });
  }

  async function performLeaveCall() {
    if (leaving) return;
    setLeaving(true);
    setError("");
    try {
      const next = await api.leave(code, join.session);
      applySnapshot(next);
      onLeave();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not leave the meeting. Please try again.",
      );
      setLeaving(false);
    }
  }

  function endMeeting() {
    if (ending) return;
    requestConfirmation({
      title: "End this meeting for everyone?",
      message: "Everyone in the call will be disconnected and cannot rejoin this meeting.",
      confirmLabel: "End meeting",
      onConfirm: confirmEndMeeting,
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
      const message =
        e instanceof Error
          ? e.message
          : "Could not end the meeting. Please try again.";
      setError(message);
      toast.error(message);
      setEnding(false);
    }
  }

  async function toggleScreenShare() {
    if (screenShareBusy) return;
    if (
      !isScreenShareEnabled &&
      (!window.isSecureContext ||
        typeof navigator.mediaDevices?.getDisplayMedia !== "function")
    ) {
      setError(
        !window.isSecureContext
          ? "Screen sharing requires a secure HTTPS connection."
          : "This browser does not support screen sharing. Try a current version of Chrome, Edge, Firefox, or Safari.",
      );
      return;
    }
    setScreenShareBusy(true);
    setError("");
    try {
      if (isScreenShareEnabled) {
        screenShareReserved.current = false;
        await localParticipant.setScreenShareEnabled(false);
        await api.stopScreenShare(code, join.session);
        return;
      }

      await api.startScreenShare(code, join.session);
      screenShareReserved.current = true;
      try {
        await localParticipant.setScreenShareEnabled(true);
      } catch (e) {
        screenShareReserved.current = false;
        try {
          await api.stopScreenShare(code, join.session);
        } catch (releaseError) {
          throw new Error(
            "Screen sharing could not start, and its reservation could not be cleared. Please leave and rejoin the meeting.",
            { cause: releaseError },
          );
        }
        const name = e instanceof Error ? e.name : "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          throw new Error(
            "Screen sharing was cancelled or blocked by browser permissions. If Selah is embedded in another site, allow screen capture for it.",
            { cause: e },
          );
        }
        throw new Error(
          "Could not start screen sharing. Check your browser permissions and try again.",
          { cause: e },
        );
      }
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      const message =
        e instanceof ApiError
          ? e.message
          : name === "NotAllowedError" || name === "PermissionDeniedError"
          ? "Screen sharing was cancelled or blocked by browser permissions. If Selah is embedded in another site, allow screen capture for it."
            : name === "NotFoundError"
              ? "No screen is available to share."
              : name === "NotReadableError" || name === "AbortError"
                ? "Your screen could not be shared. Close any other app using screen capture and try again."
                : name === "SecurityError"
                  ? "Screen sharing requires a secure connection. Open the meeting over HTTPS and try again."
                  : e instanceof Error &&
                      e.message.startsWith("Screen sharing could not start")
                    ? e.message
                    : isScreenShareEnabled
                      ? "Could not stop screen sharing. Please try again."
                      : "Could not start screen sharing. Check your browser permissions and try again.";
      setError(message);
    } finally {
      setScreenShareBusy(false);
    }
  }

  const me = join.identity;
  const isHost = snap.host.identity === me;
  const isSpeaker = snap.speakers.some((p) => p.identity === me);
  const inQueue = snap.queue.some((p) => p.identity === me);
  const canSpeak = isHost || isSpeaker;
  const floorFull = snap.speakers.length >= snap.max_speakers;
  const queueHead = snap.queue[0]?.identity;
  const canJoinNow =
    snap.mode === "open" && !floorFull && (!queueHead || queueHead === me);
  const micOn = localParticipant.isMicrophoneEnabled;
  useEffect(() => {
    if (!canSpeak) return undefined;
    function handleMicrophoneShortcut(event) {
      if (
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.repeat ||
        event.key.toLowerCase() !== "b"
      ) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      event.preventDefault();
      localParticipant
        .setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled)
        .catch((e) =>
          setError(
            e instanceof Error ? e.message : "Could not change microphone state.",
          ),
        );
    }
    window.addEventListener("keydown", handleMicrophoneShortcut);
    return () =>
      window.removeEventListener("keydown", handleMicrophoneShortcut);
  }, [canSpeak, localParticipant]);
  const cameraOn = localParticipant.isCameraEnabled;
  const screenShareTrack = tracks.find(
    (track) =>
      track.source === Track.Source.ScreenShare &&
      isTrackReference(track) &&
      !track.publication.isMuted,
  );
  const anotherScreenIsShared = tracks.some(
    (track) =>
      track.source === Track.Source.ScreenShare &&
      track.participant.identity !== me &&
      isTrackReference(track) &&
      !track.publication.isMuted,
  );
  const onStage = [snap.host, ...snap.speakers].filter(
    (person) => person.connected,
  );
  const activeSpeakerCount = onStage.filter(
    (person) => person.identity !== snap.host.identity,
  ).length;
  const showSpeakersTab = activeSpeakerCount > 3;
  const selectedTab =
    tab === "speakers" && !showSpeakersTab ? "people" : tab;
  const activeParticipants = snap.participants.filter(
    (person) => person.connected,
  );
  const activeQueue = snap.queue.filter((person) =>
    activeParticipants.some(
      (participant) => participant.identity === person.identity,
    ),
  );

  // Main view: whoever this viewer picked (if still on the floor), otherwise the host.
  const mainPerson = onStage.find((p) => p.identity === pinnedId) ?? onStage[0];
  const thumbs = onStage.filter((p) => p.identity !== mainPerson?.identity);
  const stageIds = new Set(onStage.map((p) => p.identity));
  const listeners = activeParticipants.filter((p) => !stageIds.has(p.identity));
  const peopleCount = onStage.length + listeners.length;
  const pinnedAnnouncements = snap.announcements.filter(
    (announcement) => announcement.source_question_id === null,
  );
  const sharedMessages = snap.announcements.filter(
    (announcement) => announcement.source_question_id !== null,
  );
  const activeAnnouncementIndex = Math.min(
    announcementIndex,
    pinnedAnnouncements.length - 1,
  );
  function beginAnnouncementSwipe(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target.closest("button, a, input, textarea")) return;
    announcementPointerStart.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  }

  function finishAnnouncementSwipe(event) {
    const start = announcementPointerStart.current;
    announcementPointerStart.current = null;
    if (
      !start ||
      start.id !== event.pointerId ||
      pinnedAnnouncements.length < 2
    ) {
      return;
    }
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 40 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) {
      return;
    }
    setAnnouncementIndex((current) => {
      const index = Math.min(current, pinnedAnnouncements.length - 1);
      return (index + (deltaX < 0 ? 1 : -1) + pinnedAnnouncements.length) %
        pinnedAnnouncements.length;
    });
  }

  const toggle = (fn) => () =>
    fn().catch((e) => setError(String(e.message ?? e)));
  const tileProps = { hostId: snap.host.identity, me, tracks, participants };

  useEffect(() => {
    if (!isHost) return undefined;
    let active = true;
    async function refreshInbox() {
      try {
        const questions = await api.questionInbox(code, join.session);
        if (!active) return;
        const newQuestions = questions.filter(
          (question) =>
            question.status === "pending" &&
            !seenQuestionIds.current.has(question.id),
        );
        const firstLoad = !initialInboxLoaded.current;
        initialInboxLoaded.current = true;
        questions.forEach((question) =>
          seenQuestionIds.current.add(question.id),
        );
        setQuestionInbox(questions);
        if (tab === "comments") {
          setQuestionUnread(0);
        } else if (!firstLoad && newQuestions.length) {
          setQuestionUnread((count) => count + newQuestions.length);
          const now = Date.now();
          if (now - lastQuestionToastAt.current >= 10_000) {
            toast.info(
              `${newQuestions.length} new comments${newQuestions.length === 1 ? "" : "s"}`,
              {
                description: "Open the Comments tab to review them.",
              },
            );
            lastQuestionToastAt.current = now;
          }
        }
      } catch (e) {
        if (active)
          setQuestionError(
            e instanceof Error ? e.message : "Could not load comments.",
          );
      }
    }
    void refreshInbox();
    const timer = window.setInterval(refreshInbox, 8000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [code, isHost, join.session, tab]);

  useEffect(() => {
    if (!askOpen) return undefined;
    let active = true;
    async function refreshMine() {
      try {
        const questions = await api.myQuestions(code, join.session);
        if (active) setMyQuestions(questions);
      } catch (e) {
        if (active)
          setQuestionError(
            e instanceof Error ? e.message : "Could not load your questions.",
          );
      }
    }
    void refreshMine();
    const timer = window.setInterval(refreshMine, 8000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [askOpen, code, join.session]);

  async function submitQuestion(event) {
    event.preventDefault();
    setQuestionBusy(true);
    setQuestionError("");
    setQuestionSent(false);
    try {
      if (editingQuestionId !== null) {
        const question = await api.editMyQuestion(
          code,
          join.session,
          editingQuestionId,
          questionText,
        );
        setMyQuestions((current) =>
          current.map((item) => (item.id === question.id ? question : item)),
        );
        setEditingQuestionId(null);
      } else {
        const question = await api.submitQuestion(code, join.session, {
          text: questionText,
          anonymous: anonymousQuestion,
        });
        setMyQuestions((current) => [...current, question]);
      }
      setQuestionText("");
      setQuestionSent(true);
      setTimeout( () => {
        setAskOpen(false);
      }, 2000);
    } catch (e) {
      setQuestionError(
        e instanceof Error ? e.message : "Could not save your message.",
      );
    } finally {
      setQuestionBusy(false);
    }
  }

  async function deleteMyQuestion(questionId) {
    try {
      await api.deleteMyQuestion(code, join.session, questionId);
      setMyQuestions((current) =>
        current.filter((question) => question.id !== questionId),
      );
      if (editingQuestionId === questionId) {
        setEditingQuestionId(null);
        setQuestionText("");
      }
    } catch (e) {
      setQuestionError(
        e instanceof Error ? e.message : "Could not delete your question.",
      );
    }
  }

  async function moderateQuestion(questionId, action) {
    try {
      const updated = await api.moderateQuestion(
        code,
        join.session,
        questionId,
        action,
      );
      setQuestionInbox((current) =>
        current.map((question) =>
          question.id === questionId ? updated : question,
        ),
      );
    } catch (e) {
      setQuestionError(
        e instanceof Error ? e.message : "Could not update this question.",
      );
    }
  }

  async function blockQuestionSender(questionId) {
    try {
      await api.blockQuestionSender(code, join.session, questionId);
      toast.success("Sender blocked from asking questions");
    } catch (e) {
      setQuestionError(
        e instanceof Error ? e.message : "Could not block this sender.",
      );
    }
  }

  async function publishQuestion(questionId) {
    await act(async () => {
      const next = await api.publishQuestion(code, join.session, questionId);
      setQuestionInbox((current) =>
        current.map((question) =>
          question.id === questionId
            ? { ...question, status: "answered" }
            : question,
        ),
      );
      return next;
    });
  }

  function removeAnnouncement(announcementId) {
    requestConfirmation({
      title: "Remove this announcement?",
      message: "It will no longer be visible to participants.",
      confirmLabel: "Remove announcement",
      onConfirm: () =>
        act(() => api.deleteAnnouncement(code, join.session, announcementId)),
    });
  }

  async function createAnnouncement(event) {
    event.preventDefault();
    setAnnouncementBusy(true);
    try {
      applySnapshot(
        await api.createAnnouncement(code, join.session, announcementText),
      );
      setAnnouncementText("");
      toast.success("Announcement pinned for everyone");
    } catch (e) {
      setQuestionError(
        e instanceof Error ? e.message : "Could not post announcement.",
      );
    } finally {
      setAnnouncementBusy(false);
    }
  }

  async function editAnnouncement(announcementId, text) {
    applySnapshot(
      await api.editAnnouncement(code, join.session, announcementId, text),
    );
  }

  async function exportQuestions() {
    try {
      const file = await api.exportQuestions(code, join.session);
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = `selah-${code}-questions.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setQuestionError(
        e instanceof Error ? e.message : "Could not download questions.",
      );
    }
  }

  const tabBtn = (key, label, count, alert) => (
    <button
      type="button"
      aria-pressed={selectedTab === key}
      onClick={() => setTab(key)}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl  py-2 text-[13px] font-semibold transition motion-reduce:transition-none ${
        selectedTab === key
          ? "bg-[#6495c4] text-[#fff]"
          : "text-slate-400 hover:text-slate-700"
      }`}
    >
      {label} ({count})
      {alert &&
        (key === "comments" ? (
          <span className="rounded-full bg-[#F59E0B] px-1.5 py-0.5 text-[10px] leading-none text-white">
            {questionUnread}
          </span>
        ) : (
          <span
            className="h-2 w-2 rounded-full bg-[#F59E0B]"
            aria-hidden="true"
          />
        ))}
    </button>
  );

  const renderSpeakerSection = () => (
    <section aria-label="On the floor">
      <div className="flex items-center justify-between gap-2 px-1 pb-1.5">
        <h2 className="text-[12px] font-semibold text-slate-400">
          Speakers ({onStage.length})
        </h2>
        {isHost && activeSpeakerCount > 0 && (
          <button
            type="button"
            onClick={() =>
              act(async () => {
                await api.muteAllSpeakers(code, join.session);
                toast.success("All speaker microphones are muted");
              }, "mute-all-speakers")
            }
            disabled={Boolean(busyActions["mute-all-speakers"])}
            aria-busy={Boolean(busyActions["mute-all-speakers"])}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
          >
            {busyActions["mute-all-speakers"] && <InlineSpinner />}
            {busyActions["mute-all-speakers"] ? "Muting…" : "Mute all"}
          </button>
        )}
      </div>
      {onStage.length === 0 ? (
        <p className="px-1 text-[13px] text-slate-400">
          Nobody is on the floor yet.
        </p>
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
                  isHost &&
                  !hostRow && (
                    <SmallBtn
                      label={`Remove ${p.name} from the floor`}
                      onClick={() =>
                        requestConfirmation({
                          title: `Remove ${p.name} from the floor?`,
                          message: `${p.name} will no longer be able to speak unless they rejoin the floor.`,
                          confirmLabel: "Remove from floor",
                          onConfirm: () =>
                            act(() =>
                              api.release(code, join.session, p.identity),
                            ),
                        })
                      }
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
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Live status */}
            <div className="flex h-9 items-center gap-2 rounded-full border border-red-200/70 bg-red-50/80 px-3.5 shadow-sm backdrop-blur-xl">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-50 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>

              <span className="text-[11px] font-semibold tracking-tight text-red-600">
                Live
              </span>
            </div>

            {/* Meeting stats */}
            <div className="flex h-9 items-center overflow-hidden rounded-full border border-slate-200/80 bg-white/80 shadow-sm backdrop-blur-xl">
              {/* Speakers */}
              <div className="flex items-center gap-1.5 px-3">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-3.5 w-3.5 text-slate-400"
                >
                  <path
                    d="M15 19a6 6 0 0 0-12 0M9 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 11a3 3 0 1 0-2.5-4.7M16.5 15.2A5 5 0 0 1 21 19"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>

                <span className="text-[11px] font-medium text-slate-500">
                  Speakers
                </span>

                <span className="text-[11px] font-semibold text-slate-900">
                  {snap.speakers.length}
                  <span className="mx-0.5 text-slate-300">/</span>
                  <span className="text-slate-400">{snap.max_speakers}</span>
                </span>
              </div>

              <div className="h-4 w-px bg-slate-200" />

              {/* Listeners */}
              <div className="flex items-center gap-1.5 px-3">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-3.5 w-3.5 text-slate-400"
                >
                  <path
                    d="M4 14.5a8 8 0 0 1 16 0M7 14.5a5 5 0 0 1 10 0M10 14.5a2 2 0 0 1 4 0M12 18.5v.01"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>

                <span className="text-[11px] font-medium text-slate-500">
                  Listening
                </span>

                <span className="text-[11px] font-semibold text-slate-900">
                  {snap.listeners}
                </span>
              </div>

              {/* Time */}
              {snap.ends_at && (
                <>
                  <div className="h-4 w-px bg-slate-200" />

                  <div className="flex items-center gap-1.5 px-3">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      className="h-3.5 w-3.5 text-slate-400"
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="8.5"
                        stroke="currentColor"
                        strokeWidth="1.7"
                      />
                      <path
                        d="M12 7v5l3 2"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>

                    <span className="text-[11px] font-medium text-slate-500">
                      <MeetingCountdown endsAt={snap.ends_at} />
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Theme */}
            <div className="flex h-9 items-center rounded-full border border-slate-200/80 bg-white/80 p-0.5 shadow-sm backdrop-blur-xl">
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            </div>
          </div>
        </header>

        {isHost && (
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
            <div
              role="group"
              aria-label="Floor mode"
              className="flex rounded-xl bg-slate-100 p-0.5"
            >
              {Object.entries(MODES).map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={snap.mode === key}
                  onClick={() =>
                    act(
                      () => api.updateSettings(code, join.session, { mode: key }),
                      "room-settings",
                    )
                  }
                  disabled={Boolean(busyActions["room-settings"])}
                  className={`rounded-[10px] px-3.5 py-1.5 text-[12px] font-semibold transition motion-reduce:transition-none ${
                    snap.mode === key
                      ? "bg-[#6495c4] text-[#fff] shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
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
                  act(
                    () =>
                      api.updateSettings(code, join.session, {
                        speaker_limit: Number(e.target.value),
                      }),
                    "room-settings",
                  )
                }
                disabled={Boolean(busyActions["room-settings"])}
                className="rounded-lg border border-[#E4E8EE] bg-white px-2 py-1 text-[12px] font-semibold text-slate-800 outline-none focus-visible:outline-2 focus-visible:outline-[#1F8F78]"
              >
                {Array.from({ length: MAX_SPEAKERS }, (_, i) => i + 1).map(
                  (n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="flex items-center gap-2 text-[12px] font-medium text-slate-600">
              <input
                type="checkbox"
                checked={snap.questions_enabled}
                disabled={Boolean(busyActions.questions_enabled)}
                onChange={(e) =>
                  act(
                    () =>
                      api.updateSettings(code, join.session, {
                        questions_enabled: e.target.checked,
                      }),
                    "questions_enabled",
                  )
                }
                className="h-4 w-4 accent-[#6495c4]"
              />
              Questions on
              {busyActions.questions_enabled && (
                <InlineSpinner className="h-3.5 w-3.5 text-[#6495c4]" />
              )}
            </label>
            <label className="flex items-center gap-2 text-[12px] font-medium text-slate-600">
              <input
                type="checkbox"
                checked={snap.anonymous_questions_enabled}
                disabled={Boolean(busyActions.anonymous_questions_enabled)}
                onChange={(e) =>
                  act(
                    () =>
                      api.updateSettings(code, join.session, {
                        anonymous_questions_enabled: e.target.checked,
                      }),
                    "anonymous_questions_enabled",
                  )
                }
                className="h-4 w-4 accent-[#6495c4]"
              />
              Allow anonymous
              {busyActions.anonymous_questions_enabled && (
                <InlineSpinner className="h-3.5 w-3.5 text-[#6495c4]" />
              )}
            </label>
          </div>
        )}

        {pinnedAnnouncements.length > 0 && (
          <section
            aria-label="Pinned announcements"
            className="touch-pan-y select-none"
            onPointerDown={beginAnnouncementSwipe}
            onPointerUp={finishAnnouncementSwipe}
            onPointerCancel={() => {
              announcementPointerStart.current = null;
            }}
          >
            <PinnedAnnouncement
              key={pinnedAnnouncements[activeAnnouncementIndex].id}
              announcement={pinnedAnnouncements[activeAnnouncementIndex]}
              isHost={isHost}
              onRemove={removeAnnouncement}
              onSave={editAnnouncement}
            />
            {pinnedAnnouncements.length > 1 && (
              <div
                className="mt-2 flex items-center justify-center gap-2"
                aria-label="Pinned announcement slides"
              >
                <button
                  type="button"
                  aria-label="Previous pinned announcement"
                  onClick={() =>
                    setAnnouncementIndex(
                      (activeAnnouncementIndex - 1 + pinnedAnnouncements.length) %
                        pinnedAnnouncements.length,
                    )
                  }
                  className="grid h-7 w-7 place-items-center rounded-full bg-white text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
                >
                  ‹
                </button>
                {pinnedAnnouncements.map((announcement, index) => (
                  <button
                    key={announcement.id}
                    type="button"
                    aria-label={`Show pinned announcement ${index + 1}`}
                    aria-current={index === activeAnnouncementIndex}
                    onClick={() => setAnnouncementIndex(index)}
                    className={`h-2 w-2 rounded-full ${
                      index === activeAnnouncementIndex
                        ? "bg-[#37688F]"
                        : "bg-slate-300"
                    }`}
                  />
                ))}
                <button
                  type="button"
                  aria-label="Next pinned announcement"
                  onClick={() =>
                    setAnnouncementIndex(
                      (activeAnnouncementIndex + 1) % pinnedAnnouncements.length,
                    )
                  }
                  className="grid h-7 w-7 place-items-center rounded-full bg-white text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
                >
                  ›
                </button>
              </div>
            )}
          </section>
        )}

        {hostNotice && (
          <p
            role="status"
            aria-live="polite"
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] font-medium text-amber-900"
          >
            {hostNotice}
          </p>
        )}

        {isSpeaker && !micOn && (
          <p
            role="status"
            className="flex items-center gap-2 rounded-xl bg-[#E3F3EE] px-4 py-2.5 text-[13px] font-medium text-[#1F8F78]"
          >
            <Icon name="mic" className="h-4 w-4" />
            You have the floor. Turn on your mic to speak.
          </p>
        )}

        {/* Stage: main view with other speakers stacked over its right edge */}
        <section
          aria-label="On the floor"
          className="relative min-h-[320px] flex-1 overflow-hidden rounded-2xl bg-slate-100 md:min-h-0"
        >
          {screenShareTrack ? (
            <>
              <div className="absolute inset-0 bg-slate-950">
                <VideoTrack
                  trackRef={screenShareTrack}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="absolute left-4 top-4 rounded-lg bg-black/55 px-3 py-1 text-[13px] font-medium text-white backdrop-blur-sm">
                {screenShareTrack.participant.name || "Someone"} is sharing
                their screen
              </div>
            </>
          ) : mainPerson ? (
            <>
              <div className="absolute inset-0">
                <PersonTile
                  key={mainPerson.identity}
                  person={mainPerson}
                  variant="main"
                  {...tileProps}
                />
              </div>
              {thumbs.length > 0 && (
                <div className="absolute bottom-3 right-3 top-3 flex flex-col gap-2 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {thumbs.slice(0, 3).map((p) => (
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
          <div
            className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
            aria-hidden="true"
          >
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
          <div
            role="alert"
            aria-live="assertive"
            className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-[13px] text-red-800 shadow-sm"
          >
            <span
              aria-hidden="true"
              className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-red-100 font-bold text-red-700"
            >
              !
            </span>
            <p className="min-w-0 flex-1 font-medium leading-relaxed">
              {error}
            </p>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-red-700 transition hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-600"
            >
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Controls */}
        <footer className="flex justify-end flex-wrap space-y-3 items-start gap-3">
          <div />
          <div className="flex flex-wrap items-start justify-center gap-3">
            <div className="relative">
              <Control
                label="Send a reaction"
                tone={reactionPickerOpen ? "green" : "glass"}
                onClick={() => setReactionPickerOpen((open) => !open)}
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  ✨
                </span>
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
                <Control
                  label="Join the open floor and turn on mic"
                  tone="green"
                  onClick={joinFloor}
                  busy={floorBusy}
                >
                  <Icon name="mic" />
                </Control>
              ) : inQueue ? (
                <Control
                  label="Lower hand"
                  tone="amber"
                  onClick={lowerHand}
                  busy={floorBusy}
                >
                  <Icon name="hand" />
                </Control>
              ) : (
                <Control
                  label="Raise hand"
                  tone="dark"
                  onClick={raiseHand}
                  busy={floorBusy}
                >
                  <Icon name="hand" />
                </Control>
              ))}

            {canSpeak && (
              <>
                <Control
                  label={micOn ? "Mute mic (Alt+B)" : "Turn on mic (Alt+B)"}
                  tone={micOn ? "glass" : "dark"}
                  onClick={toggle(() =>
                    localParticipant.setMicrophoneEnabled(!micOn),
                  )}
                  shortcut="Alt+B"
                >
                  <Icon name={micOn ? "mic" : "micOff"} />
                </Control>
                <Control
                  label={cameraOn ? "Stop camera" : "Start camera"}
                  tone={cameraOn ? "glass" : "dark"}
                  onClick={toggle(() =>
                    localParticipant.setCameraEnabled(!cameraOn),
                  )}
                >
                  <Icon name={cameraOn ? "video" : "videoOff"} />
                </Control>
              </>
            )}
            {(isSpeaker || isHost) && (
              <Control
                label={
                  anotherScreenIsShared
                    ? "A speaker is already sharing their screen"
                    : isScreenShareEnabled
                      ? "Stop sharing screen"
                      : "Share screen"
                }
                tone={isScreenShareEnabled ? "green" : "dark"}
                onClick={toggleScreenShare}
                disabled={
                  screenShareBusy ||
                  (anotherScreenIsShared && !isScreenShareEnabled)
                }
              >
                <Icon name="screenShare" />
              </Control>
            )}

            {isSpeaker && (
              <Control
                label="Finish speaking"
                onClick={() => act(() => api.release(code, join.session, me))}
              >
                <Icon name="stepDown" />
              </Control>
            )}
          </div>
          <div className="flex items-start justify-end gap-3">
            {!isHost && snap.questions_enabled && (
              <button
                type="button"
                onClick={() => {
                  setQuestionError("");
                  setQuestionSent(false);
                  setAskOpen(true);
                }}
                className="rounded-xl bg-[#6495c4] px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6495c4]"
              >
                Comment
              </button>
            )}
            {!isHost && !snap.questions_enabled && (
              <span className="self-center text-[11px] text-slate-500">
                Questions are closed
              </span>
            )}
            <Control
              label="Leave meeting"
              tone="dark"
              onClick={leaveCall}
              disabled={leaving}
              busy={leaving}
            >
              <Icon name="power" />
            </Control>
            {isHost && (
              <Control
                label="End meeting for everyone"
                tone="red"
                onClick={endMeeting}
                disabled={ending}
                busy={ending}
              >
                <Icon name="phone" style={{ transform: "rotate(135deg)" }} />
              </Control>
            )}
          </div>
        </footer>
      </div>

      {/* ---------------- Right: people + raised hands ---------------- */}
      <aside
        aria-label="Meeting participants"
        className="m-3 flex max-h-[480px] min-h-0 flex-col gap-3 rounded-2xl bg-[#F5F7FA] p-3 md:m-3 md:ml-0 md:max-h-none"
      >
        <div
          role="group"
          aria-label="Panel"
          className="flex flex-wrap rounded-2xl bg-white shadow-sm"
        >
          {tabBtn("people", "People", peopleCount, false)}
          {showSpeakersTab &&
            tabBtn("speakers", "Speakers", activeSpeakerCount, false)}
          {tabBtn(
            "hands",
            "Hands",
            activeQueue.length,
            isHost && activeQueue.length > 0,
          )}
          {isHost &&
            tabBtn(
              "comments",
              "Comments",
              questionInbox.filter((question) => question.status === "pending")
                .length,
              questionUnread > 0,
            )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto tabss">
          {selectedTab === "people" ? (
            <div className="flex flex-col gap-3">
              {sharedMessages.length > 0 && (
                <section
                  aria-label="Messages shared with everyone"
                  className="flex flex-col gap-1.5"
                >
                  <h2 className="px-1 pb-1.5 text-[12px] font-semibold text-slate-400">
                    Shared with everyone ({sharedMessages.length})
                  </h2>
                  {sharedMessages.map((announcement) => (
                    <PinnedAnnouncement
                      key={announcement.id}
                      announcement={announcement}
                      isHost={isHost}
                      onRemove={removeAnnouncement}
                      onSave={editAnnouncement}
                      label="Shared message"
                    />
                  ))}
                </section>
              )}
              {!showSpeakersTab && renderSpeakerSection()}

              <section aria-label="Listening">
                <h2 className="px-1 pb-1.5 text-[12px] font-semibold text-slate-400">
                  Participants ({listeners.length})
                </h2>
                {listeners.length === 0 ? (
                  <p className="px-1 text-[13px] text-slate-400">
                    No other participants yet.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {listeners.map((p) => {
                      const waiting =
                        p.queued ||
                        snap.queue.some((q) => q.identity === p.identity);
                      return (
                        <PersonRow
                          key={p.identity}
                          p={p}
                          me={me}
                          sub={waiting ? "Hand raised" : "Listening"}
                          subClass={
                            waiting ? "text-[#B7791F]" : "text-slate-400"
                          }
                          right={
                            waiting && (
                              <Icon
                                name="hand"
                                className="h-4 w-4 text-[#F59E0B]"
                              />
                            )
                          }
                        />
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          ) : selectedTab === "speakers" && showSpeakersTab ? (
            renderSpeakerSection()
          ) : selectedTab === "hands" ? (
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
                              label={
                                floorFull
                                  ? "The floor is full. Release a speaker first."
                                  : `Give floor to ${p.name}`
                              }
                              disabled={floorFull}
                              onClick={() =>
                                act(() =>
                                  api.grant(code, join.session, p.identity),
                                )
                              }
                              className="bg-[#34C759] text-white"
                            >
                              <Icon name="check" className="h-4 w-4" />
                            </SmallBtn>
                            <SmallBtn
                              label={`Decline ${p.name}`}
                              onClick={() =>
                                requestConfirmation({
                                  title: `Decline ${p.name}'s hand?`,
                                  message: `${p.name} will be removed from the speaking queue.`,
                                  confirmLabel: "Decline hand",
                                  onConfirm: () =>
                                    act(() =>
                                      api.reject(
                                        code,
                                        join.session,
                                        p.identity,
                                      ),
                                    ),
                                })
                              }
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
          ) : (
            <section
              aria-label="Host questions"
              className="flex flex-col gap-3"
            >
              <div className="flex items-center justify-between gap-2 px-1">
                <div>
                  <h2 className="text-[13px] font-semibold text-slate-800">
                    Private host inbox
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Only you can read these. Kept for 7 days after the meeting.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={exportQuestions}
                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Download
                </button>
              </div>

              {questionError && (
                <p
                  role="alert"
                  className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700"
                >
                  {questionError}
                </p>
              )}

              <form
                onSubmit={createAnnouncement}
                className="rounded-xl border border-[#D8E4F0] bg-white p-3"
              >
                <label
                  htmlFor="announcement-text"
                  className="block text-[12px] font-semibold text-slate-700"
                >
                  Pin an announcement for everyone
                </label>
                <textarea
                  id="announcement-text"
                  value={announcementText}
                  onChange={(event) => setAnnouncementText(event.target.value)}
                  maxLength={500}
                  rows={2}
                  className="mt-2 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-[12px] outline-none focus:border-[#6495c4]"
                />
                <button
                  type="submit"
                  disabled={announcementBusy || !announcementText.trim()}
                  className="mt-2 rounded-lg bg-[#6495c4] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                >
                  {announcementBusy ? "Pinning…" : "Pin announcement"}
                </button>
              </form>

              {questionInbox.length === 0 ? (
                <p className="rounded-xl bg-white p-4 text-[12px] text-slate-500">
                  No messages yet.
                </p>
              ) : (
                questionInbox.map((question) => {
                  const isPublic = snap.announcements.some(
                    (announcement) =>
                      announcement.source_question_id === question.id,
                  );
                  return (
<article
  key={question.id}
  className="group relative border-b border-slate-100 py-5 last:border-b-0"
>
  <div className="flex gap-3.5">
    {/* Avatar */}
    <div className="relative flex h-10 w-10 ms-3 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700 ring-1 ring-slate-200/70">
      {question.anonymous
        ? "?"
        : (question.author || "U").charAt(0).toUpperCase()}
    </div>

    {/* Comment content */}
    <div className="min-w-0 flex-1">
      {/* Author and timestamp */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-semibold text-slate-900">
          {question.anonymous ? "Anonymous participant" : question.author}
        </span>

        <span className="text-xs text-slate-400">
          ·
        </span>

        <span className="text-xs text-slate-500">
          {new Date(question.created_at).toLocaleString([], {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>

        {question.status === "pending" && (
          <span className="ml-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-600">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Pending
          </span>
        )}

        {question.status === "answered" && (
          <span className="ml-1 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-100 text-[9px]">
              ✓
            </span>
            Answered
          </span>
        )}

        {question.status === "dismissed" && (
          <span className="ml-1 text-[11px] font-medium text-slate-400">
            Dismissed
          </span>
        )}
      </div>

      {/* Message */}
      <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-6 text-slate-700">
        {question.text}
      </p>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {question.status === "pending" && (
          <>
            <button
              type="button"
              onClick={() =>
                void moderateQuestion(question.id, "answered")
              }
              className="text-xs font-semibold text-slate-600 transition hover:text-emerald-700"
            >
              Mark answered
            </button>

            <button
              type="button"
              onClick={() =>
                requestConfirmation({
                  title: "Dismiss this message?",
                  message:
                    "The sender's message will be marked as dismissed.",
                  confirmLabel: "Dismiss message",
                  onConfirm: () =>
                    moderateQuestion(question.id, "dismissed"),
                })
              }
              className="text-xs font-medium text-slate-400 transition hover:text-slate-700"
            >
              Dismiss
            </button>
          </>
        )}

        {!isPublic && (
          <button
            type="button"
            onClick={() =>
              requestConfirmation({
                title: "Show this private message to everyone?",
                message:
                  "The message and the sender's chosen name (or Anonymous) will be visible to all participants.",
                confirmLabel: "Show to everyone",
                busyLabel: "Publishing…",
                onConfirm: () => publishQuestion(question.id),
              })
            }
            className="text-xs font-semibold text-indigo-600 transition hover:text-indigo-800"
          >
            Publish to discussion
          </button>
        )}

        {isPublic && (
          <button
            type="button"
            onClick={() =>
              void act(() =>
                api.inviteQuestionSender(
                  code,
                  join.session,
                  question.id,
                ),
              )
            }
            className="text-xs font-semibold text-indigo-600 transition hover:text-indigo-800"
          >
            Invite to speak →
          </button>
        )}

        <button
          type="button"
          onClick={() =>
            requestConfirmation({
              title: "Block this sender from commmenting",
              message:
                "They will no longer be able to send comments in this meeting.",
              confirmLabel: "Block sender",
              onConfirm: () => blockQuestionSender(question.id),
            })
          }
          className="ml-auto text-xs text-slate-400 opacity-100 transition hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        >
          Block sender
        </button>
      </div>
    </div>
  </div>
</article>
                  );
                })
              )}
            </section>
          )}
        </div>
      </aside>
      {confirmation && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !confirmationBusy) {
              setConfirmation(null);
            }
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="room-confirmation-title"
            aria-describedby="room-confirmation-message"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !confirmationBusy) {
                setConfirmation(null);
              }
            }}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h2
              id="room-confirmation-title"
              className="text-lg font-semibold text-slate-900"
            >
              {confirmation.title}
            </h2>
            <p
              id="room-confirmation-message"
              className="mt-2 text-sm leading-relaxed text-slate-600"
            >
              {confirmation.message}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => !confirmationBusy && setConfirmation(null)}
                disabled={confirmationBusy}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6495c4]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRequestedAction}
                disabled={confirmationBusy}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
              >
                {confirmationBusy ? (
                  <span className="inline-flex items-center gap-2">
                    <InlineSpinner />
                    {confirmation.busyLabel}
                  </span>
                ) : (
                  confirmation.confirmLabel
                )}
              </button>
            </div>
          </section>
        </div>
      )}
      {askOpen && !isHost && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setAskOpen(false)
          }
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="ask-host-title"
            className="max-h-[90vh] asks w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="ask-host-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Send Message to the Host
                </h2>
                <p className="mt-1 text-[12px] text-slate-500">
                  Only the host can read your messages.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAskOpen(false)}
                aria-label="Close"
                className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100"
              >
                ×
              </button>
            </div>

            <form onSubmit={submitQuestion} className="mt-4">
              <label
                htmlFor="question-text"
                className="block text-[12px] font-semibold text-slate-700"
              >
                Your message
              </label>
              <textarea
                id="question-text"
                value={questionText}
                onChange={(event) => {
                  setQuestionText(event.target.value);
                  setQuestionSent(false);
                }}
                maxLength={500}
                required
                rows={4}
                placeholder="Write a message to the host…"
                className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-[13px] outline-none focus:border-[#6495c4]"
              />
              {editingQuestionId === null && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <fieldset>
                    <legend className="text-[11px] font-semibold text-slate-600">
                      Name
                    </legend>
                    <div className="mt-1 flex gap-2">
                      <label className="flex items-center gap-1.5 text-[12px] text-slate-700">
                        <input
                          type="radio"
                          name="question-anonymity"
                          checked={!anonymousQuestion}
                          onChange={() => setAnonymousQuestion(false)}
                        />
                        With my name
                      </label>
                      <label
                        className={`flex items-center gap-1.5 text-[12px] ${snap.anonymous_questions_enabled ? "text-slate-700" : "text-slate-400"}`}
                      >
                        <input
                          type="radio"
                          name="question-anonymity"
                          checked={anonymousQuestion}
                          disabled={!snap.anonymous_questions_enabled}
                          onChange={() => setAnonymousQuestion(true)}
                        />
                        Anonymous
                      </label>
                    </div>
                  </fieldset>
                </div>
              )}
              {editingQuestionId === null && (
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  Anonymous: the host won’t see your name. Selah keeps a private
                  record only to prevent abuse.
                </p>
              )}
              {questionError && (
                <p
                  role="alert"
                  className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700"
                >
                  {questionError}
                </p>
              )}
              {questionSent && (
                <p
                  role="status"
                  className="mt-3 text-[12px] font-semibold text-[#1F8F78]"
                >
                  {editingQuestionId !== null ? "Saved" : "Sent"}
                </p>
              )}
              <button
                type="submit"
                disabled={questionBusy || !questionText.trim()}
                className="mt-4 w-full rounded-xl bg-[#6495c4] px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {questionBusy
                  ? "Saving…"
                  : editingQuestionId !== null
                    ? "Save changes"
                    : "Send"}
              </button>
              {editingQuestionId !== null && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingQuestionId(null);
                    setQuestionText("");
                    setQuestionError("");
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2 text-[12px] font-semibold text-slate-600"
                >
                  Cancel editing
                </button>
              )}
            </form>

            <section className="mt-6 border-t border-slate-100 pt-4">
              <h3 className="text-[12px] font-semibold text-slate-700">
                Your messages
              </h3>
              {myQuestions.length === 0 ? (
                <p className="mt-2 text-[12px] text-slate-400">
                  Your sent messages will appear here.
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {myQuestions.map((question) => (
                    <li
                      key={question.id}
                      className="flex items-start gap-2 rounded-xl bg-slate-50 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="whitespace-pre-wrap break-words text-[12px] text-slate-700">
                          {question.text}
                        </p>
                        <p className="mt-1 text-[10px] text-slate-400">
                          {question.status} ·{" "}
                          {new Date(question.created_at).toLocaleString()}
                        </p>
                      </div>
                      {question.status === "pending" &&
                        !snap.announcements.some(
                          (announcement) =>
                            announcement.source_question_id === question.id,
                        ) && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingQuestionId(question.id);
                              setQuestionText(question.text);
                              setQuestionError("");
                              setQuestionSent(false);
                            }}
                            aria-label="Edit your message"
                            className="rounded-lg px-2 py-1 text-[11px] font-semibold text-[#37688F] hover:bg-blue-50"
                          >
                            Edit
                          </button>
                        )}
                      <button
                        type="button"
                        onClick={() =>
                          requestConfirmation({
                            title: "Delete this message?",
                            message: "You will not be able to restore it.",
                            confirmLabel: "Delete message",
                            onConfirm: () =>
                              deleteMyQuestion(question.id),
                          })
                        }
                        aria-label="Delete your message"
                        className="rounded-lg px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </section>
        </div>
      )}
    </div>
  );
}
