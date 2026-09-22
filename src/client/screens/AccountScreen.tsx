import { useState } from "react";
import { MAX_DISPLAY_NAME_LENGTH } from "@contracts/game.schemas";
import type { ApiFailure } from "@client/accounts/account-api";
import { AUTH_SR } from "@client/strings";

const MIN_PASSWORD_LENGTH = 15;

type Props = {
  busy: boolean;
  error: ApiFailure | null;
  onRegister: (input: { email: string; password: string; displayName: string }) => void;
  onLogIn: (input: { email: string; password: string }) => void;
  onPlayAsGuest: () => void;
  onModeChange: () => void;
};

/**
 * One form for both prijava and registracija. The account is identified by its
 * email address; the display name is what the other player sees in the room.
 */
export function AccountScreen({
  busy,
  error,
  onRegister,
  onLogIn,
  onPlayAsGuest,
  onModeChange,
}: Props) {
  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const trimmedName = displayName.trim();
  const complete =
    email.trim().length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    (!registering || trimmedName.length > 0);

  const submit = () => {
    const credentials = { email: email.trim(), password };
    if (registering) onRegister({ ...credentials, displayName: trimmedName });
    else onLogIn(credentials);
  };

  const switchMode = () => {
    setRegistering((current) => !current);
    onModeChange();
  };

  return (
    <section className="screen" aria-labelledby="account-title">
      <h1 className="screen-title" id="account-title">
        {registering ? AUTH_SR.registerTitle : AUTH_SR.signInTitle}
      </h1>

      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (complete) submit();
        }}
      >
        <div className="field">
          <label htmlFor="account-email">{AUTH_SR.email}</label>
          <input
            id="account-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-describedby={error ? "account-error" : undefined}
            aria-invalid={error ? true : undefined}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="account-password">{AUTH_SR.password}</label>
          <input
            id="account-password"
            name="password"
            type="password"
            autoComplete={registering ? "new-password" : "current-password"}
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby={`account-password-hint${error ? " account-error" : ""}`}
            aria-invalid={error ? true : undefined}
            required
          />
          <p className="field-hint" id="account-password-hint">
            {AUTH_SR.passwordHint}
          </p>
        </div>

        {registering ? (
          <div className="field">
            <label htmlFor="account-display-name">{AUTH_SR.displayName}</label>
            <input
              id="account-display-name"
              name="displayName"
              autoComplete="nickname"
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
            />
          </div>
        ) : null}

        {/* Next to the controls it belongs to, not only as a banner. */}
        {error ? (
          <p className="field-error" id="account-error" role="alert">
            {AUTH_SR.errors[error]}
          </p>
        ) : null}

        <button type="submit" disabled={busy || !complete}>
          {registering ? AUTH_SR.register : AUTH_SR.signIn}
        </button>
      </form>

      <p>
        <button type="button" className="link" onClick={switchMode}>
          {registering ? AUTH_SR.haveAccount : AUTH_SR.needAccount}
        </button>
      </p>

      <p className="notice">
        <button type="button" className="link" onClick={onPlayAsGuest}>
          {AUTH_SR.playAsGuest}
        </button>
        <br />
        {AUTH_SR.guestNote}
      </p>
    </section>
  );
}
