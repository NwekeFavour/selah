export type Role = "host" | "speaker" | "listener";
export type Mode = "approval" | "open";

export interface Person {
  identity: string;
  name: string;
  avatar: string;
  connected: boolean;
}

export interface Participant extends Person {
  role: "speaker" | "listener";
  queued: boolean;
  connected: boolean;
}

/** Full room state, owned by the server and broadcast on every change. */
export interface Snapshot {
  version: number;
  ended: boolean;
  mode: Mode;
  host: Person;
  speakers: Person[];
  queue: Person[]; // ordered, first = next to speak
  participants: Participant[];
  max_speakers: number; // the host's current speaker limit
  listeners: number; // connected people who are not speaking
  ends_at: string | null;
}

export interface JoinResult {
  token: string; // LiveKit access token
  livekit_url: string;
  session: string; // app session token, sent as Bearer on REST calls
  identity: string;
  snapshot: Snapshot;
}