import { UI_SR } from "@client/strings";

type Props = { secondsToStart: number; letter: string };

/**
 * Presentation only. Reaching zero shows a locked state and waits for the
 * server; the client never starts or closes a round by itself.
 */
export function CountdownScreen({ secondsToStart, letter }: Props) {
  return (
    <section className="screen countdown" aria-labelledby="countdown-title">
      <h1 id="countdown-title">{UI_SR.countdownTitle}</h1>

      <p className="countdown-number" aria-hidden="true">
        {secondsToStart}
      </p>
      <p aria-live="polite">
        {UI_SR.countdownTitle}: {secondsToStart}
      </p>
      <p className="letter">
        {UI_SR.letterIs}: <strong>{letter}</strong>
      </p>
    </section>
  );
}
