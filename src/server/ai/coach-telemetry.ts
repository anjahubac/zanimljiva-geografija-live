import { COACH_MAX_TRACE_BYTES, coachStatusSchema, coachStopReasonSchema } from "@contracts/coach.schemas";
import { z } from "zod";

export type CoachAttemptTelemetry = {
  step: 1 | 2;
  attempt: number;
  kind: "initial" | "retry" | "fallback";
  provider: "gemini" | "groq";
  model: string;
  status: string;
  latencyMs: number;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
};

const attemptSchema = z.object({
  step: z.union([z.literal(1), z.literal(2)]),
  attempt: z.number().int().min(1).max(3),
  kind: z.enum(["initial", "retry", "fallback"]),
  provider: z.enum(["gemini", "groq"]),
  model: z.string().min(1).max(128),
  status: z.string().min(1).max(64),
  latencyMs: z.number().int().min(0).max(30_000),
  usage: z.object({ inputTokens: z.number().int().nonnegative().max(100_000_000).optional(), outputTokens: z.number().int().nonnegative().max(100_000_000).optional(), totalTokens: z.number().int().nonnegative().max(100_000_000).optional() }).strict().optional(),
}).strict();
const finishSchema = z.object({
  status: coachStatusSchema,
  stopReason: coachStopReasonSchema,
  stepCount: z.number().int().min(0).max(2),
  toolCallCount: z.number().int().min(0).max(1),
  providerAttemptCount: z.number().int().min(0).max(3),
  elapsedMs: z.number().int().min(0).max(30_000),
}).strict();
const validationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("proposal"), step: z.union([z.literal(1), z.literal(2)]), shape: z.enum(["tool_request", "final", "refusal", "malformed"]), toolName: z.enum(["analyze_round", "unknown"]).optional(), outcome: z.enum(["accepted", "rejected"]), reason: coachStopReasonSchema.optional() }).strict(),
  z.object({ kind: z.literal("tool"), toolName: z.enum(["analyze_round", "unknown"]), execution: z.enum(["executed", "not_executed"]), resultValidation: z.enum(["accepted", "rejected", "not_run"]), reason: coachStopReasonSchema.optional() }).strict(),
]);
export type CoachValidationTelemetry = z.infer<typeof validationSchema>;

export type CoachTelemetry = {
  attempt(record: CoachAttemptTelemetry): void;
  validation(record: CoachValidationTelemetry): void;
  finish(view: { status: string; stopReason: string; stepCount: number; toolCallCount: number; providerAttemptCount: number; elapsedMs: number }): void;
};

/** Per-run structured log. Content-bearing fields are not accepted by this interface. */
export function createCoachTelemetry(runId: string, write: (line: string) => void = (line) => console.info(line)): CoachTelemetry {
  const attempts: CoachAttemptTelemetry[] = [];
  const validations: CoachValidationTelemetry[] = [];
  let finished = false;
  const emit = (record: unknown) => {
    const line = JSON.stringify(record);
    if (new TextEncoder().encode(line).byteLength <= COACH_MAX_TRACE_BYTES) {
      try { write(line); } catch { /* Optional telemetry must never change coach behavior. */ }
    }
  };
  return {
    attempt(record) {
      if (finished || attempts.length >= 3) return;
      const parsed = attemptSchema.safeParse(record);
      if (parsed.success) {
        const { usage, ...metadata } = parsed.data;
        const hasUsage = usage !== undefined && Object.values(usage).some((value) => value !== undefined);
        attempts.push(hasUsage ? { ...metadata, usage } : metadata);
      }
    },
    validation(record) {
      if (finished) return;
      const parsed = validationSchema.safeParse(record);
      if (!parsed.success) return;
      const limit = parsed.data.kind === "proposal" ? 2 : 1;
      if (validations.filter((entry) => entry.kind === parsed.data.kind).length >= limit) return;
      validations.push(parsed.data);
    },
  finish(view) {
      if (finished) return;
      finished = true;
      const parsedView = finishSchema.safeParse({ status: view.status, stopReason: view.stopReason, stepCount: view.stepCount, toolCallCount: view.toolCallCount, providerAttemptCount: view.providerAttemptCount, elapsedMs: view.elapsedMs });
      if (!parsedView.success) return;
      const known = attempts.filter((attempt) => attempt.usage !== undefined).length;
      const sum = (key: "inputTokens" | "outputTokens" | "totalTokens") => {
        const values = attempts.flatMap((attempt) => attempt.usage?.[key] === undefined ? [] : [attempt.usage[key]!]);
        return values.length ? values.reduce((total, value) => total + value, 0) : undefined;
      };
      emit({
        event: "ai.coach",
        runId,
        ...parsedView.data,
        toolName: parsedView.data.toolCallCount === 1 ? "analyze_round" : null,
        validations,
        attemptUsage: { usageReportedAttempts: known, unknownAttempts: Math.max(0, parsedView.data.providerAttemptCount - known), ...(sum("inputTokens") !== undefined ? { returnedInputTokenSum: sum("inputTokens") } : {}), ...(sum("outputTokens") !== undefined ? { returnedOutputTokenSum: sum("outputTokens") } : {}), ...(sum("totalTokens") !== undefined ? { returnedTotalTokenSum: sum("totalTokens") } : {}) },
        attempts,
      });
    },
  };
}
