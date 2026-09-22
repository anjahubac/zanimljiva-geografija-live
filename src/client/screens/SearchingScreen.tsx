import { UI_SR } from "@client/strings";

type Props = {
  busy: boolean;
  onCancel: () => void;
};

/** Queued for a random opponent. The server matches; this screen only waits. */
export function SearchingScreen({ busy, onCancel }: Props) {
  return (
    <section className="screen" aria-labelledby="searching-title">
      <h1 className="screen-title" id="searching-title">
        {UI_SR.searchingTitle}
      </h1>

      <p aria-live="polite">{UI_SR.searchingNote}</p>

      <button type="button" disabled={busy} onClick={onCancel}>
        {UI_SR.cancelSearch}
      </button>
    </section>
  );
}
