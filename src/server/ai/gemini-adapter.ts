import { classifyHttpStatus } from "./classify";
import { isDailyQuota, parseRetryAfterMs } from "./retry-policy";
import type { AdapterResult, ModelCall, ProviderAdapter, TokenUsage } from "./types";

/*
 * Gemini REST wire format ↔ our provider-neutral call (research R1). Plain
 * `fetch`, so there is no hidden SDK retry: every attempt is the gateway's.
 * The key travels in a header, never in the URL, which may be logged.
 */

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";

const REFUSAL_FINISH = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"]);

type GeminiPart = { text?: unknown; thought?: unknown };
type GeminiResponse = {
  promptFeedback?: { blockReason?: unknown };
  candidates?: Array<{ finishReason?: unknown; content?: { parts?: GeminiPart[] } }>;
  usageMetadata?: { promptTokenCount?: unknown; candidatesTokenCount?: unknown; totalTokenCount?: unknown };
};

const count = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

/** Token counts only when the provider reports them; never estimated (constitution VIII). */
function usageOf(body: GeminiResponse): TokenUsage | undefined {
  const meta = body.usageMetadata;
  if (!meta) return undefined;
  const usage: TokenUsage = {};
  const input = count(meta.promptTokenCount);
  const output = count(meta.candidatesTokenCount);
  const total = count(meta.totalTokenCount);
  if (input !== undefined) usage.inputTokens = input;
  if (output !== undefined) usage.outputTokens = output;
  if (total !== undefined) usage.totalTokens = total;
  return Object.keys(usage).length ? usage : undefined;
}

export function buildGeminiBody(call: Omit<ModelCall, "model" | "signal">): object {
  return {
    systemInstruction: { parts: [{ text: call.systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: call.userContent }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: call.responseJsonSchema,
      temperature: call.temperature,
      maxOutputTokens: call.maxOutputTokens,
      // Sent only when configured: an option a model rejects would be a permanent 400.
      ...(call.thinkingLevel ? { thinkingConfig: { thinkingLevel: call.thinkingLevel } } : {}),
    },
  };
}

export function createGeminiAdapter(options: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  now?: () => number;
}): ProviderAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? GEMINI_BASE_URL;
  const now = options.now ?? Date.now;

  return {
    provider: "gemini",
    async generate(call: ModelCall): Promise<AdapterResult> {
      const { model, signal, ...rest } = call;
      const url = `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`;

      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
          body: JSON.stringify(buildGeminiBody(rest)),
          signal,
        });
      } catch {
        return { ok: false, error: { code: signal.aborted ? "timeout" : "transport" } };
      }

      if (!response.ok) {
        let errorBody: unknown = null;
        try {
          errorBody = await response.json();
        } catch {
          // The body is diagnostic only; its absence changes nothing.
        }
        const status = classifyHttpStatus(response.status);
        const code = status === "rate_limited" && isDailyQuota(errorBody) ? "quota_exhausted" : status;
        const retryAfterMs =
          code === "rate_limited" ? parseRetryAfterMs(response.headers.get("retry-after"), errorBody, now()) : undefined;
        return {
          ok: false,
          error: { code, httpStatus: response.status, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) },
        };
      }

      let body: GeminiResponse;
      try {
        body = (await response.json()) as GeminiResponse;
      } catch {
        // A 200 that is not JSON came from somewhere between us and the model.
        return { ok: false, error: { code: signal.aborted ? "timeout" : "provider_transient", httpStatus: response.status } };
      }

      if (body.promptFeedback?.blockReason) return { ok: false, error: { code: "safety_refusal" } };

      const candidate = body.candidates?.[0];
      if (!candidate) return { ok: false, error: { code: "invalid_output:empty" } };

      const finish = typeof candidate.finishReason === "string" ? candidate.finishReason : "STOP";
      if (REFUSAL_FINISH.has(finish)) return { ok: false, error: { code: "safety_refusal" } };
      if (finish === "MAX_TOKENS") return { ok: false, error: { code: "invalid_output:truncated" } };

      // Thought summaries are not the answer.
      const text = (candidate.content?.parts ?? [])
        .filter((part) => typeof part.text === "string" && part.thought !== true)
        .map((part) => part.text as string)
        .join("");
      if (text.trim() === "") return { ok: false, error: { code: "invalid_output:empty" } };

      const usage = usageOf(body);
      return { ok: true, text, ...(usage ? { usage } : {}) };
    },
  };
}
