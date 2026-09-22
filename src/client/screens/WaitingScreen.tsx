import type { RoomState } from "@contracts/socket.schemas";
import { UI_SR } from "@client/strings";

type Props = { room: RoomState };

export function WaitingScreen({ room }: Props) {
  const synchronizing = room.phase === "synchronizing";

  return (
    <section className="screen" aria-labelledby="waiting-title">
      <h1 className="screen-title" id="waiting-title">{UI_SR.waitingTitle}</h1>

      <p className="room-code">
        <span className="room-code-label">{UI_SR.roomCode}</span>
        <strong>{room.roomCode}</strong>
      </p>

      <p aria-live="polite">{synchronizing ? UI_SR.synchronizing : UI_SR.waitingForOpponent}</p>

      <ul className="players">
        {room.players.map((player) => (
          <li key={player.slot}>
            {player.displayName}
            {player.slot === room.you ? ` (${UI_SR.you})` : ""}
            {player.connected ? "" : " — offline"}
          </li>
        ))}
      </ul>
    </section>
  );
}
