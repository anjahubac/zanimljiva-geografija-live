import { useState } from "react";
import { MAX_DISPLAY_NAME_LENGTH, ROOM_CODE_LENGTH } from "@contracts/game.schemas";
import { UI_SR } from "@client/strings";

type Props = {
  busy: boolean;
  errorMessage: string | null;
  /** Set when signed in: the account already supplies the name. */
  accountName: string | null;
  onJoin: (roomCode: string, displayName: string) => void;
  onBack: () => void;
};

export function JoinScreen({ busy, errorMessage, accountName, onJoin, onBack }: Props) {
  const [roomCode, setRoomCode] = useState("");
  const [displayName, setDisplayName] = useState("");

  const code = roomCode.trim().toUpperCase();
  const name = accountName ?? displayName.trim();
  const canSubmit = code.length === ROOM_CODE_LENGTH && name.length > 0;

  return (
    <section className="screen" aria-labelledby="join-title">
      <h1 className="screen-title" id="join-title">{UI_SR.joinInstead}</h1>

      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onJoin(code, name);
        }}
      >
        <div className="field">
          <label htmlFor="join-code">{UI_SR.roomCode}</label>
          <input
            id="join-code"
            name="roomCode"
            className="code-input"
            maxLength={ROOM_CODE_LENGTH}
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
            aria-describedby={errorMessage ? "join-error" : undefined}
            required
          />
        </div>

        {accountName ? (
          <p className="playing-as">
            {UI_SR.playingAs} <strong>{accountName}</strong>
          </p>
        ) : (
          <div className="field">
            <label htmlFor="join-name">{UI_SR.displayName}</label>
            <input
              id="join-name"
              name="displayName"
              autoComplete="nickname"
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
            />
          </div>
        )}

        {errorMessage ? (
          <p className="field-error" id="join-error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <button type="submit" disabled={busy || !canSubmit}>
          {UI_SR.join}
        </button>
      </form>

      <button type="button" className="link" onClick={onBack}>
        {UI_SR.backToLobby}
      </button>
    </section>
  );
}
