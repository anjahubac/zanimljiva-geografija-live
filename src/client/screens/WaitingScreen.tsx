import type { RoomState } from "@contracts/socket.schemas";
import { useI18n } from "@client/i18n";

type Props = {
  room: RoomState;
  /** Release the room and return to the lobby; the code stops working. */
  onLeave: () => void;
};

export function WaitingScreen({ room, onLeave }: Props) {
  const { t } = useI18n();
  const synchronizing = room.phase === "synchronizing";
  // A room against the AI has no code worth sharing: nobody else can join it.
  const againstBot = room.players.some((player) => player.bot);

  return (
    <section className="screen" aria-labelledby="waiting-title">
      <h1 className="screen-title" id="waiting-title">
        {againstBot ? t.aiRoomTitle : t.waitingTitle}
      </h1>

      {againstBot ? null : (
        <p className="room-code">
          <span className="room-code-label">{t.roomCode}</span>
          <strong>{room.roomCode}</strong>
        </p>
      )}

      <p aria-live="polite">{synchronizing ? t.synchronizing : t.waitingForOpponent}</p>

      <ul className="players">
        {room.players.map((player) => (
          <li key={player.slot}>
            {player.bot ? t.aiOpponent : player.displayName}
            {player.slot === room.you ? ` (${t.you})` : ""}
            {player.connected ? "" : " — offline"}
          </li>
        ))}
      </ul>

      {/* "Leave", not "Back": the step is not undoable — the room is released
          and a friend holding the code can no longer join it. */}
      <div className="waiting-actions">
        <button type="button" onClick={onLeave}>
          {t.leaveGame}
        </button>
        {againstBot ? null : <p className="notice">{t.leaveGameNote}</p>}
      </div>
    </section>
  );
}
