import { canFallBack, canRetrySameModel } from "./classify";
import { defaultThinkingLevel } from "./config";
import type { CoachModel, CoachModelRequest, CoachModelResponse } from "@server/features/coach-engine";
import type { ProviderAdapter, TokenUsage } from "./types";

export type CoachAttemptGuardOptions = {
  adapter: ProviderAdapter;
  modelChain: readonly string[];
  thinkingLevel: import("./config").ThinkingLevel | null;
  onAttempt?: (event: { step: 1 | 2; attempt: number; kind: "initial" | "retry" | "fallback"; provider: "gemini" | "groq"; model: string; latencyMs: number; status: string; usage?: TokenUsage }) => void;
  now?: () => number;
  schedule?: (atMs: number, fn: () => void) => () => void;
};

const evidenceIds = ["cell:country", "cell:city", "cell:river", "cell:mountain", "cell:sea", "cell:animal", "cell:plant", "cell:thing", "totals", "verification"];
const categories = ["country", "city", "river", "mountain", "sea", "animal", "plant", "thing"];
const recommendation = {
  type: "object", additionalProperties: false,
  properties: {
    code: { type: "string", enum: ["practice_recall", "check_category", "check_letter", "check_length", "review_rejected_term", "practice_without_hint", "vary_answers", "maintain_approach"] },
    category: { anyOf: [{ type: "string", enum: categories }, { type: "null" }] },
    evidenceIds: { type: "array", items: { type: "string", enum: evidenceIds }, minItems: 1, maxItems: 3 },
  }, required: ["code", "category", "evidenceIds"],
};
const stepSchemas: Record<1 | 2, object> = {
  1: {
    type: "object", additionalProperties: false,
    properties: { kind: { type: "string", enum: ["tool_request"] }, toolRequest: { type: "object", additionalProperties: false, properties: { name: { type: "string", enum: ["analyze_round"] }, arguments: { type: "object", additionalProperties: false, properties: { focus: { type: "string", enum: ["overview", "blank_categories", "rejected_answers"] } }, required: ["focus"] } }, required: ["name", "arguments"] } },
    required: ["kind", "toolRequest"],
  },
  2: {
    type: "object", additionalProperties: false,
    properties: { kind: { type: "string", enum: ["final"] }, final: { type: "object", additionalProperties: false, properties: { findingIds: { type: "array", items: { type: "string", enum: evidenceIds }, minItems: 1, maxItems: 3 }, recommendations: { type: "array", items: recommendation, minItems: 1, maxItems: 2 }, completed: { type: "boolean", enum: [true] } }, required: ["findingIds", "recommendations", "completed"] } },
    required: ["kind", "final"],
  },
};

export function coachResponseSchema(step: 1 | 2): object { return stepSchemas[step]; }

