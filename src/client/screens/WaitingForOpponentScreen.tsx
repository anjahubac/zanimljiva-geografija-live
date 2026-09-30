import { useI18n } from "@client/i18n";

type Props = {
  opponentFinished: boolean;
  opponentConnected: boolean;
  opponentIsBot?: boolean;
  remainingMs: number;
};

export function WaitingForOpponentScreen({
  opponentFinished,
  opponentConnected,
  opponentIsBot = false,
  remainingMs,
}: Props) {
  const { t } = useI18n();
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));

  return (
    <section className="screen" aria-labelledby="locked-title">
      <h1 className="screen-title" id="locked-title">{t.finishedTitle}</h1>
      <p aria-live="polite">{t.waitingForOpponentFinish}</p>
      <p
        className={opponentConnected ? undefined : "opponent-note opponent-note-gone"}
        aria-live="polite"
      >
        {opponentIsBot ? `${t.aiOpponent}: ` : ""}
        {!opponentConnected
          ? t.opponentLeft
          : opponentFinished
            ? t.opponentFinished
            : t.opponentStillPlaying}
      </p>
      <p aria-hidden="true">
        {t.timeLeft}: {seconds} s
      </p>
    </section>
  );
}
