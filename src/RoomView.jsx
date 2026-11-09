import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  VideoTrack,
  isTrackReference,
  useIsSpeaking,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import Selah from "./assets/selah.webp";
import { api } from "./api";
import { Avatar } from "./avatar";
import { avatarBg, avatarFromIdentity } from "./avatarData";
import { MAX_SPEAKERS, MODES, REACTIONS } from "./roomConstants";

// Design tokens: page #F2F2F7, glass white, brand #6495c4, green #34C759, amber #FF9F0A, red #FF3B30.
// (Class strings are written out in full so Tailwind can see them.)
const GLASS = "bg-white/75 backdrop-blur-xl ring-1 ring-black/5 shadow-[0_2px_12px_rgba(0,0,0,0.08)]";
const SHEET = "bg-white/90 backdrop-blur-2xl ring-1 ring-black/5 shadow-[0_20px_60px_rgba(0,0,0,0.22)]";
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6495c4]";
const FIELD = "w-full resize-y rounded-2xl bg-black/[0.05] px-3.5 py-2.5 text-[14px] text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-[#6495c4]/40";
const HAIRLINE = "relative after:absolute after:bottom-0 after:left-[3.25rem] after:right-0 after:h-px after:bg-black/[0.06] last:after:hidden";

// ---- Icons ------------------------------------------------------------------
const ICONS = {
  mic: (<><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></>),
  micOff: (<><line x1="2" x2="22" y1="2" y2="22" /><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" /><path d="M5 10v2a7 7 0 0 0 12 5" /><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12" /><line x1="12" x2="12" y1="19" y2="22" /></>),
  video: (<><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" /><rect x="2" y="6" width="14" height="12" rx="2" /></>),
  videoOff: (<><path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196" /><path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" /><path d="m2 2 20 20" /></>),
  screenShare: (<><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4m-3-9 3-3 3 3m-3-3v6" /></>),
  hand: (<><path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" /><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" /><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></>),
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />,
  power: (<><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></>),
  check: <path d="M20 6 9 17l-5-5" />,
  x: (<><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></>),
  close: <path d="M18 6 6 18M6 6l12 12" />,
  stepDown: (<><circle cx="12" cy="12" r="10" /><path d="M12 8v8" /><path d="m8 12 4 4 4-4" /></>),
  userMinus: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="22" x2="16" y1="11" y2="11" /></>),
  users: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  pencil: <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />,
  sliders: <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
  message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
};

export function Icon({ name, className = "h-[18px] w-[18px]", style }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

// ---- Primitives (swap for Watermelon / shadcn Button, Tabs, Switch, Dialog) --
const cn = (...c) => c.filter(Boolean).join(" ");

const BTN = {
  primary: "bg-[#6495c4] text-white hover:bg-[#5486b5]",
  dark: "bg-slate-900 text-white hover:bg-slate-700",
  soft: "bg-black/[0.06] text-slate-800 hover:bg-black/10",
  outline: "bg-white text-slate-800 ring-1 ring-black/10 hover:bg-slate-50",
  danger: "bg-[#FF3B30] text-white hover:bg-[#e8352b]",
};

function Btn({ variant = "soft", className, ...p }) {
  return <button type="button" className={cn("inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-[14px] font-semibold tracking-tight transition active:scale-[0.97] disabled:opacity-50 motion-reduce:transition-none", BTN[variant], FOCUS, className)} {...p} />;
}

function Spinner({ className = "h-4 w-4" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(className, "animate-spin motion-reduce:animate-none")} fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function IconBtn({ label, className, children, ...p }) {
  return <button type="button" aria-label={label} title={label} className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-500 transition hover:bg-black/[0.06] active:scale-90 disabled:opacity-40 motion-reduce:transition-none", FOCUS, className)} {...p}>{children}</button>;
}

const DOCK = {
  glass: "bg-black/[0.07] text-slate-900 hover:bg-black/10",
  dark: "bg-slate-900 text-white hover:bg-slate-700",
  green: "bg-[#34C759] text-white hover:bg-[#2fb552]",
  amber: "bg-[#FF9F0A] text-white hover:bg-[#e68f09]",
  red: "bg-[#FF3B30] text-white hover:bg-[#e8352b]",
};

function DockBtn({ label, tone = "glass", busy, disabled, shortcut, children, ...p }) {
  return (
    <button type="button" aria-label={busy ? `${label}, in progress` : label} title={label} aria-keyshortcuts={shortcut} aria-busy={busy} disabled={disabled || busy}
      className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-full transition active:scale-90 disabled:opacity-50 motion-reduce:transition-none", DOCK[tone], FOCUS)} {...p}>
      {busy ? <Spinner /> : children}
    </button>
  );
}

// iOS switch: 51 x 31 with a 27px knob.
function Switch({ checked, onChange, disabled, label, busy }) {
  return (
    <label className="flex items-center justify-between gap-3 py-2.5 text-[14px] text-slate-800">
      <span className="flex items-center gap-2">{label}{busy && <Spinner className="h-3.5 w-3.5 text-[#6495c4]" />}</span>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cn("relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50 motion-reduce:transition-none", checked ? "bg-[#34C759]" : "bg-slate-300", FOCUS)}>
        <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 34 }} className={cn("absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,0.25)]", checked ? "right-[2px]" : "left-[2px]")} />
      </button>
    </label>
  );
}

// Segmented control with a sliding pill.
function Seg({ id, value, onChange, items, className }) {
  return (
    <div role="tablist" className={cn("flex rounded-full bg-black/[0.06] p-[3px]", className)}>
      {items.map(({ key, label, badge }) => (
        <button key={key} type="button" role="tab" aria-selected={value === key} onClick={() => onChange(key)}
          className={cn("relative flex-1 rounded-full px-2.5 py-1.5 text-[12.5px] font-semibold tracking-tight", FOCUS)}>
          {value === key && <motion.span layoutId={id} transition={{ type: "spring", stiffness: 420, damping: 34 }} className="absolute inset-0 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.12)]" />}
          <span className={cn("relative inline-flex items-center justify-center gap-1.5", value === key ? "text-slate-900" : "text-slate-500")}>{label}{badge}</span>
        </button>
      ))}
    </div>
  );
}

