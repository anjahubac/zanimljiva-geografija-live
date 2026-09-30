import { describe, expect, it } from "vitest";
import { canFallBack, canRetrySameModel, classifyHttpStatus, isRetryableLater } from "@server/ai/classify";
import { BUDGETS, backoffMs, parseRetryAfterMs } from "@server/ai/retry-policy";
import type { AiFailureCode } from "@server/ai/types";

describe("classifyHttpStatus (research R5)", () => {
  it.each([
    [400, "invalid_request"],
    [401, "auth_config"],
    [403, "auth_config"],
    [404, "model_unavailable"],
    [408, "timeout"],
    [409, "invalid_request"],
    [429, "rate_limited"],
    [500, "provider_transient"],
    [502, "provider_transient"],
    [503, "provider_transient"],
    [504, "provider_transient"],
  ] as const)("%i → %s", (status, code) => {
    expect(classifyHttpStatus(status)).toBe(code);
  });
});

describe("what may be retried, and what may fall back (W04 decision table)", () => {
  const table: Array<[AiFailureCode, boolean, boolean]> = [
    ["timeout", false, true],
    ["transport", true, true],
    ["rate_limited", true, true],
    ["provider_transient", true, true],
    ["model_unavailable", false, true],
    ["quota_exhausted", false, true],
    ["invalid_request", false, false],
    ["auth_config", false, false],
    ["safety_refusal", false, false],
    ["invalid_output:truncated", false, false],
    ["invalid_output:empty", false, false],
    ["invalid_output:json", false, false],
    ["invalid_output:schema", false, false],
    ["invalid_output:semantic", false, false],
    ["cancelled", false, false],
  ];

  it.each(table)("%s: retry=%s fallback=%s", (code, retry, fallback) => {
    expect(canRetrySameModel(code)).toBe(retry);
    expect(canFallBack(code)).toBe(fallback);
  });

  it("offers 'Proveri ponovo' only where a later attempt could succeed", () => {
    expect(isRetryableLater("provider_transient")).toBe(true);
    expect(isRetryableLater("deadline_exhausted")).toBe(true);
    expect(isRetryableLater("invalid_output:schema")).toBe(false);
    expect(isRetryableLater("auth_config")).toBe(false);
  });
});

describe("budgets (research R4)", () => {
  it("keeps every interaction under the player-facing promise", () => {
    // Plan A (2026-09-30): shorter attempts so three models fit a check, two a hint.
    expect(BUDGETS["check-round"]).toMatchObject({ perAttemptMs: 6_000, totalMs: 18_000, maxAttemptsPerModel: 2 });
    expect(BUDGETS.hint).toMatchObject({ perAttemptMs: 4_000, totalMs: 9_000, maxAttemptsPerModel: 2 });
    expect(3 * BUDGETS["check-round"].perAttemptMs).toBeLessThanOrEqual(BUDGETS["check-round"].totalMs);
    expect(2 * BUDGETS.hint.perAttemptMs).toBeLessThanOrEqual(BUDGETS.hint.totalMs);
    expect(BUDGETS["check-round"].totalMs).toBeLessThan(20_000);
    expect(BUDGETS.hint.totalMs).toBeLessThan(10_000);
  });
});

describe("backoffMs — exponential with full jitter", () => {
  const budget = BUDGETS["check-round"];

  it("stays below base × 2ⁿ", () => {
    expect(backoffMs(0, budget, () => 0.999)).toBeLessThan(400);
    expect(backoffMs(1, budget, () => 0.999)).toBeLessThan(800);
    expect(backoffMs(0, budget, () => 0)).toBe(0);
  });

  it("never exceeds the cap", () => {
    expect(backoffMs(10, budget, () => 0.999)).toBeLessThan(budget.backoffCapMs);
  });

  it("spreads retries out instead of synchronizing them", () => {
    expect(backoffMs(1, budget, () => 0.25)).not.toBe(backoffMs(1, budget, () => 0.75));
  });
});

describe("parseRetryAfterMs", () => {
  const now = Date.parse("2026-09-30T12:00:00Z");

  it("reads a Retry-After header in seconds or as a date", () => {
    expect(parseRetryAfterMs("3", null, now)).toBe(3_000);
    expect(parseRetryAfterMs("Wed, 30 Sep 2026 12:00:05 GMT", null, now)).toBe(5_000);
  });

  it("reads Google's RetryInfo.retryDelay from the error body", () => {
    const body = {
      error: {
        code: 429,
        details: [
          { "@type": "type.googleapis.com/google.rpc.QuotaFailure" },
          { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "1.5s" },
        ],
      },
    };
    expect(parseRetryAfterMs(null, body, now)).toBe(1_500);
  });

  it("returns undefined when there is no usable hint", () => {
    expect(parseRetryAfterMs(null, null, now)).toBeUndefined();
    expect(parseRetryAfterMs("soon", { error: { details: "x" } }, now)).toBeUndefined();
  });
});
