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

function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function AnswerScreen({
  letter,
  remainingMs,
  answers,
  draftStatus,
  fieldError,
  locked,
  busy,
  announcement,
  onChange,
  onBlur,
  onFinish,
}: Props) {
  return (
    <section className="screen" aria-labelledby="answer-title">
      <header className="round-header">
        <h1 id="answer-title">{UI_SR.answeringTitle}</h1>
        <p className="letter">
          {UI_SR.letterIs}: <strong>{letter}</strong>
        </p>
        {/* Updated every second, so it is not announced; milestones are
            announced through the live region below instead. */}
        <p className="timer" aria-hidden="true">
          {UI_SR.timeLeft}: {formatRemaining(remainingMs)}
        </p>
      </header>

      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>

      <form
        className="answers"
        onSubmit={(event) => {
          event.preventDefault();
          onFinish();
        }}
      >
        {CATEGORIES.map((category) => {
          const status = draftStatus[category];
          const error = fieldError[category];
          const describedBy = [`${category}-status`, error ? `${category}-error` : null]
            .filter(Boolean)
            .join(" ");

          return (
            <div className="field" key={category}>
              <label htmlFor={`answer-${category}`}>{CATEGORY_LABELS_SR[category]}</label>
              <input
                id={`answer-${category}`}
                name={category}
                value={answers[category]}
                maxLength={MAX_ANSWER_LENGTH}
                disabled={locked}
                autoComplete="off"
                aria-describedby={describedBy}
                aria-invalid={error ? true : undefined}
                onChange={(event) => onChange(category, event.target.value)}
                onBlur={() => onBlur(category)}
              />
              {/* Text, not colour alone, carries the saved/pending meaning. */}
              <span className={`status status-${status}`} id={`${category}-status`}>
                {STATUS_TEXT[status]}
              </span>
              {error ? (
                <p className="field-error" id={`${category}-error`}>
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}

        <button type="submit" disabled={locked || busy}>
          {UI_SR.finish}
        </button>
      </form>
    </section>
  );
}
