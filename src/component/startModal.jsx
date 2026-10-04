import { useEffect, useRef, useState } from "react";
import { api } from "../api";

const MODES = [
  { key: "approval", title: "Host approval", body: "You approve each speaker from the queue." },
  { key: "open", title: "Open floor", body: "Anyone can speak while spots are free. Hands queue up once it is full." },
];

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled])";

export default function StartModal({ open, onClose, onEnter }) {
  const [shown, setShown] = useState(false);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState("approval");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState(null);
  const [copied, setCopied] = useState(false);
  const panel = useRef(null);
  const nameInput = useRef(null);
  const linkInput = useRef(null);
  const copyBtn = useRef(null);

  const link = code ? `${window.location.origin}/r/${code}` : "";

  function close() {
    setShown(false);
    setTimeout(() => {
      onClose();
      setCode(null);
      setTitle("");
      setError("");
      setCopied(false);
    }, 200);
  }

  // Open: animate in, lock page scroll, trap focus, close on Escape, restore focus after.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => {
      setShown(true);
      nameInput.current?.focus();
    });

    function onKey(e) {
      if (e.key === "Escape") return close();
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Move focus to the copy button once the link exists.
  useEffect(() => {
    if (code) copyBtn.current?.focus();
  }, [code]);

  if (!open) return null;

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const room = await api.createRoom(title.trim(), mode);
      localStorage.setItem(`selah.host.${room.code}`, room.host_key);
      setCode(room.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the meeting. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      linkInput.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className={`fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none ${
        shown ? "opacity-100" : "opacity-0"
      }`}
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-title"
        className={`relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl shadow-slate-900/20 transition duration-300 ease-out motion-reduce:transition-none sm:p-8 ${
          shown ? "translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-95 opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        {!code ? (
          <form onSubmit={create}>
            <h2 id="start-title" className="pr-8 text-2xl font-semibold tracking-tight">Start a Selah</h2>
            <p className="mt-1 text-sm text-slate-600">Name it, pick how the floor works, and get a link to share.</p>

            <label htmlFor="meeting-name" className="mt-6 block text-sm font-medium">
              Meeting name <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="meeting-name"
              ref={nameInput}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="Panel Q&A"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-[#6495c4] focus:ring-4 focus:ring-[#6495c4]/20"
            />

            <fieldset className="mt-5">
              <legend className="text-sm font-medium">How should the floor work?</legend>
              <div className="mt-2 grid gap-3">
                {MODES.map((m) => (
                  <label
                    key={m.key}
                    className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-slate-300 has-[:checked]:border-[#6495c4] has-[:checked]:bg-[#6495c4]/10 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[#6495c4]/20"
                  >
                    <input
                      type="radio"
                      name="mode"
                      value={m.key}
                      checked={mode === m.key}
                      onChange={() => setMode(m.key)}
                      className="mt-1 h-4 w-4 accent-[#6495c4]"
                    />
                    <span>
                      <span className="block font-semibold">{m.title}</span>
                      <span className="mt-0.5 block text-sm text-slate-600">{m.body}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {error && <p role="alert" className="mt-4 text-sm text-[#E5484D]">{error}</p>}

            <button
              disabled={busy}
              className="mt-6 w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white transition duration-200 hover:bg-[#6495c4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6495c4] disabled:opacity-60 motion-reduce:transition-none"
            >
              {busy ? "Creating your Selah…" : "Create meeting"}
            </button>
          </form>
        ) : (
          <div>
            <span className="grid h-12 w-12 place-items-center rounded-full bg-[#6495c4]/15 text-[#6495c4]">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <h2 id="start-title" className="mt-4 text-2xl font-semibold tracking-tight">Your Selah is ready</h2>
            <p className="mt-1 text-sm text-slate-600">Share this link. Guests join with just a name.</p>

            <div className="mt-6 flex gap-2">
              <input
                ref={linkInput}
                readOnly
                value={link}
                aria-label="Meeting link"
                onFocus={(e) => e.target.select()}
                className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-[#6495c4]"
              />
              <button
                ref={copyBtn}
                type="button"
                onClick={copy}
                className={`shrink-0 rounded-xl px-4 py-3 text-sm font-semibold text-white transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6495c4] motion-reduce:transition-none ${
                  copied ? "bg-[#2E9E8F]" : "bg-[#6495c4] hover:bg-slate-900"
                }`}
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
            <p className="sr-only" aria-live="polite">{copied ? "Link copied to clipboard" : ""}</p>

            <button
              type="button"
              onClick={() => onEnter(code)}
              className="mt-6 w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white transition duration-200 hover:bg-[#6495c4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6495c4] motion-reduce:transition-none"
            >
              Enter as host
            </button>
            <p className="mt-3 text-center text-xs text-slate-500">
              You host from this browser. Anyone who opens the link on another device joins as a guest.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}