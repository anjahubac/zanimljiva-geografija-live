import { describe, expect, it } from "vitest";
import { createGeminiAdapter } from "@server/ai/gemini-adapter";
import type { ModelCall } from "@server/ai/types";

const KEY = "AIzaSy-adapter-sentinel-0000000000000";

type Captured = { url: string; init: RequestInit };

function fakeFetch(respond: () => Response | Promise<Response>) {
  const captured: Captured[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(url), init: init ?? {} });
    return respond();
  }) as typeof fetch;
  return { impl, captured };
}

const call = (overrides: Partial<ModelCall> = {}): ModelCall => ({
  model: "gemini-3.5-flash-lite",
  systemInstruction: "Be a strict referee.",
  userContent: '{"letter":"S","items":[]}',
  responseJsonSchema: { type: "object" },
  temperature: 0,
  maxOutputTokens: 1500,
  thinkingLevel: null,
  signal: new AbortController().signal,
  ...overrides,
});

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const reply = (text: string, finishReason = "STOP") => ({
  candidates: [{ finishReason, content: { parts: [{ text }] } }],
  usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 40, totalTokenCount: 160 },
});

describe("Gemini adapter — the request it sends", () => {
  it("posts to v1beta generateContent with the key in a header, never in the URL", async () => {
    const { impl, captured } = fakeFetch(() => ok(reply("{}")));
    await createGeminiAdapter({ apiKey: KEY, fetchImpl: impl }).generate(call());

    const [{ url, init }] = captured as [Captured];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    expect(url).not.toContain(KEY);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    expect(String(init.body)).not.toContain(KEY);
  });

  it("asks for JSON against our schema, bounded, at the given temperature", async () => {
    const { impl, captured } = fakeFetch(() => ok(reply("{}")));
    await createGeminiAdapter({ apiKey: KEY, fetchImpl: impl }).generate(call());
    const body = JSON.parse(String(captured[0]!.init.body));

    expect(body.systemInstruction).toEqual({ parts: [{ text: "Be a strict referee." }] });
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: '{"letter":"S","items":[]}' }] }]);
    expect(body.generationConfig).toEqual({
      responseMimeType: "application/json",
      responseJsonSchema: { type: "object" },
      temperature: 0,
      maxOutputTokens: 1500,
    });
  });

  it("sends thinkingConfig only when a thinking level is configured", async () => {
    const { impl, captured } = fakeFetch(() => ok(reply("{}")));
    await createGeminiAdapter({ apiKey: KEY, fetchImpl: impl }).generate(call({ thinkingLevel: "low" }));
    expect(JSON.parse(String(captured[0]!.init.body)).generationConfig.thinkingConfig).toEqual({ thinkingLevel: "low" });
  });

  it("passes the abort signal through", async () => {
    const controller = new AbortController();
    const { impl, captured } = fakeFetch(() => ok(reply("{}")));
    await createGeminiAdapter({ apiKey: KEY, fetchImpl: impl }).generate(call({ signal: controller.signal }));
    expect(captured[0]!.init.signal).toBe(controller.signal);
  });
});

describe("Gemini adapter — normalizing what comes back", () => {
  const run = (respond: () => Response | Promise<Response>, overrides: Partial<ModelCall> = {}) =>
    createGeminiAdapter({ apiKey: KEY, fetchImpl: fakeFetch(respond).impl, now: () => 0 }).generate(call(overrides));

  it("returns the text and the reported token usage", async () => {
    expect(await run(() => ok(reply('{"items":[]}')))).toEqual({
      ok: true,
      text: '{"items":[]}',
      usage: { inputTokens: 120, outputTokens: 40, totalTokens: 160 },
    });
  });

  it("joins text parts and skips thought summaries", async () => {
    const body = { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "thinking…", thought: true }, { text: '{"a"' }, { text: ":1}" }] } }] };
    expect(await run(() => ok(body))).toEqual({ ok: true, text: '{"a":1}' });
  });

  it.each([
    [400, "invalid_request"],
    [401, "auth_config"],
    [403, "auth_config"],
    [404, "model_unavailable"],
    [500, "provider_transient"],
    [503, "provider_transient"],
  ] as const)("HTTP %i → %s", async (status, code) => {
    expect(await run(() => new Response('{"error":{"message":"raw provider text"}}', { status }))).toEqual({
      ok: false,
      error: { code, httpStatus: status },
    });
  });

  it("carries the rate-limit hint of a 429", async () => {
    const body = { error: { details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "2s" }] } };
    expect(await run(() => new Response(JSON.stringify(body), { status: 429 }))).toEqual({
      ok: false,
      error: { code: "rate_limited", httpStatus: 429, retryAfterMs: 2_000 },
    });
  });

  it("T12: a blocked prompt or a safety finish is a refusal", async () => {
    expect(await run(() => ok({ promptFeedback: { blockReason: "SAFETY" } }))).toEqual({ ok: false, error: { code: "safety_refusal" } });
    expect(await run(() => ok(reply("", "SAFETY")))).toEqual({ ok: false, error: { code: "safety_refusal" } });
  });

  it("T13: a reply cut off at the token limit is truncated output", async () => {
    expect(await run(() => ok(reply('{"items":[', "MAX_TOKENS")))).toEqual({ ok: false, error: { code: "invalid_output:truncated" } });
  });

  it("T14: no candidate, or only whitespace, is empty output", async () => {
    expect(await run(() => ok({ candidates: [] }))).toEqual({ ok: false, error: { code: "invalid_output:empty" } });
    expect(await run(() => ok(reply("   ")))).toEqual({ ok: false, error: { code: "invalid_output:empty" } });
  });

  it("a network failure is transport; an aborted attempt is a timeout", async () => {
    expect(await run(() => Promise.reject(new TypeError("fetch failed")))).toEqual({ ok: false, error: { code: "transport" } });

    const controller = new AbortController();
    controller.abort();
    expect(await run(() => Promise.reject(new DOMException("aborted", "AbortError")), { signal: controller.signal })).toEqual({
      ok: false,
      error: { code: "timeout" },
    });
  });

  it("never returns the provider's raw error text", async () => {
    const result = await run(() => new Response('{"error":{"message":"API key not valid AIzaSy..."}}', { status: 400 }));
    expect(JSON.stringify(result)).not.toContain("API key not valid");
  });
});
