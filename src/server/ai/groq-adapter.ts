import { classifyHttpStatus } from "./classify";
import type { AdapterResult, AiFailureCode, ModelCall, ProviderAdapter, TokenUsage } from "./types";

/*
 * Groq's OpenAI-compatible chat API ↔ our provider-neutral call (`Plan.md`
 * §2B.5). Plain `fetch`, like the Gemini adapter, so every retry is the
 * gateway's. The key travels in a header, never in the URL.
 *
 * Strict structured output (`json_schema`, `strict: true`) is used, which Groq
 * supports on the gpt-oss models: the reply is constrained to the schema. Our
 * zod validation still runs on it afterwards.
 */

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

/** gpt-oss models reason before answering; a little is enough for a referee. */
const REASONING_MODEL = /^openai\/gpt-oss-/;

type GroqResponse = {
  choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
};

const count = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

function usageOf(body: GroqResponse): TokenUsage | undefined {
  const usage: TokenUsage = {};
  const input = count(body.usage?.prompt_tokens);
  const output = count(body.usage?.completion_tokens);
  const total = count(body.usage?.total_tokens);
  if (input !== undefined) usage.inputTokens = input;
  if (output !== undefined) usage.outputTokens = output;
  if (total !== undefined) usage.totalTokens = total;
  return Object.keys(usage).length ? usage : undefined;
}

/**
 * Groq's strict mode documents types, required, additionalProperties, enums,
 * anyOf and $ref — not array length bounds — so those are removed here rather
 * than risking a 400. Zod still enforces them on the reply.
 */
export function toGroqSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGroqSchema);
  if (schema === null || typeof schema !== "object") return schema;
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => key !== "minItems" && key !== "maxItems")
      .map(([key, value]) => [key, toGroqSchema(value)]),
  );
}

export function buildGroqBody(model: string, call: Omit<ModelCall, "model" | "signal">): object {
  const reasoning = REASONING_MODEL.test(model);
  return {
    model,
    messages: [
      { role: "system", content: call.systemInstruction },
      { role: "user", content: call.userContent },
    ],
    temperature: call.temperature,
    // Reasoning tokens count against the completion; leave room for them.
    max_completion_tokens: reasoning ? call.maxOutputTokens * 2 + 1_024 : call.maxOutputTokens,
    response_format: {
      type: "json_schema",
      json_schema: { name: "reply", strict: true, schema: toGroqSchema(call.responseJsonSchema) },
    },
    // Sent only to models that accept them: an unknown option would be a permanent 400.
    ...(reasoning ? { reasoning_effort: "low", include_reasoning: false } : {}),
  };
}

const DURATION_PART = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;

/** Groq's reset headers look like "7.66s", "1m26.4s" or "2h3m". */
export function parseGroqDuration(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const unit: Record<string, number> = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 };
  let total = 0;
  let matched = "";
  for (const match of raw.trim().matchAll(DURATION_PART)) {
    total += Number(match[1]) * unit[match[2]!]!;
    matched += match[0];
  }
  return matched !== "" && matched === raw.trim() ? Math.round(total) : undefined;
}

/**
 * A 429 is the daily allowance when the requests-per-day header says none are
 * left, or the message names a per-day limit (RPD/TPD). Anything else is the
 * per-minute window, worth a short wait.
 */
function rateLimitOf(response: Response, message: string): { code: AiFailureCode; retryAfterMs?: number } {
  const daily =
    response.headers.get("x-ratelimit-remaining-requests") === "0" ||
    /per day|\bRPD\b|\bTPD\b/i.test(message);
  if (daily) {
    const reset = parseGroqDuration(response.headers.get("x-ratelimit-reset-requests"));
    return { code: "quota_exhausted", ...(reset !== undefined ? { retryAfterMs: reset } : {}) };
  }
  const seconds = Number(response.headers.get("retry-after"));
  const retryAfterMs =
    Number.isFinite(seconds) && seconds >= 0 && response.headers.get("retry-after") !== null
      ? Math.round(seconds * 1000)
      : parseGroqDuration(response.headers.get("x-ratelimit-reset-tokens"));
  return { code: "rate_limited", ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) };
}

export function createGroqAdapter(options: { apiKey: string; fetchImpl?: typeof fetch; baseUrl?: string }): ProviderAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? GROQ_BASE_URL;

  return {
    provider: "groq",
    async generate(call: ModelCall): Promise<AdapterResult> {
      const { model, signal, ...rest } = call;

      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}` },
          body: JSON.stringify(buildGroqBody(model, rest)),
          signal,
        });
      } catch {
        return { ok: false, error: { code: signal.aborted ? "timeout" : "transport" } };
      }

      if (!response.ok) {
        let message = "";
        try {
          const body = (await response.json()) as { error?: { message?: unknown } };
          if (typeof body.error?.message === "string") message = body.error.message;
        } catch {
          // The body is diagnostic only; its absence changes nothing.
        }
        if (response.status === 429) {
          const limit = rateLimitOf(response, message);
          return { ok: false, error: { ...limit, httpStatus: 429 } };
        }
        // 498: Groq's flex tier is out of capacity — temporary, like a 503.
        const code = response.status === 498 ? "provider_transient" : classifyHttpStatus(response.status);
        return { ok: false, error: { code, httpStatus: response.status } };
      }

      let body: GroqResponse;
      try {
        body = (await response.json()) as GroqResponse;
      } catch {
        return { ok: false, error: { code: signal.aborted ? "timeout" : "provider_transient", httpStatus: response.status } };
      }

      const choice = body.choices?.[0];
      if (!choice) return { ok: false, error: { code: "invalid_output:empty" } };
      if (choice.finish_reason === "length") return { ok: false, error: { code: "invalid_output:truncated" } };
      if (choice.finish_reason === "content_filter") return { ok: false, error: { code: "safety_refusal" } };

      const text = typeof choice.message?.content === "string" ? choice.message.content : "";
      if (text.trim() === "") return { ok: false, error: { code: "invalid_output:empty" } };

      const usage = usageOf(body);
      return { ok: true, text, ...(usage ? { usage } : {}) };
    },
  };
}