const Count = ({ n, alert }) => (
  <span className={cn("min-w-[18px] rounded-full px-1.5 py-px text-center text-[10px] font-bold leading-4", alert ? "bg-[#FF3B30] text-white" : "bg-black/[0.08] text-slate-500")}>{n}</span>
);

// Bottom sheet on phones, centred card on larger screens.
function Modal({ onClose, titleId, children }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <motion.section role="dialog" aria-modal="true" aria-labelledby={titleId}
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[32px] bg-white px-6 pb-8 pt-3 shadow-2xl sm:rounded-[32px] sm:pt-6">
        <span aria-hidden="true" className="mx-auto mb-4 block h-1 w-9 rounded-full bg-slate-300 sm:hidden" />
        {children}
      </motion.section>
    </motion.div>
  );
}

// ---- People & tiles ---------------------------------------------------------
function PersonAvatar({ p, className = "h-10 w-10" }) {
  const code = p.avatar || avatarFromIdentity(p.identity);
  return <span className={cn(className, "shrink-0 overflow-hidden rounded-full")} style={{ background: avatarBg(code) }}><Avatar code={code} className="h-full w-full" /></span>;
}

function TileFrame({ person, variant, isHost, isMe, muted, speaking, video, onToggleMic }) {
  const main = variant === "main";
  const name = `${person.name}${isMe ? " (you)" : ""}`;
  return (
    <div className={cn("relative h-full w-full overflow-hidden", speaking && (main ? "ring-[3px] ring-inset ring-[#34C759]" : "ring-2 ring-inset ring-[#34C759]"), main ? "rounded-none" : "rounded-2xl")}
      style={{ background: avatarBg(person.avatar || avatarFromIdentity(person.identity)) }}>
      {video ?? (
        <div className="grid h-full w-full place-items-center">
          <PersonAvatar p={person} className={main ? "h-32 w-32 sm:h-44 sm:w-44" : "h-9 w-9"} />
        </div>
      )}
      {main ? (
        <div className="absolute left-4 top-[132px] flex items-center gap-2 md:top-[72px]">
          {isMe && onToggleMic ? (
            <button type="button" aria-label={muted ? "Turn on your microphone" : "Mute your microphone"} title={muted ? "Turn on your microphone" : "Mute your microphone"}
              onClick={onToggleMic} className="flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-[13px] font-semibold text-white ring-1 ring-white/20 backdrop-blur-xl hover:bg-black/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              {muted && <Icon name="micOff" className="h-3.5 w-3.5 text-red-300" />}{name}
            </button>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1.5 text-[13px] font-semibold text-white ring-1 ring-white/15 backdrop-blur-xl">
              {muted && <Icon name="micOff" className="h-3.5 w-3.5 text-red-300" />}{name}
            </span>
          )}
          {isHost && <span className="rounded-full bg-[#6495c4] px-2.5 py-1.5 text-[12px] font-semibold text-white">Host</span>}
        </div>
      ) : (
        <>
          <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 pb-1 pt-4 text-[10px] font-semibold text-white">{isMe ? "You" : person.name}</span>
          {muted && <span className="absolute right-1 top-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-[#FF3B30] text-white"><Icon name="micOff" className="h-2.5 w-2.5" /></span>}
        </>
      )}
    </div>
  );
}

// useIsSpeaking throws without a real participant, so only use it once they are connected.
function LiveTile({ participant, ...rest }) {
  return <TileFrame {...rest} speaking={useIsSpeaking(participant)} />;
}

function PersonTile({ person, variant, hostId, me, tracks, participants, onToggleMic }) {
  const cam = tracks.find((t) => t.source === Track.Source.Camera && t.participant.identity === person.identity);
  const mic = tracks.find((t) => t.source === Track.Source.Microphone && t.participant.identity === person.identity);
  const participant = participants.find((x) => x.identity === person.identity);
  const hasVideo = cam && isTrackReference(cam) && !cam.publication.isMuted;
  const props = {
    person, variant, isHost: person.identity === hostId, isMe: person.identity === me,
    onToggleMic: person.identity === me ? onToggleMic : undefined,
    muted: !(mic && isTrackReference(mic) && !mic.publication.isMuted),
    video: hasVideo ? <VideoTrack trackRef={cam} className="h-full w-full object-cover" /> : null,
  };
  return participant ? <LiveTile participant={participant} {...props} /> : <TileFrame speaking={false} {...props} />;
}

function StatusText({ muted, speaking, isHostRow }) {
  return (
    <>
      {isHostRow && <><span className="text-[#6495c4]">Host</span><span className="text-slate-300"> · </span></>}
      {muted ? <span className="text-slate-400">Muted</span> : speaking ? <span className="text-[#22A55B]">Speaking</span> : <span className="text-slate-500">Mic on</span>}
    </>
  );
}
function LiveMicStatus({ participant, ...rest }) {
  return <StatusText {...rest} speaking={useIsSpeaking(participant)} />;
}
function MicStatus({ person, isHostRow, tracks, participants }) {
  const mic = tracks.find((t) => t.source === Track.Source.Microphone && t.participant.identity === person.identity);
  const participant = participants.find((x) => x.identity === person.identity);
  const muted = !(mic && isTrackReference(mic) && !mic.publication.isMuted);
  return participant ? <LiveMicStatus participant={participant} muted={muted} isHostRow={isHostRow} /> : <StatusText muted={muted} speaking={false} isHostRow={isHostRow} />;
}

function PersonRow({ p, sub, subClass = "text-slate-400", me, right, onNameClick }) {
  return (
    <li className={cn("flex items-center gap-3 py-2.5", HAIRLINE)}>
      <PersonAvatar p={p} />
      <span className="min-w-0 flex-1">
        {onNameClick ? (
          <button type="button" aria-label="Toggle your microphone" onClick={onNameClick} className="block max-w-full truncate text-left text-[15px] font-semibold tracking-tight text-slate-900 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6495c4]">
            {p.name}{p.identity === me && " (you)"}
          </button>
        ) : (
          <span className="block truncate text-[15px] font-semibold tracking-tight text-slate-900">{p.name}{p.identity === me && " (you)"}</span>
        )}
        <span className={cn("block text-[12.5px]", subClass)}>{sub}</span>
      </span>
      {right}
    </li>
  );
}

function SectionTitle({ children, right }) {
  return <div className="flex items-center justify-between pb-1 pt-1"><h2 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-slate-400">{children}</h2>{right}</div>;
}

