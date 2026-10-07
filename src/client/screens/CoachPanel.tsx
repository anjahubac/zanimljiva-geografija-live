import { useState } from "react";
import type { CoachReport } from "@contracts/coach.schemas";
import { CATEGORIES, type Category } from "@contracts/game.schemas";
import { useI18n } from "@client/i18n";

/*
 * The round coach on the results sheet (`Plan.md` §2C). The player picks
 * which of their 0-point categories to analyse and asks once; the server runs
 * the agent and answers with a report. The browser never sees a step, a
 * prompt or a tool call — only a status, then the report, with every code
 * turned into a sentence in the player's language.
 */

/** What the panel learns from one request. */
export type CoachAnswer = { kind: "report"; report: CoachReport } | { kind: "error"; message: string } | { kind: "timeout" };

export type CoachPanelState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "report"; report: CoachReport }
  | { status: "error"; message: string }
  | { status: "timeout" };

type ViewProps = {
  focus: Category[];
  selected: Category[];
  state: CoachPanelState;
  onToggle: (category: Category) => void;
  onSubmit: () => void;
};

/** Pure rendering of every state, so each can be tested on its own. */
export function CoachPanelView({ focus, selected, state, onToggle, onSubmit }: ViewProps) {
  const { t, labels } = useI18n();
  if (focus.length === 0) return null;

  const locked = state.status === "pending" || state.status === "report" || state.status === "timeout";
  const report = state.status === "report" ? state.report : null;
  const failed = state.status === "timeout" || report?.status === "failed";

  let statusText = "";
  if (state.status === "pending") statusText = t.coach.running;
  else if (failed) statusText = t.coach.failed;
  else if (report?.status === "completed") statusText = t.coach.completed;
  else if (report?.status === "incomplete") statusText = t.coach.incomplete;
  else if (state.status === "error") statusText = state.message;

  return (
    <section className="coach-panel" aria-labelledby="coach-title">
      <h2 id="coach-title" className="coach-title">
        {t.coach.title}
      </h2>
      <p className="notice">{t.coach.intro}</p>

      <form
        className="coach-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <fieldset className="coach-focus" disabled={locked}>
          <legend>{t.coach.focusLegend}</legend>
          {focus.map((category) => (
            <label className="coach-choice" key={category}>
              <input
                type="checkbox"
                name="focus"
                value={category}
                checked={selected.includes(category)}
                onChange={() => onToggle(category)}
              />
              {labels[category]}
            </label>
          ))}
        </fieldset>
        <button type="submit" disabled={locked || selected.length === 0}>
          {t.coach.ask}
        </button>
      </form>

      <p className="coach-status" role="status" aria-live="polite">
        {statusText}
      </p>

      {report && !failed ? (
        <div className="coach-report">
          {report.summary ? <p className="coach-summary">{report.summary}</p> : null}
          {report.status === "incomplete" ? <p className="notice">{t.coach.stopReasons[report.stopReason]}</p> : null}
          <ul className="coach-tips">
            {report.tips.map((tip) => (
              <li className="coach-tip" key={tip.category}>
                <strong>{labels[tip.category]}</strong>
                <span>
                  {t.coach.yourAnswer}: {tip.yourAnswer.trim() === "" ? t.coach.empty : tip.yourAnswer}
                  {tip.whyMissed === "empty" ? null : ` (${t.rejectReasons[tip.whyMissed]})`}
                </span>
                {tip.suggestion ? (
                  <span>
                    {t.coach.suggestion}: <span className="coach-suggestion">{tip.suggestion}</span>
                    {tip.checkedBy ? <span className="notice"> · {t.coach.checkedBy[tip.checkedBy]}</span> : null}
                  </span>
                ) : (
                  <span className="notice">{t.coach.noSuggestion}</span>
                )}
              </li>
            ))}
          </ul>
          {report.run ? (
            <details className="coach-details">
              <summary>{t.coach.details.title}</summary>
              <dl>
                <dt>{t.coach.details.modelSteps}</dt>
                <dd>{report.run.modelSteps}</dd>
                <dt>{t.coach.details.toolCalls}</dt>
                <dd>{report.run.toolCalls}</dd>
                <dt>{t.coach.details.providerAttempts}</dt>
                <dd>{report.run.providerAttempts}</dd>
                <dt>{t.coach.details.model}</dt>
                <dd>
                  {report.run.provider && report.run.model
                    ? `${t.coach.details.providers[report.run.provider]} · ${report.run.model}`
                    : t.coach.details.none}
                </dd>
                <dt>{t.coach.details.elapsed}</dt>
                <dd>
                  {(report.run.elapsedMs / 1000).toFixed(1)} {t.coach.details.seconds}
                </dd>
                <dt>{t.coach.details.stopReason}</dt>
                <dd>{t.coach.stopReasons[report.run.stopReason]}</dd>
              </dl>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type Props = {
  /** The caller's 0-point categories. */
  focus: Category[];
  onCoach: (focus: Category[]) => Promise<CoachAnswer>;
};

/** The panel with its state: everything ticked, one request, then its outcome. */
export function CoachPanel({ focus, onCoach }: Props) {
  const [selected, setSelected] = useState<Category[]>(focus);
  const [state, setState] = useState<CoachPanelState>({ status: "idle" });

  const toggle = (category: Category) =>
    setSelected((current) =>
      current.includes(category)
        ? current.filter((each) => each !== category)
        : CATEGORIES.filter((each) => each === category || current.includes(each)),
    );

  const submit = () => {
    if (selected.length === 0 || state.status === "pending") return;
    setState({ status: "pending" });
    void onCoach(selected).then((answer) => {
      if (answer.kind === "report") setState({ status: "report", report: answer.report });
      else if (answer.kind === "error") setState({ status: "error", message: answer.message });
      else setState({ status: "timeout" });
    });
  };

  return <CoachPanelView focus={focus} selected={selected} state={state} onToggle={toggle} onSubmit={submit} />;
}
