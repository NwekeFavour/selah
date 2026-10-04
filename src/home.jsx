import { useEffect, useState } from "react";
import Selah from "./assets/selah.webp";
import StartModal from "./component/startModal";
// Marketing numbers live here so they are easy to change once media costs are known.
const LIMITS = { people: 100, speakers: 10, minutes: 60 };

const PEOPLE = [
  {
    id: 1,
    photo:
      "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=900&q=90",
    name: "Amara O.",
    skin: "#8D5A3C",
    hair: "#1f1a17",
    shirt: "#F2683C",
    tint: "#FDE2D6",
  },
  {
    id: 2,
    photo:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=900&q=90",
    name: "Tunde A.",
    skin: "#6B4129",
    hair: "#111111",
    shirt: "#8575E0",
    tint: "#E6E1FA",
  },
  {
    id: 3,
    photo:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=900&q=90",
    name: "Ngozi E.",
    skin: "#A06A48",
    hair: "#2b1d16",
    shirt: "#2E9E8F",
    tint: "#D5F0EB",
  },
  {
    id: 4,
    photo:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=90",
    name: "Daniel K.",
    skin: "#E0B08A",
    hair: "#5a3a22",
    shirt: "#F6C445",
    tint: "#FCF1CC",
  },
  {
    id: 5,
    photo:
      "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=900&q=90",
    name: "Halima B.",
    skin: "#C58B64",
    hair: "#1a1a1a",
    shirt: "#F4B5BD",
    tint: "#FBE4E7",
  },
  {
    id: 6,
    photo:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=90",
    name: "Segun L.",
    skin: "#7A4A31",
    hair: "#0f0f0f",
    shirt: "#334155",
    tint: "#E2E8F0",
  },

  {
    id: 7,
    photo:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=90",
    name: "Segun L.",
    skin: "#7A4A31",
    hair: "#0f0f0f",
    shirt: "#334155",
    tint: "#E2E8F0",
  },

  {
    id: 8,
    photo:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=90",
    name: "Segun L.",
    skin: "#7A4A31",
    hair: "#0f0f0f",
    shirt: "#334155",
    tint: "#E2E8F0",
  },

  {
    id: 9,
    photo:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=90",
    name: "Segun L.",
    skin: "#7A4A31",
    hair: "#0f0f0f",
    shirt: "#334155",
    tint: "#E2E8F0",
  },
  {
    id: 10,
    photo:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=90",
    name: "Segun L.",
    skin: "#7A4A31",
    hair: "#0f0f0f",
    shirt: "#334155",
    tint: "#E2E8F0",
  },
  {
    id: 11,
    photo:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=90",
    name: "Segun L.",
    skin: "#7A4A31",
    hair: "#0f0f0f",
    shirt: "#334155",
    tint: "#E2E8F0",
  },
];

const STEPS = [
  ["Start a Selah", "Name it, choose how the floor works, and copy the link."],
  ["Share the link", "Guests join with just a name."],
  [
    "Speak or raise a hand",
    "In an open room with free spots, tap and speak. Otherwise your hand joins the queue.",
  ],
  [
    "Take your turn",
    "When a speaker finishes, the next hand in line gets the floor.",
  ],
];

const FEATURES = [
  {
    title: "The host steers",
    body: "Give the floor, take it back, decline a request, mute or remove anyone.",
    tint: "bg-[#FDE2D6]",
    icon: "M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0 M16 4v4 M8 10v4 M18 16v4",
  },
  {
    title: "Say \u201Ccan\u2019t hear\u201D once",
    body: "One tap sends the signal. The host sees a count, not a dozen interruptions.",
    tint: "bg-[#E6E1FA]",
    icon: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z",
  },
  {
    title: "Drop out, keep your place",
    body: "If your network cuts out, you have a short window to return before your spot is released.",
    tint: "bg-[#D5F0EB]",
    icon: "M12 7v5l3 2 M21 12a9 9 0 1 1-3-6.7 M21 4v5h-5",
  },
];

