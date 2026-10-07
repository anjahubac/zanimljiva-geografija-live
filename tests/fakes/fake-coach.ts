import type { ProviderAdapter, AdapterResult, ModelCall, AiProvider, AiFailureCode } from "@server/ai/types";
import { CATEGORIES, type Category } from "@contracts/game.schemas";
import type { CoachSource } from "@contracts/coach.schemas";

export type CoachScriptEntry = AdapterResult | ((call: ModelCall, index: number) => Promise<AdapterResult>);

/** Scripted at the real ProviderAdapter boundary: orchestration and validation stay real. */
export function createFakeCoachAdapter(script: CoachScriptEntry[], provider: AiProvider = "gemini") {
  const calls: ModelCall[] = [];
  const adapter: ProviderAdapter = {
    provider,
    async generate(call) {
      calls.push(call);
      const entry = script[calls.length - 1];
      if (!entry) return { ok: false, error: { code: "model_unavailable" } };
      return typeof entry === "function" ? entry(call, calls.length - 1) : entry;
    },
  };
  return { adapter, calls };
}

export function coachJson(text: string, usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 }): AdapterResult {
  return { ok: true, text, usage };
}

export function coachFailure(code: AiFailureCode): AdapterResult {
  return { ok: false, error: { code } };
}

export function makeCoachSource(overrides: Partial<CoachSource> = {}): CoachSource {
  const cells = CATEGORIES.map((category) => ({
    category,
    blank: true,
    accepted: false,
    rejectReason: null,
    hinted: false,
    points: 0 as const,
    scoringReason: "neither" as const,
  }));
  return {
    letter: "S",
    alphabet: "sr",
    verified: true,
    total: 0,
    cells,
    ...overrides,
  };
}

export function makeCoachCell(category: Category, overrides: Partial<CoachSource["cells"][number]> = {}) {
  return {
    category,
    blank: false,
    accepted: true,
    rejectReason: null,
    hinted: false,
    points: 10 as const,
    scoringReason: "only_player_1" as const,
    ...overrides,
  };
}
