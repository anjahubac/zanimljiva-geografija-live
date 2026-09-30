import { describe, expect, it } from "vitest";
import { createGeminiAdapter } from "@server/ai/gemini-adapter";
import { generate } from "@server/ai/gateway";
import { COOL_DOWN_MS, MAX_COOL_DOWN_MS, createModelHealth, nextPacificMidnight } from "@server/ai/model-health";
import { BUDGETS, isDailyQuota } from "@server/ai/retry-policy";
import { memoryTelemetry } from "@server/ai/telemetry";
import type { AiRequest } from "@server/ai/types";
import { fakeAdapter, fakeTime } from "../fakes/fake-adapter";
import { TEST_KEY } from "../fakes/fake-gemini";

const CHAIN = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.6-flash", "gemini-3.5-flash"];
const GOOD = { text: "{}" };

const request = (): AiRequest<unknown> => ({
  operation: "check-round",
  promptVersion: "check-round.v2",
  interactionId: "ai-rotation",
  systemInstruction: "s",
  userContent: "{}",
  responseJsonSchema: {},
  temperature: 0,
  maxOutputTokens: 10,
  budget: BUDGETS["check-round"],
  validate: (text) => ({ ok: true, value: text }),
});

const dailyQuotaBody = {
  error: {
    code: 429,
    status: "RESOURCE_EXHAUSTED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", quotaValue: "20" }],
      },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "45s" },
    ],
  },
};
const minuteQuotaBody = {
  error: {
    code: 429,
    details: [
      { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }] },
    ],
  },
};

describe("daily vs per-minute quota", () => {
  it("recognises the per-day quota by its quotaId", () => {
    expect(isDailyQuota(dailyQuotaBody)).toBe(true);
    expect(isDailyQuota(minuteQuotaBody)).toBe(false);
    expect(isDailyQuota(null)).toBe(false);
  });

  it("the adapter reports a daily quota as quota_exhausted, a minute one as rate_limited", async () => {
    const respond = (body: unknown) =>
      createGeminiAdapter({ apiKey: TEST_KEY, fetchImpl: (async () => new Response(JSON.stringify(body), { status: 429 })) as unknown as typeof fetch });
    const call = { model: "m", systemInstruction: "", userContent: "", responseJsonSchema: {}, temperature: 0, maxOutputTokens: 1, thinkingLevel: null, signal: new AbortController().signal };
    expect(await respond(dailyQuotaBody).generate(call)).toMatchObject({ ok: false, error: { code: "quota_exhausted", httpStatus: 429 } });
    expect(await respond(minuteQuotaBody).generate(call)).toMatchObject({ ok: false, error: { code: "rate_limited" } });
  });
});

describe("model health memory", () => {
  it("skips a model that just timed out, for the cool-down, then tries it again", () => {
    const health = createModelHealth();
    health.report(CHAIN[0]!, "timeout", 0);
    expect(health.plan(CHAIN, 1_000)).toEqual({ usable: CHAIN.slice(1), skipped: [{ model: CHAIN[0], reason: "cooling" }] });
    expect(health.plan(CHAIN, COOL_DOWN_MS).usable).toEqual(CHAIN);
  });

  it("skips a model out of daily quota until the Pacific-midnight reset", () => {
    const health = createModelHealth();
    const now = Date.parse("2026-09-30T15:00:00Z"); // 08:00 in Los Angeles
    health.report(CHAIN[0]!, "quota_exhausted", now);
    expect(health.plan(CHAIN, now + 60 * 60_000).skipped).toEqual([{ model: CHAIN[0], reason: "exhausted" }]);
    expect(health.plan(CHAIN, nextPacificMidnight(now)).usable).toEqual(CHAIN);
  });

  it("cools a model that keeps failing down longer each time, capped, and resets on success", () => {
    const health = createModelHealth();
    let now = 0;
    const cooledFor = () => {
      health.report("a", "timeout", now);
      const start = now;
      while (health.plan(["a", "b"], now).skipped.length > 0) now += 1_000;
      return now - start;
    };
    expect(cooledFor()).toBe(COOL_DOWN_MS);
    expect(cooledFor()).toBe(2 * COOL_DOWN_MS);
    expect(cooledFor()).toBe(4 * COOL_DOWN_MS);
    for (let i = 0; i < 5; i++) cooledFor();
    expect(cooledFor()).toBe(MAX_COOL_DOWN_MS);
    health.report("a", "success", now);
    expect(cooledFor()).toBe(COOL_DOWN_MS);
  });

  it("forgets a problem once the model answers", () => {
    const health = createModelHealth();
    health.report(CHAIN[1]!, "provider_transient", 0);
    health.report(CHAIN[1]!, "success", 10);
    expect(health.plan(CHAIN, 20).usable).toEqual(CHAIN);
  });

  it("with nothing healthy, still tries cooling models (soonest first) but never exhausted ones", () => {
    const health = createModelHealth();
    health.report("a", "quota_exhausted", 0);
    health.report("b", "timeout", 5);
    health.report("c", "provider_transient", 1);
    expect(health.plan(["a", "b", "c"], 10)).toEqual({ usable: ["c", "b"], skipped: [{ model: "a", reason: "exhausted" }] });
  });

  it("ignores failures that say nothing about the model", () => {
    const health = createModelHealth();
    for (const code of ["invalid_request", "safety_refusal", "invalid_output:schema"] as const) health.report("a", code, 0);
    expect(health.plan(["a"], 1).usable).toEqual(["a"]);
  });

  it("computes the next midnight in Los Angeles", () => {
    // 2026-09-30 is daylight time (UTC-7): midnight PDT is 07:00 UTC.
    expect(new Date(nextPacificMidnight(Date.parse("2026-09-30T15:00:00Z"))).toISOString()).toBe("2026-10-01T07:00:00.000Z");
    expect(new Date(nextPacificMidnight(Date.parse("2026-10-01T06:59:00Z"))).toISOString()).toBe("2026-10-01T07:00:00.000Z");
  });
});

