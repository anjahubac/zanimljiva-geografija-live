import type { CoachRunView } from "@contracts/coach.schemas";
import { runCoachEngine, type CoachEngineOptions } from "./coach-engine";
import { createCoachAttemptGuard } from "@server/ai/coach-attempt-guard";
import type { ProviderAdapter } from "@server/ai/types";
import type { ThinkingLevel } from "@server/ai/config";
import { randomUUID } from "node:crypto";
import { createCoachTelemetry } from "@server/ai/coach-telemetry";

export type CoachCapability = {
  run(input: Omit<CoachEngineOptions, "model"> & { authorizeAndCharge: () => boolean }): Promise<CoachRunView>;
};

/** Optional sibling capability; it does not alter the W04 AiService interface. */
export function createPostRoundCoach(options: {
  adapter: ProviderAdapter;
  modelChain: readonly string[];
  thinkingLevel: ThinkingLevel | null;
  now?: () => number;
  writeTelemetry?: (line: string) => void;
}): CoachCapability {
  return {
    async run(input) {
      const now = input.now ?? options.now;
      const runId = input.runId ?? randomUUID();
      const telemetry = createCoachTelemetry(runId, options.writeTelemetry);
      const model = createCoachAttemptGuard({
        adapter: options.adapter,
        modelChain: options.modelChain,
        thinkingLevel: options.thinkingLevel,
        now,
        schedule: input.schedule,
        onAttempt: (record) => telemetry.attempt(record),
      });
      const view = await runCoachEngine({ ...input, runId, model, onValidation: (record) => telemetry.validation(record), ...(now ? { now } : {}) });
      telemetry.finish(view);
      return view;
    },
  };
}
