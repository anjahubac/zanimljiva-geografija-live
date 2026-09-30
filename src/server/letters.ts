import { randomInt } from "node:crypto";
import { ALPHABETS } from "@contracts/game.schemas";
import type { Language, Letter } from "@contracts/game.schemas";

/**
 * Injected so a test can pin the round letter. The room's alphabet decides the
 * set (`Plan.md` §2B.13); the sets are fixed in the contracts module and never
 * widened here.
 */
export type LetterSelector = (alphabet: Language) => Letter;

export const randomLetterSelector: LetterSelector = (alphabet) => {
  const letters = ALPHABETS[alphabet];
  return letters[randomInt(letters.length)]!;
};
