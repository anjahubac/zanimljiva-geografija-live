import { randomUUID } from "node:crypto";
import { z } from "zod";
import { gameErrorCodeSchema } from "@contracts/errors";
import { coachStopReasonSchema, type CoachReport, type CoachStopReason } from "@contracts/coach.schemas";

/*
 * W08 minimal security events (`Plan.md` §2D). One JSON line per allowed or
 * denied coach decision, built from a closed set of fields. No field can carry
 * a prompt, an answer, a name, a model reply, a key or a stack: every value is
 * an enum, a bounded count, a server timestamp or a server-generated UUID, and
 * anything that fails the schema is dropped rather than logged.
 */

/** Internal-only refinements of a user-facing code, for diagnostics. */
const internalReasonSchema = z.enum(["CONCURRENCY_LIMIT"]);

export const securityEventSchema = z
  .object({
    event: z.enum(["agent.request.rejected", "agent.tool.rejected", "agent.run.finished"]),
    timestamp: z.string().datetime(),
    correlationId: z.string().uuid(),
    operation: z.literal("round:coach"),
    reasonCode: z.union([gameErrorCodeSchema, coachStopReasonSchema, internalReasonSchema]),
    outcome: z.enum(["allowed", "denied", "failed"]),
    // The ceilings of a run with its repair step (§2C.16): 7 attempts, 3 tool calls.
    providerAttempts: z.number().int().min(0).max(7),
    executedToolCalls: z.number().int().min(0).max(3),
  })
  .strict();
export type SecurityEvent = z.infer<typeof securityEventSchema>;

export type SecurityLog = {
  /** A request refused before any provider or tool work. */
  rejected(reasonCode: SecurityEvent["reasonCode"]): void;
  /** The terminal state of an admitted run that answered its caller. */
  finished(runId: string, report: CoachReport): void;
};

/** A tool the model proposed and the application refused to run. */
const TOOL_REJECTIONS = new Set<CoachStopReason>(["unknown_tool", "invalid_tool_args", "repeated_call"]);

export function createSecurityLog(
  write: (line: string) => void = (line) => console.info(line),
  now: () => number = Date.now,
): SecurityLog {
  const emit = (candidate: SecurityEvent) => {
    const parsed = securityEventSchema.safeParse(candidate);
    if (!parsed.success) return;
    try { write(JSON.stringify(parsed.data)); } catch { /* Logging never changes a game outcome. */ }
  };
  const base = () => ({ timestamp: new Date(now()).toISOString(), operation: "round:coach" as const });
  return {
    rejected(reasonCode) {
      emit({ ...base(), event: "agent.request.rejected", correlationId: randomUUID(), reasonCode, outcome: "denied", providerAttempts: 0, executedToolCalls: 0 });
    },
    finished(runId, report) {
      const toolRejected = TOOL_REJECTIONS.has(report.stopReason);
      emit({
        ...base(),
        event: toolRejected ? "agent.tool.rejected" : "agent.run.finished",
        correlationId: runId,
        reasonCode: report.stopReason,
        outcome: report.status === "completed" ? "allowed" : toolRejected ? "denied" : "failed",
        providerAttempts: report.run?.providerAttempts ?? 0,
        executedToolCalls: report.run?.toolCalls ?? 0,
      });
    },
  };
}
