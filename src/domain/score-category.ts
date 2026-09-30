import type { Category, CategoryScore, Letter } from "@contracts/game.schemas";
import { normalizeAnswer } from "@domain/normalize-answer";
import { isValidAnswer } from "@domain/validate-answer";

/**
 * One player's answer after validity is decided. `key` is what "the same
 * answer" is compared on: the normalized text under the local rule, or the
 * AI's canonical name for the term, so "Srbija" and "Serbia" match.
 */
export type JudgedAnswer = { valid: boolean; key: string };

/**
 * Traditional scoring for one category (`Plan.md` §6).
 *
 * Validity is decided per player *before* the two answers are compared; two
 * invalid answers are never "the same answer", they are simply both worth zero.
 */
export function scoreJudgedCategory(category: Category, player1: JudgedAnswer, player2: JudgedAnswer): CategoryScore {
  if (player1.valid && player2.valid) {
    return player1.key === player2.key
      ? { category, player1Points: 5, player2Points: 5, reason: "same_answer" }
      : { category, player1Points: 10, player2Points: 10, reason: "both_different" };
  }

  if (player1.valid) {
    return { category, player1Points: 10, player2Points: 0, reason: "only_player_1" };
  }

  if (player2.valid) {
    return { category, player1Points: 0, player2Points: 10, reason: "only_player_2" };
  }

  return { category, player1Points: 0, player2Points: 0, reason: "neither" };
}

/** The local rule only: the Week 3 behaviour, and the fallback when the AI check is unavailable. */
export function scoreCategory(
  category: Category,
  player1Raw: string,
  player2Raw: string,
  letter: Letter,
): CategoryScore {
  const judge = (raw: string): JudgedAnswer => ({ valid: isValidAnswer(raw, letter), key: normalizeAnswer(raw) });
  return scoreJudgedCategory(category, judge(player1Raw), judge(player2Raw));
}
