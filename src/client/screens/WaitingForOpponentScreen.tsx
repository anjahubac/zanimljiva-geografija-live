import { UI_SR } from "@client/strings";

type Props = { opponentFinished: boolean; opponentConnected: boolean; remainingMs: number };

export function WaitingForOpponentScreen({
  opponentFinished,
  opponentConnected,
  remainingMs,
}: Props) {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));

  return (
    <section className="screen" aria-labelledby="locked-title">
      <h1 className="screen-title" id="locked-title">{UI_SR.finishedTitle}</h1>
      <p aria-live="polite">{UI_SR.waitingForOpponentFinish}</p>
      <p
        className={opponentConnected ? undefined : "opponent-note opponent-note-gone"}
        aria-live="polite"
      >
        {!opponentConnected
          ? UI_SR.opponentLeft
          : opponentFinished
            ? UI_SR.opponentFinished
            : UI_SR.opponentStillPlaying}
      </p>
      <p aria-hidden="true">
        {UI_SR.timeLeft}: {seconds} s
      </p>
    </section>
  );
}
