import { CATEGORY_LABELS_SR } from "@contracts/game.schemas";
import type { Category, PlayerSlot } from "@contracts/game.schemas";
import type { RoundResults, RoundRevealed } from "@contracts/socket.schemas";
import { UI_SR } from "@client/strings";

type Props = {
  you: PlayerSlot;
  revealed: RoundRevealed;
  results: RoundResults;
};

export function ResultsScreen({ you, revealed, results }: Props) {
  const yourAnswers = you === 1 ? revealed.player1 : revealed.player2;
  const theirAnswers = you === 1 ? revealed.player2 : revealed.player1;
  const yourTotal = you === 1 ? results.player1Total : results.player2Total;
  const theirTotal = you === 1 ? results.player2Total : results.player1Total;

  const outcomeText =
    results.outcome === "draw"
      ? UI_SR.outcomeDraw
      : (results.outcome === "player_1") === (you === 1)
        ? UI_SR.outcomeWin
        : UI_SR.outcomeLoss;

  const answerFor = (list: RoundRevealed["player1"], category: Category) =>
    list.find((answer) => answer.category === category);

  const pointsFor = (category: Category) => {
    const score = results.scores.find((entry) => entry.category === category);
    if (!score) return { yours: 0, theirs: 0, reason: "neither" as const };
    return you === 1
      ? { yours: score.player1Points, theirs: score.player2Points, reason: score.reason }
      : { yours: score.player2Points, theirs: score.player1Points, reason: score.reason };
  };

  /**
   * An unanswered cell gets the diagonal the paper game strikes through it.
   * The words stay in the DOM for assistive technology, so the meaning never
   * rests on a drawn line or on ink colour alone.
   */
  const renderCell = (answer: RoundRevealed["player1"][number] | undefined) => {
    if (!answer || answer.raw.trim() === "") {
      return (
        <td className="cell-empty" key="empty">
          <span className="visually-hidden">{UI_SR.noAnswer}</span>
        </td>
      );
    }
    return (
      <td key="filled">
        <span className={answer.valid ? undefined : "answer-invalid"}>{answer.raw}</span>
        <span className="verdict">{answer.valid ? UI_SR.valid : UI_SR.invalid}</span>
      </td>
    );
  };

  return (
    <section className="screen screen-results" aria-labelledby="results-title">
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
        <table className="results-table">
          <caption className="visually-hidden">{UI_SR.resultsTitle}</caption>
          <thead>
            <tr>
              <th scope="col">{UI_SR.points}</th>
              <th scope="col">{UI_SR.you}</th>
              <th scope="col">{UI_SR.opponent}</th>
              <th scope="col">{UI_SR.points}</th>
            </tr>
          </thead>
          <tbody>
            {results.scores.map((score) => {
              const points = pointsFor(score.category);
              return (
                <tr key={score.category}>
                  <th scope="row">{CATEGORY_LABELS_SR[score.category]}</th>
                  {renderCell(answerFor(yourAnswers, score.category))}
                  {renderCell(answerFor(theirAnswers, score.category))}
                  <td>
                    <span className="points">
                      {points.yours} : {points.theirs}
                    </span>
                    <span className="reason">{UI_SR.reasons[score.reason]}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">{UI_SR.total}</th>
              <td>{yourTotal}</td>
              <td>{theirTotal}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="notice">{UI_SR.honorSystemSr}</p>
      <p className="notice notice-en" lang="en">
        {UI_SR.honorSystemEn}
      </p>
    </section>
  );
}
