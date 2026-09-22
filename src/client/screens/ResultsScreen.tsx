import { CATEGORIES, CATEGORY_LABELS_SR } from "@contracts/game.schemas";
import type { Category, PlayerSlot } from "@contracts/game.schemas";
import type { RoundResults, RoundRevealed } from "@contracts/socket.schemas";
import { UI_SR } from "@client/strings";

type Props = {
  you: PlayerSlot;
  revealed: RoundRevealed;
  results: RoundResults;
  onLeave: () => void;
};

type SheetCell = {
  category: Category;
  raw: string;
  valid: boolean;
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

export function ResultsScreen({ you, revealed, results, onLeave }: Props) {
  const buildRow = (slot: PlayerSlot, label: string): SheetRow => {
    const answers = slot === 1 ? revealed.player1 : revealed.player2;

    const cells = CATEGORIES.map((category) => {
      const answer = answers.find((entry) => entry.category === category);
      const score = results.scores.find((entry) => entry.category === category);
      return {
        category,
        raw: answer?.raw ?? "",
        valid: answer?.valid ?? false,
        points: (slot === 1 ? score?.player1Points : score?.player2Points) ?? 0,
        reason: score ? UI_SR.reasons[score.reason] : "",
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
  const rows = [buildRow(you, UI_SR.you), buildRow(opponent, UI_SR.opponent)];

  const yourTotal = you === 1 ? results.player1Total : results.player2Total;
  const theirTotal = you === 1 ? results.player2Total : results.player1Total;

  const outcomeText =
    results.outcome === "draw"
      ? UI_SR.outcomeDraw
      : (results.outcome === "player_1") === (you === 1)
        ? UI_SR.outcomeWin
        : UI_SR.outcomeLoss;

  return (
    <section className="screen screen-results screen-wide" aria-labelledby="results-title">
      <h1 id="results-title" className="screen-title">
        {UI_SR.resultsTitle}
      </h1>

      <p className="outcome" aria-live="polite">
        {outcomeText} {yourTotal} : {theirTotal}
      </p>

      <p className="letter">
        {UI_SR.letterIs} <strong>{revealed.letter}</strong>
      </p>

      <div className="table-scroll">
        <table className="sheet-table">
          <caption className="visually-hidden">{UI_SR.resultsTitle}</caption>
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
                        <span className="visually-hidden">{UI_SR.points}: </span>
                        {cell.points}
                      </span>

                      {empty ? (
                        <span className="visually-hidden">{UI_SR.noAnswer}</span>
                      ) : (
                        <>
                          <span className={cell.valid ? "cell-answer" : "cell-answer answer-invalid"}>
                            {cell.raw}
                          </span>
                          <span className="verdict">
                            {cell.valid ? UI_SR.valid : UI_SR.invalid}
                          </span>
                        </>
                      )}

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
          <p className="notice">{UI_SR.honorSystemSr}</p>
          <p className="notice notice-en" lang="en">
            {UI_SR.honorSystemEn}
          </p>
        </div>

        <button type="button" onClick={onLeave}>
          {UI_SR.backToLobby}
        </button>
      </div>
    </section>
  );
}