describe("gateway with rotation", () => {
  const deps = (steps: Parameters<typeof fakeAdapter>[0], health = createModelHealth()) => {
    const adapter = fakeAdapter(steps);
    const time = fakeTime();
    const telemetry = memoryTelemetry();
    return { adapter, health, telemetry, time, deps: { adapter, modelChain: CHAIN, thinkingLevel: null, telemetry, health, now: time.now, sleep: time.sleep, random: () => 0 } };
  };

  it("the request after a timeout starts on the next model, without waiting for the slow one", async () => {
    const health = createModelHealth();
    const first = deps([{ code: "timeout" }, GOOD], health);
    await generate(request(), first.deps);

    const second = deps([GOOD], health);
    const result = await generate(request(), { ...second.deps, now: first.time.now });
    expect(second.adapter.calls.map((call) => call.model)).toEqual([CHAIN[1]]);
    expect(second.telemetry.records[0]!.skipped).toEqual([{ model: CHAIN[0], reason: "cooling" }]);
    expect(result).toMatchObject({ ok: true, model: CHAIN[1] });
  });

  it("a daily quota moves to the next model at once, with no retry of the spent one", async () => {
    const { adapter, deps: d } = deps([{ code: "quota_exhausted", httpStatus: 429 }, GOOD]);
    const result = await generate(request(), d);
    expect(adapter.calls.map((call) => call.model)).toEqual([CHAIN[0], CHAIN[1]]);
    expect(result).toMatchObject({ ok: true, model: CHAIN[1] });
  });

  it("every model out of daily quota → quota_exhausted, not retryable", async () => {
    const quota = { code: "quota_exhausted", httpStatus: 429 } as const;
    const { adapter, deps: d } = deps([quota, quota, quota, quota]);
    const result = await generate(request(), d);
    expect(adapter.calls).toHaveLength(4);
    expect(result).toMatchObject({ ok: false, code: "quota_exhausted", retryable: false });
  });

  it("once every model is known to be out of quota, answers without any provider call", async () => {
    const health = createModelHealth();
    for (const model of CHAIN) health.report(model, "quota_exhausted", 1_000_000);
    const { adapter, deps: d } = deps([GOOD], health);
    const result = await generate(request(), d);
    expect(adapter.calls).toHaveLength(0);
    expect(result).toMatchObject({ ok: false, code: "quota_exhausted" });
  });

  it("a mix of spent quota and timeouts is a temporary failure, not 'limit reached'", async () => {
    const { deps: d } = deps([{ code: "quota_exhausted" }, { code: "timeout" }, { code: "timeout" }, { code: "timeout" }]);
    const result = await generate(request(), d);
    expect(result).toMatchObject({ ok: false, code: "timeout", retryable: true });
  });
});

describe("thinking level per model", () => {
  it("Flash models get 'minimal', lite models nothing, unless overridden", async () => {
    const { defaultThinkingLevel } = await import("@server/ai/config");
    expect(defaultThinkingLevel("gemini-3.6-flash")).toBe("minimal");
    expect(defaultThinkingLevel("gemini-3.5-flash")).toBe("minimal");
    expect(defaultThinkingLevel("gemini-3.5-flash-lite")).toBeNull();
    expect(defaultThinkingLevel("gemini-3.1-flash-lite")).toBeNull();

    const adapter = fakeAdapter([{ code: "timeout" }, { code: "timeout" }, GOOD]);
    await generate(request(), { adapter, modelChain: CHAIN, thinkingLevel: null, telemetry: () => {}, sleep: async () => {} });
    expect(adapter.calls.map((call) => [call.model, call.thinkingLevel])).toEqual([
      [CHAIN[0], null],
      [CHAIN[1], null],
      [CHAIN[2], "minimal"],
    ]);

    const forced = fakeAdapter([GOOD]);
    await generate(request(), { adapter: forced, modelChain: CHAIN, thinkingLevel: "low", telemetry: () => {} });
    expect(forced.calls[0]!.thinkingLevel).toBe("low");
  });
});
