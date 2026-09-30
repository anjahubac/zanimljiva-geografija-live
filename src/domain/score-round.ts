import { CATEGORIES } from "@contracts/game.schemas";
import type { Category, CategoryScore, Letter, Outcome } from "@contracts/game.schemas";
import { scoreCategory, scoreJudgedCategory, type JudgedAnswer } from "@domain/score-category";

export type RoundScore = {
  scores: CategoryScore[];
  player1Total: number;
  player2Total: number;
  outcome: Outcome;
};

function total(scores: CategoryScore[]): RoundScore {
  const player1Total = scores.reduce((sum, score) => sum + score.player1Points, 0);
  const player2Total = scores.reduce((sum, score) => sum + score.player2Points, 0);

  const outcome: Outcome =
    player1Total > player2Total ? "player_1" : player2Total > player1Total ? "player_2" : "draw";

  return { scores, player1Total, player2Total, outcome };
}

/**
 * Scores every category in the locked `CATEGORIES` order, so both players
 * receive the same rows in the same order from one deterministic pass.
 */
export function scoreRound(
  answers1: Record<Category, string>,
  answers2: Record<Category, string>,
  letter: Letter,
): RoundScore {
  return total(CATEGORIES.map((category) => scoreCategory(category, answers1[category], answers2[category], letter)));
}

/** The same pass over answers whose validity was already decided (Week 4, with the AI verdict). */
export function scoreJudgedRound(
  judged1: Record<Category, JudgedAnswer>,
  judged2: Record<Category, JudgedAnswer>,
): RoundScore {
  return total(CATEGORIES.map((category) => scoreJudgedCategory(category, judged1[category], judged2[category])));
}