const PLANS = [
  [
    "Free",
    "Available at launch",
    [
      `${LIMITS.people} people`,
      `${LIMITS.speakers} speakers on the floor`,
      `${LIMITS.minutes}-minute meetings`,
      "Guests join without an account",
    ],
  ],
  [
    "Pro",
    "Coming soon",
    ["250 people", "25 speakers", "3-hour meetings", "Recording and history"],
  ],
  [
    "Business",
    "Coming soon",
    ["500+ people", "Multiple moderators", "Your branding", "Admin dashboard"],
  ],
];

// ---- Small pieces -----------------------------------------------------------

function Avatar({ p, className = "" }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <path d="M8 100c0-24 18-34 42-34s42 10 42 34Z" fill={p.shirt} />
      <rect x="42" y="52" width="16" height="16" rx="6" fill={p.skin} />
      <circle cx="50" cy="40" r="19" fill={p.skin} />
      <path
        d="M30 40c0-14 8-22 20-22s20 8 20 22c-5-8-12-12-20-12s-15 4-20 12Z"
        fill={p.hair}
      />
      <circle cx="43" cy="42" r="1.8" fill="#1e293b" />
      <circle cx="57" cy="42" r="1.8" fill="#1e293b" />
      <path
        d="M44 49q6 5 12 0"
        stroke="#1e293b"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Icon({ d, className = "h-5 w-5" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const Sparkle = ({ className = "" }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      d="M12 1c.8 6.2 4.8 10.2 11 11-6.2.8-10.2 4.8-11 11-.8-6.2-4.8-10.2-11-11 6.2-.8 10.2-4.8 11-11Z"
      fill="currentColor"
    />
  </svg>
);

const Wave = ({ fill, flip }) => (
  <svg
    viewBox="0 0 1440 80"
    preserveAspectRatio="none"
    className={`block h-10 w-full sm:h-16 ${flip ? "rotate-180" : ""}`}
    aria-hidden="true"
  >
    <path
      d="M0,40 C240,85 480,0 720,30 C960,60 1200,75 1440,20 L1440,80 L0,80 Z"
      fill={fill}
    />
  </svg>
);

function useRotation(ms) {
  const [order, setOrder] = useState(PEOPLE.map((p) => p.id));
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setOrder((o) => [...o.slice(1), o[0]]), ms);
    return () => clearInterval(t);
  }, [ms]);
  return order;
}

const Bars = ({ className = "bg-white" }) => (
  <span className="flex h-5 items-center gap-0.5" aria-hidden="true">
    {["h-2", "h-5", "h-3", "h-4"].map((h, i) => (
      <i
        key={i}
        className={`w-1 animate-pulse rounded ${h} ${className} motion-reduce:animate-none`}
        style={{ animationDelay: `${i * 140}ms` }}
      />
    ))}
  </span>
);

// ---- Hero art: chunky letters, the floor passes between them ----------------

const TILES = [
  {
    k: "S",
    bg: "bg-[#F2683C]",
    shape: "rounded-[38%_62%_55%_45%/48%_42%_58%_52%]",
    say: "Hello!",
  },
  {
    k: "E",
    bg: "bg-[#8575E0]",
    shape: "rounded-[55%_45%_40%_60%/45%_55%_45%_55%]",
    say: "My turn!",
  },
  { k: null, bg: "bg-[#FDE2D6]", shape: "rounded-full", say: "Thank you!" },
  {
    k: "L",
    bg: "bg-[#F6C445]",
    shape: "rounded-[45%_55%_60%_40%/55%_45%_55%_45%]",
    say: "Next up",
  },
  {
    k: "A",
    bg: "bg-[#F4B5BD]",
    shape: "rounded-[60%_40%_45%_55%/40%_60%_40%_60%]",
    say: "Yeay!",
  },
  {
    k: "H",
    bg: "bg-[#6495c4]",
    shape: "rounded-[42%_58%_52%_48%/58%_42%_58%_42%]",
    say: "Hand up!",
  },
];

