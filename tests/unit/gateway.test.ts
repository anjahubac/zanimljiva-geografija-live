import { describe, expect, it } from "vitest";
import { generate } from "@server/ai/gateway";
import { BUDGETS } from "@server/ai/retry-policy";
import { memoryTelemetry } from "@server/ai/telemetry";
import type { AiRequest, RetryBudget, Validation } from "@server/ai/types";
import { fakeAdapter, fakeTime, type Step } from "../fakes/fake-adapter";

const CHAIN = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
const GOOD = { text: '{"ok":true}' };
const S503 = { code: "provider_transient", httpStatus: 503 } as const;

function request(overrides: Partial<AiRequest<unknown>> = {}): AiRequest<unknown> {
  return {
    operation: "check-round",
    promptVersion: "check-round.v2",
    interactionId: "ai-test",
    systemInstruction: "system",
    userContent: '{"letter":"S"}',
    responseJsonSchema: {},
    temperature: 0,
    maxOutputTokens: 100,
    budget: BUDGETS["check-round"],
    validate: (text: string): Validation<unknown> =>
      text === GOOD.text ? { ok: true, value: JSON.parse(text) } : { ok: false, code: "invalid_output:json" },
    ...overrides,
  };
}

function setup(steps: Step[], chain: string[] = CHAIN) {
  const adapter = fakeAdapter(steps);
  const time = fakeTime();
  const telemetry = memoryTelemetry();
  const deps = { adapter, modelChain: chain, thinkingLevel: null, telemetry, now: time.now, sleep: time.sleep, random: () => 0.5 };
  return { adapter, time, telemetry, deps };
}

const kinds = (result: { attempts: Array<{ kind: string }> }) => result.attempts.map((attempt) => attempt.kind);
const models = (calls: Array<{ model: string }>) => calls.map((call) => call.model);

describe("gateway — success paths", () => {
  it("T01: one call when the first model answers; no fallback", async () => {
    const { adapter, deps } = setup([GOOD]);
    const result = await generate(request(), deps);
    expect(result.ok).toBe(true);
    expect(adapter.calls).toHaveLength(1);
    expect(result).toMatchObject({ model: CHAIN[0], fallbackUsed: false });
  });

  it("T04: a 503 is retried once on the same model, after a jittered backoff", async () => {
    const { adapter, time, deps } = setup([S503, GOOD]);
    const result = await generate(request(), deps);
    expect(result.ok).toBe(true);
    expect(kinds(result)).toEqual(["initial", "retry"]);
    expect(models(adapter.calls)).toEqual([CHAIN[0], CHAIN[0]]);
    expect(time.sleeps).toEqual([200]); // random 0.5 × 400 ms
  });

  it("T05: two failures on the first model move to the fallback model", async () => {
    const { adapter, deps } = setup([S503, S503, GOOD]);
    const result = await generate(request(), deps);
    expect(result).toMatchObject({ ok: true, model: CHAIN[1], fallbackUsed: true });
    expect(kinds(result)).toEqual(["initial", "retry", "fallback"]);
    expect(models(adapter.calls)).toEqual([CHAIN[0], CHAIN[0], CHAIN[1]]);
  });

  it("T11: a 404 does not retry the same model but falls back", async () => {
    const { adapter, deps } = setup([{ code: "model_unavailable", httpStatus: 404 }, GOOD]);
    const result = await generate(request(), deps);
    expect(result).toMatchObject({ ok: true, model: CHAIN[1], fallbackUsed: true });
    expect(adapter.calls).toHaveLength(2);
  });
});

