import {
  VideoTrack,
  isTrackReference,
  useIsSpeaking,
  useParticipants,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { Avatar } from "./avatar";
import { avatarBg, avatarFromIdentity } from "./avatarData";

// The speakers on the floor. `people` comes from the server snapshot, so someone can be listed
// before their browser has connected to LiveKit; they show as a name tile until they appear.
export default function Tiles({ people, hostId }) {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  const participants = useParticipants();

  return (
    <>
      {people.map((p) => {
        const ref = tracks.find((t) => t.participant.identity === p.identity);
        const participant = participants.find((x) => x.identity === p.identity);
        const video =
          ref && isTrackReference(ref) ? (
            <VideoTrack trackRef={ref} className="h-full w-full object-cover" />
          ) : null;
        const isHost = p.identity === hostId;

        // useIsSpeaking throws without a real participant, so only use it once they are connected.
        return participant ? (
          <LiveTile key={p.identity} person={p} isHost={isHost} participant={participant}>
            {video}
          </LiveTile>
        ) : (
          <TileFrame key={p.identity} person={p} isHost={isHost}>
            {video}
          </TileFrame>
        );
      })}
    </>
  );
}

function LiveTile({ participant, ...rest }) {
  const speaking = useIsSpeaking(participant);
  return <TileFrame {...rest} speaking={speaking} />;
}

function TileFrame({ person, isHost, speaking = false, children }) {
  return (
    <div
      className={`relative flex min-h-40 items-center justify-center overflow-hidden rounded-2xl bg-slate-800 transition-shadow ${
        speaking ? "ring-4 ring-[#2E9E8F]" : "ring-1 ring-slate-300"
      }`}
    >
      {children ?? (
        <div
          className="h-28 w-28 overflow-hidden rounded-full"
          style={{ background: avatarBg(person.avatar || avatarFromIdentity(person.identity)) }}
        >
          <Avatar code={person.avatar || avatarFromIdentity(person.identity)} className="h-full w-full" />
        </div>
      )}
      <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2.5 py-0.5 text-sm text-white">
        {person.name}
        {isHost && " · host"}
      </span>
    </div>
  );
}