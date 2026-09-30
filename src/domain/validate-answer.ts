import { MIN_ANSWER_LENGTH, type Language, type Letter } from "@contracts/game.schemas";
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
export function isValidAnswer(raw: string, letter: Letter, alphabet: Language): boolean {
  return checkAnswerLocally(raw, letter, alphabet).ok;
}

export type LocalVerdict =
  | { ok: true }
  | { ok: false; reason: "empty" | "too_short" | "wrong_letter" };

/** The same rule as `isValidAnswer`, saying why an answer failed. */
export function checkAnswerLocally(raw: string, letter: Letter, alphabet: Language): LocalVerdict {
  const normalized = normalizeAnswer(raw);
  if (normalized === "") return { ok: false, reason: "empty" };
  if (normalized.length < MIN_ANSWER_LENGTH) return { ok: false, reason: "too_short" };
  if (!startsWithLetter(normalized, letter, alphabet)) return { ok: false, reason: "wrong_letter" };
  return { ok: true };
}

/**
 * In the Serbian alphabet Lj, Nj and Dž are letters of their own, so L, N and
 * D do not take a word that starts with them (`Plan.md` §2B.13). English has
 * no such letters.
 */
const SERBIAN_DIGRAPH_OF: Partial<Record<Letter, string>> = { L: "lj", N: "nj", D: "dž" };

/**
 * Case-insensitive, diacritics respected: "Šabac" does not start with S. In a
 * Serbian room "Ljubljana" starts with Lj and not with L.
 */
export function startsWithLetter(text: string, letter: Letter, alphabet: Language): boolean {
  const normalizedLetter = normalizeAnswer(letter);
  const normalizedText = normalizeAnswer(text);
  if (normalizedLetter === "" || !normalizedText.startsWith(normalizedLetter)) return false;
  const digraph = alphabet === "sr" ? SERBIAN_DIGRAPH_OF[letter] : undefined;
  return digraph === undefined || !normalizedText.startsWith(digraph);
}