describe("gateway — bounded failure", () => {
  it("a timeout goes straight to the fallback model instead of retrying the slow one (live 2026-09-30)", async () => {
    const { adapter, deps } = setup([{ code: "timeout" }, GOOD]);
    const result = await generate(request(), deps);
    expect(result).toMatchObject({ ok: true, model: CHAIN[1], fallbackUsed: true });
    expect(kinds(result)).toEqual(["initial", "fallback"]);
    expect(adapter.calls).toHaveLength(2);
  });

  it("a timeout on every model ends as a retryable timeout after one attempt per model", async () => {
    const { adapter, deps } = setup([{ code: "timeout" }, { code: "timeout" }]);
    const result = await generate(request(), deps);
    expect(result).toMatchObject({ ok: false, code: "timeout", retryable: true });
    expect(adapter.calls).toHaveLength(2);
  });

  it("T06: all models failing transiently ends in a safe, retryable failure after at most 4 calls", async () => {
    const { adapter, deps } = setup([S503, S503, S503, S503]);
    const result = await generate(request(), deps);
    expect(result).toMatchObject({ ok: false, code: "provider_transient", retryable: true, fallbackUsed: true });
    expect(adapter.calls).toHaveLength(4);
  });

  it.each([
    ["T09 401", { code: "auth_config", httpStatus: 401 }],
    ["T09 403", { code: "auth_config", httpStatus: 403 }],
    ["T10 400", { code: "invalid_request", httpStatus: 400 }],
    ["T12 refusal", { code: "safety_refusal" }],
    ["T13 truncated", { code: "invalid_output:truncated" }],
    ["T14 empty", { code: "invalid_output:empty" }],
  ] as const)("%s: one call, no retry, no fallback", async (_label, error) => {
    const { adapter, deps } = setup([error, GOOD, GOOD]);
    const result = await generate(request(), deps);
    expect(result).toMatchObject({ ok: false, code: error.code, retryable: false, fallbackUsed: false });
    expect(adapter.calls).toHaveLength(1);
  });

  it("T15/T16: output that fails validation is not retried and does not fall back", async () => {
    const { adapter, deps } = setup([{ text: "not json" }, GOOD]);
    const result = await generate(request(), deps);
    expect(result).toMatchObject({ ok: false, code: "invalid_output:json", retryable: false });
    expect(adapter.calls).toHaveLength(1);
  });

  it("T08: a rate-limit hint longer than the budget is not waited for — the fallback runs at once", async () => {
    const { adapter, time, deps } = setup([{ code: "rate_limited", httpStatus: 429, retryAfterMs: 60_000 }, GOOD]);
    const result = await generate(request(), deps);
    expect(result).toMatchObject({ ok: true, model: CHAIN[1] });
    expect(time.sleeps).toEqual([]);
    expect(adapter.calls).toHaveLength(2);
  });

  it("a rate-limit hint that fits is honored instead of the backoff", async () => {
    const { time, deps } = setup([{ code: "rate_limited", httpStatus: 429, retryAfterMs: 1_500 }, GOOD]);
    await generate(request(), deps);
    expect(time.sleeps).toEqual([1_500]);
  });

  it("never starts an attempt after the shared deadline", async () => {
    const tight: RetryBudget = { ...BUDGETS["check-round"], totalMs: 5_000, minAttemptMs: 2_000 };
    const { adapter, time, deps } = setup([S503, S503, S503, S503]);
    const deadline = time.now() + tight.totalMs;
    const startedAt: number[] = [];
    // Each failed attempt spends 2.5 s. (This fake ignores the attempt timeout;
    // T07 proves with real timers that a slow attempt is cut at min(timeout, remaining).)
    const slow = { ...adapter, generate: async (call: Parameters<typeof adapter.generate>[0]) => {
      startedAt.push(time.now());
      time.advance(2_500);
      return adapter.generate(call);
    } };
    const result = await generate(request({ budget: tight }), { ...deps, adapter: slow });
    expect(result.ok).toBe(false);
    expect(adapter.calls).toHaveLength(2);
    for (const start of startedAt) expect(start).toBeLessThanOrEqual(deadline - tight.minAttemptMs);
  });

  it("T07: a hanging attempt is aborted at its timeout and the fallback model runs with what is left", async () => {
    const budget: RetryBudget = { perAttemptMs: 40, totalMs: 300, maxAttemptsPerModel: 2, backoffBaseMs: 1, backoffCapMs: 1, minAttemptMs: 10 };
    const adapter = fakeAdapter(["hang", GOOD]);
    const telemetry = memoryTelemetry();
    const started = Date.now();
    const result = await generate(request({ budget }), { adapter, modelChain: CHAIN, thinkingLevel: null, telemetry });
    expect(result.ok).toBe(true);
    expect(kinds(result)).toEqual(["initial", "fallback"]);
    expect(result.attempts.map((attempt) => attempt.model)).toEqual(CHAIN);
    expect(result.attempts[0]).toMatchObject({ status: "failure", errorClass: "timeout" });
    expect(Date.now() - started).toBeLessThan(300);
  });

  it("T24: a player who leaves cancels the call, with no retry", async () => {
    const controller = new AbortController();
    const adapter = fakeAdapter(["hang", GOOD]);
    const pending = generate(request(), { adapter, modelChain: CHAIN, thinkingLevel: null, telemetry: memoryTelemetry() }, controller.signal);
    controller.abort();
    const result = await pending;
    expect(result).toMatchObject({ ok: false, code: "cancelled", retryable: false });
    expect(adapter.calls).toHaveLength(1);
  });

  it("never calls two models at the same time", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const { adapter, deps } = setup([S503, S503, S503, S503]);
    const counting = { ...adapter, generate: async (call: Parameters<typeof adapter.generate>[0]) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      const out = await adapter.generate(call);
      inFlight--;
      return out;
    } };
    await generate(request(), { ...deps, adapter: counting });
    expect(maxInFlight).toBe(1);
  });
});

describe("gateway — telemetry (S01, S02)", () => {
  it("records every attempt in order with model, kind, status and latency", async () => {
    const { telemetry, deps } = setup([S503, S503, GOOD]);
    await generate(request(), deps);
    expect(telemetry.records).toHaveLength(1);
    const [record] = telemetry.records;
    expect(record).toMatchObject({ event: "ai.interaction", operation: "check-round", outcome: "success", fallbackUsed: true });
    expect(record!.attempts.map((attempt) => [attempt.n, attempt.model, attempt.kind, attempt.status])).toEqual([
      [1, CHAIN[0], "initial", "failure"],
      [2, CHAIN[0], "retry", "failure"],
      [3, CHAIN[1], "fallback", "success"],
    ]);
    expect(record!.attempts[0]).toMatchObject({ errorClass: "provider_transient", httpStatus: 503 });
    for (const attempt of record!.attempts) expect(typeof attempt.latencyMs).toBe("number");
    expect(record!.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
  });

  it("records a failure as its code, and never the prompt or the reply", async () => {
    const { telemetry, deps } = setup([{ text: "not json — SECRET-REPLY" }]);
    await generate(request({ systemInstruction: "SECRET-PROMPT", userContent: "SECRET-ANSWERS" }), deps);
    const line = JSON.stringify(telemetry.records);
    expect(telemetry.records[0]!.outcome).toBe("invalid_output:json");
    expect(line).not.toContain("SECRET-PROMPT");
    expect(line).not.toContain("SECRET-ANSWERS");
    expect(line).not.toContain("SECRET-REPLY");
  });
});
