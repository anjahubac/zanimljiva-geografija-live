import { CHECK_JSON_SCHEMA, checkOutputSchema, type CheckItem } from "@contracts/ai-output.schemas";
import { CATEGORIES, type Category, type Letter, type PlayerSlot, type RejectReason } from "@contracts/game.schemas";
import { compactFold } from "@domain/fold-letters";
import { editDistance, resembles } from "@domain/resemblance";
import { checkAnswerLocally, startsWithLetter } from "@domain/validate-answer";
import { generate, type GatewayDeps } from "@server/ai/gateway";
import { BUDGETS } from "@server/ai/retry-policy";
import type { AiResult, Validation, ValidationNotes } from "@server/ai/types";
import {
  buildCheckRoundContent,
  CHECK_ROUND_PROMPT_VERSION,
  CHECK_ROUND_SYSTEM_INSTRUCTION,
  type CheckRoundItem,
} from "@server/prompts/check-round.v3";

/*
 * One request per round judges both players (`Plan.md` §2B.2). Adapted from
 * the colleague's `check-round.ts`: answers that fail the local rule are never
 * sent, identical answers in one category are sent once, and the model's
 * verdict is overridden by code where the model cannot be trusted (the round
 * letter, and naming a term the player did not write).
 */

export type Sheets = Record<PlayerSlot, Record<Category, string>>;

/** What the checker decided about one accepted-or-rejected answer. */
export type AiVerdict =
  | { valid: true; canonical: string }
  | { valid: false; reason: RejectReason };

/** Verdicts for every answer that was sent, keyed by `answerKey`. */
export type CheckVerdicts = Map<string, AiVerdict>;

export const answerKey = (slot: PlayerSlot, category: Category): string => `${slot}:${category}`;

export type CheckPlan = {
  items: CheckRoundItem[];
  /** answerKey -> the item id it was sent as. */
  itemOf: Map<string, string>;
};

/** Which answers go to the model, de-duplicated per category. Pure. */
export function planCheck(letter: Letter, sheets: Sheets): CheckPlan {
  const items: CheckRoundItem[] = [];
  const itemOf = new Map<string, string>();
  const idByAnswer = new Map<string, string>();

  for (const category of CATEGORIES) {
    for (const slot of [1, 2] as const) {
      const written = sheets[slot][category];
      if (!checkAnswerLocally(written, letter).ok) continue;

      const dedupe = `${category}:${compactFold(written)}`;
      let id = idByAnswer.get(dedupe);
      if (id === undefined) {
        id = `a${items.length}`;
        idByAnswer.set(dedupe, id);
        items.push({ id, category, answer: written });
      }
      itemOf.set(answerKey(slot, category), id);
    }
  }
  return { items, itemOf };
}

const blank = (value: string): string | null => (value.trim() === "" ? null : value.trim());

/**
 * The name the letter rule is checked on: the recognised name (Serbian or
 * English) closest to what the player wrote, Serbian on a tie. Null when
 * neither resembles it — the model named a different term.
 */
function nameToCheck(written: string, item: CheckItem): string | null {
  const candidates = [blank(item.recognizedSr), blank(item.recognizedEn)].filter(
    (name): name is string => name !== null && resembles(written, name),
  );
  if (candidates.length === 0) return null;
  const target = compactFold(written);
  return candidates.reduce((best, name) =>
    editDistance(target, compactFold(name)) < editDistance(target, compactFold(best)) ? name : best,
  );
}

/** Parse -> schema -> semantic validation of the model's reply. Pure; exported for tests. */
export function validateCheck(text: string, letter: Letter, plan: CheckPlan): Validation<Map<string, AiVerdict>> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, code: "invalid_output:json" };
  }

  const parsed = checkOutputSchema.safeParse(json);
  if (!parsed.success) return { ok: false, code: "invalid_output:schema" };

  // Exactly the items we sent, each once.
  const byId = new Map<string, CheckItem>();
  for (const item of parsed.data.items) {
    if (byId.has(item.id)) return { ok: false, code: "invalid_output:semantic" };
    byId.set(item.id, item);
  }
  if (byId.size !== plan.items.length || plan.items.some(({ id }) => !byId.has(id))) {
    return { ok: false, code: "invalid_output:semantic" };
  }

  const notes: ValidationNotes = { items: plan.items.length, overrides: 0 };
  const verdicts = new Map<string, AiVerdict>();

  for (const sent of plan.items) {
    const item = byId.get(sent.id)!;
    if (item.verdict === "rejected") {
      verdicts.set(sent.id, { valid: false, reason: item.reason === "" ? "unrecognized" : item.reason });
      continue;
    }

    const name = nameToCheck(sent.answer, item);
    if (name === null) {
      // The model "corrected" the answer into a term the player did not write.
      notes.overrides! += 1;
      verdicts.set(sent.id, { valid: false, reason: "unrecognized" });
    } else if (!startsWithLetter(name, letter)) {
      // The letter is decided by code, never by the model: "Sabac" is Šabac.
      notes.overrides! += 1;
      verdicts.set(sent.id, { valid: false, reason: "wrong_letter" });
    } else {
      // One key per term, whichever language the player used, so "Srbija"
      // and "Serbia" are the same answer.
      const canonical = compactFold(blank(item.recognizedSr) ?? name);
      verdicts.set(sent.id, { valid: true, canonical });
    }
  }

  return { ok: true, value: verdicts, notes };
}

export async function runCheck(
  letter: Letter,
  sheets: Sheets,
  deps: GatewayDeps & { interactionId: string },
): Promise<AiResult<CheckVerdicts>> {
  const plan = planCheck(letter, sheets);
  const toAnswers = (byItem: Map<string, AiVerdict>): CheckVerdicts =>
    new Map([...plan.itemOf].map(([key, id]) => [key, byItem.get(id)!]));

  // Nothing passed the local rule: there is nothing to ask, and it is still verified.
  if (plan.items.length === 0) {
    return { ok: true, value: new Map(), model: "none", fallbackUsed: false, attempts: [] };
  }

  const result = await generate(
    {
      operation: "check-round",
      promptVersion: CHECK_ROUND_PROMPT_VERSION,
      interactionId: deps.interactionId,
      systemInstruction: CHECK_ROUND_SYSTEM_INSTRUCTION,
      userContent: buildCheckRoundContent(letter, plan.items),
      responseJsonSchema: CHECK_JSON_SCHEMA,
      temperature: 0,
      maxOutputTokens: 2_000,
      budget: BUDGETS["check-round"],
      validate: (text) => validateCheck(text, letter, plan),
    },
    deps,
  );
  return result.ok ? { ...result, value: toAnswers(result.value) } : result;
}
