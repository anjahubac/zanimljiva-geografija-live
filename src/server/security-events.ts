import { randomUUID } from "node:crypto";
import { z } from "zod";
import { gameErrorCodeSchema } from "@contracts/errors";
import { coachStopReasonSchema, type CoachRunView } from "@contracts/coach.schemas";

/*
 * W08 minimal security events (specs/011-secure-the-arcade). One JSON line per
 * allowed or denied agent decision, built from a closed set of fields. No
 * field can carry a prompt, an answer, a name, a model reply, a key or a stack:
 * every value is an enum, a bounded count, a server timestamp or a
 * server-generated UUID, and anything that fails the schema is dropped rather
 * than logged.
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
    providerAttempts: z.number().int().min(0).max(3),
    executedToolCalls: z.number().int().min(0).max(1),
  })
  .strict();
export type SecurityEvent = z.infer<typeof securityEventSchema>;

export type SecurityLog = {
  /** A request refused before any provider or tool work. */
  rejected(reasonCode: SecurityEvent["reasonCode"]): void;
  /** The terminal state of an admitted run. */
  finished(view: Pick<CoachRunView, "runId" | "status" | "stopReason" | "providerAttemptCount" | "toolCallCount">): void;
};

const TOOL_REJECTIONS = new Set<CoachRunView["stopReason"]>(["unknown_tool", "invalid_tool_arguments", "repeated_action", "tool_call_limit"]);

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
    finished(view) {
      const toolRejected = TOOL_REJECTIONS.has(view.stopReason);
      emit({
        ...base(),
        event: toolRejected ? "agent.tool.rejected" : "agent.run.finished",
        correlationId: view.runId,
        reasonCode: view.stopReason,
        outcome: view.status === "completed" ? "allowed" : view.status === "failed" ? "failed" : "denied",
        providerAttempts: view.providerAttemptCount,
        executedToolCalls: view.toolCallCount,
      });
    },
  };
}
