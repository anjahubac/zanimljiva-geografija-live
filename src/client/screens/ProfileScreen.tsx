import { useEffect, useState } from "react";
import { CATEGORY_LABELS_SR } from "@contracts/game.schemas";
import type { Profile } from "@contracts/account.schemas";
import { accountApi, type ApiFailure } from "@client/accounts/account-api";
import { AUTH_SR, UI_SR } from "@client/strings";

type Props = {
  onBack: () => void;
};

const OUTCOME_TEXT = {
  win: AUTH_SR.outcomeWin,
  loss: AUTH_SR.outcomeLoss,
  draw: AUTH_SR.outcomeDraw,
} as const;

const formatDate = (epochMs: number) =>
  new Date(epochMs).toLocaleDateString("sr-Latn-RS", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export function ProfileScreen({ onBack }: Props) {
  const [page, setPage] = useState(1);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);

  useEffect(() => {
    let live = true;
    void accountApi.profile(page).then((result) => {
      if (!live) return;
      if (result.ok) {
        setProfile(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    });
    return () => {
      live = false;
    };
  }, [page]);

  const hasNextPage = profile !== null && profile.history.length === profile.pageSize;

  return (
    <section className="screen screen-wide" aria-labelledby="profile-title">
      <h1 className="screen-title" id="profile-title">
        {AUTH_SR.profileTitle}
      </h1>

      {error ? (
        <p className="field-error" role="alert">
          {AUTH_SR.errors[error]}
        </p>
      ) : null}

      {profile ? (
        <>
          <p className="profile-name">{profile.account.displayName}</p>

          <dl className="profile-stats">
            <div>
              <dt>{AUTH_SR.games}</dt>
              <dd>{profile.games}</dd>
            </div>
            <div>
              <dt>{AUTH_SR.wins}</dt>
              <dd>{profile.wins}</dd>
            </div>
            <div>
              <dt>{AUTH_SR.totalPoints}</dt>
              <dd>{profile.points}</dd>
            </div>
          </dl>

          <h2 className="section-title">{AUTH_SR.historyTitle}</h2>

          {profile.history.length === 0 ? (
            <p className="notice">{AUTH_SR.noHistory}</p>
          ) : (
            <ol className="history" aria-live="polite">
              {profile.history.map((game) => (
                <li className="history-game" key={game.roundId}>
                  <p className="history-head">
                    <span className="history-letter">{game.letter}</span>
                    <span>{formatDate(game.completedAt)}</span>
                    <span>
                      {AUTH_SR.opponentLabel}: {game.opponent}
                    </span>
                    <span className={`history-outcome outcome-${game.outcome}`}>
                      {OUTCOME_TEXT[game.outcome]} {game.total} : {game.opponentTotal}
                    </span>
                  </p>

                  <div className="table-scroll">
                    <table className="sheet-table">
                      <caption className="visually-hidden">
                        {AUTH_SR.historyTitle} — {game.letter}
                      </caption>
                      <thead>
                        <tr>
                          {game.answers.map((answer) => (
                            <th scope="col" className="col-head" key={answer.category}>
                              {CATEGORY_LABELS_SR[answer.category]}
                            </th>
                          ))}
                          <th scope="col" className="col-head col-total">
                            {UI_SR.total}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {game.answers.map((answer) => (
                            <td
                              className={answer.raw.trim() === "" ? "cell cell-empty" : "cell"}
                              key={answer.category}
                            >
                              <span className="cell-points">
                                <span className="visually-hidden">{UI_SR.points}: </span>
                                {answer.points}
                              </span>
                              <span
                                className={
                                  answer.valid ? "cell-answer" : "cell-answer answer-invalid"
                                }
                              >
                                {answer.raw}
                              </span>
                            </td>
                          ))}
                          <td className="cell cell-total">{game.total}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <nav className="pager" aria-label={AUTH_SR.historyTitle}>
            <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>
              {AUTH_SR.previousPage}
            </button>
            <span>
              {AUTH_SR.page} {profile.page}
            </span>
            <button type="button" disabled={!hasNextPage} onClick={() => setPage(page + 1)}>
              {AUTH_SR.nextPage}
            </button>
          </nav>
        </>
      ) : null}

      <button type="button" className="link" onClick={onBack}>
        {AUTH_SR.backToGame}
      </button>
    </section>
  );
}
