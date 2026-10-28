import { describe, expect, it } from "vitest";
import { createCoachAttemptGuard, coachResponseSchema } from "@server/ai/coach-attempt-guard";
import { createGeminiAdapter } from "@server/ai/gemini-adapter";
import { createGroqAdapter } from "@server/ai/groq-adapter";
import type { ModelCall, ProviderAdapter } from "@server/ai/types";
import { z } from "zod";

const call: ModelCall = { model: "openai/gpt-oss-20b", systemInstruction: "system", userContent: "{}", responseJsonSchema: coachResponseSchema(1), temperature: 0, maxOutputTokens: 1024, thinkingLevel: null, signal: new AbortController().signal };
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
type SchemaNode = { required?: string[]; additionalProperties?: boolean; properties?: Record<string, SchemaNode> };
const schemaNodeSchema: z.ZodType<SchemaNode> = z.lazy(() => z.object({
  required: z.array(z.string()).optional(),
  additionalProperties: z.boolean().optional(),
  properties: z.record(schemaNodeSchema).optional(),
}).passthrough());
const geminiBodySchema = z.object({ generationConfig: z.object({ responseJsonSchema: z.unknown() }).passthrough() }).passthrough();
const groqBodySchema = z.object({ response_format: z.object({ json_schema: z.object({ strict: z.boolean(), schema: z.unknown() }).passthrough() }).passthrough() }).passthrough();

