import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "./api";
import Room from "./Room";
import Home from "./home";
import Selah from "./assets/selah.webp";
import { Avatar, AvatarPicker } from "./avatar";
import { avatarBg, avatarFromIdentity, getSavedAvatar, randomAvatar, saveAvatar } from "./avatarData";

const codeFromUrl = () =>
  window.location.pathname.match(/^\/r\/([\w-]+)/)?.[1] ?? null;

const joinedKey = (roomCode) => `selah.joined.${roomCode}`;
const hostMeetingKey = (roomCode) => `selah.host.title.${roomCode}`;
const hostMarkerKey = (roomCode) => `selah.hostroom.${roomCode}`;
const hostAccessKey = (roomCode) => sessionStorage.getItem(`selah.host.key.${roomCode}`) ?? undefined;
const guestIdentityKey = (roomCode) => `selah.guest.${roomCode}`;

function guestIdentityFor(roomCode) {
  let identity = sessionStorage.getItem(guestIdentityKey(roomCode));
  if (!identity) {
    identity = crypto.randomUUID();
    sessionStorage.setItem(guestIdentityKey(roomCode), identity);
  }
  return identity;
}

function clearLegacyCredentials() {
  localStorage.removeItem("selah.guest");
  const legacyHostKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key) => key?.startsWith("selah.host.") && !key.startsWith("selah.host.title."));
  legacyHostKeys.forEach((key) => localStorage.removeItem(key));
}

clearLegacyCredentials();

function removeSavedHostMeeting(roomCode) {
  sessionStorage.removeItem(`selah.host.key.${roomCode}`);
  localStorage.removeItem(`selah.host.${roomCode}`);
  localStorage.removeItem(hostMarkerKey(roomCode));
  localStorage.removeItem(hostMeetingKey(roomCode));
}

function clearRoomSession(roomCode) {
  sessionStorage.removeItem(joinedKey(roomCode));
  localStorage.removeItem(`selah.avatar.${roomCode}`);
  removeSavedHostMeeting(roomCode);
}

