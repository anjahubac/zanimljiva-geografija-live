import { useState } from "react";
import { MAX_DISPLAY_NAME_LENGTH } from "@contracts/game.schemas";
import { useI18n } from "@client/i18n";

type Props = {
  busy: boolean;
  errorMessage: string | null;
  onCreate: (displayName: string) => void;
  onQuickPlay: (displayName: string) => void;
  onPlayAi: (displayName: string) => void;
  onSwitchToJoin: () => void;
};

export function LobbyScreen({ busy, errorMessage, onCreate, onQuickPlay, onPlayAi, onSwitchToJoin }: Props) {
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState("");
  const name = displayName.trim();
  const ready = name.length > 0;

  return (
    <section className="screen" aria-labelledby="lobby-title">
      <h1 className="screen-title" id="lobby-title">
        {t.lobbyTitle}
      </h1>

      <div className="field">
        <label htmlFor="lobby-name">{t.displayName}</label>
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

      {errorMessage ? (
        <p className="field-error" id="lobby-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {/* Three ways into a room; all end in the same scheduled round. */}
      <div className="paths">
        <div className="path">
          <button type="button" disabled={busy || !ready} onClick={() => onCreate(name)}>
            {t.playWithFriend}
          </button>
          <p className="path-note">{t.playWithFriendNote}</p>
        </div>

        <div className="path">
          <button type="button" disabled={busy || !ready} onClick={() => onQuickPlay(name)}>
            {t.playWithStranger}
          </button>
          <p className="path-note">{t.playWithStrangerNote}</p>
        </div>

        <div className="path">
          <button type="button" disabled={busy || !ready} onClick={() => onPlayAi(name)}>
            {t.playWithAi}
          </button>
          <p className="path-note">{t.playWithAiNote}</p>
        </div>
      </div>

      <p>
        {t.haveCode}{" "}
        <button type="button" className="link" onClick={onSwitchToJoin}>
          {t.joinInstead}
        </button>
      </p>

      <p className="path-note">{t.languageNote}</p>
      <p className="path-note">{t.aiPrivacyNote}</p>
    </section>
  );
}