// ---- Announcements ----------------------------------------------------------
function Linkify({ text }) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//i.test(part) ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{part}</a> : part,
  );
}

function Announcement({ a, isHost, onRemove, onSave, label, onCollapse }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(a.text);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const long = a.text.length > 160;
  const author = a.author || "Participant";

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try { await onSave(a.id, text); setEditing(false); }
    catch (x) { setErr(x instanceof Error ? x.message : "Could not edit announcement."); }
    finally { setBusy(false); }
  }

  return (
    <article className={cn("flex gap-3 rounded-[22px] p-3.5", SHEET)}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#6495c4] text-[13px] font-bold text-white">{author[0].toUpperCase()}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs">
          <b className="font-semibold text-slate-900">{author}</b>
          <span className="rounded-full bg-black/[0.06] px-2 py-px text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
          <span className="ml-auto flex items-center">
            {onCollapse && !editing && (
              <button type="button" aria-label="Collapse pinned announcement" onClick={onCollapse}
                className="rounded-full px-2 py-1 text-[11px] font-semibold text-[#37688F] hover:bg-black/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6495c4]">
                Collapse
              </button>
            )}
            {isHost && !editing && (
              <IconBtn label="Edit" className="h-7 w-7" onClick={() => { setText(a.text); setEditing(true); setErr(""); }}><Icon name="pencil" className="h-3.5 w-3.5" /></IconBtn>
            )}
            {isHost && !editing && (
              <IconBtn label="Remove announcement" className="h-7 w-7 hover:bg-red-50 hover:text-[#FF3B30]" onClick={() => onRemove(a.id)}><Icon name="close" className="h-3.5 w-3.5" /></IconBtn>
            )}
          </span>
        </div>
        {editing ? (
          <form onSubmit={save} className="mt-2">
            <textarea aria-label="Edit shared message" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={3} className={FIELD} />
            {err && <p role="alert" className="mt-1 text-xs text-[#FF3B30]">{err}</p>}
            <div className="mt-2 flex gap-2">
              <Btn variant="primary" type="submit" disabled={busy || !text.trim()} className="px-4 py-1.5 text-[13px]">{busy ? "Saving…" : "Save"}</Btn>
              <Btn variant="soft" onClick={() => { setEditing(false); setText(a.text); }} className="px-4 py-1.5 text-[13px]">Cancel</Btn>
            </div>
          </form>
        ) : (
          <>
            <p id={label === "pinned" ? `pinned-announcement-${a.id}` : undefined} className={cn("mt-1 whitespace-pre-wrap break-words text-[14px] leading-[1.4] text-slate-700", long && !open && "line-clamp-2")}><Linkify text={a.text} /></p>
            {long && <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="mt-1 text-xs font-semibold text-[#37688F]">{open ? "Show less" : "Read more"}</button>}
          </>
        )}
      </div>
    </article>
  );
}

function MeetingCountdown({ endsAt }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const deadline = new Date(endsAt).getTime();
  if (!endsAt || !Number.isFinite(deadline)) return null;
  const s = Math.max(0, Math.ceil((deadline - now) / 1000));
  const p = (n) => String(n).padStart(2, "0");
  return (
    <span role="timer" aria-label={`Meeting time remaining: ${p(Math.floor(s / 3600))} hours, ${p(Math.floor((s % 3600) / 60))} minutes, ${p(s % 60)} seconds`}
      className={cn("text-[12px] font-bold tabular-nums", s <= 600 ? "animate-pulse text-[#FF3B30] motion-reduce:animate-none" : "text-slate-700")}>
      {p(Math.floor(s / 3600))}:{p(Math.floor((s % 3600) / 60))}:{p(s % 60)}
    </span>
  );
}

