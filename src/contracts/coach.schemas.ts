import { z } from "zod";
import {
  CATEGORIES,
  CATEGORY_COUNT,
  categorySchema,
  languageSchema,
  letterSchema,
  playerSlotSchema,
  rejectReasonSchema,
  scoreReasonSchema,
  roundIdSchema,
} from "./game.schemas";

export const COACH_MAX_REQUEST_BYTES = 512;
export const COACH_MAX_TOOL_ARGS_BYTES = 128;
export const COACH_MAX_TOOL_RESULT_BYTES = 16_384;
export const COACH_MAX_TRACE_BYTES = 16_384;
export const COACH_MAX_MODEL_TEXT_BYTES = 8_192;
export const COACH_MAX_OUTPUT_TOKENS = 1_024;

export const coachGoalSchema = z.literal("review_round");
export const analyzeRoundFocusSchema = z.enum(["overview", "blank_categories", "rejected_answers"]);
export const coachAnalyzeRoundArgsSchema = z.object({ focus: analyzeRoundFocusSchema }).strict();
export type CoachAnalyzeRoundArgs = z.infer<typeof coachAnalyzeRoundArgsSchema>;

export const coachRequestSchema = z
  .object({ roundId: roundIdSchema, goalId: coachGoalSchema, language: languageSchema })
  .strict()
  .superRefine((value, ctx) => {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > COACH_MAX_REQUEST_BYTES) {
      ctx.addIssue({ code: "custom", message: "request too large" });
    }
  });
export type CoachRequest = z.infer<typeof coachRequestSchema>;

export const coachPointsSchema = z.union([z.literal(0), z.literal(5), z.literal(10)]);

/** Server-only projection copied from the exact canonical reveal and score values. */
export const coachSourceCategorySchema = z
  .object({
    category: categorySchema,
    blank: z.boolean(),
    accepted: z.boolean(),
    rejectReason: rejectReasonSchema.nullable(),
    hinted: z.boolean(),
    points: coachPointsSchema,
    scoringReason: scoreReasonSchema,
  })
  .strict();

export const coachSourceSchema = z
  .object({
    letter: letterSchema,
    alphabet: languageSchema,
    verified: z.boolean(),
    total: z.number().int().min(0).max(80),
    cells: z.array(coachSourceCategorySchema).length(CATEGORY_COUNT),
  })
  .strict()
  .superRefine((source, ctx) => {
    const seen = new Set<string>();
    for (const [index, cell] of source.cells.entries()) {
      if (seen.has(cell.category)) ctx.addIssue({ code: "custom", path: ["cells", index, "category"], message: "duplicate category" });
      seen.add(cell.category);
      if (cell.blank && (cell.accepted || cell.rejectReason !== null)) {
        ctx.addIssue({ code: "custom", path: ["cells", index], message: "blank cell cannot be accepted or rejected" });
      }
      if (cell.accepted && cell.rejectReason !== null) {
        ctx.addIssue({ code: "custom", path: ["cells", index], message: "accepted cell cannot have a reject reason" });
      }
      if (cell.accepted && cell.points === 0) {
        ctx.addIssue({ code: "custom", path: ["cells", index, "points"], message: "accepted cell must have points" });
      }
      if (!cell.accepted && cell.points !== 0) {
        ctx.addIssue({ code: "custom", path: ["cells", index, "points"], message: "rejected or blank cell has no points" });
      }
      if (cell.scoringReason === "same_answer" && (!cell.accepted || cell.points !== 5)) {
        ctx.addIssue({ code: "custom", path: ["cells", index], message: "duplicate score must be accepted five points" });
      }
      if (!cell.blank && !cell.accepted && cell.rejectReason === null) {
        ctx.addIssue({ code: "custom", path: ["cells", index, "rejectReason"], message: "rejected nonblank cell needs recorded reason" });
      }
    }
    if (seen.size !== CATEGORY_COUNT || CATEGORIES.some((category) => !seen.has(category))) {
      ctx.addIssue({ code: "custom", path: ["cells"], message: "all categories required exactly once" });
    }
    if (source.cells.reduce((sum, cell) => sum + cell.points, 0) !== source.total) {
      ctx.addIssue({ code: "custom", path: ["total"], message: "total must equal category points" });
    }
  });
export type CoachSource = z.infer<typeof coachSourceSchema>;

