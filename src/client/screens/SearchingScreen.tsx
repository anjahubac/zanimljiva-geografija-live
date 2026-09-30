import { useI18n } from "@client/i18n";

type Props = {
  busy: boolean;
  onCancel: () => void;
};

/** Queued for a random opponent. The server matches; this screen only waits. */
export function SearchingScreen({ busy, onCancel }: Props) {
  const { t } = useI18n();
  return (
    <section className="screen" aria-labelledby="searching-title">
      <h1 className="screen-title" id="searching-title">
        {t.searchingTitle}
      </h1>

      <p aria-live="polite">{t.searchingNote}</p>

      <button type="button" disabled={busy} onClick={onCancel}>
        {t.cancelSearch}
      </button>
    </section>
  );
}
