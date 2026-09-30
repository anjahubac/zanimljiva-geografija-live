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
 *
 * Week 4 (`Plan.md` §2B.2): this rule is step 1 of validity. Only answers it
 * accepts are sent to the AI checker, which is step 2.
 */
export function isValidAnswer(raw: string, letter: string): boolean {
  return checkAnswerLocally(raw, letter).ok;
}

export type LocalVerdict =
  | { ok: true }
  | { ok: false; reason: "empty" | "too_short" | "wrong_letter" };

/** The same rule as `isValidAnswer`, saying why an answer failed. */
export function checkAnswerLocally(raw: string, letter: string): LocalVerdict {
  const normalized = normalizeAnswer(raw);
  if (normalized === "") return { ok: false, reason: "empty" };
  if (normalized.length < MIN_ANSWER_LENGTH) return { ok: false, reason: "too_short" };
  if (!startsWithLetter(normalized, letter)) return { ok: false, reason: "wrong_letter" };
  return { ok: true };
}

/** Case-insensitive, diacritics respected: "Šabac" does not start with S. */
export function startsWithLetter(text: string, letter: string): boolean {
  const normalizedLetter = normalizeAnswer(letter);
  return normalizedLetter !== "" && normalizeAnswer(text).startsWith(normalizedLetter);
}