export const coachFindingIds = [
  "cell:country", "cell:city", "cell:river", "cell:mountain", "cell:sea", "cell:animal", "cell:plant", "cell:thing", "totals", "verification",
] as const;
export const coachFindingIdSchema = z.enum(coachFindingIds);
export const coachRecommendationCodeSchema = z.enum([
  "practice_recall", "check_category", "check_letter", "check_length", "review_rejected_term",
  "practice_without_hint", "vary_answers", "maintain_approach",
]);
export const coachRecommendationSchema = z
  .object({
    code: coachRecommendationCodeSchema,
    category: categorySchema.nullable(),
    evidenceIds: z.array(coachFindingIdSchema).min(1).max(3).refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();

export const coachEvidenceCellSchema = z
  .object({
    id: z.string().regex(/^cell:(country|city|river|mountain|sea|animal|plant|thing)$/),
    kind: z.literal("cell"),
    category: categorySchema,
    blank: z.boolean(),
    accepted: z.boolean(),
    rejectReason: rejectReasonSchema.nullable(),
    hinted: z.boolean(),
    points: coachPointsSchema,
    scoringReason: scoreReasonSchema,
  })
  .strict();
export const coachEvidenceTotalsSchema = z
  .object({
    id: z.literal("totals"), kind: z.literal("totals"), blank: z.number().int().min(0).max(8),
    accepted: z.number().int().min(0).max(8), rejectedNonblank: z.number().int().min(0).max(8),
    hinted: z.number().int().min(0).max(8), acceptedDuplicates: z.number().int().min(0).max(8),
    ownPoints: z.number().int().min(0).max(80),
  })
  .strict();
export const coachEvidenceVerificationSchema = z
  .object({ id: z.literal("verification"), kind: z.literal("verification"), verified: z.boolean() })
  .strict();
export const coachEvidenceSchema = z.discriminatedUnion("kind", [coachEvidenceCellSchema, coachEvidenceTotalsSchema, coachEvidenceVerificationSchema]);
export type CoachEvidence = z.infer<typeof coachEvidenceSchema>;

export const coachEligibleRecommendationSchema = z
  .object({ code: coachRecommendationCodeSchema, category: categorySchema.nullable(), evidenceIds: z.array(coachFindingIdSchema).min(1).max(3) })
  .strict();

export const coachToolResultSchema = z
  .object({
    sourceVersion: z.string().min(1).max(128),
    focus: analyzeRoundFocusSchema,
    letter: letterSchema,
    alphabet: languageSchema,
    verified: z.boolean(),
    totals: coachEvidenceTotalsSchema,
    cells: z.array(coachEvidenceCellSchema).length(CATEGORY_COUNT),
    evidence: z.array(coachEvidenceSchema).length(10),
    eligibleRecommendations: z.array(coachEligibleRecommendationSchema).max(40),
    priorityEvidenceIds: z.array(coachFindingIdSchema).length(10),
  })
  .strict()
  .superRefine((result, ctx) => {
    if (result.cells.map((cell) => cell.category).join("|") !== CATEGORIES.join("|")) {
      ctx.addIssue({ code: "custom", path: ["cells"], message: "cells must use canonical category order" });
    }
    if (result.totals.blank + result.totals.accepted + result.totals.rejectedNonblank !== CATEGORY_COUNT) {
      ctx.addIssue({ code: "custom", path: ["totals"], message: "cell totals inconsistent" });
    }
    if (result.totals.ownPoints !== result.cells.reduce((sum, cell) => sum + cell.points, 0)) {
      ctx.addIssue({ code: "custom", path: ["totals", "ownPoints"], message: "points inconsistent" });
    }
    if (result.totals.accepted !== result.cells.filter((cell) => cell.accepted).length || result.totals.blank !== result.cells.filter((cell) => cell.blank).length) {
      ctx.addIssue({ code: "custom", path: ["totals"], message: "flags inconsistent" });
    }
    const expected = [...CATEGORIES.map((category) => `cell:${category}`), "totals", "verification"];
    if (result.evidence.map((item) => item.id).join("|") !== expected.join("|")) {
      ctx.addIssue({ code: "custom", path: ["evidence"], message: "evidence coverage/order inconsistent" });
    }
    if (new Set(result.priorityEvidenceIds).size !== 10) {
      ctx.addIssue({ code: "custom", path: ["priorityEvidenceIds"], message: "priority evidence IDs must be unique" });
    }
  });
export type CoachToolResult = z.infer<typeof coachToolResultSchema>;

export const coachFinalProposalSchema = z
  .object({ kind: z.literal("final"), final: z.object({ findingIds: z.array(coachFindingIdSchema).min(1).max(3), recommendations: z.array(coachRecommendationSchema).min(1).max(2), completed: z.literal(true) }).strict() })
  .strict();
export const coachToolProposalEnvelopeSchema = z
  .object({ kind: z.literal("tool_request"), toolRequest: z.object({ name: z.string().min(1).max(64), arguments: z.unknown() }).strict() })
  .strict();
export const coachModelProposalSchema = z.discriminatedUnion("kind", [coachToolProposalEnvelopeSchema, coachFinalProposalSchema, z.object({ kind: z.literal("refusal") }).strict()]);

export const coachStatusSchema = z.enum(["completed", "stopped", "failed"]);
export const coachStopReasonSchema = z.enum([
  "completed", "invalid_model_proposal", "unknown_tool", "invalid_tool_arguments", "invalid_tool_result",
  "tool_failed", "tool_timeout", "provider_failed", "rate_limit", "provider_timeout", "quota_exhausted",
  "provider_refusal", "invalid_final", "insufficient_evidence", "repeated_action", "step_limit",
  "tool_call_limit", "provider_attempt_limit", "deadline", "cancelled",
]);
export type CoachStopReason = z.infer<typeof coachStopReasonSchema>;
export const coachLimitationSchema = z.enum(["single_round", "checker_can_be_wrong", "local_rule_only"]);
export const coachCompletedResultSchema = z
  .object({
    summary: z.object({ findingIds: z.array(coachFindingIdSchema).min(1).max(3) }).strict(),
    recommendations: z.array(coachRecommendationSchema).min(1).max(2),
    evidence: z.array(coachEvidenceSchema).length(10),
    confidence: z.enum(["medium", "low"]),
    limitations: z.array(coachLimitationSchema).length(2),
    completed: z.literal(true),
  })
  .strict()
  .superRefine((result, ctx) => {
    if (new Set(result.summary.findingIds).size !== result.summary.findingIds.length) {
      ctx.addIssue({ code: "custom", path: ["summary", "findingIds"], message: "finding IDs must be unique" });
    }
    const byId = new Map(result.evidence.map((entry) => [entry.id, entry]));
    const expectedIds = [...CATEGORIES.map((category) => `cell:${category}`), "totals", "verification"];
    if (byId.size !== 10 || expectedIds.some((id) => !byId.has(id))) {
      ctx.addIssue({ code: "custom", path: ["evidence"], message: "exact evidence coverage required" });
    }
    for (const findingId of result.summary.findingIds) {
      if (!byId.has(findingId)) ctx.addIssue({ code: "custom", path: ["summary", "findingIds"], message: "finding must reference supplied evidence" });
    }
    const cells = CATEGORIES.map((category) => byId.get(`cell:${category}`));
    if (cells.some((cell) => !cell || cell.kind !== "cell" || cell.id !== `cell:${cell.category}`)) {
      ctx.addIssue({ code: "custom", path: ["evidence"], message: "cell IDs must match categories" });
    }
    const totals = byId.get("totals");
    const verification = byId.get("verification");
    for (const [index, cell] of cells.entries()) {
      if (cell?.kind !== "cell") continue;
      if (cell.blank && (cell.accepted || cell.rejectReason !== null)) {
        ctx.addIssue({ code: "custom", path: ["evidence", index], message: "blank cell cannot be accepted or rejected" });
      }
      if (cell.accepted && (cell.rejectReason !== null || cell.points === 0)) {
        ctx.addIssue({ code: "custom", path: ["evidence", index], message: "accepted cell requires positive points and no rejection" });
      }
      if (!cell.accepted && cell.points !== 0) {
        ctx.addIssue({ code: "custom", path: ["evidence", index], message: "nonaccepted cell cannot have points" });
      }
      if (!cell.blank && !cell.accepted && cell.rejectReason === null) {
        ctx.addIssue({ code: "custom", path: ["evidence", index], message: "rejected nonblank cell needs recorded reason" });
      }
      if (cell.scoringReason === "same_answer" && (!cell.accepted || cell.points !== 5)) {
        ctx.addIssue({ code: "custom", path: ["evidence", index], message: "same answer must be accepted for five points" });
      }
    }
    if (totals?.kind !== "totals" || verification?.kind !== "verification") {
      ctx.addIssue({ code: "custom", path: ["evidence"], message: "totals and verification evidence required" });
    } else {
      const cellItems = cells.filter((cell): cell is z.infer<typeof coachEvidenceCellSchema> => Boolean(cell && cell.kind === "cell"));
      if (totals.blank !== cellItems.filter((cell) => cell.blank).length ||
          totals.accepted !== cellItems.filter((cell) => cell.accepted).length ||
          totals.rejectedNonblank !== cellItems.filter((cell) => !cell.blank && !cell.accepted).length ||
          totals.hinted !== cellItems.filter((cell) => cell.hinted).length ||
          totals.acceptedDuplicates !== cellItems.filter((cell) => cell.accepted && cell.scoringReason === "same_answer").length ||
          totals.ownPoints !== cellItems.reduce((sum, cell) => sum + cell.points, 0)) {
        ctx.addIssue({ code: "custom", path: ["evidence"], message: "evidence totals are inconsistent" });
      }
      if (verification.verified !== (result.confidence === "medium") ||
          (verification.verified && (!result.limitations.includes("single_round") || !result.limitations.includes("checker_can_be_wrong") || result.limitations.includes("local_rule_only"))) ||
          (!verification.verified && (!result.limitations.includes("single_round") || !result.limitations.includes("local_rule_only") || result.limitations.includes("checker_can_be_wrong"))) ||
          new Set(result.limitations).size !== 2) {
        ctx.addIssue({ code: "custom", path: ["limitations"], message: "confidence/limitations mismatch" });
      }
    }
    const usedCategories = new Set<string>();
    let hasMaintain = false;
    for (const [index, rec] of result.recommendations.entries()) {
      if ((rec.code === "maintain_approach") !== (rec.category === null)) {
        ctx.addIssue({ code: "custom", path: ["recommendations", index], message: "general recommendation must not have a category" });
      }
      if (rec.category === null) {
        if (rec.code !== "maintain_approach" || hasMaintain) ctx.addIssue({ code: "custom", path: ["recommendations", index], message: "invalid general recommendation" });
        hasMaintain = true;
      } else {
        if (usedCategories.has(rec.category)) ctx.addIssue({ code: "custom", path: ["recommendations", index], message: "only one recommendation per category" });
        usedCategories.add(rec.category);
      }
      if (new Set(rec.evidenceIds).size !== rec.evidenceIds.length || rec.evidenceIds.some((id) => !byId.has(id))) {
        ctx.addIssue({ code: "custom", path: ["recommendations", index, "evidenceIds"], message: "recommendation evidence must be unique and supplied" });
      }
      const cell = rec.category ? byId.get(`cell:${rec.category}`) : undefined;
      const verified = verification?.kind === "verification" && verification.verified;
      const supported = rec.code === "maintain_approach"
        ? totals?.kind === "totals" && totals.accepted === CATEGORY_COUNT && totals.blank === 0 && totals.rejectedNonblank === 0 && rec.evidenceIds.includes("totals") && rec.evidenceIds.includes("verification")
        : cell?.kind === "cell" && rec.evidenceIds.some((id) => id === cell.id) && (
            (rec.code === "practice_recall" && cell.blank) ||
            (rec.code === "practice_without_hint" && cell.hinted) ||
            (rec.code === "vary_answers" && cell.accepted && cell.points === 5 && cell.scoringReason === "same_answer") ||
            (verified && rec.code === "check_category" && !cell.blank && !cell.accepted && cell.rejectReason === "wrong_category") ||
            (rec.code === "check_letter" && !cell.blank && !cell.accepted && cell.rejectReason === "wrong_letter") ||
            (rec.code === "check_length" && !cell.blank && !cell.accepted && cell.rejectReason === "too_short") ||
            (verified && rec.code === "review_rejected_term" && !cell.blank && !cell.accepted && ["not_real", "historical", "unrecognized"].includes(cell.rejectReason ?? ""))
          );
      if (!supported) ctx.addIssue({ code: "custom", path: ["recommendations", index], message: "recommendation is not supported by evidence" });
    }
  });
export const coachRunViewSchema = z
  .object({
    runId: z.string().uuid(), roundId: roundIdSchema, status: coachStatusSchema,
    stopReason: coachStopReasonSchema, stepCount: z.number().int().min(0).max(2),
    toolCallCount: z.number().int().min(0).max(1), providerAttemptCount: z.number().int().min(0).max(3),
    elapsedMs: z.number().int().min(0).max(30_000), result: coachCompletedResultSchema.nullable(),
  })
  .strict()
  .superRefine((view, ctx) => {
    if (view.status === "completed" && (view.stopReason !== "completed" || view.result === null || view.stepCount !== 2 || view.toolCallCount !== 1 || view.providerAttemptCount < 2)) ctx.addIssue({ code: "custom", path: ["result"], message: "completed run requires two decisions, one tool and provider attempts" });
    if (view.status !== "completed" && (view.result !== null || view.stopReason === "completed")) ctx.addIssue({ code: "custom", path: ["result"], message: "stopped/failed run requires non-completed reason and null result" });
  });
export type CoachRunView = z.infer<typeof coachRunViewSchema>;

/** Internal key metadata is intentionally separate from coachSourceSchema. */
export const coachRunKeySchema = z.object({ roundId: roundIdSchema, seat: playerSlotSchema, sourceVersion: z.string().min(1).max(128) }).strict();
