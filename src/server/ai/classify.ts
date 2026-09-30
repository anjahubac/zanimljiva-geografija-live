import type { AiFailureCode } from "./types";

/*
 * research R5 — the W04 decision table, as code. Retry repeats the same model;
 * fallback moves to the next model; both only for temporary problems.
 */

export function classifyHttpStatus(status: number): AiFailureCode {
  if (status === 401 || status === 403) return "auth_config";
  if (status === 404) return "model_unavailable";
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_transient";
  return "invalid_request";
}

/**
 * Temporary problems worth another attempt on the same model. A timeout is not
 * one of them: a model too slow for the budget is likely still slow a second
 * later, and retrying it spent the whole deadline before the fallback could run
 * (live, 2026-09-30: gemini-3.5-flash-lite took 13.6 s for "ok" while
 * gemini-3.1-flash-lite took 1.9 s). A timeout moves straight to the next model.
 */
const RETRY_SAME_MODEL: ReadonlySet<AiFailureCode> = new Set<AiFailureCode>([
  "transport",
  "rate_limited",
  "provider_transient",
]);

/** Worth moving to the next model. 404 only because the chain is pre-verified (L1). */
const MOVE_TO_NEXT_MODEL: ReadonlySet<AiFailureCode> = new Set<AiFailureCode>([
  ...RETRY_SAME_MODEL,
  "timeout",
  "model_unavailable",
  "quota_exhausted",
]);

export const canRetrySameModel = (code: AiFailureCode): boolean => RETRY_SAME_MODEL.has(code);
export const canFallBack = (code: AiFailureCode): boolean => MOVE_TO_NEXT_MODEL.has(code);

/**
 * Whether the player may usefully press "Proveri ponovo" later. Bad requests,
 * key problems, refusals and malformed output would fail the same way again.
 */
export function isRetryableLater(code: AiFailureCode): boolean {
  // A spent daily quota comes back only after the reset, not on the next click.
  if (code === "quota_exhausted") return false;
  return canFallBack(code) || code === "deadline_exhausted";
}