function LetterBlocks() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActive((a) => (a + 1) % TILES.length), 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative mx-auto grid w-full max-w-[25rem] grid-cols-3 gap-5 p-4 pt-8">
      <Sparkle className="absolute -left-1 top-2 h-5 w-5 animate-pulse text-[#F6C445] motion-reduce:animate-none" />
      <Sparkle className="absolute -right-1 bottom-6 h-4 w-4 animate-pulse text-[#8575E0] motion-reduce:animate-none" />
      {TILES.map((t, i) => {
        const on = i === active;
        return (
          <div key={i} className="relative">
            <div
              className={`grid aspect-square place-items-center overflow-hidden border-[3px] border-slate-900 text-6xl font-black text-slate-900 shadow-[4px_4px_0_0_#0f172a] transition duration-500 ease-out motion-reduce:transition-none ${t.bg} ${t.shape} ${
                on
                  ? `z-10 scale-110 ${i % 2 ? "rotate-3" : "-rotate-3"}`
                  : "scale-100 rotate-0"
              }`}
            >
              {t.k ?? (
                <Avatar p={PEOPLE[0]} className="h-full w-full translate-y-2" />
              )}
            </div>
            <span
              aria-hidden="true"
              className={`absolute -top-5 left-1/2 z-20 -translate-x-1/4 whitespace-nowrap rounded-2xl border-2 border-slate-900 bg-white px-3 py-1 text-sm font-bold transition duration-300 motion-reduce:transition-none ${
                on ? "scale-100 opacity-100" : "scale-75 opacity-0"
              }`}
            >
              {t.say}
              <i className="absolute -bottom-[7px] left-4 h-3 w-3 rotate-45 border-b-2 border-r-2 border-slate-900 bg-white" />
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---- Product mock: a Selah room, with the queue moving ----------------------

const DEMO_CAP = 6; // host-chosen speaker limit for the picture (the real maximum is LIMITS.speakers)
const QUEUE_ROW = ["translate-y-0", "translate-y-16"];

// Each frame is one moment: who is on the floor (s), who is waiting (q), and what just happened.
const MODES = {
  approval: {
    label: "Host approval",
    frames: [
      {
        s: [1, 2],
        q: [],
        say: "Two people are speaking. Everyone else is listening.",
      },
      { s: [1, 2], q: [3], say: "Ngozi raises her hand and joins the queue." },
      {
        s: [1, 2],
        q: [3, 4],
        say: "Daniel raises his hand too. Hands stay in order.",
      },
      { s: [1, 2, 3], q: [4], say: "The host gives Ngozi the floor." },
      { s: [2, 3], q: [4], say: "Amara finishes her turn." },
      {
        s: [2, 3, 4],
        q: [],
        say: "Daniel is next. Everyone who asked has had a turn.",
      },
    ],
  },
  open: {
    label: "Open floor",
    note: "While the floor has open spots, anyone can speak without waiting for approval. When it is full, new hands wait in line.",
    frames: [
      { s: [1, 2], q: [], say: "A normal call with two speakers." },
      {
        s: [1, 2, 3],
        q: [],
        say: "Ngozi joins the floor. No approval needed.",
      },
      {
        s: [1, 2, 3, 4, 5, 6],
        q: [],
        say: `The floor fills up to the host's limit of ${DEMO_CAP}.`,
      },
      {
        s: [1, 2, 3, 4, 5, 6],
        q: [7],
        say: "The floor is full, so a new hand waits in the queue.",
      },
      {
        s: [2, 3, 4, 5, 6, 7],
        q: [],
        say: "A speaker finishes and the next hand takes their spot.",
      },
    ],
  },
};

const COMPANY = { name: "OKNOWN", url: "" };
const FOOTER_LINKS = [
  [
    "Product",
    [
      ["How it works", "#how"],
      ["The room", "#product"],
      ["Plans", "#plans"],
    ],
  ],
  [
    "Legal",
    [
      ["Privacy policy", "#"],
      ["Terms of use", "#"],
    ],
  ],
];

function useFrame(count, ms, still) {
  const [f, setF] = useState(still);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setF(0);
    const t = setInterval(() => setF((x) => (x + 1) % count), ms);
    return () => clearInterval(t);
  }, [count, ms]);
  return f;
}

// Real photo with an initial as fallback if the image fails to load.
function Photo({ p, className = "", focus = "object-top" }) {
  const [bad, setBad] = useState(false);
  if (bad)
    return (
      <span
        className={`grid place-items-center bg-slate-200 font-bold text-slate-500 ${className}`}
      >
        {p.name[0]}
      </span>
    );
  return (
    <img
      src={p.photo}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setBad(true)}
      className={`object-cover ${focus} ${className}`}
    />
  );
}

function MeetingMock() {
  const [mode, setMode] = useState("approval");
  return (
    <div>
      <div
        role="tablist"
        aria-label="How a room runs"
        className="mx-auto mb-6 flex w-fit rounded-full bg-slate-100 p-1"
      >
        {Object.entries(MODES).map(([key, m]) => (
          <button
            key={key}
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition duration-200 motion-reduce:transition-none ${
              mode === key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <Room key={mode} mode={mode} />
    </div>
  );
}

function Room({ mode }) {
  const { label, note, frames } = MODES[mode];
  const f = useFrame(frames.length, 2800, 2);
  const { s: speakers, q: queue, say } = frames[f];
  const full = speakers.length >= DEMO_CAP;
  const talking = speakers[f % speakers.length];

  return (
    <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_30px_80px_-30px_rgba(15,23,42,0.25)]">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5 text-sm">
        <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#2E9E8F] opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#2E9E8F]" />
        </span>
        <span className="font-semibold">Panel Q&amp;A</span>{" "}
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
          {label}
        </span>
        <span className="ml-auto hidden items-center gap-3 text-slate-500 sm:flex">
          {speakers.length} of {DEMO_CAP} on the floor · 46 listening
          <span className="flex gap-0.5" aria-hidden="true">
            {Array.from({ length: DEMO_CAP }).map((_, i) => (
              <i
                key={i}
                className={`h-1.5 w-3 rounded-full transition-colors duration-500 motion-reduce:transition-none ${i < speakers.length ? "bg-[#2E9E8F]" : "bg-slate-200"}`}
              />
            ))}
          </span>
        </span>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px]">
        <div className="p-5">
          <div
            className="grid grid-cols-3 gap-3"
            role="img"
            aria-label="Speakers on the floor, with open spots until the floor is full"
          >
            {Array.from({ length: DEMO_CAP }).map((_, slot) => (
              <div key={slot} className="relative aspect-[4/3]">
                <span className="absolute inset-0 grid place-items-center rounded-2xl border-2 border-dashed border-slate-200 text-xs text-slate-400">
                  Open spot
                </span>
                {PEOPLE.filter((p) => (p.id - 1) % DEMO_CAP === slot).map(
                  (p) => {
                    const on = speakers.includes(p.id);
                    return (
                      <div
                        key={p.id}
                        className={`absolute inset-0 overflow-hidden rounded-2xl bg-slate-200 transition-all duration-700 motion-reduce:transition-none ${
                          on ? "scale-100 opacity-100" : "scale-95 opacity-0"
                        } ${on && p.id === talking ? "ring-[3px] ring-[#2E9E8F]" : "ring-0 ring-transparent"}`}
                      >
                        <Photo
                          p={p}
                          focus="object-[50%_20%]"
                          className="h-full w-full"
                        />
                        <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-900 backdrop-blur">
                          {p.id === talking && (
                            <Bars className="bg-[#2E9E8F]" />
                          )}
                          {p.name}
                        </span>
                      </div>
                    );
                  },
                )}
              </div>
            ))}
          </div>

          <p className="mt-4 flex min-h-6 items-center justify-center gap-2 text-center text-sm text-slate-600">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#2E9E8F]"
              aria-hidden="true"
            />
            {say}
          </p>

          <div className="mt-4 flex items-center justify-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-700">
              <Icon d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v3" />
            </span>
            <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-700">
              <Icon d="m16 13 5 3.5V7.5L16 11 M3 6h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" />
            </span>
            <span
              className={`rounded-full px-6 py-3 text-sm font-semibold text-white transition-colors duration-500 motion-reduce:transition-none ${mode === "open" && !full ? "bg-[#2E9E8F]" : "bg-slate-900"}`}
            >
              {mode === "open" && !full ? "Join the floor" : "Raise hand"}
            </span>
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[#E5484D] text-white">
              <Icon d="M5 12h14" />
            </span>
          </div>
        </div>

        <aside className="border-t border-slate-100 p-5 lg:border-l lg:border-t-0">
          <div className="mb-4 flex items-center justify-between text-sm">
            <h3 className="font-semibold">Waiting to speak</h3>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
              {queue.length}
            </span>
          </div>
          <div className="relative h-[120px]" aria-hidden="true">
            <p
              className={`absolute inset-x-0 top-0 rounded-xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500 transition-opacity duration-500 motion-reduce:transition-none ${queue.length ? "opacity-0" : "opacity-100"}`}
            >
              {mode === "open"
                ? "No one is waiting. Free spots can be taken straight away."
                : "No hands raised yet."}
            </p>
            {PEOPLE.map((p) => {
              const q = queue.indexOf(p.id);
              return (
                <div
                  key={p.id}
                  className={`absolute inset-x-0 top-0 flex h-14 items-center gap-2 rounded-xl bg-slate-50 px-3 transition-all duration-500 ease-in-out motion-reduce:transition-none ${
                    q < 0
                      ? "-translate-y-3 opacity-0"
                      : `${QUEUE_ROW[q]} opacity-100`
                  }`}
                >
                  <Photo p={p} className="h-9 w-9 shrink-0 rounded-full" />
                  <span className="flex-1 truncate text-sm font-medium">
                    {p.name}
                  </span>
                  {mode === "approval" && q === 0 ? (
                    <>
                      <span className="rounded-md bg-[#6495c4] px-2 py-1 text-xs text-white">
                        Give floor
                      </span>
                      <span className="rounded-md border border-slate-300 px-2 py-1 text-xs">
                        Decline
                      </span>
                    </>
                  ) : q === 0 ? (
                    <span className="rounded-full bg-[#D5F0EB] px-2.5 py-0.5 text-xs font-semibold text-[#1f7a6d]">
                      Up next
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">#{q + 1}</span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">{note}</p>
        </aside>
      </div>
    </div>
  );
}
// ---- Page -------------------------------------------------------------------

export default function Home({ onStart, onEnter }) {
  const [open, setOpen] = useState(false);
  const dark =
    "inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-[#2E9E8F] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2E9E8F] motion-reduce:transition-none";

  return (
    <div className="min-h-screen scroll-smooth bg-white text-slate-900 antialiased">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <a
          href="#top"
          className="flex items-center gap-2 text-lg font-bold tracking-tight"
        >
          <img src={Selah} alt="Selah" className="w-25" />
        </a>
        <nav className="hidden items-center gap-8 text-sm text-slate-600 md:flex">
          <a href="#product" className="transition hover:text-slate-900">
            Product
          </a>
          <a href="#how" className="transition hover:text-slate-900">
            How it works
          </a>
          <a href="#plans" className="transition hover:text-slate-900">
            Plans
          </a>
        </nav>
        <button
          onClick={onStart}
          className="px-4 py-2 text-sm text-slate-100 font-semibold transition bg-[#6495c4] hover:text-white"
        >
          Start a Selah
        </button>
      </header>

      <main id="top">
        <section className="mx-auto grid max-w-6xl lg:items-center gap-10 px-6 pb-20 pt-10 lg:grid-cols-[0.7fr_1fr] md:items-start md:grid-cols-2 lg:pt-16">
          <div>
            <h1 className="text-[40px]! sm:text-[42px]! text-start font-semibold! leading-[1.1] text-black tracking-tight md:text-[45px]! lg:text-[60px]!">
              Big meetings, <span className="text-[#6495c4]">one voice</span> at
              a time
              <Sparkle className="ml-2 inline h-6 w-6 text-slate-900" />
            </h1>
            <p className="mt-6 text-justify max-w-md leading-relaxed text-slate-600">
              Hold town halls, classes and community calls where people raise a
              hand, join the queue, and speak when the host calls them.
            </p>
            <div className="my-4 flex flex-wrap items-center gap-5">
              <button onClick={() =>setOpen(true)} className={dark}>
                <Icon
                  d="m16 13 5 3.5V7.5L16 11 M3 6h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z"
                  className="h-4 w-4"
                />
                Start a Selah
              </button>
              <a
                href="#product"
                className="group flex items-center gap-3 text-sm font-semibold"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[#6495c4] text-white transition duration-200 group-hover:scale-105 motion-reduce:transition-none">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 fill-current"
                    aria-hidden="true"
                  >
                    <path d="M8 5v14l11-7Z" />
                  </svg>
                </span>
                See it in action
              </a>
            </div>
            <p className="text-sm text-start text-slate-500">
              Guests join with a link and a name. Free meetings run up to{" "}
              {LIMITS.minutes} minutes.
            </p>
          </div>
          <LetterBlocks />
        </section>

        <Wave fill="#EEF2F7" />
        <section className="bg-[#EEF2F7]">
          <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 md:grid-cols-[1fr_auto_1.2fr] md:items-center">
            <h2 className="text-3xl text-black font-semibold leading-tight tracking-tight">
              Ready to host your next big meeting?
            </h2>
            <span className="hidden h-24 w-px bg-slate-300 md:block" />
            <div>
              <p className="leading-relaxed text-slate-600">
                Selah keeps large groups orderly. Up to {LIMITS.speakers} people
                speak at once, everyone else listens, and the host decides who
                is next.
              </p>
              <a
                href="#how"
                className="mt-3 inline-block text-sm font-semibold text-[#6495c4] underline decoration-[#6495c4]/40 underline-offset-4 transition hover:decoration-[#6495c4]"
              >
                Learn more
              </a>
            </div>
          </div>
        </section>
        <Wave fill="#EEF2F7" flip />

        <section id="product" className="mx-auto max-w-6xl px-6 pb-20 pt-4">
          <div className="mb-10 text-center">
            <h2 className="text-3xl text-black font-semibold tracking-tight sm:text-4xl">
              <svg
                viewBox="0 0 40 24"
                className="mr-3 inline h-6 w-9 text-[#6495c4]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="9" cy="8" r="1" />
                <circle cx="25" cy="8" r="1" />
                <path d="M5 15q10 9 24 0" />
              </svg>
              A room built for turn-taking
            </h2>
            <div className="mx-auto mt-3 max-w-md">
              <p className=" text-center mt-3 text-slate-600">
                Watch the queue move: each person takes the floor, finishes, and
                the next hand goes up.
              </p>
            </div>
          </div>
          <MeetingMock />
        </section>

        <section id="how" className="mx-auto max-w-6xl px-6 pb-20">
          <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([t, b], i) => (
              <li key={t} className="flex gap-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#6495c4] text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{t}</h3>
                  <p className="mt-1 text-sm text-slate-600">{b}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto grid max-w-6xl gap-10 px-6 pb-24 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="group text-center">
              <span
                className={`relative mx-auto grid h-16 w-16 place-items-center rounded-2xl transition duration-300 group-hover:-rotate-6 motion-reduce:transition-none ${f.tint}`}
              >
                <Icon d={f.icon} className="h-7 w-7 text-slate-900" />
              </span>
              <h3 className="mt-5 font-semibold">{f.title}</h3>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-600">
                {f.body}
              </p>
            </div>
          ))}
        </section>

        <section id="plans" className="mx-auto max-w-6xl px-6 pb-24">
          <h2 className="text-center text-black text-3xl font-semibold tracking-tight">
            Start free. Grow when your room does.
          </h2>
          <div className="mt-10 grid divide-slate-200 md:grid-cols-3 md:divide-x">
            {PLANS.map(([name, note, items], i) => (
              <div
                key={name}
                className={`px-8 py-4 ${i === 0 ? "" : "text-slate-500"}`}
              >
                <h3
                  className={`text-xl font-semibold ${i === 0 ? "text-slate-900" : ""}`}
                >
                  {name}
                </h3>
                <p
                  className={`text-sm ${i === 0 ? "font-semibold text-[#6495c4]" : ""}`}
                >
                  {note}
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  {items.map((it) => (
                    <li key={it} className="flex gap-2">
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${i === 0 ? "bg-[#6495c4]" : "bg-slate-300"}`}
                      />
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </main>

      <Wave fill="#EEF2F7" />
      <footer className="bg-[#EEF2F7] px-6 pb-8 pt-6 text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <h2 className="max-w-md  text-black text-3xl font-semibold tracking-tight">
            Give your next meeting some order.
          </h2>
          <a
            onClick={() => setOpen(true)} 
            className="group flex items-center gap-3 text-sm text-[#8fb8d8] font-semibold"
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-[#6495c4] text-white transition duration-200 group-hover:scale-105 motion-reduce:transition-none">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 fill-current"
                aria-hidden="true"
              >
                <path d="M8 5v14l11-7Z" />
              </svg>
            </span>
            Start a Selah
          </a>
        </div>

        <div className="mx-auto mt-14 grid max-w-6xl gap-10 border-t border-[#8fb8d8] pt-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <a
              href="#top"
              className="flex justify-center mb-4 w-fit rounded-full items-center gap-2 text-lg font-bold tracking-tight"
            >
              <img src={Selah} alt="Selah" className="w-25" />
            </a>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-900">
              Video meetings for large groups, with a speaking queue so every
              voice gets a turn.
            </p>
          </div>
          {FOOTER_LINKS.map(([heading, links]) => (
            <nav key={heading} aria-label={heading}>
              <h3 className="text-sm text-[#6495c4] font-semibold">
                {heading}
              </h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-400">
                {links.map(([label, href]) => (
                  <li key={label}>
                    <a
                      href={href}
                      className="transition text-black hover:text-white"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mx-auto mt-12 flex max-w-6xl flex-col justify-between gap-2 border-t border-[#8fb8d8] pt-6 text-sm text-slate-400 sm:flex-row">
          <span>
            &copy; {new Date().getFullYear()} Selah. All rights reserved.
          </span>
          <span>
            A product of{" "}
            {COMPANY.url ? (
              <a
                href={COMPANY.url}
                className="font-semibold text-white underline decoration-slate-600 underline-offset-4 transition hover:decoration-white"
              >
                {COMPANY.name}
              </a>
            ) : (
              <span className="font-semibold text-[#6495c4]">
                {COMPANY.name}
              </span>
            )}
          </span>
        </div>
      </footer>
      <StartModal open={open} onClose={() => setOpen(false)} onEnter={onEnter} />
    </div>
  );
}
