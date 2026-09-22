import { randomInt } from "node:crypto";
import { SUPPORTED_LETTERS } from "@contracts/game.schemas";
import type { Letter } from "@contracts/game.schemas";

/**
 * Injected so a test can pin the round letter. The allowlist is fixed in the
 * contracts module and is never widened here.
 */
export type LetterSelector = () => Letter;

export const randomLetterSelector: LetterSelector = () =>
  SUPPORTED_LETTERS[randomInt(SUPPORTED_LETTERS.length)]!;
