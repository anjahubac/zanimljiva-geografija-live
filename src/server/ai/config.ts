/*
 * AI configuration, read from the server environment only (constitution I).
 * A missing or broken setting never throws: the app reports "not configured"
 * and every round falls back to local scoring, so the game keeps working.
 */

/**
 * Owner-approved chain A (2026-09-30): the two lite models first, stronger Flash
 * models only as a last resort. Every model has its own free-tier quota, so a
 * longer chain also means more requests per day. research R3.
 *
 * gemini-3.5-flash, the fourth model of plan A, is held back: its capability
 * check through the real flow timed out (6 s) on 2026-09-30, and W04 admits a
 * fallback only after it passes that check. Re-run
 * `npm run smoke:live -- capability gemini-3.5-flash` and add it back when it passes.
 */
export const DEFAULT_MODEL_CHAIN = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.6-flash",
] as const;

export const THINKING_LEVELS = ["minimal", "low", "medium", "high"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

/**
 * Thinking level sent to a model when GEMINI_THINKING_LEVEL does not override it.
 * Live, 2026-09-30: Flash models think by default (≈70 thought tokens even for
 * "ok"); gemini-3.6-flash took 3.1 s by default and 0.96 s with "minimal".
 * Lite models already answer without thinking and the option is untested on
 * them, so nothing is sent there.
 */
export function defaultThinkingLevel(model: string): ThinkingLevel | null {
  return /-lite$/.test(model) ? null : "minimal";
}

/** Stable Gemini ids only: no preview, latest or experimental variants (W04 PDF §5). */
const MODEL_ID = /^gemini-\d[0-9a-z.-]*$/;
const UNSTABLE = /(preview|latest|exp)/;

export type AiConfig =
  | { configured: false; reason: "missing_key" | "invalid_model_chain" | "invalid_thinking_level" }
  | {
      configured: true;
      apiKey: string;
      modelChain: string[];
      thinkingLevel: ThinkingLevel | null;
    };

export type AiEnv = Partial<Record<"GEMINI_API_KEY" | "GEMINI_MODEL_CHAIN" | "GEMINI_THINKING_LEVEL", string>>;

export function loadAiConfig(env: AiEnv): AiConfig {
  const apiKey = env.GEMINI_API_KEY?.trim() ?? "";
  if (apiKey === "") return { configured: false, reason: "missing_key" };

  const rawChain = env.GEMINI_MODEL_CHAIN?.trim();
  const listed = rawChain ? rawChain.split(",").map((model) => model.trim()).filter(Boolean) : [...DEFAULT_MODEL_CHAIN];
  const modelChain = [...new Set(listed)];
  if (modelChain.length === 0 || modelChain.some((model) => !MODEL_ID.test(model) || UNSTABLE.test(model))) {
    // Reported by name only; the offending value is never echoed (it could be a pasted secret).
    console.warn("[ai.config] GEMINI_MODEL_CHAIN contains an id outside the allowlist; AI disabled");
    return { configured: false, reason: "invalid_model_chain" };
  }

  const rawLevel = env.GEMINI_THINKING_LEVEL?.trim() ?? "";
  if (rawLevel !== "" && !THINKING_LEVELS.includes(rawLevel as ThinkingLevel)) {
    console.warn("[ai.config] GEMINI_THINKING_LEVEL is not one of minimal|low|medium|high; AI disabled");
    return { configured: false, reason: "invalid_thinking_level" };
  }

  return {
    configured: true,
    apiKey,
    modelChain,
    thinkingLevel: rawLevel === "" ? null : (rawLevel as ThinkingLevel),
  };
}