// ---- The room ---------------------------------------------------------------
export default function RoomView({ v } = {}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() => (typeof window === "undefined" ? true : window.innerWidth >= 768));
  const [controlsExpanded, setControlsExpanded] = useState(true);
  const [pinnedAnnouncementsCollapsed, setPinnedAnnouncementsCollapsed] = useState(false);

  if (!v || !v.snap) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#F2F2F7] px-4 text-slate-700" role="status" aria-live="polite">
        <div className="flex items-center gap-3 rounded-full bg-white px-6 py-4 shadow-[0_8px_30px_rgba(0,0,0,0.08)] ring-1 ring-black/5">
          <Spinner className="h-5 w-5 text-[#6495c4]" />
          <span className="text-[15px] font-semibold tracking-tight">Preparing your room…</span>
        </div>
      </main>
    );
  }

  const {
    code, join, snap, me, isHost, isSpeaker, canSpeak, inQueue, canJoinNow, floorFull, micOn, cameraOn,
    isScreenShareEnabled, anotherScreenIsShared, screenShareTrack, mainPerson, thumbs, onStage, listeners, activeQueue, peopleCount,
    activeSpeakerCount, showSpeakersTab, selectedTab, setTab, pinnedAnnouncements, sharedMessages, activeAnnouncementIndex,
    setAnnouncementIndex, beginAnnouncementSwipe, finishAnnouncementSwipe, announcementPointerStart, tracks, participants, setPinnedId,
    reactions, reactionPickerOpen, setReactionPickerOpen, react, act, busyActions, floorBusy, joinFloor, raiseHand, lowerHand, toggle,
    localParticipant, toggleScreenShare, screenShareBusy, leaveCall, leaving, endMeeting, ending, requestConfirmation, hostNotice,
    error, setError, questionInbox, questionUnread, questionError, setQuestionError, exportQuestions, moderateQuestion,
    publishQuestion, blockQuestionSender, announcementText, setAnnouncementText, announcementBusy, createAnnouncement,
    removeAnnouncement, editAnnouncement, askOpen, setAskOpen, questionText, setQuestionText, questionSent, setQuestionSent,
    editingQuestionId, setEditingQuestionId, anonymousQuestion, setAnonymousQuestion, questionBusy, submitQuestion, myQuestions,
    deleteMyQuestion, confirmation, setConfirmation, confirmationBusy, confirmRequestedAction,
  } = v;

  const toggleOwnMic = canSpeak
    ? toggle(() => localParticipant.setMicrophoneEnabled(!micOn))
    : undefined;
  const tile = { hostId: snap.host.identity, me, tracks, participants, onToggleMic: toggleOwnMic };
  const pendingCount = questionInbox.filter((q) => q.status === "pending").length;
  const activeAnn = pinnedAnnouncements[activeAnnouncementIndex];
  const roomBusy = Boolean(busyActions["room-settings"]);
  const settings = (patch, key = "room-settings") => act(() => api.updateSettings(code, join.session, patch), key);
  const panelAlert = isHost && activeQueue.length + pendingCount > 0;
  const activeTab = selectedTab === "pinned" && pinnedAnnouncements.length === 0 ? "people" : selectedTab;

  const speakerSection = (
    <section aria-label="On the floor">
      <SectionTitle right={isHost && activeSpeakerCount > 0 && (
        <Btn variant="soft" className="bg-red-50 px-3 py-1 text-[11px] text-[#D70015] hover:bg-red-100" disabled={Boolean(busyActions["mute-all-speakers"])}
          onClick={() => act(async () => { await api.muteAllSpeakers(code, join.session); }, "mute-all-speakers")}>
          {busyActions["mute-all-speakers"] && <Spinner className="h-3 w-3" />}Mute all
        </Btn>)}>
        Speakers ({onStage.length})
      </SectionTitle>
      {onStage.length === 0 ? <p className="py-2 text-[14px] text-slate-400">Nobody is on the floor yet.</p> : (
        <ul>
          {onStage.map((p) => {
            const hostRow = p.identity === snap.host.identity;
            return (
              <PersonRow key={p.identity} p={p} me={me} subClass=""
                sub={<MicStatus person={p} isHostRow={hostRow} tracks={tracks} participants={participants} />}
                onNameClick={p.identity === me ? toggleOwnMic : undefined}
                right={isHost && !hostRow && (
                  <IconBtn label={`Remove ${p.name} from the floor`} className="h-9 w-9 bg-red-50 text-[#FF3B30] hover:bg-red-100"
                    onClick={() => requestConfirmation({
                      title: `Remove ${p.name} from the floor?`, message: `${p.name} will no longer be able to speak unless they rejoin the floor.`,
                      confirmLabel: "Remove from floor", onConfirm: () => act(() => api.release(code, join.session, p.identity)),
                    })}><Icon name="userMinus" className="h-4 w-4" /></IconBtn>)} />
            );
          })}
        </ul>
      )}
    </section>
  );

  const tabs = [
    { key: "people", label: "People", badge: <Count n={peopleCount} /> },
    ...(pinnedAnnouncements.length > 0 ? [{ key: "pinned", label: "Pinned", badge: <Count n={pinnedAnnouncements.length} /> }] : []),
    ...(showSpeakersTab ? [{ key: "speakers", label: "Speakers", badge: <Count n={activeSpeakerCount} /> }] : []),
    { key: "hands", label: "Hands", badge: <Count n={activeQueue.length} alert={isHost && activeQueue.length > 0} /> },
    ...(isHost ? [{ key: "comments", label: "Inbox", badge: <Count n={pendingCount} alert={questionUnread > 0} /> }] : []),
  ];

  return (
    <div className="h-dvh bg-[#F2F2F7] p-2 sm:p-3">
      {/* The frame: a full-bleed stage with everything floating on top */}
      <div className="relative h-full w-full overflow-hidden rounded-[32px] bg-slate-200 shadow-[0_10px_40px_rgba(0,0,0,0.1)] ring-1 ring-black/5">
        {/* ---- Stage layer (leaves room for the panel on wide screens) ---- */}
        <div className={cn("absolute inset-0 transition-[padding] duration-300 motion-reduce:transition-none", panelOpen && "md:pr-[396px]")}>
          <div className="relative h-full w-full">
            {screenShareTrack ? (
              <>
                <div className="absolute inset-0 bg-slate-950"><VideoTrack trackRef={screenShareTrack} className="h-full w-full object-contain" /></div>
                <div className="absolute left-4 top-[72px] rounded-full bg-black/35 px-3 py-1.5 text-[13px] font-semibold text-white ring-1 ring-white/15 backdrop-blur-xl">{screenShareTrack.participant.name || "Someone"} is sharing their screen</div>
              </>
            ) : mainPerson ? (
              <div className="absolute inset-0"><PersonTile key={mainPerson.identity} person={mainPerson} variant="main" {...tile} /></div>
            ) : (
              <div className="grid h-full place-items-center p-6 text-center">
                <div>
                  <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/70 text-slate-400 ring-1 ring-black/5"><Icon name="mic" className="h-7 w-7" /></span>
                  <p className="mt-4 text-[15px] font-medium text-slate-500">Nobody is on the floor yet.</p>
                </div>
              </div>
            )}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-40 bg-gradient-to-t from-black/25 to-transparent" aria-hidden="true" />

            {/* Thumbnail rail */}
            {thumbs.length > 0 && !screenShareTrack && (
              <div className={cn("absolute left-4 z-10 flex w-28 flex-col gap-2", activeAnn ? "top-[200px] md:top-[120px]" : "top-[120px]", "max-md:bottom-[6.5rem] max-md:top-auto")}>
                {thumbs.slice(0, 4).map((p) => (
                  <button key={p.identity} type="button" aria-label={`Show ${p.name} in the main view`} title={`Show ${p.name} in the main view`} onClick={() => setPinnedId(p.identity)}
                    className={cn("h-[72px] w-28 shrink-0 rounded-2xl p-0 shadow-[0_4px_14px_rgba(0,0,0,0.25)] ring-2 ring-white/70 transition hover:scale-[1.05] active:scale-95 motion-reduce:transition-none", FOCUS)}>
                    <PersonTile person={p} variant="thumb" {...tile} />
                  </button>
                ))}
              </div>
            )}

            {/* Notices, announcements and errors */}
            <div className="pointer-events-none absolute left-1/2 top-[116px] z-30 flex w-[min(34rem,calc(100%-2rem))] -translate-x-1/2 flex-col gap-2 md:top-[72px] [&>*]:pointer-events-auto">
              <AnimatePresence>
                {error && (
                  <motion.div key="error" role="alert" aria-live="assertive" initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }}
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    className="flex items-start gap-3 rounded-[22px] bg-white/90 px-4 py-3 text-[14px] text-[#B3261E] shadow-[0_12px_40px_rgba(0,0,0,0.2)] ring-1 ring-black/5 backdrop-blur-2xl">
                    <p className="min-w-0 flex-1 font-medium leading-snug">{error}</p>
                    <IconBtn label="Dismiss error" className="h-6 w-6 text-[#B3261E]" onClick={() => setError("")}><Icon name="close" className="h-4 w-4" /></IconBtn>
                  </motion.div>
                )}
              </AnimatePresence>
              {hostNotice && <p role="status" aria-live="polite" className="rounded-[20px] bg-[#FFF4E0]/95 px-4 py-3 text-[14px] font-medium text-[#8A5300] shadow-[0_8px_30px_rgba(0,0,0,0.12)] ring-1 ring-[#FF9F0A]/25 backdrop-blur-xl">{hostNotice}</p>}
              {activeAnn && (
                <section aria-label="Pinned announcements" className="touch-pan-y select-none" onPointerDown={beginAnnouncementSwipe} onPointerUp={finishAnnouncementSwipe} onPointerCancel={() => { announcementPointerStart.current = null; }}>
                  <AnimatePresence initial={false} mode="wait">
                    {!pinnedAnnouncementsCollapsed && (
                      <motion.div key={activeAnn.id} initial={{ opacity: 0, height: 0, y: -8 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={{ opacity: 0, height: 0, y: -8 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                        <Announcement a={activeAnn} isHost={isHost} onRemove={removeAnnouncement} onSave={editAnnouncement} label="pinned" onCollapse={() => setPinnedAnnouncementsCollapsed(true)} />
                        {pinnedAnnouncements.length > 1 && (
                          <div className="mt-2 flex items-center justify-center gap-1.5" aria-label="Pinned announcement slides">
                            {pinnedAnnouncements.map((a, i) => (
                              <button key={a.id} type="button" aria-label={`Show pinned announcement ${i + 1}`} aria-current={i === activeAnnouncementIndex} onClick={() => setAnnouncementIndex(i)}
                                className={cn("h-1.5 rounded-full transition-all", i === activeAnnouncementIndex ? "w-5 bg-white" : "w-1.5 bg-white/50")} />
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
              )}
            </div>

            {/* Floating reactions */}
            <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
              {reactions.map((r) => (
                <span key={r.id} className="room-reaction-float absolute bottom-28 flex flex-col items-center gap-1" style={{ left: `${r.left}%` }}>
                  <span className="text-3xl leading-none drop-shadow-[0_2px_8px_rgba(15,23,42,0.4)]">{r.emoji}</span>
                  <span className="max-w-28 truncate text-xs font-semibold text-white drop-shadow-[0_1px_4px_rgba(15,23,42,0.9)]">{r.senderName}</span>
                </span>
              ))}
            </div>

            {/* Control dock */}
            <div className="absolute inset-x-3 bottom-4 z-30 flex justify-center">
              <div className="flex max-w-full flex-col items-center">
                {(isHost || isSpeaker) && (
                  <button type="button" aria-expanded={controlsExpanded} aria-controls="room-controls"
                    onClick={() => setControlsExpanded((expanded) => !expanded)}
                    className={cn("mb-2 flex items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-semibold text-slate-800 md:hidden", SHEET, FOCUS)}>
                    {controlsExpanded ? "Hide controls" : "Show controls"}
                    <svg aria-hidden="true" viewBox="0 0 16 16" className={cn("h-3.5 w-3.5 transition-transform", controlsExpanded && "rotate-180")} fill="none">
                      <path d="m3.5 6 4.5 4 4.5-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              <div id="room-controls" className={cn("flex max-w-full flex-wrap items-center justify-center gap-2 rounded-[32px] p-2", SHEET, (isHost || isSpeaker) && !controlsExpanded && "hidden md:flex")}>
                <div className="relative">
                  <DockBtn label="Send a reaction" tone={reactionPickerOpen ? "green" : "glass"} onClick={() => setReactionPickerOpen((o) => !o)}><span aria-hidden="true" className="text-xl leading-none">✨</span></DockBtn>
                  <AnimatePresence>
                    {reactionPickerOpen && (
                      <motion.div role="group" aria-label="Choose a reaction" initial={{ opacity: 0, y: 10, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.92 }}
                        transition={{ type: "spring", stiffness: 460, damping: 30 }}
                        className={cn("absolute bottom-full left-0 mb-3 flex gap-0.5 rounded-full p-1.5", SHEET)}>
                        {REACTIONS.map((emoji) => (
                          <button key={emoji} type="button" aria-label={`React ${emoji}`} onClick={() => react(emoji)} className={cn("grid h-10 w-10 place-items-center rounded-full text-2xl transition hover:-translate-y-1 hover:scale-110 active:scale-95 motion-reduce:transition-none", FOCUS)}>{emoji}</button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {!canSpeak && (canJoinNow
                  ? <DockBtn label="Join the open floor and turn on mic" tone="green" onClick={joinFloor} busy={floorBusy}><Icon name="mic" /></DockBtn>
                  : inQueue
                    ? <DockBtn label="Lower hand" tone="amber" onClick={lowerHand} busy={floorBusy}><Icon name="hand" /></DockBtn>
                    : <DockBtn label="Raise hand" tone="dark" onClick={raiseHand} busy={floorBusy}><Icon name="hand" /></DockBtn>)}

                {canSpeak && (
                  <>
                    <DockBtn label={micOn ? "Mute mic (Alt+B)" : "Turn on mic (Alt+B)"} tone={micOn ? "glass" : "dark"} shortcut="Alt+B" onClick={toggle(() => localParticipant.setMicrophoneEnabled(!micOn))}><Icon name={micOn ? "mic" : "micOff"} /></DockBtn>
                    <DockBtn label={cameraOn ? "Stop camera" : "Start camera"} tone={cameraOn ? "glass" : "dark"} onClick={toggle(() => localParticipant.setCameraEnabled(!cameraOn))}><Icon name={cameraOn ? "video" : "videoOff"} /></DockBtn>
                  </>
                )}
                {(isSpeaker || isHost) && (
                  <DockBtn label={anotherScreenIsShared ? "A speaker is already sharing their screen" : isScreenShareEnabled ? "Stop sharing screen" : "Share screen"} tone={isScreenShareEnabled ? "green" : "glass"}
                    onClick={toggleScreenShare} disabled={screenShareBusy || (anotherScreenIsShared && !isScreenShareEnabled)}><Icon name="screenShare" /></DockBtn>
                )}
                {isSpeaker && <DockBtn label="Finish speaking" onClick={() => act(() => api.release(code, join.session, me))}><Icon name="stepDown" /></DockBtn>}
                {!isHost && snap.questions_enabled && (
                  <DockBtn label="Send a comment to the host" onClick={() => { setQuestionError(""); setQuestionSent(false); setAskOpen(true); }}><Icon name="message" /></DockBtn>
                )}

                <span className="mx-0.5 h-7 w-px bg-black/10" aria-hidden="true" />
                <DockBtn label="Leave meeting" tone={isHost ? "dark" : "red"} onClick={leaveCall} disabled={leaving} busy={leaving}><Icon name="power" /></DockBtn>
                {isHost && <DockBtn label="End meeting for everyone" tone="red" onClick={endMeeting} disabled={ending} busy={ending}><Icon name="phone" style={{ transform: "rotate(135deg)" }} /></DockBtn>}
              </div>
              </div>
            </div>
            {!isHost && !snap.questions_enabled && (
              <p className="pointer-events-none absolute inset-x-0 bottom-[6.5rem] z-20 text-center max-md:hidden"><span className="rounded-full bg-black/35 px-3 py-1 text-[12px] font-medium text-white backdrop-blur-xl">Questions are closed</span></p>
            )}
          </div>
        </div>

        {/* ---- Header overlay ---- */}
        <header className="pointer-events-none absolute inset-x-3 top-3 z-40 flex flex-wrap items-center gap-2 [&>*]:pointer-events-auto">
          <span className={cn("flex items-center rounded-full px-3.5 py-1.5", GLASS)}><img src={Selah} alt="Selah" className="w-16" /></span>
          <span className={cn("rounded-full px-3 py-2 text-[12px] font-semibold text-[#37688F]", GLASS)}>{MODES[snap.mode]}</span>
          <span className="flex items-center gap-1.5 rounded-full bg-[#FF3B30] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-white shadow-[0_2px_12px_rgba(255,59,48,0.35)]">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60 motion-reduce:animate-none" /><span className="relative inline-flex h-2 w-2 rounded-full bg-white" /></span>Live
          </span>

          <div className="ml-auto flex items-center gap-2">
            <span className={cn("flex items-center gap-3 rounded-full px-4 py-2 text-[12px] text-slate-500", GLASS)}>
              <span><b className="text-slate-900">{snap.speakers.length}/{snap.max_speakers}</b> speaking</span>
              <span className="hidden sm:inline"><b className="text-slate-900">{snap.listeners}</b> listening</span>
              {snap.ends_at && <MeetingCountdown endsAt={snap.ends_at} />}
            </span>

            {isHost && (
              <div className="relative">
                <button type="button" aria-label="Room settings" title="Room settings" onClick={() => setSettingsOpen((o) => !o)}
                  className={cn("grid h-9 w-9 place-items-center rounded-full text-slate-700 transition active:scale-90", GLASS, FOCUS)}><Icon name="sliders" /></button>
                <AnimatePresence>
                  {settingsOpen && (
                    <motion.div initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.96 }}
                      transition={{ type: "spring", stiffness: 420, damping: 32 }}
                      className={cn("absolute right-0 top-full z-50 mt-2 w-[19rem] origin-top-right space-y-3 rounded-[28px] p-4", SHEET)}>
                      <Seg id="mode-seg" value={snap.mode} onChange={(key) => !roomBusy && settings({ mode: key })} items={Object.entries(MODES).map(([key, label]) => ({ key, label }))} />
                      <div className="divide-y divide-black/[0.06] rounded-2xl bg-black/[0.04] px-3.5">
                        <label className="flex items-center justify-between py-2.5 text-[14px] text-slate-800">Speakers up to
                          <select value={snap.max_speakers} disabled={roomBusy} onChange={(e) => settings({ speaker_limit: Number(e.target.value) })}
                            className={cn("rounded-lg bg-transparent py-1 pl-2 text-[14px] font-semibold text-[#37688F]", FOCUS)}>
                            {Array.from({ length: MAX_SPEAKERS }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </label>
                        <Switch label="Questions on" checked={snap.questions_enabled} busy={busyActions.questions_enabled} disabled={Boolean(busyActions.questions_enabled)}
                          onChange={(c) => settings({ questions_enabled: c }, "questions_enabled")} />
                        <Switch label="Allow anonymous" checked={snap.anonymous_questions_enabled} busy={busyActions.anonymous_questions_enabled} disabled={Boolean(busyActions.anonymous_questions_enabled)}
                          onChange={(c) => settings({ anonymous_questions_enabled: c }, "anonymous_questions_enabled")} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <button type="button" aria-label={panelOpen ? "Hide people panel" : "Show people panel"} aria-expanded={panelOpen} onClick={() => { setSettingsOpen(false); setPanelOpen((o) => !o); }}
              className={cn("flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold transition active:scale-95", panelOpen ? "bg-slate-900 text-white shadow-[0_2px_12px_rgba(0,0,0,0.2)]" : cn("text-slate-800", GLASS), FOCUS)}>
              <Icon name="users" className="h-4 w-4" />
              <span className="hidden sm:inline">People</span>
              <Count n={peopleCount} alert={panelAlert} />
            </button>
          </div>
        </header>

        {/* ---- Slide-over panel ---- */}
        <AnimatePresence>
          {panelOpen && (
            <>
              <motion.button type="button" aria-label="Close people panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setPanelOpen(false)} className="absolute inset-0 z-30 cursor-default bg-black/10 backdrop-blur-[1px]" />
              <motion.aside aria-label="Meeting participants" initial={{ opacity: 0, x: 36 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 36 }}
                transition={{ type: "spring", stiffness: 380, damping: 34 }}
                className={cn("absolute inset-x-3 bottom-3 top-[38%] z-40 flex flex-col overflow-hidden rounded-[28px] md:inset-x-auto md:right-3 md:top-[64px] md:w-[372px]", SHEET)}>
                <span aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-slate-300 md:hidden" />
                <div className="flex items-center justify-between px-4 pt-3">
                  <h2 className="text-[17px] font-bold tracking-tight text-slate-900">In this room</h2>
                  <IconBtn label="Close panel" className="bg-black/[0.06]" onClick={() => setPanelOpen(false)}><Icon name="close" className="h-4 w-4" /></IconBtn>
                </div>
              <Seg id="panel-tab" value={activeTab} onChange={setTab} items={tabs} className="mx-4 mt-3" />
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {activeTab === "pinned" ? (
                  <section aria-label="Pinned announcements" className="flex flex-col gap-3">
                    <div>
                      <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">Pinned announcements</h2>
                      <p className="text-[12px] text-slate-500">Shared with everyone in this room.</p>
                    </div>
                    {pinnedAnnouncements.map((a) => (
                      <div key={a.id} className="flex flex-col gap-2">
                        <Announcement a={a} isHost={isHost} onRemove={removeAnnouncement} onSave={editAnnouncement} label="pinned" />
                        <button type="button" onClick={() => { setPinnedAnnouncementsCollapsed(false); setPanelOpen(false); }}
                          className="self-start rounded-full px-3 py-1.5 text-[12px] font-semibold text-[#37688F] hover:bg-black/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6495c4]">
                          Show on stage
                        </button>
                      </div>
                    ))}
                  </section>
                ) : activeTab === "people" ? (
                  <div className="flex flex-col gap-4">
                    {sharedMessages.length > 0 && (
                      <section aria-label="Messages shared with everyone" className="flex flex-col gap-2">
                        <SectionTitle>Shared with everyone ({sharedMessages.length})</SectionTitle>
                        {sharedMessages.map((a) => <Announcement key={a.id} a={a} isHost={isHost} onRemove={removeAnnouncement} onSave={editAnnouncement} label="shared" />)}
                      </section>
                    )}
                    {!showSpeakersTab && speakerSection}
                    <section aria-label="Listening">
                      <SectionTitle>Participants ({listeners.length})</SectionTitle>
                      {listeners.length === 0 ? <p className="py-2 text-[14px] text-slate-400">No other participants yet.</p> : (
                        <ul>
                          {listeners.map((p) => {
                            const waiting = p.queued || snap.queue.some((q) => q.identity === p.identity);
                            return <PersonRow key={p.identity} p={p} me={me} sub={waiting ? "Hand raised" : "Listening"} subClass={waiting ? "text-[#B7791F]" : "text-slate-400"} right={waiting && <Icon name="hand" className="h-4 w-4 text-[#FF9F0A]" />} />;
                          })}
                        </ul>
                      )}
                    </section>
                  </div>
                ) : activeTab === "speakers" && showSpeakersTab ? speakerSection : activeTab === "hands" ? (
                  <section aria-label="Speaking queue">
                    {activeQueue.length === 0 ? (
                      <p className="pt-1 text-[14px] text-slate-400">{snap.mode === "open" && !floorFull ? "No one is waiting. Free spots can be taken straight away." : "No hands raised yet."}</p>
                    ) : (
                      <ol>
                        {activeQueue.map((p, i) => (
                          <PersonRow key={p.identity} p={p} me={me} sub={`Waiting · #${i + 1}`} subClass="text-[#B7791F]"
                            right={isHost && (
                              <div className="flex gap-1.5">
                                <IconBtn label={floorFull ? "The floor is full. Release a speaker first." : `Give floor to ${p.name}`} disabled={floorFull} className="h-9 w-9 bg-[#34C759] text-white hover:bg-[#2fb552]" onClick={() => act(() => api.grant(code, join.session, p.identity))}><Icon name="check" className="h-4 w-4" /></IconBtn>
                                <IconBtn label={`Decline ${p.name}`} className="h-9 w-9 bg-black/[0.06]"
                                  onClick={() => requestConfirmation({ title: `Decline ${p.name}'s hand?`, message: `${p.name} will be removed from the speaking queue.`, confirmLabel: "Decline hand", onConfirm: () => act(() => api.reject(code, join.session, p.identity)) })}><Icon name="close" className="h-4 w-4" /></IconBtn>
                              </div>)} />
                        ))}
                      </ol>
                    )}
                  </section>
                ) : (
                  <section aria-label="Host questions" className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div><h2 className="text-[15px] font-semibold tracking-tight text-slate-900">Private host inbox</h2><p className="text-[12px] text-slate-500">Only you can read these. Kept for 7 days after the meeting.</p></div>
                      <Btn variant="soft" onClick={exportQuestions} className="px-3 py-1.5 text-[12px]">Download</Btn>
                    </div>
                    {questionError && <p role="alert" className="rounded-2xl bg-red-50 px-3 py-2 text-[13px] text-[#B3261E]">{questionError}</p>}
                    <form onSubmit={createAnnouncement} className="rounded-[22px] bg-black/[0.04] p-3.5">
                      <label htmlFor="announcement-text" className="block text-[13px] font-semibold text-slate-800">Pin an announcement for everyone</label>
                      <textarea id="announcement-text" value={announcementText} onChange={(e) => setAnnouncementText(e.target.value)} maxLength={500} rows={2} className={cn(FIELD, "mt-2 bg-white text-[13px] ring-1 ring-black/5")} />
                      <Btn variant="primary" type="submit" disabled={announcementBusy || !announcementText.trim()} className="mt-2 px-4 py-2 text-[13px]">{announcementBusy ? "Pinning…" : "Pin announcement"}</Btn>
                    </form>
                    {questionInbox.length === 0 ? <p className="rounded-[22px] bg-black/[0.04] p-4 text-[13px] text-slate-500">No messages yet.</p> : questionInbox.map((q) => {
                      const isPublic = snap.announcements.some((a) => a.source_question_id === q.id);
                      const link = "text-[13px] font-semibold text-slate-600 transition hover:text-slate-900";
                      return (
                        <article key={q.id} className="group flex gap-3 border-b border-black/[0.06] pb-3 last:border-b-0">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/[0.06] text-sm font-bold text-slate-600">{q.anonymous ? "?" : (q.author || "U")[0].toUpperCase()}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 text-xs">
                              <b className="font-semibold text-slate-900">{q.anonymous ? "Anonymous participant" : q.author}</b>
                              <span className="text-slate-400">{new Date(q.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                              <span className={cn("font-semibold", q.status === "pending" ? "text-[#FF9F0A]" : q.status === "answered" ? "text-[#34C759]" : "text-slate-400")}>{q.status === "pending" ? "Pending" : q.status === "answered" ? "Answered" : "Dismissed"}</span>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-[1.4] text-slate-700">{q.text}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                              {q.status === "pending" && (
                                <>
                                  <button type="button" className={link} onClick={() => void moderateQuestion(q.id, "answered")}>Mark answered</button>
                                  <button type="button" className={cn(link, "font-medium text-slate-400")} onClick={() => requestConfirmation({ title: "Dismiss this message?", message: "The sender's message will be marked as dismissed.", confirmLabel: "Dismiss message", onConfirm: () => moderateQuestion(q.id, "dismissed") })}>Dismiss</button>
                                </>
                              )}
                              {!isPublic ? (
                                <button type="button" className="text-[13px] font-semibold text-[#37688F]" onClick={() => requestConfirmation({ title: "Show this private message to everyone?", message: "The message and the sender's chosen name (or Anonymous) will be visible to all participants.", confirmLabel: "Show to everyone", busyLabel: "Publishing…", onConfirm: () => publishQuestion(q.id) })}>Publish to discussion</button>
                              ) : (
                                <button type="button" className="text-[13px] font-semibold text-[#37688F]" onClick={() => void act(() => api.inviteQuestionSender(code, join.session, q.id))}>Invite to speak</button>
                              )}
                              <button type="button" className="ml-auto text-[13px] text-slate-400 hover:text-[#FF3B30] sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100" onClick={() => requestConfirmation({ title: "Block this sender from commenting?", message: "They will no longer be able to send comments in this meeting.", confirmLabel: "Block sender", onConfirm: () => blockQuestionSender(q.id) })}>Block sender</button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </section>
                )}
              </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Confirm dialog */}
      <AnimatePresence>
        {confirmation && (
          <Modal titleId="confirm-title" onClose={() => !confirmationBusy && setConfirmation(null)}>
            <h2 id="confirm-title" className="text-center text-[19px] font-semibold tracking-tight text-slate-900">{confirmation.title}</h2>
            <p className="mt-2 text-center text-[14px] leading-relaxed text-slate-500">{confirmation.message}</p>
            <div className="mt-6 flex flex-col gap-2">
              <Btn variant="danger" disabled={confirmationBusy} onClick={confirmRequestedAction} className="w-full py-3">{confirmationBusy ? <><Spinner className="h-3.5 w-3.5" />{confirmation.busyLabel}</> : confirmation.confirmLabel}</Btn>
              <Btn variant="soft" autoFocus disabled={confirmationBusy} onClick={() => setConfirmation(null)} className="w-full py-3">Cancel</Btn>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Message to host */}
      <AnimatePresence>
        {askOpen && !isHost && (
          <Modal titleId="ask-title" onClose={() => setAskOpen(false)}>
            <div className="flex items-start justify-between gap-3">
              <div><h2 id="ask-title" className="text-[19px] font-semibold tracking-tight text-slate-900">Message the host</h2><p className="mt-1 text-[13px] text-slate-500">Only the host can read your messages.</p></div>
              <IconBtn label="Close" className="bg-black/[0.06]" onClick={() => setAskOpen(false)}><Icon name="close" className="h-4 w-4" /></IconBtn>
            </div>
            <form onSubmit={submitQuestion} className="mt-4">
              <label htmlFor="question-text" className="block text-[13px] font-semibold text-slate-700">Your message</label>
              <textarea id="question-text" value={questionText} onChange={(e) => { setQuestionText(e.target.value); setQuestionSent(false); }} maxLength={500} required rows={4} placeholder="Write a message to the host…"
                className={cn(FIELD, "mt-2 rounded-[20px] px-4 py-3")} />
              {editingQuestionId === null && (
                <>
                  <Seg id="anon-seg" className="mt-3" value={anonymousQuestion ? "anon" : "name"} onChange={(k) => (k === "anon" ? snap.anonymous_questions_enabled && setAnonymousQuestion(true) : setAnonymousQuestion(false))}
                    items={[{ key: "name", label: "With my name" }, { key: "anon", label: snap.anonymous_questions_enabled ? "Anonymous" : "Anonymous (off)" }]} />
                  <p className="mt-2 text-[12px] leading-relaxed text-slate-500">Anonymous: the host won’t see your name. Selah keeps a private record only to prevent abuse.</p>
                </>
              )}
              {questionError && <p role="alert" className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-[13px] text-[#B3261E]">{questionError}</p>}
              {questionSent && <p role="status" className="mt-3 text-[13px] font-semibold text-[#1E7A38]">{editingQuestionId !== null ? "Saved" : "Sent"}</p>}
              <Btn variant="primary" type="submit" disabled={questionBusy || !questionText.trim()} className="mt-4 w-full py-3">{questionBusy ? "Saving…" : editingQuestionId !== null ? "Save changes" : "Send"}</Btn>
              {editingQuestionId !== null && <Btn variant="soft" className="mt-2 w-full py-3" onClick={() => { setEditingQuestionId(null); setQuestionText(""); setQuestionError(""); }}>Cancel editing</Btn>}
            </form>
            <section className="mt-6 border-t border-black/[0.06] pt-4">
              <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-slate-400">Your messages</h3>
              {myQuestions.length === 0 ? <p className="mt-2 text-[13px] text-slate-400">Your sent messages will appear here.</p> : (
                <ul className="mt-2 flex flex-col gap-2">
                  {myQuestions.map((q) => (
                    <li key={q.id} className="flex items-start gap-2 rounded-[20px] bg-black/[0.04] p-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="whitespace-pre-wrap break-words text-[13px] text-slate-700">{q.text}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{q.status} · {new Date(q.created_at).toLocaleString()}</p>
                      </div>
                      {q.status === "pending" && !snap.announcements.some((a) => a.source_question_id === q.id) && (
                        <button type="button" aria-label="Edit your message" className="rounded-full px-2.5 py-1 text-[12px] font-semibold text-[#37688F] hover:bg-blue-50" onClick={() => { setEditingQuestionId(q.id); setQuestionText(q.text); setQuestionError(""); setQuestionSent(false); }}>Edit</button>
                      )}
                      <button type="button" aria-label="Delete your message" className="rounded-full px-2.5 py-1 text-[12px] font-semibold text-[#FF3B30] hover:bg-red-50"
                        onClick={() => requestConfirmation({ title: "Delete this message?", message: "You will not be able to restore it.", confirmLabel: "Delete message", onConfirm: () => deleteMyQuestion(q.id) })}>Delete</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}