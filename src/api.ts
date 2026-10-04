import type { JoinResult, Snapshot } from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

async function call<T>(path: string, body?: unknown, session?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  createRoom: (title: string) =>
    call<{ code: string; host_key: string }>("/rooms/", { title }),
  join: (code: string, display_name: string, guest_id: string, host_key?: string) =>
    call<JoinResult>(`/rooms/${code}/join/`, { display_name, guest_id, host_key }),
  state: (code: string, session: string) => call<Snapshot>(`/rooms/${code}/state/`, undefined, session),
  raiseHand: (code: string, s: string) => call<Snapshot>(`/rooms/${code}/hand/`, {}, s),
  lowerHand: (code: string, s: string) => call<Snapshot>(`/rooms/${code}/hand/lower/`, {}, s),
  grant: (code: string, s: string, identity: string) =>
    call<Snapshot>(`/rooms/${code}/floor/grant/`, { identity }, s),
  reject: (code: string, s: string, identity: string) =>
    call<Snapshot>(`/rooms/${code}/floor/reject/`, { identity }, s),
  release: (code: string, s: string, identity: string) =>
    call<Snapshot>(`/rooms/${code}/floor/release/`, { identity }, s),
};
