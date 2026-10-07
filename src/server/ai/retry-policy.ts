import type { AiOperation, RetryBudget } from "./types";

/*
 * Ported from the colleague's fork (research R4). Every retry and fallback of
 * one interaction shares one deadline, kept under the player-facing promise
 * (≤ 20 s check, ≤ 10 s hint). Bot answers are fetched while the human is
 * already playing, so they may take longer without anyone waiting on them.
 */

export const BUDGETS: Record<AiOperation, RetryBudget> = {
  "check-round": {
    // Normal replies take 0.9-2.1 s (live, 2026-09-30); 6 s leaves room for three models.
    perAttemptMs: 6_000,
    totalMs: 18_000,
    maxAttemptsPerModel: 2,
    backoffBaseMs: 400,
    backoffCapMs: 2_000,
    minAttemptMs: 2_000,
  },
  hint: {
    perAttemptMs: 4_000,
    totalMs: 9_000,
    maxAttemptsPerModel: 2,
    backoffBaseMs: 300,
    backoffCapMs: 1_500,
    minAttemptMs: 1_500,
  },
  "bot-answers": {
    perAttemptMs: 8_000,
    totalMs: 30_000,
    maxAttemptsPerModel: 2,
    backoffBaseMs: 500,
    backoffCapMs: 3_000,
    minAttemptMs: 2_000,
  },
  "post-round-coach": {
    perAttemptMs: 8_000,
    totalMs: 30_000,
    maxAttemptsPerModel: 1,
    backoffBaseMs: 0,
    backoffCapMs: 0,
    minAttemptMs: 1,
  },
};

/** Exponential backoff with full jitter: uniform in [0, min(cap, base × 2ⁿ)). */
export function backoffMs(retryIndex: number, budget: RetryBudget, random: () => number): number {
  const ceiling = Math.min(budget.backoffCapMs, budget.backoffBaseMs * 2 ** retryIndex);
  return Math.floor(random() * ceiling);
}

const DURATION = /^(\d+(?:\.\d+)?)s$/;

/**
 * Whether a 429 is the per-day quota (e.g. quotaId
 * "GenerateRequestsPerDayPerProjectPerModel-FreeTier") rather than per-minute.
 * Gemini names the window in the QuotaFailure detail of the error body.
 */
export function isDailyQuota(body: unknown): boolean {
  const details = (body as { error?: { details?: unknown } } | null)?.error?.details;
  if (!Array.isArray(details)) return false;
  return details.some((detail) => {
    const type = (detail as { "@type"?: unknown })["@type"];
    const violations = (detail as { violations?: unknown }).violations;
    if (typeof type !== "string" || !type.endsWith("QuotaFailure") || !Array.isArray(violations)) return false;
    return violations.some((violation) => {
      const id = (violation as { quotaId?: unknown }).quotaId;
      return typeof id === "string" && /PerDay/i.test(id);
    });
  });
}

/**
 * The provider's own "try again in …" hint, from a `Retry-After` header
 * (seconds or an HTTP date) or Google's `RetryInfo.retryDelay` ("30s").
 */
export function parseRetryAfterMs(header: string | null, body: unknown, now: number): number | undefined {
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
    const date = Date.parse(header);
    if (!Number.isNaN(date)) return Math.max(0, date - now);
  }

  const details = (body as { error?: { details?: unknown } } | null)?.error?.details;
  if (Array.isArray(details)) {
    for (const detail of details) {
      const type = (detail as { "@type"?: unknown })["@type"];
      const delay = (detail as { retryDelay?: unknown }).retryDelay;
      if (typeof type === "string" && type.endsWith("RetryInfo") && typeof delay === "string") {
        const match = DURATION.exec(delay);
        if (match) return Math.round(Number(match[1]) * 1000);
      }
    }
  }
  return undefined;
}
