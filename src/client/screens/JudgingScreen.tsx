import { useI18n } from "@client/i18n";

/** Both sheets are locked; the server is asking the AI. Nothing to do but wait. */
export function JudgingScreen() {
  const { t } = useI18n();

  return (
    <section className="screen" aria-labelledby="judging-title" aria-busy="true">
      <h1 className="screen-title" id="judging-title">
        {t.judgingTitle}
      </h1>
      <p aria-live="polite">{t.judgingNote}</p>
    </section>
  );
}
