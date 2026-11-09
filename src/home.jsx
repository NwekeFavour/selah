import { useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Selah from "./assets/selah.webp";
import StartModal from "./component/startModal";
import { ApiError, api } from "./api";

// Marketing numbers live here so they are easy to change once media costs are known.
const LIMITS = { people: 100, speakers: 10, minutes: 60 };

// ---- Content ----------------------------------------------------------------

const PEOPLE = [
  { id: 1, name: "Amara O.", photo: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=800&q=85" },
  { id: 2, name: "Tunde A.", photo: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=85" },
  { id: 3, name: "Ngozi E.", photo: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=85" },
  { id: 4, name: "Daniel K.", photo: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=85" },
  { id: 5, name: "Halima B.", photo: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=800&q=85" },
  { id: 6, name: "Segun L.", photo: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=85" },
];

const CAP = 4; // speaker limit shown in the demo (the real maximum is LIMITS.speakers)

const MODES = {
  approval: {
    label: "Host approval",
    note: "The host decides who speaks next. Raised hands wait in order until the host gives the floor.",
    frames: [
      { s: [1, 2], q: [], say: "Two people are speaking. Everyone else is listening." },
      { s: [1, 2], q: [3], say: "Ngozi raises her hand and joins the queue." },
      { s: [1, 2], q: [3, 4], say: "Daniel raises his hand too. Hands stay in order." },
      { s: [1, 2, 3], q: [4], say: "The host gives Ngozi the floor." },
      { s: [2, 3], q: [4], say: "Amara finishes her turn." },
      { s: [2, 3, 4], q: [], say: "Daniel is next. Everyone who asked has had a turn." },
    ],
  },
  open: {
    label: "Open floor",
    note: "While the floor has open spots, anyone can speak without approval. When it is full, new hands wait in line.",
    frames: [
      { s: [1, 2], q: [], say: "A normal call with two speakers." },
      { s: [1, 2, 3], q: [], say: "Ngozi joins the floor. No approval needed." },
      { s: [1, 2, 3, 4], q: [], say: `The floor fills up to the host's limit of ${CAP}.` },
      { s: [1, 2, 3, 4], q: [5], say: "The floor is full, so a new hand waits in the queue." },
      { s: [2, 3, 4, 5], q: [], say: "A speaker finishes and the next hand takes their spot." },
    ],
  },
};

const STEPS = [
  ["Start a video meeting", "Name your Selah and copy the invite link. Nothing to download."],
  ["Share the link", "Guests join with just a name. No account, no sign-up."],
  ["Raise a hand or join the floor", "With free speaker spots, tap and speak. Otherwise your hand joins the queue."],
  ["Speak in turn", "When a speaker finishes, the next raised hand in line gets the floor."],
];

const FEATURES = [
  ["The host controls the floor", "Give the floor, take it back, decline a request, or mute and remove anyone in the room.", "M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0 M16 4v4 M8 10v4 M18 16v4"],
  ["Say “can’t hear” once", "One tap sends the signal. The host sees a single count instead of a dozen interruptions.", "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"],
  ["Drop out, keep your place", "If your network cuts out, you have a short window to rejoin before your spot is released.", "M12 7v5l3 2 M21 12a9 9 0 1 1-3-6.7 M21 4v5h-5"],
  ["Guests join with a link", "Share one link. People enter their name and join. No account needed.", "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7 M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"],
];

const USE_CASES = [
  ["Town halls and all-hands", "Members or staff raise a hand and ask in order, without everyone talking at once.", "#F2683C"],
  ["Online classes and lectures", "Students raise a hand, the teacher gives the floor, and the class stays orderly.", "#8575E0"],
  ["Panel discussions and Q&A", "Keep a panel on the floor and take audience questions one voice at a time.", "#2E9E8F"],
  ["Community and faith group calls", "Host large community, association or fellowship calls where every voice gets a turn.", "#F6C445"],
];

const PLANS = [
  ["Free", "Available at launch", [`${LIMITS.people} people`, `${LIMITS.speakers} speakers`, `${LIMITS.minutes}-minute meetings`, "Raise-hand queue"]],
  ["Pro", "Coming soon", ["250 people", "25 speakers", "3-hour meetings", "Recording and history"]],
  ["Business", "Coming soon", ["500+ people", "Multiple moderators", "Your branding", "Admin dashboard"]],
];

const FAQS = [
  ["What is Selah?", "Selah is a moderated video conferencing app for large groups. Up to 10 people speak at a time, everyone else listens, and a raise-hand speaking queue decides who talks next."],
  ["How does the raise-hand queue work?", "Tap Raise hand and you join an ordered queue. In host-approval mode, the host gives you the floor. In open-floor mode, you can speak straight away while there are free speaker spots, and once the floor is full, new hands wait in line."],
  ["How many people can join a free meeting?", `A free meeting supports up to ${LIMITS.people} people, with up to ${LIMITS.speakers} speakers on the floor, for ${LIMITS.minutes} minutes. Pro and Business plans with larger rooms are coming soon.`],
  ["Do guests need an account?", "No. Guests join with a link and a name, with no sign-up and no download."],
  ["What can the host control?", "The host can give the floor, take it back, decline a request, and mute or remove anyone. The host also sees a count when people report they can't hear."],
  ["What if someone's connection drops?", "They have a short window to return before their spot is released, so a brief network drop does not cost them their place."],
];

const COMPANY = { name: "OKNOWN", url: "" };
const HOST_MEETING_PREFIX = "selah.host.title.";

const FOOTER_LINKS = [
  ["Speaking queue", "#demo"],
  ["How it works", "#how"],
  ["Host controls", "#features"],
  ["Use cases", "#use-cases"],
  ["Plans", "#plans"],
  ["FAQ", "#faq"],
];

// ---- Saved host meetings (localStorage) -------------------------------------

function removeSavedHostMeeting(code) {
  localStorage.removeItem(`selah.host.${code}`);
  localStorage.removeItem(`selah.hostroom.${code}`);
  localStorage.removeItem(`${HOST_MEETING_PREFIX}${code}`);
}

function savedHostMeetings() {
  const meetings = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key?.startsWith(HOST_MEETING_PREFIX)) continue;
    const code = key.slice(HOST_MEETING_PREFIX.length);
    if (!/^[a-z2-9]{3}(?:-[a-z2-9]{3}){2}$/.test(code)) continue;
    meetings.push({ code, title: localStorage.getItem(key) || `Selah ${code}` });
  }
  return meetings.sort((a, b) => a.title.localeCompare(b.title));
}

// ---- Small pieces -----------------------------------------------------------

function Icon({ d, className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Reveal({ children, delay = 0, className = "" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Eyebrow({ children }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6495c4]">{children}</p>;
}

function Photo({ p, className = "" }) {
  const [bad, setBad] = useState(false);
  if (bad) return <span className={`grid place-items-center bg-slate-700 font-bold text-slate-300 ${className}`}>{p.name[0]}</span>;
  return <img src={p.photo} alt="" loading="lazy" decoding="async" onError={() => setBad(true)} className={`object-cover object-[50%_20%] ${className}`} />;
}

function useFrame(count, ms) {
  const [f, setF] = useState(2);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setF(0);
    const t = setInterval(() => setF((x) => (x + 1) % count), ms);
    return () => clearInterval(t);
  }, [count, ms]);
  return f;
}

// ---- Section 2: live room demo ----------------------------------------------

const ICON_MIC = "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v3";
const ICON_CAM = "m16 13 5 3.5V7.5L16 11 M3 6h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z";
const ICON_HAND = "M18 11V6a2 2 0 0 0-4 0 M14 10V4a2 2 0 0 0-4 0v2 M10 10.5V6a2 2 0 0 0-4 0v8 M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-5.9-2.4L3.4 16a2 2 0 0 1 3.2-2.4L8 15";
const AUDIENCE = ["#F2683C", "#8575E0", "#2E9E8F", "#F6C445", "#F4B5BD"];

function SpeakingBars() {
  return (
    <span className="flex h-3.5 items-center gap-0.5" aria-hidden="true">
      {["h-1.5", "h-3.5", "h-2.5", "h-3"].map((h, i) => (
        <i key={i} className={`w-0.5 animate-pulse rounded bg-emerald-400 ${h} motion-reduce:animate-none`} style={{ animationDelay: `${i * 140}ms` }} />
      ))}
    </span>
  );
}

function Room({ mode }) {
  const { label, note, frames } = MODES[mode];
  const f = useFrame(frames.length, 2800);
  const { s: speakers, q: queue, say } = frames[f];
  const full = speakers.length >= CAP;
  const talkingId = speakers[f % speakers.length];
  const featured = PEOPLE.find((p) => p.id === talkingId);
  const others = speakers.filter((id) => id !== talkingId).map((id) => PEOPLE.find((p) => p.id === id));

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_40px_90px_-40px_rgba(15,23,42,0.35)]">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 px-5 py-3.5 text-sm">
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="font-semibold">Panel Q&amp;A</span>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{label}</span>
        <span className="ml-auto flex items-center gap-2.5 text-xs text-slate-500">
          <span className="flex gap-1" aria-hidden="true">
            {Array.from({ length: CAP }).map((_, i) => (
              <i key={i} className={`h-1.5 w-5 rounded-full transition-colors duration-500 motion-reduce:transition-none ${i < speakers.length ? "bg-emerald-500" : "bg-slate-200"}`} />
            ))}
          </span>
          {speakers.length} of {CAP} on the floor
        </span>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px]">
        {/* Stage */}
        <div className="bg-slate-100/70 p-4">
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-900" role="img" aria-label="The active speaker in a Selah video meeting">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={featured.id}
                initial={{ opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45 }}
                className="absolute inset-0"
              >
                <Photo p={featured} className="h-full w-full" />
                <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
              </motion.div>
            </AnimatePresence>

            <span className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
              <SpeakingBars />
              {featured.name}
            </span>
            <span className="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-black/55 py-1 pl-1.5 pr-3 text-xs font-medium text-white backdrop-blur">
              <span className="flex -space-x-1.5" aria-hidden="true">
                {AUDIENCE.slice(0, 3).map((c) => (
                  <i key={c} className="h-4 w-4 rounded-full ring-2 ring-slate-900" style={{ background: c }} />
                ))}
              </span>
              46 listening
            </span>

            {/* Control dock */}
            <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2" aria-hidden="true">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white backdrop-blur"><Icon d={ICON_MIC} className="h-[18px] w-[18px]" /></span>
              <span className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white backdrop-blur"><Icon d={ICON_CAM} className="h-[18px] w-[18px]" /></span>
              <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors duration-500 motion-reduce:transition-none ${mode === "open" && !full ? "bg-emerald-500 text-white" : "bg-white text-slate-900"}`}>
                <Icon d={ICON_HAND} className="h-4 w-4" />
                {mode === "open" && !full ? "Join the floor" : "Raise hand"}
              </span>
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[#E5484D] text-white"><Icon d="M5 12h14" className="h-[18px] w-[18px]" /></span>
            </div>
          </div>

          {/* Other speakers + open spots */}
          <div className="mt-3 grid grid-cols-3 gap-3">
            {Array.from({ length: CAP - 1 }).map((_, i) => {
              const p = others[i];
              return p ? (
                <motion.div key={p.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} className="relative aspect-video overflow-hidden rounded-xl bg-slate-200">
                  <Photo p={p} className="h-full w-full" />
                  <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">{p.name}</span>
                </motion.div>
              ) : (
                <div key={`open-${i}`} className="grid aspect-video place-items-center rounded-xl border border-dashed border-slate-300 text-xs text-slate-400">
                  Open spot
                </div>
              );
            })}
          </div>

          {/* Caption */}
          <div className="mt-4 flex min-h-6 items-center justify-center text-center text-sm text-slate-600">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p key={say} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
                {say}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        {/* Queue */}
        <aside className="flex flex-col border-t border-slate-200 p-5 lg:border-l lg:border-t-0">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Icon d={ICON_HAND} className="h-4 w-4 text-[#F2683C]" />
              Speaking queue
            </h3>
            <span className="grid h-6 min-w-6 place-items-center rounded-full bg-slate-900 px-1.5 text-xs font-semibold text-white">{queue.length}</span>
          </div>

          <div className="relative min-h-[132px] flex-1" aria-hidden="true">
            <AnimatePresence mode="popLayout" initial={false}>
              {queue.length === 0 && (
                <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
                  {mode === "open" ? "No one is waiting. Free spots can be taken straight away." : "No hands raised yet."}
                </motion.p>
              )}
              {queue.map((id, q) => {
                const p = PEOPLE.find((x) => x.id === id);
                const first = q === 0;
                return (
                  <motion.div
                    key={id}
                    layout
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.35 }}
                    className={`mb-2 rounded-xl border p-3 ${first ? "border-[#6495c4]/40 bg-[#6495c4]/[0.07]" : "border-slate-200 bg-white"}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${first ? "bg-[#6495c4] text-white" : "bg-slate-100 text-slate-500"}`}>{q + 1}</span>
                      <Photo p={p} className="h-8 w-8 shrink-0 rounded-full" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                      {first && mode === "open" && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Up next</span>}
                    </div>
                    {first && mode === "approval" && (
                      <div className="mt-3 flex gap-2">
                        <span className="flex-1 rounded-lg bg-slate-900 py-1.5 text-center text-xs font-semibold text-white">Give floor</span>
                        <span className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600">Decline</span>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">{note}</p>
        </aside>
      </div>
    </div>
  );
}

function RoomDemo() {
  const [mode, setMode] = useState("approval");
  return (
    <div>
      <div role="tablist" aria-label="How a room runs" className="mx-auto mb-6 flex w-fit rounded-full border border-slate-200 bg-white p-1 shadow-sm">
        {Object.entries(MODES).map(([key, m]) => (
          <button
            key={key}
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className="relative rounded-full px-5 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[#6495c4]"
          >
            {mode === key && <motion.span layoutId="mode-pill" className="absolute inset-0 rounded-full bg-slate-900" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
            <span className={`relative ${mode === key ? "text-white" : "text-slate-600"}`}>{m.label}</span>
          </button>
        ))}
      </div>
      <Room key={mode} mode={mode} />
    </div>
  );
}

// ---- Page -------------------------------------------------------------------

export default function Home({ onStart, onEnter }) {
  const [open, setOpen] = useState(false);
  const [meetings, setMeetings] = useState(savedHostMeetings);
  const [statuses, setStatuses] = useState({});
  const [copied, setCopied] = useState("");
  const refreshMeetings = () => setMeetings(savedHostMeetings());

  const copyLink = async (code) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${code}`);
      setCopied(code);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  useEffect(() => {
    if (!meetings.length) return undefined;
    let active = true;
    Promise.all(
      meetings.map(async ({ code }) => {
        try {
          const { ended } = await api.meetingStatus(code);
          if (ended) removeSavedHostMeeting(code);
          return [code, ended ? "ended" : "active"];
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) {
            removeSavedHostMeeting(code);
            return [code, "ended"];
          }
          return [code, "unavailable"];
        }
      }),
    ).then((results) => {
      if (!active) return;
      setStatuses((cur) => ({ ...cur, ...Object.fromEntries(results) }));
      if (results.some(([, s]) => s === "ended")) setMeetings(savedHostMeetings());
    });
    return () => {
      active = false;
    };
  }, [meetings]);

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };

  const darkBtn =
    "inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition duration-200 hover:bg-[#6495c4] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 motion-reduce:transition-none";

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen scroll-smooth bg-[#FAFAF7] text-slate-900 antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

        {/* Header */}
        <header className="sticky top-0 z-40 bg-[#FAFAF7]/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <a href="#top"><img src={Selah} alt="Selah" className="w-20" /></a>
            <nav aria-label="Main" className="hidden items-center gap-7 text-sm text-slate-600 md:flex">
              <a href="#demo" className="transition hover:text-slate-900">Speaking queue</a>
              <a href="#how" className="transition hover:text-slate-900">How it works</a>
              <a href="#use-cases" className="transition hover:text-slate-900">Use cases</a>
              <a href="#faq" className="transition hover:text-slate-900">FAQ</a>
            </nav>
            <button onClick={() => setOpen(true)} className="rounded-full bg-[#6495c4] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#5486b5] active:scale-[0.98]">
              Start a Selah
            </button>
          </div>
        </header>

        <main id="top">
          {/* Saved meetings: compact bar, only when the host has meetings */}
          {meetings.length > 0 && (
            <section aria-label="Your saved meetings" className="mx-auto max-w-6xl px-6 pt-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Your meetings</p>
                <ul className="divide-y divide-slate-100">
                  <AnimatePresence>
                    {meetings.map(({ code, title }) => {
                      const status = statuses[code] ?? "checking";
                      const dot = status === "active" ? "bg-emerald-500" : status === "unavailable" ? "bg-amber-500" : "bg-slate-300";
                      return (
                        <motion.li key={code} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-wrap items-center gap-3 px-2 py-2.5">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} title={status} />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
                          <button type="button" onClick={() => copyLink(code)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50">
                            {copied === code ? "Copied" : "Copy link"}
                          </button>
                          <button type="button" onClick={() => onEnter(code)} className="rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#6495c4]">
                            Enter meeting
                          </button>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              </div>
            </section>
          )}

          {/* 1. Hero */}
          <section className="mx-auto max-w-4xl px-6 pb-20 pt-16 text-center sm:pt-24">
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: "easeOut" }}>
              <Eyebrow>Moderated video meetings</Eyebrow>
              <h1 className="mt-5 text-balance text-4xl font-bold leading-[1.06] tracking-tight sm:text-6xl">
                Video meetings for large groups, <span className="font-serif italic font-semibold text-[#6495c4]">one voice</span> at a time
              </h1>
              <p className="mx-auto mt-6  text-balance text-base leading-relaxed text-slate-600 sm:text-lg">
                Selah is a video conferencing app with a raise-hand speaking queue. Run town halls, online classes, panel discussions and community calls where the host controls the floor and everyone gets a turn.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <button onClick={() => setOpen(true)} className={darkBtn}>Start a free meeting</button>
                <a href="#demo" className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold transition hover:bg-white">
                  See the speaking queue
                </a>
              </div>
            </motion.div>

            <dl className="mx-auto mt-14 grid max-w-xl grid-cols-3 divide-x divide-slate-200">
              {[[LIMITS.people, "people per meeting"], [LIMITS.speakers, "speakers at once"], [LIMITS.minutes, "minutes, free"]].map(([n, l]) => (
                <div key={l} className="px-4">
                  <dt className="text-3xl font-bold tracking-tight sm:text-4xl">{n}</dt>
                  <dd className="mt-1 text-xs text-slate-500 sm:text-sm">{l}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 text-sm text-slate-500">Guests join with a link and a name. No account needed.</p>
          </section>

          {/* 2. Live room demo */}
          <section id="demo" className="mx-auto max-w-5xl scroll-mt-20 px-6 pb-28">
            <Reveal className="mb-10 text-center">
              <Eyebrow>Raise-hand speaking queue</Eyebrow>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">A speaking queue built for large video calls</h2>
              <p className="mx-auto mt-3  text-slate-600">
                Participants raise a hand and wait in line. The host gives the floor, or lets people speak freely while speaker spots are open.
              </p>
            </Reveal>
            <RoomDemo />
          </section>

          {/* 3. How it works */}
          <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-6 pb-28">
            <Reveal className="mb-12 text-center">
              <Eyebrow>How it works</Eyebrow>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Run a moderated video meeting in four steps</h2>
            </Reveal>
            <ol className="relative grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
              <span aria-hidden="true" className="absolute left-0 right-0 top-5 hidden h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent lg:block" />
              {STEPS.map(([t, b], i) => (
                <Reveal key={t} delay={i * 0.08}>
                  <li className="relative">
                    <span className="relative grid h-10 w-10 place-items-center rounded-full bg-slate-900 text-sm font-bold text-white ring-8 ring-[#FAFAF7]">{i + 1}</span>
                    <h3 className="mt-5 font-semibold tracking-tight">{t}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{b}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </section>

          {/* 4. Host controls and features */}
          <section id="features" className="scroll-mt-20 bg-white py-28">
            <div className="mx-auto grid max-w-6xl gap-14 px-6 lg:grid-cols-[0.8fr_1.2fr]">
              <Reveal className="lg:sticky lg:top-28 lg:self-start">
                <Eyebrow>Host controls</Eyebrow>
                <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Orderly group meetings, without the chaos</h2>
                <p className="mt-4 max-w-md text-slate-600">
                  Up to {LIMITS.speakers} people speak at once, everyone else listens, and the host decides who is next.
                </p>
              </Reveal>
              <ul className="grid gap-x-8 gap-y-10 sm:grid-cols-2">
                {FEATURES.map(([t, b, d], i) => (
                  <Reveal key={t} delay={i * 0.06}>
                    <li>
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#6495c4]/10 text-[#6495c4]">
                        <Icon d={d} />
                      </span>
                      <h3 className="mt-4 font-semibold tracking-tight">{t}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">{b}</p>
                    </li>
                  </Reveal>
                ))}
              </ul>
            </div>
          </section>

          {/* 5. Use cases */}
          <section id="use-cases" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-28">
            <Reveal className="mb-12 text-center">
              <Eyebrow>Use cases</Eyebrow>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Made for meetings where everyone talks at once</h2>
              <p className="mx-auto mt-3 text-slate-600">If your video call has too many people and too few turns, a moderated speaking queue fixes it.</p>
            </Reveal>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {USE_CASES.map(([t, b, c], i) => (
                <Reveal key={t} delay={i * 0.07}>
                  <li className="h-full overflow-hidden rounded-2xl border border-slate-200 bg-white transition duration-300 hover:-translate-y-1 hover:shadow-lg motion-reduce:transition-none">
                    <span className="block h-1.5" style={{ background: c }} />
                    <div className="p-5">
                      <h3 className="font-semibold tracking-tight">{t}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">{b}</p>
                    </div>
                  </li>
                </Reveal>
              ))}
            </ul>
          </section>

          {/* 6. Plans strip */}
          <section id="plans" className="mx-auto max-w-6xl scroll-mt-20 px-6 pb-28">
            <Reveal className="mb-10 text-center">
              <Eyebrow>Plans</Eyebrow>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Start free. Grow when your room does.</h2>
            </Reveal>
            <div className="grid overflow-hidden rounded-3xl border border-slate-200 bg-white md:grid-cols-[1.3fr_1fr_1fr] md:divide-x divide-y md:divide-y-0 divide-slate-200">
              {PLANS.map(([name, note, items], i) => (
                <div key={name} className={`p-7 ${i === 0 ? "bg-[#6495c4]/[0.06]" : "text-slate-500"}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className={`text-xl font-bold ${i === 0 ? "text-slate-900" : ""}`}>{name}</h3>
                    <span className={`text-xs font-semibold ${i === 0 ? "text-[#6495c4]" : "text-slate-400"}`}>{note}</span>
                  </div>
                  <ul className="mt-5 space-y-2.5 text-sm">
                    {items.map((it) => (
                      <li key={it} className="flex gap-2.5">
                        <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${i === 0 ? "bg-[#6495c4]" : "bg-slate-300"}`} />
                        {it}
                      </li>
                    ))}
                  </ul>
                  {i === 0 && <button onClick={() => setOpen(true)} className={`${darkBtn} mt-7 w-full`}>Start a free meeting</button>}
                </div>
              ))}
            </div>
          </section>

          {/* 7. FAQ and final call to action */}
          <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-6 pb-24">
            <Reveal className="mb-10 text-center">
              <Eyebrow>FAQ</Eyebrow>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Questions about Selah video meetings</h2>
            </Reveal>
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {FAQS.map(([q, a]) => (
                <details key={q} className="group py-5 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold focus-visible:outline-2 focus-visible:outline-[#6495c4]">
                    {q}
                    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-slate-400 transition duration-200 group-open:rotate-45 motion-reduce:transition-none" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                      <path d="M8 3v10M3 8h10" />
                    </svg>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">{a}</p>
                </details>
              ))}
            </div>

            <Reveal className="mt-20 rounded-3xl bg-slate-900 px-8 py-14 text-center">
              <h2 className="mx-auto text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">Give your next large video meeting some order.</h2>
              <p className="mx-auto mt-3  text-slate-300">Start a free Selah, share the link, and let the queue keep every voice heard.</p>
              <button onClick={() => setOpen(true)} className="mt-8 inline-flex items-center rounded-full bg-white px-7 py-3 text-sm font-semibold text-slate-900 transition hover:bg-[#6495c4] hover:text-white active:scale-[0.98]">
                Start a free meeting
              </button>
            </Reveal>
          </section>
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200 px-6 py-12">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div className="max-w-xs">
              <a href="#top"><img src={Selah} alt="Selah" className="w-20" /></a>
              <p className="mt-4 text-sm leading-relaxed text-slate-600">
                Video conferencing for large groups, with a raise-hand speaking queue so every voice gets a turn.
              </p>
            </div>
            <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm text-slate-600">
              {FOOTER_LINKS.map(([l, h]) => (
                <a key={l} href={h} className="transition hover:text-slate-900">{l}</a>
              ))}
              <a href="#" className="transition hover:text-slate-900">Privacy policy</a>
              <a href="#" className="transition hover:text-slate-900">Terms of use</a>
            </nav>
          </div>
          <div className="mx-auto mt-10 flex max-w-6xl flex-col justify-between gap-2 border-t border-slate-200 pt-6 text-sm text-slate-500 sm:flex-row">
            <span>&copy; {new Date().getFullYear()} Selah. All rights reserved.</span>
            <span>
              A product of{" "}
              {COMPANY.url ? (
                <a href={COMPANY.url} className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-4">{COMPANY.name}</a>
              ) : (
                <span className="font-semibold text-[#6495c4]">{COMPANY.name}</span>
              )}
            </span>
          </div>
        </footer>

        <StartModal open={open} onClose={() => setOpen(false)} onEnter={onEnter} onMeetingCreated={refreshMeetings} />
      </div>
    </MotionConfig>
  );
}