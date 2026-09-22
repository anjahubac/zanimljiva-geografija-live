import { useEffect, useState, type ReactNode } from "react";
import { App } from "@client/App";
import { AccountScreen } from "@client/screens/AccountScreen";
import { ProfileScreen } from "@client/screens/ProfileScreen";
import { ThemeToggle } from "@client/ThemeToggle";
import { useSession } from "@client/accounts/useSession";
import { AUTH_SR, UI_SR } from "@client/strings";

type View = "game" | "account" | "profile";

/**
 * The account shell around the game. The server reads the session cookie at the
 * socket handshake, so `App` is keyed by the account: signing in or out
 * remounts it and the new socket introduces itself as the right player.
 */
export function PlayerApp() {
  const session = useSession();
  const [view, setView] = useState<View>("account");
  /**
   * Bumped when a player leaves a finished room. It remounts `App`, which
   * drops the socket — and the server releases the room on that disconnect,
   * so the next socket is unbound and free to create or join a new room. A
   * reset of client state alone would leave the socket tied to the dead room.
   */
  const [gameNonce, setGameNonce] = useState(0);

  const { account, loading } = session;

  useEffect(() => {
    if (loading) return;
    // A returning player with a live cookie goes straight to the game.
    if (account) setView((current) => (current === "account" ? "game" : current));
  }, [account, loading]);

  const onAccountScreen = view === "account" && !account;

  /**
   * The brand is deliberately not a link home: a stray click during a live
   * round would abandon it with no warning. Leaving a partija is an explicit
   * action on the results sheet.
   */
  const shell = (body: ReactNode) => (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <span className="brand">{UI_SR.appTitle}</span>

          <nav className="site-nav" aria-label={UI_SR.navLabel}>
            {/* On the sign-in screen these would only repeat what is already
                on it, so the bar carries just the theme control there. */}
            {loading || onAccountScreen ? null : account ? (
              <>
                <span className="nav-who">{account.displayName}</span>
                <button
                  type="button"
                  className="link"
                  aria-current={view === "profile" ? "page" : undefined}
                  onClick={() => setView("profile")}
                >
                  {AUTH_SR.profile}
                </button>
                <button
                  type="button"
                  className="link"
                  disabled={session.busy}
                  onClick={() => void session.logOut().then(() => setView("account"))}
                >
                  {AUTH_SR.signOut}
                </button>
              </>
            ) : (
              <>
                <span className="nav-who">{AUTH_SR.guestShort}</span>
                <button type="button" className="link" onClick={() => setView("account")}>
                  {AUTH_SR.signIn}
                </button>
              </>
            )}

            <ThemeToggle />
          </nav>
        </div>
      </header>

      {body}
    </>
  );

  if (loading) return shell(null);

  if (onAccountScreen) {
    return shell(
      <main className="app">
        <AccountScreen
          busy={session.busy}
          error={session.error}
          onRegister={(input) => void session.register(input)}
          onLogIn={(input) => void session.logIn(input)}
          onPlayAsGuest={() => setView("game")}
          onModeChange={session.clearError}
        />
      </main>,
    );
  }

  if (view === "profile" && account) {
    return shell(
      <main className="app">
        <ProfileScreen onBack={() => setView("game")} />
      </main>,
    );
  }

  return shell(
    <App
      key={`${account?.id ?? "guest"}-${gameNonce}`}
      accountName={account?.displayName ?? null}
      onLeave={() => setGameNonce((current) => current + 1)}
    />,
  );
}
