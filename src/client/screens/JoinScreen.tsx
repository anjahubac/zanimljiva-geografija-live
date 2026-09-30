import { useState } from "react";
import {
  MAX_DISPLAY_NAME_LENGTH,
  ROOM_CODE_LENGTH,
} from "@contracts/game.schemas";
import { useI18n } from "@client/i18n";

type Props = {
  busy: boolean;
  errorMessage: string | null;
  onJoin: (roomCode: string, displayName: string) => void;
  onBack: () => void;
};

export function JoinScreen({ busy, errorMessage, onJoin, onBack }: Props) {
  const { t } = useI18n();
  const [roomCode, setRoomCode] = useState("");
  const [displayName, setDisplayName] = useState("");

  const code = roomCode.trim().toUpperCase();
  const name = displayName.trim();
  const canSubmit = code.length === ROOM_CODE_LENGTH && name.length > 0;

  return (
    <section className="screen" aria-labelledby="join-title">
      <h1 className="screen-title" id="join-title">
        {t.joinInstead}
      </h1>

      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onJoin(code, name);
        }}
      >
        <div className="field">
          <label htmlFor="join-code">{t.roomCode}</label>
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

        <div className="field">
          <label htmlFor="join-name">{t.displayName}</label>
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

        {errorMessage ? (
          <p className="field-error" id="join-error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <button type="submit" disabled={busy || !canSubmit}>
          {t.join}
        </button>
      </form>

      <button type="button" className="link" onClick={onBack}>
        {t.backToLobby}
      </button>
    </section>
  );
}
