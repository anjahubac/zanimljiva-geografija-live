import { MIN_ANSWER_LENGTH } from "@contracts/game.schemas";
import { normalizeAnswer } from "@domain/normalize-answer";

/**
 * Core validity is an honor-system rule: at least MIN_ANSWER_LENGTH characters
 * after normalization, and starting with the round letter. Geographic or
 * semantic correctness is explicitly not checked (`GAME_SPEC.md` §5 rule 4).
 *
 * The 40-character cap is an input bound owned by `answerValueSchema` at the
 * socket boundary, not re-checked here, so the rule has exactly one owner.
 *
 * Amendment 2 (2026-09-22): the floor was `length > 0`, which let a player
 * score by typing the round letter alone. Recorded in `docs/EVIDENCE_003.md`.
 */
export function isValidAnswer(raw: string, letter: string): boolean {
  const normalized = normalizeAnswer(raw);
  const normalizedLetter = normalizeAnswer(letter);
  return normalized.length >= MIN_ANSWER_LENGTH && normalized.startsWith(normalizedLetter);
}
