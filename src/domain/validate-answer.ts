import { normalizeAnswer } from "@domain/normalize-answer";

/**
 * Core validity is an honor-system rule: non-empty after normalization and
 * starting with the round letter. Geographic or semantic correctness is
 * explicitly not checked (`GAME_SPEC.md` §5 rule 4).
 *
 * The 40-character cap is an input bound owned by `answerValueSchema` at the
 * socket boundary, not re-checked here, so the rule has exactly one owner.
 *
 * Body is taken verbatim from `Plan.md` §7.
 */
export function isValidAnswer(raw: string, letter: string): boolean {
  const normalized = normalizeAnswer(raw);
  const normalizedLetter = normalizeAnswer(letter);
  return normalized.length > 0 && normalized.startsWith(normalizedLetter);
}
