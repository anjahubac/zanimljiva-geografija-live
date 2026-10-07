import { z } from "zod";
import { CATEGORIES, MAX_ANSWER_LENGTH, categorySchema } from "./game.schemas";

/*
 * What the model must return (`Plan.md` §2B). Adapted from the colleague's
 * fork. Two fences: each JSON Schema below is sent to Gemini as
 * `responseJsonSchema`; the zod schemas re-validate the reply here, including
 * limits Gemini cannot express.
 *
 * Gemini documents only a subset of JSON Schema (type, properties, required,
 * additionalProperties, enum, items, min/maxItems, description), with no
 * `anyOf` or nullable types, so "no value" is the empty string "".
 */

export const MAX_NAME_LENGTH = 60;
export const MAX_RAW_CLUE_LENGTH = 300;
/** Two players × eight categories, before de-duplication. */
export const MAX_CHECK_ITEMS = 2 * CATEGORIES.length;

const noControlCharacters = (value: string) => !/\p{Cc}/u.test(value);
const name = z.string().max(MAX_NAME_LENGTH).refine(noControlCharacters, "control character");

/* -------------------------------------------------------- answer checker */

export const CHECK_VERDICTS = ["accepted", "rejected"] as const;
export const CHECK_REASONS = ["not_real", "wrong_category", "historical", "unrecognized"] as const;
export type CheckReason = (typeof CHECK_REASONS)[number];

export const checkItemSchema = z
  .object({
    id: z.string().max(8),
    verdict: z.enum(CHECK_VERDICTS),
    recognizedSr: name,
    recognizedEn: name,
    reason: z.enum([...CHECK_REASONS, ""]),
  })
  .strict();
export type CheckItem = z.infer<typeof checkItemSchema>;

export const checkOutputSchema = z
  .object({ items: z.array(checkItemSchema).min(1).max(MAX_CHECK_ITEMS) })
  .strict();

export const CHECK_JSON_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      minItems: 1,
      maxItems: MAX_CHECK_ITEMS,
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "The id of the item being judged, copied exactly." },
          verdict: { type: "string", enum: [...CHECK_VERDICTS] },
          recognizedSr: { type: "string", description: 'Correct Serbian Latin name of the recognised term, or "".' },
          recognizedEn: { type: "string", description: 'English name of the recognised term, or "".' },
          reason: { type: "string", enum: [...CHECK_REASONS, ""] },
        },
        required: ["id", "verdict", "recognizedSr", "recognizedEn", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

/* ------------------------------------------------------------ bot answers */

export const botOutputSchema = z
  .object({
    answers: z
      .array(
        z
          .object({
            category: categorySchema,
            answer: z.string().max(MAX_ANSWER_LENGTH).refine(noControlCharacters, "control character"),
          })
          .strict(),
      )
      .length(CATEGORIES.length),
  })
  .strict();

export const BOT_JSON_SCHEMA = {
  type: "object",
  properties: {
    answers: {
      type: "array",
      minItems: CATEGORIES.length,
      maxItems: CATEGORIES.length,
      items: {
        type: "object",
        properties: {
          category: { type: "string", enum: [...CATEGORIES] },
          answer: { type: "string", description: 'One real term in Serbian Latin, or "".' },
        },
        required: ["category", "answer"],
        additionalProperties: false,
      },
    },
  },
  required: ["answers"],
  additionalProperties: false,
} as const;

/* ------------------------------------------------------------------ hints */

export const hintOutputSchema = z
  .object({
    term: name,
    termEn: name,
    clue: z.string().max(MAX_RAW_CLUE_LENGTH).refine(noControlCharacters, "control character"),
    noKnownTerm: z.boolean(),
  })
  .strict();

export const HINT_JSON_SCHEMA = {
  type: "object",
  properties: {
    term: { type: "string", description: 'The term in Serbian Latin, or "".' },
    termEn: { type: "string", description: 'The English name, or "".' },
    clue: { type: "string", description: 'One or two short sentences that describe the term without naming it, or "".' },
    noKnownTerm: { type: "boolean" },
  },
  required: ["term", "termEn", "clue", "noKnownTerm"],
  additionalProperties: false,
} as const;

/* ------------------------------------------------------- round coach step */

/*
 * One reply per coach step (`Plan.md` §2C.7, contracts/model-step.md). Flat,
 * with every field required and unused ones empty, because Gemini takes no
 * `anyOf`. Deliberately loose: `action` is any short string and the arguments
 * have wide bounds, so an unknown tool reaches the allowlist (`unknown_tool`)
 * and a bad argument reaches the tool's own check (`invalid_tool_args`). Only
 * a reply that is not this shape at all is `malformed_output`.
 */
export const coachStepSchema = z
  .object({
    action: z.string().min(1).max(40),
    candidates: z.array(z.object({ category: z.string().max(20), term: z.string().max(60) }).strict()).max(32),
    evidenceIds: z.array(z.string().max(8)).max(32),
    summary: z.string().max(400),
    tips: z.array(z.object({ category: z.string().max(20), evidenceId: z.string().max(8) }).strict()).max(16),
    confidence: z.string().max(10),
  })
  .strict();
export type CoachStep = z.infer<typeof coachStepSchema>;

/** Stricter than the zod envelope, as a hint to the provider only; the allowlist is the fence. */
export const COACH_STEP_JSON_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["check_candidates", "verify_terms", "final"] },
    candidates: {
      type: "array",
      maxItems: 16,
      items: {
        type: "object",
        properties: {
          category: { type: "string", enum: [...CATEGORIES] },
          term: { type: "string", description: "One word or name to check, as a player would write it." },
        },
        required: ["category", "term"],
        additionalProperties: false,
      },
    },
    evidenceIds: {
      type: "array",
      maxItems: 16,
      items: { type: "string" },
      description: "verify_terms only: ids of passing checked items to send to the referee.",
    },
    summary: { type: "string", description: 'One or two sentences for the player, or "".' },
    tips: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          category: { type: "string", enum: [...CATEGORIES] },
          evidenceId: { type: "string", description: 'The id of a passing checked item, or "" for no suggestion.' },
        },
        required: ["category", "evidenceId"],
        additionalProperties: false,
      },
    },
    confidence: { type: "string", enum: ["low", "medium", "high", ""] },
  },
  required: ["action", "candidates", "evidenceIds", "summary", "tips", "confidence"],
  additionalProperties: false,
} as const;
