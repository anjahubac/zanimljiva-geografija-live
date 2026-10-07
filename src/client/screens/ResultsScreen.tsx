import { CATEGORIES } from "@contracts/game.schemas";
import type { Category, PlayerSlot, RejectReason } from "@contracts/game.schemas";
import type { RoundResults, RoundRevealed } from "@contracts/socket.schemas";
import { useI18n } from "@client/i18n";
import type { CoachRunView } from "@contracts/coach.schemas";
import type { GameErrorCode } from "@contracts/errors";

type Props = {
  you: PlayerSlot;
  revealed: RoundRevealed;
  results: RoundResults;
  opponentIsBot?: boolean;
  coachView?: CoachRunView | null;
  coachLoading?: boolean;
  coachUnavailable?: boolean;
  coachErrorCode?: GameErrorCode | null;
  coachDisabled?: boolean;
  onReviewRound?: () => void;
  onLeave: () => void;
};

type SheetCell = {
  category: Category;
  raw: string;
  valid: boolean;
  rejected: RejectReason | null;
  hinted: boolean;
  points: number;
  reason: string;
};

/**
 * One line of the paper sheet. Core plays a single round, so the sheet has one
 * line per player; the shape is an array so more lines are a data change, not
 * a layout rewrite.
 */
type SheetRow = {
  key: string;
  label: string;
  cells: SheetCell[];
  total: number;
};

/** Two scored lines plus the rest of the ruled page, so the sheet keeps the
 *  same height and shape it had while the round was being played. */
const BLANK_SHEET_ROWS = [1, 2, 3];

