import { describe, expect, it } from "vitest";
import { CATEGORIES, type Category } from "@contracts/game.schemas";
import { CHECK_JSON_SCHEMA } from "@contracts/ai-output.schemas";
import { createAiService } from "@server/ai/service";
import { buildGroqBody, createGroqAdapter, parseGroqDuration, toGroqSchema } from "@server/ai/groq-adapter";
import { createModelHealth } from "@server/ai/model-health";
import { interleave, loadProviders, parseProviderOrder, providerOfModel } from "@server/ai/providers";
import { memoryTelemetry } from "@server/ai/telemetry";
import type { ModelCall } from "@server/ai/types";
import { answerKey } from "@server/features/check-round";

const GROQ_KEY = "gsk_SENTINEL_test_key_0000000000";
const GEMINI_KEY = "AIzaSy-SENTINEL-test-key-000000000000";

const call = (overrides: Partial<ModelCall> = {}): ModelCall => ({
  model: "openai/gpt-oss-120b",
  systemInstruction: "system",
  userContent: '{"letter":"S"}',
  responseJsonSchema: CHECK_JSON_SCHEMA,
  temperature: 0,
  maxOutputTokens: 500,
  thinkingLevel: null,
  signal: new AbortController().signal,
  ...overrides,
});

const groqReply = (content: string, finish = "stop") =>
  new Response(
    JSON.stringify({
      choices: [{ finish_reason: finish, message: { content } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    }),
    { status: 200 },
  );

const groqError = (status: number, message: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { message, type: "rate_limit" } }), { status, headers });

