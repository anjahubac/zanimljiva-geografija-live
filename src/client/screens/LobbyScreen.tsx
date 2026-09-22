import { useState } from "react";
import { MAX_DISPLAY_NAME_LENGTH } from "@contracts/game.schemas";
import { UI_SR } from "@client/strings";

type Props = {
  busy: boolean;
  errorMessage: string | null;
  onCreate: (displayName: string) => void;
  onSwitchToJoin: () => void;
};

export function LobbyScreen({ busy, errorMessage, onCreate, onSwitchToJoin }: Props) {
  const [displayName, setDisplayName] = useState("");
  const trimmed = displayName.trim();

  return (
    <section className="screen" aria-labelledby="lobby-title">
      <h1 className="screen-title" id="lobby-title">{UI_SR.appTitle}</h1>

      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed) onCreate(trimmed);
        }}
      >
        <div className="field">
          <label htmlFor="lobby-name">{UI_SR.displayName}</label>
          <input
            id="lobby-name"
            name="displayName"
            autoComplete="nickname"
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            aria-describedby={errorMessage ? "lobby-error" : undefined}
            required
          />
          {errorMessage ? (
            <p className="field-error" id="lobby-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <button type="submit" disabled={busy || trimmed.length === 0}>
          {UI_SR.createRoom}
        </button>
      </form>

      <p>
        {UI_SR.haveCode}{" "}
        <button type="button" className="link" onClick={onSwitchToJoin}>
          {UI_SR.joinInstead}
        </button>
      </p>
    </section>
  );
}