describe("coach physical-attempt guard", () => {
  it("charges immediately before the real adapter and records usage from malformed transport-success", async () => {
    let charges = 0;
    const seen: Array<{ usage?: unknown; status: string }> = [];
    const adapter: ProviderAdapter = { provider: "gemini", generate: async () => ({ ok: true, text: "{bad", usage: { inputTokens: 4, outputTokens: 2 } }) };
    const model = createCoachAttemptGuard({ adapter, modelChain: ["gemini-test"], thinkingLevel: null, onAttempt: (event) => seen.push({ usage: event.usage, status: event.status }) });
    const result = await model({ step: 1, system: "system", content: "{}", signal: new AbortController().signal, deadlineAt: Date.now() + 30_000, now: Date.now, onAttempt: () => { charges += 1; return true; } });
    expect(charges).toBe(1);
    expect(result.ok).toBe(true);
    expect(seen).toEqual([{ usage: { inputTokens: 4, outputTokens: 2 }, status: "transport_success" }]);
  });

  it("never starts a fourth physical adapter attempt across two model steps", async () => {
    let calls = 0;
    const adapter: ProviderAdapter = { provider: "gemini", generate: async () => { calls += 1; return { ok: false, error: { code: "timeout" } }; } };
    const model = createCoachAttemptGuard({ adapter, modelChain: ["gemini-one", "gemini-two"], thinkingLevel: null });
    const request = (step: 1 | 2) => model({ step, system: "", content: "", signal: new AbortController().signal, deadlineAt: Date.now() + 30_000, now: Date.now, onAttempt: () => true });
    await request(1);
    await request(2);
    await request(2);
    expect(calls).toBe(3);
  });

  it("settles promptly on caller abort when the adapter ignores abort and discards its late reply", async () => {
    let resolveLate: ((value: Awaited<ReturnType<ProviderAdapter["generate"]>>) => void) | undefined;
    const statuses: string[] = [];
    const adapter: ProviderAdapter = { provider: "gemini", generate: async () => new Promise((resolve) => { resolveLate = resolve; }) };
    const model = createCoachAttemptGuard({ adapter, modelChain: ["gemini-test"], thinkingLevel: null, onAttempt: (entry) => statuses.push(entry.status) });
    const controller = new AbortController();
    const pending = model({ step: 1, system: "", content: "", signal: controller.signal, deadlineAt: Date.now() + 30_000, now: Date.now, onAttempt: () => true });
    await Promise.resolve();
    controller.abort();
    await expect(pending).resolves.toEqual({ ok: false, reason: "cancelled" });
    resolveLate?.({ ok: true, text: "{}", usage: { totalTokens: 99 } });
    await Promise.resolve();
    expect(statuses).toEqual(["cancelled"]);
  });

  it("does not charge or call the provider when the shared physical-attempt gate denies", async () => {
    let calls = 0;
    const adapter: ProviderAdapter = { provider: "gemini", generate: async () => { calls += 1; return { ok: true, text: "{}" }; } };
    const model = createCoachAttemptGuard({ adapter, modelChain: ["gemini-test"], thinkingLevel: null });
    const result = await model({ step: 1, system: "", content: "", signal: new AbortController().signal, deadlineAt: Date.now() + 30_000, now: Date.now, onAttempt: () => false });
    expect(result).toEqual({ ok: false, reason: "quota_exhausted" });
    expect(calls).toBe(0);
  });

  it("uses the injected attempt deadline and cancels all scheduler entries after a hung dependency", async () => {
    const scheduled: Array<{ at: number; fire: () => void; cancelled: boolean }> = [];
    const schedule = (at: number, fn: () => void) => {
      const entry = { at, fire: fn, cancelled: false };
      scheduled.push(entry);
      return () => { entry.cancelled = true; };
    };
    let calls = 0;
    const adapter: ProviderAdapter = { provider: "gemini", generate: async () => { calls += 1; return new Promise(() => {}); } };
    let time = 100;
    const now = () => time;
    const model = createCoachAttemptGuard({ adapter, modelChain: ["gemini-test"], thinkingLevel: null, now, schedule });
    const pending = model({ step: 1, system: "", content: "", signal: new AbortController().signal, deadlineAt: 105, now, onAttempt: () => true });
    for (let i = 0; i < 2; i += 1) {
      await Promise.resolve();
      const active = scheduled.find((entry) => !entry.cancelled);
      active?.fire();
      time = active?.at ?? time;
      await Promise.resolve();
      await Promise.resolve();
    }
    await expect(pending).resolves.toEqual({ ok: false, reason: "deadline" });
    expect(calls).toBe(1);
    expect(scheduled.every((entry) => entry.cancelled)).toBe(true);
  });

  it("uses one configured fallback and pins that model across the next decision", async () => {
    const models: string[] = [];
    const adapter: ProviderAdapter = {
      provider: "gemini",
      async generate(request) {
        models.push(request.model);
        return models.length === 1 ? { ok: false, error: { code: "timeout" } } : { ok: true, text: "{}" };
      },
    };
    const model = createCoachAttemptGuard({ adapter, modelChain: ["gemini-one", "groq-one"], thinkingLevel: null });
    let attempts = 0;
    const call = (step: 1 | 2) => model({ step, system: "", content: "", signal: new AbortController().signal, deadlineAt: Date.now() + 30_000, now: Date.now, onAttempt: () => { attempts += 1; return true; } });
    expect((await call(1)).ok).toBe(true);
    expect((await call(2)).ok).toBe(true);
    expect(models).toEqual(["gemini-one", "groq-one", "groq-one"]);
    expect(attempts).toBe(3);
  });

  it("caps retries at two physical attempts in one logical decision", async () => {
    let calls = 0;
    const adapter: ProviderAdapter = { provider: "gemini", generate: async () => { calls += 1; return { ok: false, error: { code: "transport" } }; } };
    const model = createCoachAttemptGuard({ adapter, modelChain: ["gemini-one"], thinkingLevel: null });
    const result = await model({ step: 1, system: "", content: "", signal: new AbortController().signal, deadlineAt: Date.now() + 30_000, now: Date.now, onAttempt: () => true });
    expect(result.ok).toBe(false);
    expect(calls).toBe(2);
  });

  it("caps each adapter call at eight seconds even when the run has more time", async () => {
    const scheduledAt: number[] = [];
    const adapter: ProviderAdapter = { provider: "gemini", generate: async () => ({ ok: true, text: "{}" }) };
    const model = createCoachAttemptGuard({ adapter, modelChain: ["gemini-one"], thinkingLevel: null, now: () => 1_000, schedule: (at, _fn) => { scheduledAt.push(at); return () => {}; } });
    await model({ step: 1, system: "", content: "", signal: new AbortController().signal, deadlineAt: 30_000, now: () => 1_000, onAttempt: () => true });
    expect(scheduledAt).toEqual([9_000]);
  });

  it("classifies an adapter promise rejection as transport, not an attempt timeout", async () => {
    const adapter: ProviderAdapter = { provider: "gemini", generate: async () => { throw new Error("private adapter detail"); } };
    const statuses: string[] = [];
    const model = createCoachAttemptGuard({ adapter, modelChain: ["gemini-test"], thinkingLevel: null, onAttempt: (event) => statuses.push(event.status) });
    const result = await model({ step: 1, system: "", content: "", signal: new AbortController().signal, deadlineAt: Date.now() + 30_000, now: Date.now, onAttempt: () => true });
    expect(result).toEqual({ ok: false, reason: "provider_failed" });
    expect(statuses).toEqual(["transport", "transport"]);
  });

  it("honors a bounded Retry-After wait and skips recovery when it cannot fit the run deadline", async () => {
    const waits: Array<{ at: number; fire: () => void; cancelled: boolean }> = [];
    const schedule = (at: number, fn: () => void) => { const item = { at, fire: fn, cancelled: false }; waits.push(item); return () => { item.cancelled = true; }; };
    let nowValue = 100;
    let calls = 0;
    const adapter: ProviderAdapter = { provider: "gemini", generate: async () => { calls += 1; return calls === 1 ? { ok: false, error: { code: "rate_limited", retryAfterMs: 20 } } : { ok: true, text: "{}" }; } };
    const model = createCoachAttemptGuard({ adapter, modelChain: ["gemini-test"], thinkingLevel: null, now: () => nowValue, schedule });
    const pending = model({ step: 1, system: "", content: "", signal: new AbortController().signal, deadlineAt: 200, now: () => nowValue, onAttempt: () => true });
    for (let i = 0; i < 8 && calls < 2; i += 1) {
      await Promise.resolve();
      const active = waits.filter((item) => !item.cancelled).sort((a, b) => a.at - b.at)[0];
      if (active && active.at < 200) { nowValue = active.at; active.fire(); }
      await Promise.resolve();
    }
    expect((await pending).ok).toBe(true);
    expect(calls).toBe(2);
    expect(nowValue).toBe(120);

    const limited = createCoachAttemptGuard({ adapter: { provider: "gemini", generate: async () => ({ ok: false, error: { code: "rate_limited", retryAfterMs: 30 } }) }, modelChain: ["gemini-test"], thinkingLevel: null, now: () => nowValue, schedule });
    const stop = await limited({ step: 1, system: "", content: "", signal: new AbortController().signal, deadlineAt: 150, now: () => nowValue, onAttempt: () => true });
    expect(stop).toEqual({ ok: false, reason: "rate_limit" });
  });

  it("does not wait for Retry-After after the single recovery is spent", async () => {
    const scheduled: number[] = [];
    let calls = 0;
    const adapter: ProviderAdapter = { provider: "gemini", generate: async () => {
      calls += 1;
      return calls === 1 ? { ok: false, error: { code: "provider_transient" } } : { ok: false, error: { code: "rate_limited", retryAfterMs: 20_000 } };
    } };
    const model = createCoachAttemptGuard({ adapter, modelChain: ["gemini-test"], thinkingLevel: null, schedule: (at, _fn) => { scheduled.push(at); return () => {}; } });
    const result = await model({ step: 1, system: "", content: "", signal: new AbortController().signal, deadlineAt: Date.now() + 30_000, now: Date.now, onAttempt: () => true });
    expect(result).toEqual({ ok: false, reason: "rate_limit" });
    expect(calls).toBe(2);
    expect(scheduled).toHaveLength(2); // attempt timers only; no Retry-After timer
  });

  it("sends complete strict nested schemas through the Gemini HTTP adapter", async () => {
    let body: z.infer<typeof geminiBodySchema> | undefined;
    const adapter = createGeminiAdapter({ apiKey: "test", fetchImpl: (async (_url, init) => { body = geminiBodySchema.parse(JSON.parse(String(init?.body))); return response({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "{}" }] } }] }); }) as typeof fetch });
    await adapter.generate(call);
    const schema = schemaNodeSchema.parse(body!.generationConfig.responseJsonSchema);
    expect(schema.required).toEqual(["kind", "toolRequest"]);
    expect(schema.additionalProperties).toBe(false);
    const toolRequest = schemaNodeSchema.parse(schema.properties?.toolRequest);
    expect(toolRequest.required).toEqual(["name", "arguments"]);
    expect(schemaNodeSchema.parse(toolRequest.properties?.arguments).required).toEqual(["focus"]);
  });

  it("sends complete strict nested schemas through the Groq HTTP adapter", async () => {
    let body: z.infer<typeof groqBodySchema> | undefined;
    const adapter = createGroqAdapter({ apiKey: "test", fetchImpl: (async (_url, init) => { body = groqBodySchema.parse(JSON.parse(String(init?.body))); return response({ choices: [{ finish_reason: "stop", message: { content: "{}" } }] }); }) as typeof fetch });
    await adapter.generate({ ...call, model: "openai/gpt-oss-20b" });
    const schema = schemaNodeSchema.parse(body!.response_format.json_schema.schema);
    expect(body!.response_format.json_schema.strict).toBe(true);
    expect(schema.required).toEqual(["kind", "toolRequest"]);
    expect(schema.additionalProperties).toBe(false);
    const toolRequest = schemaNodeSchema.parse(schema.properties?.toolRequest);
    expect(schemaNodeSchema.parse(toolRequest.properties?.arguments).required).toEqual(["focus"]);
  });
});
