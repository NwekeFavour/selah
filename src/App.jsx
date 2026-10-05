import { useEffect, useState } from "react";
import { ApiError, api } from "./api";
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

const joinedKey = (roomCode) => `selah.joined.${roomCode}`;

export default function App() {
  const [code, setCode] = useState(codeFromUrl());
  const [name, setName] = useState(localStorage.getItem("selah.name") ?? "");
  const [joined, setJoined] = useState(null);
  const [resuming, setResuming] = useState(() => Boolean(code && sessionStorage.getItem(joinedKey(code))));
  const [waitingForHost, setWaitingForHost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Keep the screen in step with the browser's back and forward buttons.
  useEffect(() => {
    const onPop = () => {
      const nextCode = codeFromUrl();
      setCode(nextCode);
      setResuming(Boolean(nextCode && sessionStorage.getItem(joinedKey(nextCode))));
      setJoined(null);
      setWaitingForHost(false);
      setError("");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // A refresh loses React state, so reissue a LiveKit token for rooms joined in this tab.
  useEffect(() => {
    if (!code || !sessionStorage.getItem(joinedKey(code))) return;
    let active = true;
    const displayName = localStorage.getItem("selah.name") ?? "";
    const hostKey = localStorage.getItem(`selah.host.${code}`) ?? undefined;

    api.join(code, displayName, guestId(), hostKey)
      .then((result) => {
        if (active) setJoined(result);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => {
        if (active) setResuming(false);
      });

    return () => {
      active = false;
    };
  }, [code]);

  // Guests wait here until the host opens the room; retry below the API rate limit.
  useEffect(() => {
    if (!waitingForHost || !code) return;

    let active = true;
    let timer;
    async function retryJoin() {
      try {
        const displayName = localStorage.getItem("selah.name") ?? "";
        const hostKey = localStorage.getItem(`selah.host.${code}`) ?? undefined;
        const result = await api.join(code, displayName, guestId(), hostKey);
        if (!active) return;
        sessionStorage.setItem(joinedKey(code), "1");
        setWaitingForHost(false);
        setJoined(result);
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.status === 425) {
          timer = window.setTimeout(retryJoin, 3000);
          return;
        }
        setWaitingForHost(false);
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    }

    timer = window.setTimeout(retryJoin, 3000);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [waitingForHost, code]);

  // Called by the "Start a Selah" modal once the host has a meeting.
  function enter(roomCode) {
    window.history.pushState({}, "", `/r/${roomCode}`);
    setCode(roomCode);
    setResuming(false);
    setWaitingForHost(false);
    setError("");
  }

  function goHome() {
    window.history.pushState({}, "", "/");
    setCode(null);
    setResuming(false);
    setWaitingForHost(false);
    setError("");
  }

  async function join(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      localStorage.setItem("selah.name", name.trim());
      const hostKey = localStorage.getItem(`selah.host.${code}`) ?? undefined;
      const result = await api.join(code, name.trim(), guestId(), hostKey);
      sessionStorage.setItem(joinedKey(code), "1");
      setJoined(result);
    } catch (err) {
      if (err instanceof ApiError && err.status === 425) {
        setWaitingForHost(true);
        return;
      }
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function leave() {
    if (code) sessionStorage.removeItem(joinedKey(code));
    setJoined(null);
  }

  if (joined && code) {
    return <Room code={code} join={joined} onLeave={leave} onDisconnected={() => setJoined(null)} />;
  }

  if (!code) {
    return <Home onEnter={enter} />;
  }

  const isHost = Boolean(localStorage.getItem(`selah.host.${code}`));

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-6 text-slate-900 antialiased">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5">
        <img src={Selah} alt="Selah" className="h-8 w-auto" />
        {waitingForHost ? (
          <>
            <h1 className="mt-6 text-2xl font-semibold tracking-tight">Waiting for the host</h1>
            <p role="status" className="mt-2 text-sm text-slate-600">
              You’ll join automatically when the host opens the call.
            </p>
            <button
              type="button"
              onClick={() => setWaitingForHost(false)}
              className="mt-6 text-sm pe-7 text-slate-500 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-900"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
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
                disabled={busy || resuming || !name.trim()}
              >
                {resuming ? "Rejoining…" : busy ? "Joining…" : isHost ? "Open the room" : "Join Selah"}
              </button>
            </form>
          </>
        )}

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