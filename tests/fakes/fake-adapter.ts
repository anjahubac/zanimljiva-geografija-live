import type { AdapterResult, ModelCall, ProviderAdapter, ProviderError } from "@server/ai/types";

/** One scripted outcome per attempt, in order. "hang" waits until the attempt is aborted. */
export type Step = { text: string } | ProviderError | "hang";

export function fakeAdapter(steps: Step[]): ProviderAdapter & { calls: ModelCall[] } {
  const calls: ModelCall[] = [];
  return {
    provider: "gemini",
    calls,
    async generate(call): Promise<AdapterResult> {
      calls.push(call);
      const step = steps[calls.length - 1];
      if (step === undefined) throw new Error(`fake adapter: no step scripted for call ${calls.length}`);
      if (step === "hang") {
        await new Promise<void>((resolve) => call.signal.addEventListener("abort", () => resolve(), { once: true }));
        return { ok: false, error: { code: "timeout" } };
      }
      if ("text" in step) return { ok: true, text: step.text, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
      return { ok: false, error: step };
    },
  };
}

/** A clock that only moves when the code under test sleeps or a step says so. */
export function fakeTime(start = 1_000_000) {
  let current = start;
  const sleeps: number[] = [];
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
    sleep: async (ms: number) => {
      sleeps.push(ms);
      current += ms;
    },
    sleeps,
  };
}
