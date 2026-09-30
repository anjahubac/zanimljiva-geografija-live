import { HINT_JSON_SCHEMA, hintOutputSchema } from "@contracts/ai-output.schemas";
import {
  MAX_CLUE_LENGTH,
  MIN_CLUE_LENGTH,
  type Category,
  type Language,
  type Letter,
} from "@contracts/game.schemas";
import { leaksTerm } from "@domain/hint-leak";
import { startsWithLetter } from "@domain/validate-answer";
import { generate, type GatewayDeps } from "@server/ai/gateway";
import { BUDGETS } from "@server/ai/retry-policy";
import type { AiResult, Validation } from "@server/ai/types";
import { buildHintContent, HINT_PROMPT_VERSION, HINT_SYSTEM_INSTRUCTIONS } from "@server/prompts/hint.v3";

/**
 * Adapted from the colleague's `hint.ts`. The described term is used only to
 * validate the clue; it never leaves the server. A clue that names the term
 * in either language is discarded, and the player is not charged for it.
 */
export type HintOutcome = { kind: "clue"; clue: string } | { kind: "no_known_term" };

export function validateHint(text: string, letter: Letter, alphabet: Language): Validation<HintOutcome> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, code: "invalid_output:json" };
  }

  const parsed = hintOutputSchema.safeParse(json);
  if (!parsed.success) return { ok: false, code: "invalid_output:schema" };
  const output = parsed.data;

  if (output.noKnownTerm) return { ok: true, value: { kind: "no_known_term" } };

  const term = output.term.trim();
  const termEn = output.termEn.trim();
  const clue = output.clue.trim();
  const names = [term, termEn].filter(Boolean);
  // The Serbian name must fit in a Serbian room; an English room also takes
  // the English name, since Q, W, X and Y begin almost no Serbian names (§2B.13).
  const fitsLetter =
    startsWithLetter(term, letter, alphabet) ||
    (alphabet === "en" && termEn !== "" && startsWithLetter(termEn, letter, alphabet));
  const leak = leaksTerm(clue, names);

  const valid =
    term !== "" &&
    fitsLetter &&
    clue.length >= MIN_CLUE_LENGTH &&
    clue.length <= MAX_CLUE_LENGTH &&
    !leak;

  return valid
    ? { ok: true, value: { kind: "clue", clue } }
    : { ok: false, code: "invalid_output:semantic", notes: { leak: leak ? 1 : 0 } };
}

export function runHint(
  letter: Letter,
  alphabet: Language,
  category: Category,
  language: Language,
  deps: GatewayDeps & { interactionId: string },
): Promise<AiResult<HintOutcome>> {
  return generate(
    {
      operation: "hint",
      promptVersion: HINT_PROMPT_VERSION,
      interactionId: deps.interactionId,
      systemInstruction: HINT_SYSTEM_INSTRUCTIONS[alphabet],
      userContent: buildHintContent(letter, alphabet, category, language),
      responseJsonSchema: HINT_JSON_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 400,
      budget: BUDGETS.hint,
      validate: (text) => validateHint(text, letter, alphabet),
    },
    deps,
  );
}
