import { useState } from "react";
import { App } from "@client/App";
import { I18nProvider, LanguageToggle, useI18n } from "@client/i18n";
import { ThemeToggle } from "@client/ThemeToggle";

/**
 * The page shell around the game. There are no accounts: every player is a
 * guest who types a name in the lobby.
 */
export function PlayerApp() {
  return (
    <I18nProvider>
      <Shell />
    </I18nProvider>
  );
}

function Shell() {
  const { t } = useI18n();
  /**
   * Bumped when a player leaves a room — from the waiting screen before a
   * round, or from the results sheet after it. It remounts `App`, which
   * drops the socket — and the server releases the room on that disconnect,
   * so the next socket is unbound and free to create or join a new room. A
   * reset of client state alone would leave the socket tied to the dead room.
   */
  const [gameNonce, setGameNonce] = useState(0);

  /**
   * The brand is deliberately not a link home: a stray click during a live
   * round would abandon it with no warning. Leaving a partija is an explicit
   * action on the waiting screen and on the results sheet.
   */
  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <span className="brand">{t.appTitle}</span>

          <nav className="site-nav" aria-label={t.navLabel}>
            <LanguageToggle />
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <App key={gameNonce} onLeave={() => setGameNonce((current) => current + 1)} />
    </>
  );
}
