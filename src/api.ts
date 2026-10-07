import type { JoinResult, Mode, Question, Snapshot } from "./types";

const BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api").replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// The server answers errors as {"detail": "..."} or, for bad input, {"field": ["message"]}.
function messageFrom(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d.detail === "string") return d.detail;
    const first = (Object.values(d) as unknown[]).flat()[0];
    if (typeof first === "string") return first;
  }
  return `Something went wrong (${status}).`;
}

async function call<T>(
  path: string,
  body?: unknown,
  session?: string,
  method?: string,
  responseType: "json" | "blob" = "json",
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      credentials: "include",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(session ? { Authorization: `Bearer ${session}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(messageFrom(data, res.status), res.status);
  }
  return responseType === "blob" ? res.blob() as Promise<T> : res.json() as Promise<T>;
}

export const api = {
  createRoom: (title: string, mode: Mode = "approval") =>
    call<{ code: string; host_key: string }>("/rooms/", { title, mode }),
  join: (
    code: string,
    display_name: string,
    avatar?: string,
    host_key?: string,
    guest_id?: string,
  ) => call<JoinResult>(`/rooms/${code}/join/`, { display_name, avatar, host_key, guest_id }),
  meetingStatus: (code: string) => call<{ ended: boolean }>(`/rooms/${code}/status/`),
  state: (code: string, session: string) => call<Snapshot>(`/rooms/${code}/state/`, undefined, session),
  leave: (code: string, session: string) => call<Snapshot>(`/rooms/${code}/leave/`, {}, session),
  end: (code: string, session: string) => call<Snapshot>(`/rooms/${code}/end/`, {}, session),

  // Raise a hand. In an open room with a free spot this puts you on the floor straight away.
  raiseHand: (code: string, s: string) => call<Snapshot>(`/rooms/${code}/hand/`, {}, s),
  lowerHand: (code: string, s: string) => call<Snapshot>(`/rooms/${code}/hand/lower/`, {}, s),

  // Host actions (release also works for a speaker handing over their own turn).
  grant: (code: string, s: string, identity: string) =>
    call<Snapshot>(`/rooms/${code}/floor/grant/`, { identity }, s),
  reject: (code: string, s: string, identity: string) =>
    call<Snapshot>(`/rooms/${code}/floor/reject/`, { identity }, s),
  release: (code: string, s: string, identity: string) =>
    call<Snapshot>(`/rooms/${code}/floor/release/`, { identity }, s),
  remove: (code: string, s: string, identity: string) =>
    call<Snapshot>(`/rooms/${code}/floor/remove/`, { identity }, s),
  updateSettings: (code: string, s: string, settings: {
    mode?: Mode;
    speaker_limit?: number;
    questions_enabled?: boolean;
    anonymous_questions_enabled?: boolean;
  }) =>
    call<Snapshot>(`/rooms/${code}/settings/`, settings, s),
  myQuestions: (code: string, s: string) =>
    call<Question[]>(`/rooms/${code}/questions/`, undefined, s),
  submitQuestion: (code: string, s: string, question: {
    text: string;
    anonymous: boolean;
  }) => call<Question>(`/rooms/${code}/questions/`, question, s),
  editMyQuestion: (code: string, s: string, questionId: number, text: string) =>
    call<Question>(`/rooms/${code}/questions/${questionId}/`, { text }, s, "PATCH"),
  deleteMyQuestion: (code: string, s: string, questionId: number) =>
    call<{ deleted: boolean }>(`/rooms/${code}/questions/${questionId}/`, undefined, s, "DELETE"),
  questionInbox: (code: string, s: string) =>
    call<Question[]>(`/rooms/${code}/questions/inbox/`, undefined, s),
  moderateQuestion: (code: string, s: string, questionId: number, action: "answered" | "dismissed") =>
    call<Question>(`/rooms/${code}/questions/${questionId}/moderate/`, { action }, s),
  blockQuestionSender: (code: string, s: string, questionId: number) =>
    call<{ blocked: boolean }>(`/rooms/${code}/questions/${questionId}/block/`, {}, s),
  inviteQuestionSender: (code: string, s: string, questionId: number) =>
    call<Snapshot>(`/rooms/${code}/questions/${questionId}/invite/`, {}, s),
  publishQuestion: (code: string, s: string, questionId: number) =>
    call<Snapshot>(`/rooms/${code}/questions/${questionId}/publish/`, {}, s),
  createAnnouncement: (code: string, s: string, text: string) =>
    call<Snapshot>(`/rooms/${code}/announcements/`, { text }, s),
  deleteAnnouncement: (code: string, s: string, announcementId: number) =>
    call<Snapshot>(`/rooms/${code}/announcements/${announcementId}/`, undefined, s, "DELETE"),
  editAnnouncement: (code: string, s: string, announcementId: number, text: string) =>
    call<Snapshot>(`/rooms/${code}/announcements/${announcementId}/`, { text }, s, "PATCH"),
  exportQuestions: (code: string, s: string) =>
    call<Blob>(`/rooms/${code}/questions/export/`, undefined, s, undefined, "blob"),
  startScreenShare: (code: string, s: string) =>
    call<{ identity: string; name: string }>(`/rooms/${code}/screen-share/start/`, {}, s),
  stopScreenShare: (code: string, s: string) =>
    call<{ stopped: boolean }>(`/rooms/${code}/screen-share/stop/`, {}, s),
};