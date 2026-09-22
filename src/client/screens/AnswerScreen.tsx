import { CATEGORIES, CATEGORY_LABELS_SR, MAX_ANSWER_LENGTH } from "@contracts/game.schemas";
import type { Category } from "@contracts/game.schemas";
import type { DraftStatus } from "@client/state/useGameState";
import { UI_SR } from "@client/strings";

type Props = {
  letter: string;
  remainingMs: number;
  answers: Record<Category, string>;
  draftStatus: Record<Category, DraftStatus>;
  fieldError: Partial<Record<Category, string>>;
  locked: boolean;
  busy: boolean;
  opponentFinished: boolean;
  announcement: string;
  onChange: (category: Category, value: string) => void;
  onBlur: (category: Category) => void;
  onFinish: () => void;
};

const STATUS_TEXT: Record<DraftStatus, string> = {
  empty: UI_SR.statusEmpty,
  pending: UI_SR.statusPending,
  saved: UI_SR.statusSaved,
  rejected: UI_SR.statusRejected,
};

const LOW_TIME_MS = 15_000;

function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * The same sheet the results are scored on: categories across the top, your
 * line editable, the opponent's line present but blank — the client never
 * holds their answers before the canonical reveal.
 */
export function AnswerScreen({
  letter,
  remainingMs,
  answers,
  draftStatus,
  fieldError,
  locked,
  busy,
  opponentFinished,
  announcement,
  onChange,
  onBlur,
  onFinish,
}: Props) {
  return (
    <section className="screen screen-wide" aria-labelledby="answer-title">
      <header className="round-header">
        <div>
          <h1 id="answer-title" className="screen-title">
            {UI_SR.answeringTitle}
          </h1>
          <p className="letter">
            {UI_SR.letterIs} <strong>{letter}</strong>
          </p>
        </div>
        {/* Reads once per second, so it is hidden from assistive technology;
            the live region below announces milestones instead. */}
        <p className={`timer${remainingMs <= LOW_TIME_MS ? " timer-low" : ""}`} aria-hidden="true">
          <span className="timer-label">{UI_SR.timeLeft}</span>
          {formatRemaining(remainingMs)}
        </p>
      </header>

      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>

      <form onSubmit={(event) => { event.preventDefault(); onFinish(); }}>
        <div className="table-scroll">
          <table className="sheet-table play-table">
            <caption className="visually-hidden">{UI_SR.answeringTitle}</caption>
            <thead>
              <tr>
                <th scope="col" className="col-head col-row-head">
                  {UI_SR.player}
                </th>
                {CATEGORIES.map((category) => (
                  <th scope="col" className="col-head" key={category}>
                    {CATEGORY_LABELS_SR[category]}
                  </th>
                ))}
                <th scope="col" className="col-head col-total">
                  {UI_SR.total}
                </th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <th scope="row" className="col-row-head">
                  {UI_SR.you}
                </th>

                {CATEGORIES.map((category) => {
                  const status = draftStatus[category];
                  const error = fieldError[category];
                  const describedBy = [`${category}-status`, error ? `${category}-error` : null]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <td className="cell cell-input" key={category}>
                      {/* Always a real label. The column header names the field
                          on a wide screen, so it is hidden there and shown
                          again once the sheet stacks. */}
                      <label className="cell-label" htmlFor={`answer-${category}`}>
                        {CATEGORY_LABELS_SR[category]}
                      </label>
                      <input
                        id={`answer-${category}`}
                        name={category}
                        value={answers[category]}
                        maxLength={MAX_ANSWER_LENGTH}
                        disabled={locked}
                        autoComplete="off"
                        autoCapitalize="words"
                        spellCheck={false}
                        aria-describedby={describedBy}
                        aria-invalid={error ? true : undefined}
                        onChange={(event) => onChange(category, event.target.value)}
                        onBlur={() => onBlur(category)}
                      />
                      {/* The word carries the meaning; the pen colour seconds it. */}
                      <span className={`status status-${status}`} id={`${category}-status`}>
                        {STATUS_TEXT[status]}
                      </span>
                      {error ? (
                        <p className="field-error" id={`${category}-error`}>
                          {error}
                        </p>
                      ) : null}
                    </td>
                  );
                })}

                <td className="cell cell-total cell-pending">
                  <span aria-hidden="true">—</span>
                  <span className="visually-hidden">{UI_SR.notScoredYet}</span>
                </td>
              </tr>

              <tr className="row-opponent">
                <th scope="row" className="col-row-head">
                  {UI_SR.opponent}
                  <span className="row-note">
                    {opponentFinished ? UI_SR.opponentFinished : UI_SR.opponentStillPlaying}
                  </span>
                </th>

                {CATEGORIES.map((category) => (
                  <td className="cell cell-hidden" key={category}>
                    <span className="visually-hidden">{UI_SR.hiddenUntilReveal}</span>
                  </td>
                ))}

                <td className="cell cell-total cell-pending">
                  <span aria-hidden="true">—</span>
                  <span className="visually-hidden">{UI_SR.notScoredYet}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <button type="submit" disabled={locked || busy}>
          {UI_SR.finish}
        </button>
      </form>
    </section>
  );
}
