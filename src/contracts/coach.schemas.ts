import { z } from "zod";
import {
  CATEGORY_COUNT,
  MAX_ANSWER_LENGTH,
  REJECT_REASONS,
  categorySchema,
  languageSchema,
  roundIdSchema,
} from "./game.schemas";

/*
 * The round coach (`Plan.md` §2C, `specs/010-round-coach-agent`). One client
 * event, `round:coach`, answered only by an ack to the caller: there is no
 * server-to-client event, so a report can reach nobody else (FR-025).
 */

/** Core has one goal (§2C.16 decision 2). */
export const COACH_GOALS = ["fill_gaps"] as const;

/** Why a focus category scored 0: blank, or one of the reveal's reasons. */
export const missReasonSchema = z.enum(["empty", ...REJECT_REASONS]);
export type MissReason = z.infer<typeof missReasonSchema>;

/** Stable codes; the client turns each into a sentence. `cancelled` is log-only and never sent. */
export const COACH_STOP_REASONS = [
  "goal_completed",
  "unknown_tool",
  "invalid_tool_args",
  "repeated_call",
  "tool_failed",
  "provider_timeout",
  "provider_unavailable",
  "rate_limited",
  "quota_exhausted",
  "malformed_output",
  "final_invalid",
  "max_steps",
  "deadline",
  "call_budget",
] as const;
export const coachStopReasonSchema = z.enum(COACH_STOP_REASONS);
export type CoachStopReason = z.infer<typeof coachStopReasonSchema>;

/* ---------------------------------------------------------------- request */

/** Strict: the caller, letter, scores and evidence are the server's, never the payload's. */
export const coachRequestSchema = z
  .object({
    roundId: roundIdSchema,
    goal: z.enum(COACH_GOALS),
    focus: z.array(categorySchema).min(1).max(CATEGORY_COUNT),
    language: languageSchema,
  })
  .strict()
  .refine((request) => new Set(request.focus).size === request.focus.length, {
    message: "repeated category",
    path: ["focus"],
  });
export type CoachRequest = z.infer<typeof coachRequestSchema>;

/* ----------------------------------------------------------------- report */

export const coachTipSchema = z
  .object({
    category: categorySchema,
    /** From the server's record of the round, never the model's. */
    yourAnswer: z.string().max(MAX_ANSWER_LENGTH),
    whyMissed: missReasonSchema,
    /**
     * A word the referee accepted in this run, in the referee's spelling;
     * never the model's text (owner, 2026-10-07: only valid and checked answers).
     */
    suggestion: z.string().min(1).max(MAX_ANSWER_LENGTH).nullable(),
    checkedBy: z.enum(["letter_rule", "letter_rule_and_referee"]).nullable(),
  })
  .strict();
export type CoachTip = z.infer<typeof coachTipSchema>;

/** O6 (§2C.16): counts, the last provider and model, time and stop reason — no content. */
export const runDetailsSchema = z
  .object({
    modelSteps: z.number().int().min(0).max(3),
    toolCalls: z.number().int().min(0).max(2),
    providerAttempts: z.number().int().min(0).max(5),
    provider: z.enum(["gemini", "groq"]).nullable(),
    model: z.string().min(1).max(80).nullable(),
    elapsedMs: z.number().int().nonnegative(),
    stopReason: coachStopReasonSchema,
  })
  .strict();
export type RunDetails = z.infer<typeof runDetailsSchema>;

/**
 * No model text: the summary the player reads is written by the client from
 * the checked tips (owner, 2026-10-07), so the report has no `summary` field.
 */
export const coachReportSchema = z
  .object({
    status: z.enum(["completed", "incomplete", "failed"]),
    tips: z.array(coachTipSchema).min(1).max(CATEGORY_COUNT),
    confidence: z.enum(["low", "medium", "high"]).nullable(),
    stopReason: coachStopReasonSchema,
    run: runDetailsSchema.optional(),
  })
  .strict()
  // A confidence belongs to a completed report only (§2C.7).
  .refine((report) => (report.status === "completed") === (report.confidence !== null));
export type CoachReport = z.infer<typeof coachReportSchema>;
