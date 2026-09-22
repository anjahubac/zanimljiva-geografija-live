import type { Category, CategoryScore, Letter } from "@contracts/game.schemas";
import { normalizeAnswer } from "@domain/normalize-answer";
import { isValidAnswer } from "@domain/validate-answer";

/**
 * Traditional scoring for one category (`Plan.md` §6).
 *
 * Validity is decided per player *before* the two answers are compared; two
 * invalid answers are never "the same answer", they are simply both worth zero.
 */
export function scoreCategory(
  category: Category,
  player1Raw: string,
  player2Raw: string,
  letter: Letter,
): CategoryScore {
  const player1Valid = isValidAnswer(player1Raw, letter);
  const player2Valid = isValidAnswer(player2Raw, letter);

  if (player1Valid && player2Valid) {
    const sameAnswer = normalizeAnswer(player1Raw) === normalizeAnswer(player2Raw);
    return sameAnswer
      ? { category, player1Points: 5, player2Points: 5, reason: "same_answer" }
      : { category, player1Points: 10, player2Points: 10, reason: "both_different" };
  }

  if (player1Valid) {
    return { category, player1Points: 10, player2Points: 0, reason: "only_player_1" };
  }

  if (player2Valid) {
    return { category, player1Points: 0, player2Points: 10, reason: "only_player_2" };
  }

  return { category, player1Points: 0, player2Points: 0, reason: "neither" };
}