describe("Groq adapter — request", () => {
  it("sends strict JSON-schema output, the key only in a header, and low reasoning for gpt-oss", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const adapter = createGroqAdapter({
      apiKey: GROQ_KEY,
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen.push({ url, init });
        return groqReply('{"items":[]}');
      }) as unknown as typeof fetch,
    });

    await adapter.generate(call());
    const { url, init } = seen[0]!;
    const body = JSON.parse(init.body as string);

    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(url).not.toContain(GROQ_KEY);
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${GROQ_KEY}`);
    expect(body.response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true } });
    expect(body.messages.map((message: { role: string }) => message.role)).toEqual(["system", "user"]);
    expect(body).toMatchObject({ reasoning_effort: "low", include_reasoning: false });
    expect(body.max_completion_tokens).toBeGreaterThan(500);
  });

  it("sends no reasoning options to a model that does not reason", () => {
    const body = buildGroqBody("llama-3.3-70b-versatile", call()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(body.max_completion_tokens).toBe(500);
  });

  it("strips array length bounds, which strict mode does not document, and keeps the rest", () => {
    const schema = toGroqSchema(CHECK_JSON_SCHEMA);
    expect(JSON.stringify(schema)).not.toMatch(/minItems|maxItems/);
    expect(schema).toMatchObject({ required: ["items"], additionalProperties: false });
  });
});

describe("Groq adapter — responses", () => {
  const adapterFor = (response: () => Response | Promise<Response>) =>
    createGroqAdapter({ apiKey: GROQ_KEY, fetchImpl: (async () => response()) as unknown as typeof fetch });

  it("returns the message content and token usage", async () => {
    const result = await adapterFor(() => groqReply('{"items":[]}')).generate(call());
    expect(result).toEqual({
      ok: true,
      text: '{"items":[]}',
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    });
  });

  it.each([
    ["length", "invalid_output:truncated"],
    ["content_filter", "safety_refusal"],
  ])("maps finish_reason %s to %s", async (finish, code) => {
    const result = await adapterFor(() => groqReply("{}", finish)).generate(call());
    expect(result).toEqual({ ok: false, error: { code } });
  });

  it("tells a daily limit from a per-minute one, with when each resets", async () => {
    const daily = await adapterFor(() =>
      groqError(429, "Rate limit reached on requests per day (RPD): Limit 1000", {
        "x-ratelimit-remaining-requests": "0",
        "x-ratelimit-reset-requests": "2h3m",
      }),
    ).generate(call());
    expect(daily).toEqual({ ok: false, error: { code: "quota_exhausted", retryAfterMs: 7_380_000, httpStatus: 429 } });

    const minute = await adapterFor(() =>
      groqError(429, "Rate limit reached on tokens per minute (TPM)", { "retry-after": "7" }),
    ).generate(call());
    expect(minute).toEqual({ ok: false, error: { code: "rate_limited", retryAfterMs: 7_000, httpStatus: 429 } });
  });

  it("treats 498 (flex capacity) and 5xx as temporary, and 401 as a key problem", async () => {
    expect(await adapterFor(() => groqError(498, "capacity")).generate(call())).toMatchObject({
      error: { code: "provider_transient" },
    });
    expect(await adapterFor(() => groqError(503, "down")).generate(call())).toMatchObject({
      error: { code: "provider_transient" },
    });
    expect(await adapterFor(() => groqError(401, "bad key")).generate(call())).toMatchObject({
      error: { code: "auth_config" },
    });
  });

  it("reports a network failure as transport, and an aborted one as timeout", async () => {
    const failing = createGroqAdapter({
      apiKey: GROQ_KEY,
      fetchImpl: (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
    });
    expect(await failing.generate(call())).toEqual({ ok: false, error: { code: "transport" } });

    const controller = new AbortController();
    controller.abort();
    expect(await failing.generate(call({ signal: controller.signal }))).toEqual({ ok: false, error: { code: "timeout" } });
  });

  it("parses Groq's reset durations", () => {
    expect(parseGroqDuration("7.66s")).toBe(7_660);
    expect(parseGroqDuration("1m26.4s")).toBe(86_400);
    expect(parseGroqDuration("2h3m")).toBe(7_380_000);
    expect(parseGroqDuration("450ms")).toBe(450);
    expect(parseGroqDuration("soon")).toBeUndefined();
    expect(parseGroqDuration(null)).toBeUndefined();
  });
});

describe("provider configuration", () => {
  it("interleaves the two chains so every fallback goes to the other provider", () => {
    expect(interleave(["g1", "g2", "g3"], ["q1", "q2"])).toEqual(["g1", "q1", "g2", "q2", "g3"]);
    expect(interleave(["g1"], [])).toEqual(["g1"]);
  });

  it("routes each model to its provider", () => {
    expect(providerOfModel("gemini-3.5-flash-lite")).toBe("gemini");
    expect(providerOfModel("openai/gpt-oss-120b")).toBe("groq");
  });

  it("reads the provider order, ignoring unknown names", () => {
    expect(parseProviderOrder(undefined)).toEqual(["gemini", "groq"]);
    expect(parseProviderOrder("groq, gemini")).toEqual(["groq", "gemini"]);
    expect(parseProviderOrder("groq")).toEqual(["groq"]);
    expect(parseProviderOrder("openai")).toEqual(["gemini", "groq"]);
  });

  it("builds a chain from whichever keys are set", () => {
    expect(loadProviders({})).toBeNull();
    expect(loadProviders({ GROQ_API_KEY: GROQ_KEY })?.modelChain).toEqual(["openai/gpt-oss-120b", "openai/gpt-oss-20b"]);

    const both = loadProviders({
      GEMINI_API_KEY: GEMINI_KEY,
      GEMINI_MODEL_CHAIN: "gemini-3.5-flash-lite,gemini-3.1-flash-lite",
      GROQ_API_KEY: GROQ_KEY,
    });
    expect(both?.providers).toEqual(["gemini", "groq"]);
    expect(both?.modelChain).toEqual([
      "gemini-3.5-flash-lite",
      "openai/gpt-oss-120b",
      "gemini-3.1-flash-lite",
      "openai/gpt-oss-20b",
    ]);

    const groqFirst = loadProviders({ GEMINI_API_KEY: GEMINI_KEY, GROQ_API_KEY: GROQ_KEY, AI_PROVIDER_ORDER: "groq,gemini" });
    expect(groqFirst?.modelChain[0]).toBe("openai/gpt-oss-120b");

    // A provider left out of the order is not used even with a key.
    expect(loadProviders({ GEMINI_API_KEY: GEMINI_KEY, GROQ_API_KEY: GROQ_KEY, AI_PROVIDER_ORDER: "groq" })?.providers).toEqual([
      "groq",
    ]);
  });

  it("disables Groq, and says so without echoing it, when its chain is not an allowlisted id", () => {
    const setup = loadProviders({ GROQ_API_KEY: GROQ_KEY, GROQ_MODEL_CHAIN: "some model; rm -rf" });
    expect(setup).toBeNull();
  });
});

/** Answers the Gemini and Groq endpoints from two scripts, recording every call. */
function twoProviders(gemini: () => Response, groq: () => Response) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    if (url.includes("generativelanguage.googleapis.com")) {
      calls.push("gemini");
      return gemini();
    }
    calls.push("groq");
    return groq();
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const sheet = (answers: Partial<Record<Category, string>>) =>
  Object.fromEntries(CATEGORIES.map((category) => [category, answers[category] ?? ""])) as Record<Category, string>;

const checkReply = JSON.stringify({
  items: [{ id: "a0", verdict: "accepted", recognizedSr: "Srbija", recognizedEn: "Serbia", reason: "" }],
});

describe("Gemini and Groq cover for each other", () => {
  function service(env: Record<string, string>, fetchImpl: typeof fetch) {
    const setup = loadProviders(env, fetchImpl)!;
    const telemetry = memoryTelemetry();
    const ai = createAiService({
      adapter: setup.adapter,
      modelChain: setup.modelChain,
      thinkingLevel: setup.thinkingLevel,
      health: createModelHealth(),
      telemetry,
      sleep: async () => {},
      random: () => 0,
    });
    return { ai, telemetry };
  }

  const env = {
    GEMINI_API_KEY: GEMINI_KEY,
    GEMINI_MODEL_CHAIN: "gemini-3.5-flash-lite",
    GROQ_API_KEY: GROQ_KEY,
    GROQ_MODEL_CHAIN: "openai/gpt-oss-120b",
  };

  it("answers from Groq when Gemini's daily quota is spent, and skips Gemini on the next round", async () => {
    const quota = () =>
      new Response(
        JSON.stringify({
          error: {
            code: 429,
            details: [
              {
                "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }],
              },
            ],
          },
        }),
        { status: 429 },
      );
    const { calls, fetchImpl } = twoProviders(quota, () => groqReply(checkReply));
    const { ai, telemetry } = service(env, fetchImpl);

    const first = await ai.checkRound("S", "sr", { 1: sheet({ country: "Srbija" }), 2: sheet({}) });
    expect(first?.get(answerKey(1, "country"))).toEqual({ valid: true, canonical: "srbija" });
    expect(calls).toEqual(["gemini", "groq"]);
    expect(telemetry.records[0]!.attempts.map((attempt) => attempt.provider)).toEqual(["gemini", "groq"]);

    await ai.checkRound("S", "sr", { 1: sheet({ country: "Srbija" }), 2: sheet({}) });
    expect(calls).toEqual(["gemini", "groq", "groq"]);
  });

  it("answers from Gemini when Groq is first and down", async () => {
    const geminiOk = () =>
      new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: checkReply }] } }] }), {
        status: 200,
      });
    const { calls, fetchImpl } = twoProviders(geminiOk, () => groqError(503, "down"));
    const { ai } = service({ ...env, AI_PROVIDER_ORDER: "groq,gemini" }, fetchImpl);

    const verdicts = await ai.checkRound("S", "sr", { 1: sheet({ country: "Srbija" }), 2: sheet({}) });
    expect(verdicts?.get(answerKey(1, "country"))).toEqual({ valid: true, canonical: "srbija" });
    // A 5xx is retried once on the same model before moving on (fork policy).
    expect(calls).toEqual(["groq", "groq", "gemini"]);
  });

  it("falls back to the letter rule only when both are down", async () => {
    const { fetchImpl } = twoProviders(
      () => new Response("{}", { status: 503 }),
      () => groqError(503, "down"),
    );
    const { ai } = service(env, fetchImpl);
    expect(await ai.checkRound("S", "sr", { 1: sheet({ country: "Srbija" }), 2: sheet({}) })).toBeNull();
  });
});

describe("model health with a provider-given reset", () => {
  it("skips a Groq model out of its daily allowance only until Groq says it resets", () => {
    const health = createModelHealth();
    health.report("openai/gpt-oss-120b", "quota_exhausted", 1_000, 60_000);
    expect(health.plan(["openai/gpt-oss-120b"], 30_000).usable).toEqual([]);
    expect(health.plan(["openai/gpt-oss-120b"], 61_001).usable).toEqual(["openai/gpt-oss-120b"]);
  });
});
