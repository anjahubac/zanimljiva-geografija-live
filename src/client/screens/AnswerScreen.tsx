import { CATEGORIES, MAX_ANSWER_LENGTH } from "@contracts/game.schemas";
import type { Category } from "@contracts/game.schemas";
import { useI18n } from "@client/i18n";
import type { DraftStatus, HintView } from "@client/state/useGameState";
import type { Strings } from "@client/strings";

type Props = {
  letter: string;
  remainingMs: number;
  answers: Record<Category, string>;
  draftStatus: Record<Category, DraftStatus>;
  fieldError: Partial<Record<Category, string>>;
  locked: boolean;
  busy: boolean;
  opponentFinished: boolean;
  opponentConnected: boolean;
  opponentIsBot?: boolean;
  announcement: string;
  /** Hints (§2B.8). Without `onHint` the sheet shows no hint controls. */
  hintsLeft?: number;
  hints?: Partial<Record<Category, HintView>>;
  onHint?: (category: Category) => void;
  onChange: (category: Category, value: string) => void;
  onBlur: (category: Category) => void;
  onFinish: () => void;
};

const statusText = (t: Strings): Record<DraftStatus, string> => ({
  empty: t.statusEmpty,
  pending: t.statusPending,
  saved: t.statusSaved,
  rejected: t.statusRejected,
});

const LOW_TIME_MS = 15_000;

/** The paper sheet is ruled for several letters down the page. Core plays one
 *  round, so the remaining lines stay blank rather than disappearing. */
const BLANK_SHEET_ROWS = [1, 2, 3, 4];

function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * The paper sheet: the round letter down the left, categories across the top,
 * and your line the only one you write on. The opponent's answers are never in
 * client state before the canonical reveal, so nothing here hides them.
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
  opponentConnected,
  opponentIsBot = false,
  announcement,
  hintsLeft = 0,
  hints = {},
  onHint,
  onChange,
  onBlur,
  onFinish,
}: Props) {
  const { t, labels } = useI18n();
  const STATUS_TEXT = statusText(t);
  const hintPending = Object.values(hints).some((hint) => hint?.status === "loading");

  return (
    <section className="screen screen-wide" aria-labelledby="answer-title">
      <header className="round-header">
        <div>
          <h1 id="answer-title" className="screen-title">
            {t.answeringTitle}
          </h1>
          <p className="letter">
            {t.letterIs} <strong>{letter}</strong>
          </p>
        </div>
        {/* Reads once per second, so it is hidden from assistive technology;
            the live region below announces milestones instead. */}
        <p className={`timer${remainingMs <= LOW_TIME_MS ? " timer-low" : ""}`} aria-hidden="true">
          <span className="timer-label">{t.timeLeft}</span>
          {formatRemaining(remainingMs)}
        </p>
      </header>

      {/* The sheet is now one player's page, so the opponent's progress is
          reported beside it rather than as a second line on the table.
          `aria-live` is polite rather than assertive on purpose: this fires
          while someone is typing an answer, and must not interrupt them
          mid-word. A departure outranks whether they had finished. */}
      <p className={`opponent-note${opponentConnected ? "" : " opponent-note-gone"}`} aria-live="polite">
        {opponentIsBot ? `${t.aiOpponent}: ` : ""}
        {!opponentConnected
          ? t.opponentLeft
          : opponentFinished
            ? t.opponentFinished
            : t.opponentStillPlaying}
      </p>

      {onHint ? (
        <p className="hints-left">
          {t.hintsLeft}: <strong>{hintsLeft}</strong>
        </p>
      ) : null}

      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>

      <form onSubmit={(event) => { event.preventDefault(); onFinish(); }}>
        <div className="table-scroll">
          <table className="sheet-table play-table">
            <caption className="visually-hidden">{t.answeringTitle}</caption>
            <thead>
              <tr>
                {CATEGORIES.map((category) => (
                  <th scope="col" className="col-head" key={category}>
                    {labels[category]}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              <tr>
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
                        {labels[category]}
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
                      {onHint ? (
                        <HintCell
                          view={hints[category]}
                          canAsk={!locked && hintsLeft > 0 && !hintPending}
                          label={`${t.hintFor}: ${labels[category]}`}
                          t={t}
                          onAsk={() => onHint(category)}
                        />
                      ) : null}
                    </td>
                  );
                })}
              </tr>

              {/* Ruled but unused: the blank part of the page. Decorative, so
                  assistive technology is not walked through empty cells. */}
              {BLANK_SHEET_ROWS.map((line) => (
                <tr className="row-blank" aria-hidden="true" key={line}>
                  {CATEGORIES.map((category) => (
                    <td className="cell" key={category} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button type="submit" disabled={locked || busy}>
          {t.finish}
        </button>
      </form>
    </section>
  );
}

type HintCellProps = {
  view: HintView | undefined;
  canAsk: boolean;
  label: string;
  t: Strings;
  onAsk: () => void;
};

/**
 * One category's hint: a button until it is asked for, then what came back.
 * The clue is announced politely, so it never interrupts someone typing.
 */
function HintCell({ view, canAsk, label, t, onAsk }: HintCellProps) {
  if (!view || view.status === "error") {
    return (
      <>
        {view?.status === "error" ? <p className="field-error">{view.message}</p> : null}
        <button type="button" className="link hint-button" disabled={!canAsk} aria-label={label} onClick={onAsk}>
          {t.hint}
        </button>
      </>
    );
  }

  return (
    <p className="hint-text" aria-live="polite">
      {view.status === "loading" ? t.hintLoading : view.status === "clue" ? view.clue : t.hintNone}
    </p>
  );
}