/** Coach-only physical egress boundary; the daily charge happens immediately before each adapter call. */
export function createCoachAttemptGuard(options: CoachAttemptGuardOptions): CoachModel {
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? ((atMs: number, fn: () => void) => { const timer = setTimeout(fn, Math.max(0, atMs - now())); return () => clearTimeout(timer); });
  let selectedModel = options.modelChain[0];
  let attempts = 0;
  let recoveries = 0;
  let fallbacks = 0;
  const failureReason = (code: import("./types").AiFailureCode): Extract<CoachModelResponse, { ok: false }>["reason"] => {
    if (code === "timeout") return "provider_timeout";
    if (code === "rate_limited") return "rate_limit";
    if (code === "quota_exhausted") return "quota_exhausted";
    if (code === "safety_refusal") return "provider_refusal";
    if (code.startsWith("invalid_output:")) return "invalid_model_proposal";
    return "provider_failed";
  };
  const wait = (ms: number, signal: AbortSignal, clockNow: () => number): Promise<"elapsed" | "cancelled"> => new Promise((resolve) => {
    if (signal.aborted) return resolve("cancelled");
    if (ms <= 0) return resolve(signal.aborted ? "cancelled" : "elapsed");
    let cancel = () => {};
    const onAbort = () => { cancel(); signal.removeEventListener("abort", onAbort); resolve("cancelled"); };
    cancel = schedule(clockNow() + ms, () => { signal.removeEventListener("abort", onAbort); resolve("elapsed"); });
    signal.addEventListener("abort", onAbort, { once: true });
  });

  return async (request: CoachModelRequest): Promise<CoachModelResponse> => {
    if (!selectedModel) return { ok: false, reason: "provider_failed" };
    let current = selectedModel;
    let previousStepModel: string | undefined;
    for (let perStep = 0; perStep < 2 && attempts < 3; perStep += 1) {
      if (request.signal.aborted) return { ok: false, reason: "cancelled" };
      if (request.now() >= request.deadlineAt) return { ok: false, reason: "deadline" };
      if (attempts >= 3) return { ok: false, reason: "provider_attempt_limit" };
      const started = request.now();
      const attemptTimeout = Math.max(1, Math.min(8_000, request.deadlineAt - started));
      const attemptController = new AbortController();
      const kind: "initial" | "retry" | "fallback" = previousStepModel === undefined ? "initial" : previousStepModel === current ? "retry" : "fallback";
      const report = (status: string, usage?: TokenUsage) => options.onAttempt?.({ step: request.step, attempt: attempts, kind, provider: options.adapter.providerOf?.(current) ?? options.adapter.provider, model: current, latencyMs: Math.max(0, request.now() - started), status, ...(usage ? { usage } : {}) });
      const relayAbort = () => attemptController.abort();
      request.signal.addEventListener("abort", relayAbort, { once: true });
      const cancelTimeout = schedule(started + attemptTimeout, () => attemptController.abort());
      let raw: ReturnType<ProviderAdapter["generate"]>;
      let result: Awaited<ReturnType<ProviderAdapter["generate"]>> | undefined;
      let timedOut = false;
      let adapterThrew = false;
      let abortListener: (() => void) | undefined;
      try {
        // Synchronous boundary: no await between the atomic charge/counter and real adapter call.
        if (!request.onAttempt()) return { ok: false, reason: "quota_exhausted" };
        attempts += 1;
        raw = options.adapter.generate({
          model: current,
          systemInstruction: request.system,
          userContent: request.content,
          responseJsonSchema: coachResponseSchema(request.step),
          temperature: 0,
          maxOutputTokens: 1_024,
          thinkingLevel: options.thinkingLevel ?? defaultThinkingLevel(current),
          signal: attemptController.signal,
        });
        previousStepModel = current;
        const bounded = new Promise<never>((_, reject) => {
          abortListener = () => reject(new Error("attempt_cancelled"));
          attemptController.signal.addEventListener("abort", abortListener, { once: true });
        });
        result = await Promise.race([raw, bounded]);
      }
      catch {
        if (!request.signal.aborted) {
          timedOut = attemptController.signal.aborted;
          adapterThrew = !timedOut;
        }
      } finally {
        cancelTimeout();
        if (abortListener) attemptController.signal.removeEventListener("abort", abortListener);
        request.signal.removeEventListener("abort", relayAbort);
      }
      if (request.signal.aborted || attemptController.signal.aborted) {
        if (request.signal.aborted) { report("cancelled"); return { ok: false, reason: "cancelled" }; }
        timedOut = true;
      }
      if (adapterThrew) {
        result = { ok: false, error: { code: "transport" } };
      }
      if (timedOut) {
        report("timeout");
        if (request.now() >= request.deadlineAt) return { ok: false, reason: "deadline" };
        if (recoveries >= 1) return { ok: false, reason: "provider_timeout" };
        recoveries += 1;
        const next = options.modelChain.find((model) => model !== current);
        if (next && fallbacks < 1) { current = next; fallbacks += 1; }
        continue;
      }
      if (!result) return { ok: false, reason: "provider_failed" };
      if (result.ok) {
        report("transport_success", result.usage);
        selectedModel = current;
        return { ok: true, text: result.text, model: current, ...(result.usage ? { usage: result.usage } : {}) };
      }
      report(result.error.code);
      if (request.signal.aborted || result.error.code === "cancelled") return { ok: false, reason: "cancelled" };
      if (result.error.code === "quota_exhausted") {
        if (recoveries >= 1) return { ok: false, reason: "quota_exhausted" };
        if (options.modelChain.length > 1 && fallbacks < 1) {
          const next = options.modelChain.find((model) => model !== current);
          if (next) { current = next; fallbacks += 1; recoveries += 1; continue; }
        }
        return { ok: false, reason: "quota_exhausted" };
      }
      if (!canFallBack(result.error.code)) return { ok: false, reason: failureReason(result.error.code) };
      if (recoveries >= 1) return { ok: false, reason: failureReason(result.error.code) };
      if (result.error.code === "rate_limited") {
        const waitMs = Math.max(0, result.error.retryAfterMs ?? 250);
        if (request.now() + waitMs + 1 >= request.deadlineAt) return { ok: false, reason: "rate_limit" };
        if (await wait(waitMs, request.signal, request.now) === "cancelled") return { ok: false, reason: "cancelled" };
      }
      recoveries += 1;
      if (canRetrySameModel(result.error.code)) continue;
      const next = options.modelChain.find((model) => model !== current);
      if (next && fallbacks < 1) { current = next; fallbacks += 1; continue; }
      return { ok: false, reason: failureReason(result.error.code) };
    }
    return { ok: false, reason: attempts >= 3 ? "provider_attempt_limit" : "quota_exhausted" };
  };
}
