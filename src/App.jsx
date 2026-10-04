import { useEffect, useState } from "react";
import { api } from "./api";
import Room from "./Room";
import Home from "./home";
import Selah from "./assets/selah.webp";

function guestId() {
  let id = localStorage.getItem("selah.guest");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("selah.guest", id);
  }
  return id;
}

const codeFromUrl = () =>
  window.location.pathname.match(/^\/r\/([\w-]+)/)?.[1] ?? null;

export default function App() {
  const [code, setCode] = useState(codeFromUrl());
  const [name, setName] = useState(localStorage.getItem("selah.name") ?? "");
  const [joined, setJoined] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Keep the screen in step with the browser's back and forward buttons.
  useEffect(() => {
    const onPop = () => {
      setCode(codeFromUrl());
      setJoined(null);
      setError("");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Called by the "Start a Selah" modal once the host has a meeting.
  function enter(roomCode) {
    window.history.pushState({}, "", `/r/${roomCode}`);
    setCode(roomCode);
    setError("");
  }

  function goHome() {
    window.history.pushState({}, "", "/");
    setCode(null);
    setError("");
  }

  async function join(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      localStorage.setItem("selah.name", name.trim());
      const hostKey = localStorage.getItem(`selah.host.${code}`) ?? undefined;
      setJoined(await api.join(code, name.trim(), guestId(), hostKey));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (joined && code) {
    return <Room code={code} join={joined} onLeave={() => setJoined(null)} />;
  }

  if (!code) {
    return <Home onEnter={enter} />;
  }

  const isHost = Boolean(localStorage.getItem(`selah.host.${code}`));

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-6 text-slate-900 antialiased">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5">
        <img src={Selah} alt="Selah" className="h-8 w-auto" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          {isHost ? "Join as host" : "Join this Selah"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {isHost
            ? "Enter your name to open the room. You will run the floor from here."
            : "Enter your name to join. No account needed."}
        </p>

        <form className="mt-6 flex flex-col gap-3" onSubmit={join}>
          <label className="text-sm font-medium" htmlFor="name">
            Your name
          </label>
          <input
            id="name"
            autoFocus
            className="rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-[#6495c4] focus:ring-4 focus:ring-[#6495c4]/20"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            required
          />
          <button
            className="mt-2 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white transition duration-200 hover:bg-[#6495c4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6495c4] disabled:opacity-50 motion-reduce:transition-none"
            disabled={busy || !name.trim()}
          >
            {busy ? "Joining…" : isHost ? "Open the room" : "Join Selah"}
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-4 text-sm text-[#E5484D]">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={goHome}
          className="mt-6 text-sm text-slate-500 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-900"
        >
          Back to home
        </button>
      </div>
    </main>
  );
}