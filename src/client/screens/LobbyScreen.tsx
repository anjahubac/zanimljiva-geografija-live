import { useState } from "react";
import { MAX_DISPLAY_NAME_LENGTH } from "@contracts/game.schemas";
import { UI_SR } from "@client/strings";

type Props = {
  busy: boolean;
  errorMessage: string | null;
  /** Set when signed in: the account already supplies the name, so the form
   *  does not ask for it and the server ignores it either way. */
  accountName: string | null;
  onCreate: (displayName: string) => void;
  onQuickPlay: (displayName: string) => void;
  onSwitchToJoin: () => void;
};

export function LobbyScreen({
  busy,
  errorMessage,
  accountName,
  onCreate,
  onQuickPlay,
  onSwitchToJoin,
}: Props) {
  const [displayName, setDisplayName] = useState("");
  const name = accountName ?? displayName.trim();
  const ready = name.length > 0;

  return (
    <section className="screen" aria-labelledby="lobby-title">
      <h1 className="screen-title" id="lobby-title">
        {UI_SR.lobbyTitle}
      </h1>

      {accountName ? (
        <p className="playing-as">
          {UI_SR.playingAs} <strong>{accountName}</strong>
        </p>
      ) : (
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
        </div>
      )}

      {errorMessage ? (
        <p className="field-error" id="lobby-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {/* Two ways into a room; both end in the same scheduled round. */}
      <div className="paths">
        <div className="path">
          <button type="button" disabled={busy || !ready} onClick={() => onCreate(name)}>
            {UI_SR.playWithFriend}
          </button>
          <p className="path-note">{UI_SR.playWithFriendNote}</p>
        </div>

        <div className="path">
          <button type="button" disabled={busy || !ready} onClick={() => onQuickPlay(name)}>
            {UI_SR.playWithStranger}
          </button>
          <p className="path-note">{UI_SR.playWithStrangerNote}</p>
        </div>
      </div>

      <p>
        {UI_SR.haveCode}{" "}
        <button type="button" className="link" onClick={onSwitchToJoin}>
          {UI_SR.joinInstead}
        </button>
      </p>
    </section>
  );
}
