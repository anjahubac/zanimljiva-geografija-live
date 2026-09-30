import type { SkippedModel } from "./model-health";
import type { AiFailureCode, AiOperation, ProviderAttempt, TokenUsage, ValidationNotes } from "./types";

/*
 * constitution VIII / W04 PDF §10-11. One line per logical interaction with the
 * ordered attempts. Built from typed fields only, so the key, prompts, provider
 * replies and player answers have no way in.
 */

export type InteractionRecord = {
  event: "ai.interaction";
  interactionId: string;
  operation: AiOperation;
  promptVersion: string;
  outcome: "success" | AiFailureCode;
  fallbackUsed: boolean;
  attempts: ProviderAttempt[];
  /** Models not tried because they were cooling down or out of daily quota. */
  skipped?: SkippedModel[];
  totalLatencyMs: number;
  usage?: TokenUsage;
  notes?: ValidationNotes;
};

export type TelemetrySink = (record: InteractionRecord) => void;

export const consoleTelemetry: TelemetrySink = (record) => {
  console.info(JSON.stringify(record));
};

/** Test sink: keeps records in memory. */
export function memoryTelemetry(): TelemetrySink & { records: InteractionRecord[] } {
  const records: InteractionRecord[] = [];
  const sink = ((record: InteractionRecord) => {
    records.push(record);
  }) as TelemetrySink & { records: InteractionRecord[] };
  sink.records = records;
  return sink;
}
