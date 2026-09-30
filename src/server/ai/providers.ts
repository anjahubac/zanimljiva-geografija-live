import { loadAiConfig, type AiEnv, type ThinkingLevel } from "./config";
import { createGeminiAdapter } from "./gemini-adapter";
import { createGroqAdapter } from "./groq-adapter";
import type { AiProvider, ProviderAdapter } from "./types";

/*
 * Gemini and Groq as substitutes for each other (`Plan.md` §2B.5). Both
 * providers' models go into the gateway's one chain, interleaved:
 *
 *   gemini-3.5-flash-lite, openai/gpt-oss-120b, gemini-3.1-flash-lite, openai/gpt-oss-20b, ...
 *
 * so the attempt after any failure — a timeout, a 5xx, a spent daily quota —
 * is on the other provider. The gateway's model-health memory then skips the
 * failing models for later requests, which is what keeps a provider that is
 * down from costing every round a timeout.
 */

export const PROVIDERS = ["gemini", "groq"] as const;

/** Both support strict JSON-schema output on Groq (checked 2026-09-30). */
export const DEFAULT_GROQ_CHAIN = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"] as const;

/** "vendor/model" or "model": letters, digits, dots and dashes; no previews. */
const GROQ_MODEL_ID = /^(?:[a-z0-9-]+\/)?[a-z0-9][a-z0-9.-]*$/;
const UNSTABLE = /(preview|latest|exp)/;

export type ProviderEnv = AiEnv &
  Partial<Record<"GROQ_API_KEY" | "GROQ_MODEL_CHAIN" | "AI_PROVIDER_ORDER", string>>;

export type ProviderSetup = {
  adapter: ProviderAdapter;
  modelChain: string[];
  thinkingLevel: ThinkingLevel | null;
  providers: AiProvider[];
};

/** Gemini ids all start "gemini-"; every other model in the chain is Groq's. */
export const providerOfModel = (model: string): AiProvider => (model.startsWith("gemini-") ? "gemini" : "groq");

type GroqConfig = { configured: true; apiKey: string; modelChain: string[] } | { configured: false };

export function loadGroqConfig(env: ProviderEnv): GroqConfig {
  const apiKey = env.GROQ_API_KEY?.trim() ?? "";
  if (apiKey === "") return { configured: false };

  const raw = env.GROQ_MODEL_CHAIN?.trim();
  const listed = raw ? raw.split(",").map((model) => model.trim()).filter(Boolean) : [...DEFAULT_GROQ_CHAIN];
  const modelChain = [...new Set(listed)];
  if (
    modelChain.length === 0 ||
    modelChain.some((model) => !GROQ_MODEL_ID.test(model) || UNSTABLE.test(model) || model.startsWith("gemini-"))
  ) {
    // Reported by name only; the value is never echoed (it could be a pasted secret).
    console.warn("[ai.config] GROQ_MODEL_CHAIN contains an id outside the allowlist; Groq disabled");
    return { configured: false };
  }
  return { configured: true, apiKey, modelChain };
}

/** Which providers to use, first choice first. Unknown names are ignored. */
export function parseProviderOrder(raw: string | undefined): AiProvider[] {
  if (!raw?.trim()) return [...PROVIDERS];
  const order = raw
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name): name is AiProvider => (PROVIDERS as readonly string[]).includes(name));
  return order.length ? [...new Set(order)] : [...PROVIDERS];
}

/** a1, b1, a2, b2, ... then whatever is left of the longer list. */
export function interleave(first: readonly string[], second: readonly string[]): string[] {
  const merged: string[] = [];
  for (let index = 0; index < Math.max(first.length, second.length); index += 1) {
    if (index < first.length) merged.push(first[index]!);
    if (index < second.length) merged.push(second[index]!);
  }
  return merged;
}

/** One adapter for the gateway that hands each model to its provider's adapter. */
export function createRoutingAdapter(adapters: Partial<Record<AiProvider, ProviderAdapter>>): ProviderAdapter {
  const first = (Object.keys(adapters) as AiProvider[])[0] ?? "gemini";
  return {
    provider: first,
    providerOf: providerOfModel,
    generate(call) {
      const adapter = adapters[providerOfModel(call.model)];
      // A model whose provider has no key is a configuration error, not a crash.
      return adapter ? adapter.generate(call) : Promise.resolve({ ok: false, error: { code: "not_configured" } });
    },
  };
}

/**
 * Everything the gateway needs, from the environment. Null when neither
 * provider has a key: the game then runs on the local letter rule.
 */
export function loadProviders(env: ProviderEnv, fetchImpl?: typeof fetch): ProviderSetup | null {
  const order = parseProviderOrder(env.AI_PROVIDER_ORDER);
  const gemini = order.includes("gemini") ? loadAiConfig(env) : null;
  const groq = order.includes("groq") ? loadGroqConfig(env) : null;

  const chains: Partial<Record<AiProvider, string[]>> = {};
  const adapters: Partial<Record<AiProvider, ProviderAdapter>> = {};
  if (gemini?.configured) {
    chains.gemini = gemini.modelChain;
    adapters.gemini = createGeminiAdapter({ apiKey: gemini.apiKey, ...(fetchImpl ? { fetchImpl } : {}) });
  }
  if (groq?.configured) {
    chains.groq = groq.modelChain;
    adapters.groq = createGroqAdapter({ apiKey: groq.apiKey, ...(fetchImpl ? { fetchImpl } : {}) });
  }

  const providers = order.filter((provider) => chains[provider]);
  if (providers.length === 0) return null;

  const [preferred, other] = providers;
  const modelChain = interleave(chains[preferred!]!, other ? chains[other]! : []);
  return {
    adapter: createRoutingAdapter(adapters),
    modelChain,
    thinkingLevel: gemini?.configured ? gemini.thinkingLevel : null,
    providers,
  };
}