export default function App() {
  const [code, setCode] = useState(codeFromUrl());
  const [name, setName] = useState(localStorage.getItem("selah.name") ?? "");
  const [joined, setJoined] = useState(null);
  const [resuming, setResuming] = useState(() => Boolean(code && sessionStorage.getItem(joinedKey(code))));
  const [waitingForHost, setWaitingForHost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const goHome = useCallback(() => {
    window.history.pushState({}, "", "/");
    setCode(null);
    setResuming(false);
    setWaitingForHost(false);
    setError("");
  }, []);

  const handleMeetingEnded = useCallback(() => {
    if (code) clearRoomSession(code);
    goHome();
  }, [code, goHome]);

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

    api.join(
      code,
      displayName,
      getSavedAvatar(code) ?? avatarFromIdentity(`${code}:${displayName}`),
      hostAccessKey(code),
      guestIdentityFor(code),
    )
      .then((result) => {
        if (active) setJoined(result);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && [401, 403, 410].includes(err.status)) {
          clearRoomSession(code);
          if (err.status === 410) {
            handleMeetingEnded();
            return;
          }
          setError("Your previous session expired. Please rejoin the meeting.");
          return;
        }
        setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => {
        if (active) setResuming(false);
      });

    return () => {
      active = false;
    };
  }, [code, handleMeetingEnded]);

  // Guests wait here until the host opens the room; retry below the API rate limit.
  useEffect(() => {
    if (!waitingForHost || !code) return;

    let active = true;
    let timer;
    async function retryJoin() {
      const isHost = localStorage.getItem(hostMarkerKey(code)) !== null;
      try {
        const displayName = localStorage.getItem("selah.name") ?? "";
        const result = await api.join(
          code,
          displayName,
          getSavedAvatar(code) ?? avatarFromIdentity(`${code}:${displayName}`),
          hostAccessKey(code),
          guestIdentityFor(code),
        );
        if (!active) return;
        sessionStorage.setItem(joinedKey(code), "1");
        setWaitingForHost(false);
        setJoined(result);
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.status === 425) {
          if (isHost) {
            setWaitingForHost(false);
            setError("This browser could not verify host access. Open this meeting in the same tab and browser that created it. Meetings created before this fix may need to be started again.");
            return;
          }
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

  async function join(e, selectedAvatar) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const isHost = localStorage.getItem(hostMarkerKey(code)) !== null;
    try {
      localStorage.setItem("selah.name", name.trim());
      saveAvatar(code, getSavedAvatar(code) ?? selectedAvatar);
      const result = await api.join(
        code,
        name.trim(),
        getSavedAvatar(code),
        hostAccessKey(code),
        guestIdentityFor(code),
      );
      sessionStorage.setItem(joinedKey(code), "1");
      setJoined(result);
    } catch (err) {
      if (err instanceof ApiError && err.status === 425) {
        if (isHost) {
          setError("This browser could not verify host access. Open this meeting in the same tab and browser that created it. Meetings created before this fix may need to be started again.");
          return;
        }
        setWaitingForHost(true);
        return;
      }
      if (err instanceof ApiError && err.status === 410 && isHost) {
        clearRoomSession(code);
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
    return (
      <Room
        code={code}
        join={joined}
        onLeave={leave}
        onDisconnected={() => setJoined(null)}
        onMeetingEnded={handleMeetingEnded}
      />
    );
  }

  if (!code) {
    return <Home onEnter={enter} />;
  }

  const isHost = localStorage.getItem(hostMarkerKey(code)) !== null;

  return (
    <JoinScreen
      key={code}
      code={code}
      name={name}
      setName={setName}
      isHost={isHost}
      waitingForHost={waitingForHost}
      resuming={resuming}
      busy={busy}
      error={error}
      onDismissError={() => setError("")}
      onCancelWait={() => setWaitingForHost(false)}
      onJoin={join}
      onHome={goHome}
    />
  );
}

// Needs the imports you already have (useState, Selah, Avatar, AvatarPicker, getSavedAvatar, randomAvatar, avatarBg)
// plus one more: add avatarFromIdentity to your "./avatarData" import.

const SAMPLE = ["selah-host", "selah-ana", "selah-kofi", "selah-ife"].map((id) => avatarFromIdentity(id));

// Mini version of the room: shows the person how they will appear, live.
function JoinPreview({ isHost, code, name }) {
  const me = { code, name: name.trim() || "You" };
  const main = isHost ? { ...me, host: true } : { code: SAMPLE[0], host: true };
  const thumbs = isHost
    ? [SAMPLE[1], SAMPLE[2], SAMPLE[3]].map((c) => ({ code: c }))
    : [{ ...me, you: true }, { code: SAMPLE[2] }, { code: SAMPLE[3] }];

  return (
    <div
      className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl shadow-[0_10px_30px_-12px_rgba(15,23,42,0.25)]"
      aria-hidden="true"
    >
      <div className="absolute inset-0" style={{ background: avatarBg(main.code) }}>
        <Avatar code={main.code} className="h-full w-full" />
      </div>
      <div className="absolute left-3 top-3 flex items-center gap-2">
        <span className="rounded-lg bg-[#1F8F78] px-2 py-1 text-[11px] font-semibold text-white">Host</span>
      </div>
      <div className="absolute bottom-3 right-3 top-3 flex flex-col gap-2">
        {thumbs.map((t, i) => (
          <div
            key={i}
            className={`relative h-14 w-14 overflow-hidden rounded-xl shadow-md ring-2 ${t.you ? "ring-[#1F8F78]" : "ring-white"}`}
            style={{ background: avatarBg(t.code) }}
          >
            <Avatar code={t.code} className="h-full w-full" />
            {t.you && (
              <span className="absolute inset-x-0 bottom-0 bg-[#1F8F78] py-0.5 text-center text-[9px] font-semibold text-white">
                You
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function JoinScreen({
  code,
  name,
  setName,
  isHost,
  waitingForHost,
  resuming,
  busy,
  error,
  onDismissError,
  onCancelWait,
  onJoin,
  onHome,
}) {
  const savedAvatar = getSavedAvatar(code);
  const [avatar, setAvatar] = useState(() => savedAvatar ?? randomAvatar());

  return (
    <main className="grid min-h-screen place-items-center bg-[#EEF1F5] px-4 py-8 text-slate-900 antialiased">
      <div className="w-full max-w-4xl">
        <div className="grid overflow-hidden rounded-[28px] bg-white shadow-[0_20px_60px_-20px_rgba(15,23,42,0.18)] md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          {/* Left: how you'll appear (desktop only) */}
          <aside className="hidden md:grid grid-cols-1 justify-between  bg-[#E3F3EE] p-8">
            <img src={Selah} alt="Selah" className="h-10 mb-4 w-[110px] object-contain object-left" />
            <div className="flex flex-col gap-5">
              <JoinPreview isHost={isHost} code={savedAvatar || avatar} name={name} />
              <div>
                <p className="text-[15px] font-semibold text-slate-900">
                  {isHost ? "You'll be on the main stage" : "Listen first, speak when you're ready"}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
                  {isHost
                    ? "Guests see you first. Speakers you approve appear beside you."
                    : "Raise your hand to join the floor and you'll appear beside the host like this."}
                </p>
              </div>
            </div>
          </aside>

          {/* Right: form */}
          <section className="flex flex-col p-6 sm:p-8">
            <img src={Selah} alt="Selah" className="mb-6 h-10 w-[110px] object-contain object-left md:hidden" />

            {waitingForHost ? (
              <div className="my-auto py-4">
                <div
                  className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-[#1F8F78] motion-reduce:animate-none"
                  aria-hidden="true"
                />
                <h1 className="m-0! mt-6! text-[26px]! font-bold leading-[1.1] tracking-[-0.02em] text-slate-900 md:text-[32px]!">
                  Waiting for the host
                </h1>
                <p role="status" className="mt-2 text-[15px] leading-snug text-slate-500">
                  You’ll join automatically when the host opens the call.
                </p>
                <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-[13px] leading-snug text-slate-500">
                  If you created this meeting, reopen it from <strong className="text-slate-700">Your meetings</strong> using the same device you used to create it. The invite link provides guest access.
                </p>
                <button
                  type="button"
                  onClick={onCancelWait}
                  className="mt-6 w-full rounded-xl border border-[#E4E8EE] bg-white px-5 py-3.5 text-[15px] font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F8F78] motion-reduce:transition-none motion-reduce:active:scale-100"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <h1 className="m-0! text-[26px]! font-bold leading-[1.1] tracking-[-0.02em] text-slate-900 md:text-[32px]!">
                  {isHost ? "Join as host" : "Join this Selah"}
                </h1>
                <p className="mt-2 text-[14px] leading-snug text-slate-500">
                  {isHost
                    ? "Enter your name to open the room. You will run the floor from here."
                    : "Enter your name to join. No account needed."}
                </p>

                <form className="mt-6 flex flex-col gap-5" onSubmit={(event) => onJoin(event, avatar)}>
                  <fieldset>
                    <legend className="sr-only">{savedAvatar ? "Your avatar for this Selah" : "Choose your avatar"}</legend>
                    {savedAvatar ? (
                      <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-3">
                        <div
                          className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl ring-1 ring-slate-200"
                          style={{ background: avatarBg(savedAvatar) }}
                        >
                          <Avatar code={savedAvatar} className="h-full w-full" />
                        </div>
                        <p className="text-[13px] leading-snug text-slate-500">This choice is locked for this meeting.</p>
                      </div>
                    ) : (
                      <AvatarPicker value={avatar} onChange={setAvatar} />
                    )}
                  </fieldset>

                  <div>
                    <label htmlFor="name" className="mb-1.5 block text-[13px] font-medium text-slate-600">
                      Your name
                    </label>
                    <input
                      id="name"
                      autoFocus
                      placeholder="e.g. Ada Obi"
                      className="w-full rounded-xl border border-[#E4E8EE] bg-white px-4 py-3.5 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-[#1F8F78] focus:ring-4 focus:ring-[#1F8F78]/15 motion-reduce:transition-none"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={40}
                      required
                    />
                  </div>

                  <button
                    className="w-full rounded-xl bg-[#1F8F78] px-5 py-3.5 text-[15px] font-semibold text-white transition duration-150 hover:bg-[#187A66] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F8F78] disabled:bg-slate-200 disabled:text-slate-400 motion-reduce:transition-none motion-reduce:active:scale-100"
                    disabled={busy || resuming || !name.trim()}
                  >
                    {resuming ? "Rejoining…" : busy ? "Joining…" : isHost ? "Open the room" : "Join Selah"}
                  </button>
                </form>
              </>
            )}

            {error && (
              <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm">
                <section
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="join-error-title"
                  aria-describedby="join-error-message"
                  className="w-full max-w-sm rounded-2xl border border-red-100 bg-white p-5 shadow-2xl"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-50 text-[#E5484D]" aria-hidden="true">
                      !
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 id="join-error-title" className="text-base font-semibold text-slate-900">
                        Couldn’t join the meeting
                      </h2>
                      <p id="join-error-message" className="mt-1 text-sm leading-relaxed text-slate-600">
                        {error}
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 flex justify-end">
                    <button
                      type="button"
                      onClick={onDismissError}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6495c4]"
                    >
                      Cancel
                    </button>
                  </div>
                </section>
              </div>
            )}
          </section>
        </div>

        <button
          type="button"
          onClick={onHome}
          className="mt-4 text-[14px] text-slate-500 transition hover:text-slate-900 active:opacity-50 motion-reduce:transition-none"
        >
          ← Back to home
        </button>
      </div>
    </main>
  );
}