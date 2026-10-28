import { randomUUID } from "node:crypto";
import { z } from "zod";
import { gameErrorCodeSchema } from "@contracts/errors";
import { coachStopReasonSchema, type CoachReport, type CoachStopReason } from "@contracts/coach.schemas";
import { coachStopReasonSchema as reviewStopReasonSchema, type CoachRunView as ReviewRunView } from "@contracts/review.schemas";

/*
 * W08 minimal security events (`Plan.md` §2D for the round coach, §2F for the
 * post-round review). One JSON line per allowed or denied agent decision,
 * built from a closed set of fields. No field can carry a prompt, an answer, a
 * name, a model reply, a key or a stack: every value is an enum, a bounded
 * count, a server timestamp or a server-generated UUID, and anything that
 * fails the schema is dropped rather than logged.
 */

/** Internal-only refinements of a user-facing code, for diagnostics. */
const internalReasonSchema = z.enum(["CONCURRENCY_LIMIT"]);

/** Which agent the event is about: its socket event name. */
export const securityOperationSchema = z.enum(["round:coach", "round:review"]);
export type SecurityOperation = z.infer<typeof securityOperationSchema>;

export const securityEventSchema = z
  .object({
    event: z.enum(["agent.request.rejected", "agent.tool.rejected", "agent.run.finished"]),
    timestamp: z.string().datetime(),
    correlationId: z.string().uuid(),
    operation: securityOperationSchema,
    reasonCode: z.union([gameErrorCodeSchema, coachStopReasonSchema, reviewStopReasonSchema, internalReasonSchema]),
    outcome: z.enum(["allowed", "denied", "failed"]),
    // The larger ceilings of the two: the round coach with its repair step
    // (§2C.16) makes at most 7 attempts and 3 tool calls; the review 3 and 1.
    providerAttempts: z.number().int().min(0).max(7),
    executedToolCalls: z.number().int().min(0).max(3),
  })
  .strict();
export type SecurityEvent = z.infer<typeof securityEventSchema>;

export type SecurityLog = {
  /** A request to either agent refused before any provider or tool work. */
  rejected(operation: SecurityOperation, reasonCode: SecurityEvent["reasonCode"]): void;
  /** The round coach: the terminal state of an admitted run that answered its caller. */
  coachFinished(runId: string, report: CoachReport): void;
  /** The post-round review: the terminal state of an admitted run. */
  reviewFinished(view: Pick<ReviewRunView, "runId" | "status" | "stopReason" | "providerAttemptCount" | "toolCallCount">): void;
};

/** A tool the model proposed and the application refused to run. */
const COACH_TOOL_REJECTIONS = new Set<CoachStopReason>(["unknown_tool", "invalid_tool_args", "repeated_call"]);
const REVIEW_TOOL_REJECTIONS = new Set<ReviewRunView["stopReason"]>(["unknown_tool", "invalid_tool_arguments", "repeated_action", "tool_call_limit"]);

export function createSecurityLog(
  write: (line: string) => void = (line) => console.info(line),
  now: () => number = Date.now,
): SecurityLog {
  const emit = (candidate: SecurityEvent) => {
    const parsed = securityEventSchema.safeParse(candidate);
    if (!parsed.success) return;
    try { write(JSON.stringify(parsed.data)); } catch { /* Logging never changes a game outcome. */ }
  };
  const timestamp = () => new Date(now()).toISOString();
  return {
    rejected(operation, reasonCode) {
      emit({ event: "agent.request.rejected", timestamp: timestamp(), correlationId: randomUUID(), operation, reasonCode, outcome: "denied", providerAttempts: 0, executedToolCalls: 0 });
    },
    coachFinished(runId, report) {
      const toolRejected = COACH_TOOL_REJECTIONS.has(report.stopReason);
      emit({
        event: toolRejected ? "agent.tool.rejected" : "agent.run.finished",
        timestamp: timestamp(),
        correlationId: runId,
        operation: "round:coach",
        reasonCode: report.stopReason,
        outcome: report.status === "completed" ? "allowed" : toolRejected ? "denied" : "failed",
        providerAttempts: report.run?.providerAttempts ?? 0,
        executedToolCalls: report.run?.toolCalls ?? 0,
      });
    },
    reviewFinished(view) {
      const toolRejected = REVIEW_TOOL_REJECTIONS.has(view.stopReason);
      emit({
        event: toolRejected ? "agent.tool.rejected" : "agent.run.finished",
        timestamp: timestamp(),
        correlationId: view.runId,
        operation: "round:review",
        reasonCode: view.stopReason,
        outcome: view.status === "completed" ? "allowed" : view.status === "failed" ? "failed" : "denied",
        providerAttempts: view.providerAttemptCount,
        executedToolCalls: view.toolCallCount,
      });
    },
  };
}