export function ResultsScreen({ you, revealed, results, opponentIsBot = false, coachView = null, coachLoading = false, coachUnavailable = false, coachErrorCode = null, coachDisabled = false, onReviewRound = () => {}, onLeave }: Props) {
  const { t, labels } = useI18n();

  const buildRow = (slot: PlayerSlot, label: string): SheetRow => {
    const answers = slot === 1 ? revealed.player1 : revealed.player2;

    const cells = CATEGORIES.map((category) => {
      const answer = answers.find((entry) => entry.category === category);
      const score = results.scores.find((entry) => entry.category === category);
      return {
        category,
        raw: answer?.raw ?? "",
        valid: answer?.valid ?? false,
        rejected: answer?.reason ?? null,
        hinted: answer?.hinted ?? false,
        points: (slot === 1 ? score?.player1Points : score?.player2Points) ?? 0,
        reason: score ? t.reasons[score.reason] : "",
      };
    });

    return {
      key: `player-${slot}`,
      label,
      cells,
      total: slot === 1 ? results.player1Total : results.player2Total,
    };
  };

  const opponent: PlayerSlot = you === 1 ? 2 : 1;
  const rows = [buildRow(you, t.you), buildRow(opponent, opponentIsBot ? t.aiOpponent : t.opponent)];

  const yourTotal = you === 1 ? results.player1Total : results.player2Total;
  const theirTotal = you === 1 ? results.player2Total : results.player1Total;

  const outcomeText =
    results.outcome === "draw"
      ? t.outcomeDraw
      : (results.outcome === "player_1") === (you === 1)
        ? t.outcomeWin
        : t.outcomeLoss;
  const coachResult = coachView?.status === "completed" ? coachView.result : null;

  return (
    <section className="screen screen-results screen-wide" aria-labelledby="results-title">
      <h1 id="results-title" className="screen-title">
        {t.resultsTitle}
      </h1>

      <p className="outcome" aria-live="polite">
        {outcomeText} {yourTotal} : {theirTotal}
      </p>

      <p className="letter">
        {t.letterIs} <strong>{revealed.letter}</strong>
      </p>

      <div className="table-scroll">
        <table className="sheet-table">
          <caption className="visually-hidden">{t.resultsTitle}</caption>
          <thead>
            <tr>
              <th scope="col" className="col-head col-row-head">
                {t.player}
              </th>
              {CATEGORIES.map((category) => (
                <th scope="col" className="col-head" key={category}>
                  {labels[category]}
                </th>
              ))}
              <th scope="col" className="col-head col-total">
                {t.total}
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" className="col-row-head">
                  {row.label}
                </th>

                {row.cells.map((cell) => {
                  const empty = cell.raw.trim() === "";
                  return (
                    <td className={empty ? "cell cell-empty" : "cell"} key={cell.category}>
                      {/* Marked in the corner in red pen, the way the points are
                          written on the paper sheet. */}
                      <span className="cell-points">
                        <span className="visually-hidden">{t.points}: </span>
                        {cell.points}
                      </span>

                      {empty ? (
                        <span className="visually-hidden">{t.noAnswer}</span>
                      ) : (
                        <>
                          <span className={cell.valid ? "cell-answer" : "cell-answer answer-invalid"}>
                            {cell.raw}
                          </span>
                          <span className="verdict">
                            {cell.valid
                              ? t.valid
                              : cell.rejected
                                ? t.rejectReasons[cell.rejected]
                                : t.invalid}
                          </span>
                        </>
                      )}

                      {/* Shown on a blank cell too: a hint used is part of the record. */}
                      {cell.hinted ? <span className="verdict verdict-hinted">{t.hinted}</span> : null}
                      <span className="visually-hidden">{cell.reason}</span>
                    </td>
                  );
                })}

                <td className="cell cell-total">{row.total}</td>
              </tr>
            ))}

            {BLANK_SHEET_ROWS.map((line) => (
              <tr className="row-blank" aria-hidden="true" key={line}>
                <td className="col-row-head" />
                {CATEGORIES.map((category) => (
                  <td className="cell" key={category} />
                ))}
                <td className="cell cell-total" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The closing note and the way out share one line: the round is over and
          a room holds exactly one round, so the way on is a new room rather
          than a rematch in this one. */}
      <div className="results-footer">
        <div className="results-note">
          <p className="notice">{results.verified ? t.verifiedNote : t.unverifiedNote}</p>
          {results.botFailed ? <p className="notice">{t.botFailedNote}</p> : null}
        </div>

        <button type="button" onClick={onLeave}>
          {t.backToLobby}
        </button>
      </div>

      <section className="coach-panel" aria-labelledby="coach-title">
        <h2 id="coach-title">{t.coach.summary}</h2>
        <button type="button" onClick={onReviewRound} disabled={coachLoading || coachView !== null || coachUnavailable || coachDisabled}>
          {coachLoading ? t.coach.loading : t.coach.action}
        </button>
        {coachLoading ? <p role="status" aria-live="polite">{t.coach.loading}</p> : null}
        {coachUnavailable ? <p role="alert">{coachErrorCode ? t.errors[coachErrorCode] : t.coach.unavailable}</p> : null}
        {coachView?.status === "completed" ? <p role="status">{t.coach.completed}</p> : null}
        {coachView && coachView.status !== "completed" ? <p role="status">{t.coach.stopReasons[coachView.stopReason]}</p> : null}
        {coachView?.status === "completed" && coachResult ? (
          <div className="coach-result">
            <p>{coachResult.confidence === "medium" ? t.coach.confidenceMedium : t.coach.confidenceLow}</p>
            <h3>{t.coach.finding}</h3>
            <ul>{coachResult.summary.findingIds.map((id) => {
              const evidence = coachResult.evidence.find((item) => item.id === id)!;
              if (evidence.kind === "cell") {
                const state = evidence.blank ? t.coach.blank : evidence.accepted ? t.coach.accepted : t.coach.rejected;
                const reason = evidence.rejectReason ? `: ${t.rejectReasons[evidence.rejectReason]}` : "";
                return <li key={id}>{t.coach.findingCell.replace("{{category}}", labels[evidence.category]).replace("{{state}}", state).replace("{{reason}}", reason).replace("{{points}}", String(evidence.points))}</li>;
              }
              if (evidence.kind === "totals") return <li key={id}>{t.coach.totalsEvidence.replace("{{blank}}", String(evidence.blank)).replace("{{accepted}}", String(evidence.accepted)).replace("{{rejected}}", String(evidence.rejectedNonblank)).replace("{{hinted}}", String(evidence.hinted)).replace("{{duplicates}}", String(evidence.acceptedDuplicates)).replace("{{points}}", String(evidence.ownPoints))}</li>;
              return <li key={id}>{t.coach.verifiedEvidence.replace("{{status}}", evidence.verified ? t.coach.yes : t.coach.no)}</li>;
            })}</ul>
            <h3>{t.coach.recommendations}</h3>
            <ul>{coachResult.recommendations.map((item, index) => (
              <li key={`${item.code}-${item.category ?? "all"}-${index}`}>
                {item.code === "maintain_approach"
                  ? coachResult.evidence.find((entry) => entry.kind === "verification")?.verified ? t.coach.maintainVerified : t.coach.maintainLocal
                  : t.coach.recommendationText[item.code].replace("{{category}}", item.category ? labels[item.category] : "")}
              </li>
            ))}</ul>
            <ul>{coachResult.limitations.map((limitation) => (
              <li key={limitation}>{limitation === "single_round" ? t.coach.limitationSingleRound : limitation === "checker_can_be_wrong" ? t.coach.limitationChecker : t.coach.limitationLocal}</li>
            ))}</ul>
            <details>
              <summary>{t.coach.evidence}</summary>
              <ul>{coachResult.evidence.map((item) => {
                if (item.kind === "cell") {
                  const state = item.blank ? t.coach.blank : item.accepted ? t.coach.accepted : t.coach.rejected;
                  return <li key={item.id}>{t.coach.evidenceCell.replace("{{category}}", labels[item.category]).replace("{{state}}", state).replace("{{points}}", String(item.points)).replace("{{hint}}", item.hinted ? t.coach.hintedEvidence : "")}</li>;
                }
                if (item.kind === "totals") return <li key={item.id}>{t.coach.totalsEvidence.replace("{{blank}}", String(item.blank)).replace("{{accepted}}", String(item.accepted)).replace("{{rejected}}", String(item.rejectedNonblank)).replace("{{hinted}}", String(item.hinted)).replace("{{duplicates}}", String(item.acceptedDuplicates)).replace("{{points}}", String(item.ownPoints))}</li>;
                return <li key={item.id}>{t.coach.verifiedEvidence.replace("{{status}}", item.verified ? t.coach.yes : t.coach.no)}</li>;
              })}</ul>
            </details>
          </div>
        ) : null}
      </section>
    </section>
  );
}
