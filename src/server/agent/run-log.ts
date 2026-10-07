import type { CoachStopReason } from "@contracts/coach.schemas";
import type { ProviderAttempt, TokenUsage } from "@server/ai/types";

/*
 * One `agent.run` line per coach run (`Plan.md` §2C.9, research R15). Built
 * from typed fields only, so no answer, candidate word, prompt, model reply or
 * key has a way in. Each step's own `ai.interaction` line carries
 * `interactionId = <runId>:s<n>`, which links the two.
 *
 * "A retry is not a step": every step keeps its provider attempts under it.
 */

export type StepDecision = "allowed" | "rejected";
export type StepRejectReason = "unknown_tool" | "invalid_tool_args" | "repeated_call" | "malformed_output" | "final_invalid" | "max_steps";

export type StepRecord = {
  n: number;
  /** The action the model named; null when there was no readable reply. */
  action: string | null;
  /** Null when there was nothing to judge (the provider failed). */
  decision: StepDecision | null;
  rejectReason?: StepRejectReason;
  attempts: ProviderAttempt[];
  /** `passed`: passing words for check_candidates, accepted words for verify_terms (O1). */
  tool?: { name: string; items: number; passed: number; latencyMs: number; attempts?: ProviderAttempt[] };
  usage?: TokenUsage;
  /** The repair step after the report's referee check (owner, 2026-10-07). */
  repair?: true;
};

export type AgentRunRecord = {
  event: "agent.run";
  runId: string;
  goal: "fill_gaps";
  promptVersion: string;
  status: "completed" | "incomplete" | "failed" | "cancelled";
  stopReason: CoachStopReason | "cancelled";
  steps: StepRecord[];
  /**
   * The game's own referee check before the report (owner, 2026-10-07): words
   * sent, words accepted, its provider attempts. Absent when nothing needed it.
   */
  refereeCheck?: { items: number; accepted: number; attempts: ProviderAttempt[] };
  /**
   * The repair (owner, 2026-10-07): categories it was asked about, passing
   * words it proposed, words the referee accepted, the referee's attempts.
   * Absent when no category was left empty.
   */
  repair?: { categories: number; items: number; accepted: number; attempts: ProviderAttempt[] };
  totals: { modelSteps: number; providerAttempts: number; toolCalls: number; elapsedMs: number };
};

export type RunLogSink = (record: AgentRunRecord) => void;

export const consoleRunLog: RunLogSink = (record) => {
  console.info(JSON.stringify(record));
};

/** Test sink: keeps records in memory. */
export function memoryRunLog(): RunLogSink & { records: AgentRunRecord[] } {
  const records: AgentRunRecord[] = [];
  const sink = ((record: AgentRunRecord) => {
    records.push(record);
  }) as RunLogSink & { records: AgentRunRecord[] };
  sink.records = records;
  return sink;
}
