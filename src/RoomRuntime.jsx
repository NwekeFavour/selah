import { useCallback, useEffect, useRef, useState } from "react";
import {
  useDataChannel,
  useLocalParticipant,
  useParticipants,
  useTracks,
  isTrackReference,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { toast } from "sonner";
import { ApiError, api } from "./api";
import RoomView from "./RoomView";
import { REACTIONS } from "./roomConstants";

export default function RoomRuntime({ code, join, theme, onToggleTheme, onLeave, onMeetingEnded }) {
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
  return <RoomView v={{
    code,
    join,
    theme,
    onToggleTheme,
    snap,
    me,
    isHost,
    isSpeaker,
    canSpeak,
    inQueue,
    canJoinNow,
    floorFull,
    micOn,
    cameraOn,
    isScreenShareEnabled,
    anotherScreenIsShared,
    screenShareTrack,
    mainPerson,
    thumbs,
    onStage,
    listeners,
    activeQueue,
    peopleCount,
    activeSpeakerCount,
    showSpeakersTab,
    selectedTab,
    setTab,
    pinnedAnnouncements,
    sharedMessages,
    activeAnnouncementIndex,
    setAnnouncementIndex,
    beginAnnouncementSwipe,
    finishAnnouncementSwipe,
    announcementPointerStart,
    tracks,
    participants,
    setPinnedId,
    reactions,
    reactionPickerOpen,
    setReactionPickerOpen,
    react,
    act,
    busyActions,
    floorBusy,
    joinFloor,
    raiseHand,
    lowerHand,
    toggle,
    localParticipant,
    toggleScreenShare,
    screenShareBusy,
    leaveCall,
    leaving,
    endMeeting,
    ending,
    requestConfirmation,
    hostNotice,
    error,
    setError,
    questionInbox,
    questionUnread,
    questionError,
    setQuestionError,
    exportQuestions,
    moderateQuestion,
    publishQuestion,
    blockQuestionSender,
    announcementText,
    setAnnouncementText,
    announcementBusy,
    createAnnouncement,
    removeAnnouncement,
    editAnnouncement,
    askOpen,
    setAskOpen,
    questionText,
    setQuestionText,
    questionSent,
    setQuestionSent,
    editingQuestionId,
    setEditingQuestionId,
    anonymousQuestion,
    setAnonymousQuestion,
    questionBusy,
    submitQuestion,
    myQuestions,
    deleteMyQuestion,
    confirmation,
    setConfirmation,
    confirmationBusy,
    confirmRequestedAction,
  }} />;
}
