import { CATEGORIES } from "@contracts/game.schemas";
import type { Category, PlayerSlot, RejectReason } from "@contracts/game.schemas";
import type { RoundResults, RoundRevealed } from "@contracts/socket.schemas";
import { useI18n } from "@client/i18n";

type Props = {
  you: PlayerSlot;
  revealed: RoundRevealed;
  results: RoundResults;
  opponentIsBot?: boolean;
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

export function ResultsScreen({ you, revealed, results, opponentIsBot = false, onLeave }: Props) {
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
    </section>
  );
}
