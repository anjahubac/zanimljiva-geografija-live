import { canFallBack, canRetrySameModel, isRetryableLater } from "./classify";
import { defaultThinkingLevel, type ThinkingLevel } from "./config";
import type { DebugSink } from "./debug-log";
import type { ModelHealth } from "./model-health";
import { backoffMs } from "./retry-policy";
import type { TelemetrySink } from "./telemetry";
import type {
  AiFailureCode,
  AiRequest,
  AiResult,
  AttemptKind,
  ProviderAdapter,
  ProviderAttempt,
  TokenUsage,
  ValidationNotes,
} from "./types";

/*
 * The attempt loop (W04 PDF §4-§6): sequential attempts through an allowlisted
 * model chain, bounded retries with jittered backoff, one shared deadline,
 * abort propagation, and a telemetry record for the whole interaction.
 */

export type GatewayDeps = {
  adapter: ProviderAdapter;
  modelChain: readonly string[];
  /** An explicit level for every model (GEMINI_THINKING_LEVEL); null = per-model default. */
  thinkingLevel: ThinkingLevel | null;
  telemetry: TelemetrySink;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal | undefined) => Promise<void>;
  random?: () => number;
  /** Local-only raw logging (debug-log.ts); absent everywhere else. */
  debug?: DebugSink;
  /** Model rotation memory (model-health.ts); without it every request uses the chain as given. */
  health?: ModelHealth;
};

function realSleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

function attemptSignal(timeoutMs: number, caller: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(Math.max(1, timeoutMs));
  return caller ? AbortSignal.any([timeout, caller]) : timeout;
}

export async function generate<T>(
  request: AiRequest<T>,
  deps: GatewayDeps,
  callerSignal?: AbortSignal,
): Promise<AiResult<T>> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? realSleep;
  const random = deps.random ?? Math.random;
  const { budget } = request;

  const startedAt = now();
  const deadlineAt = startedAt + budget.totalMs;
  const attempts: ProviderAttempt[] = [];
  let lastCode: AiFailureCode = "deadline_exhausted";

  const providerOf = (model: string) => deps.adapter.providerOf?.(model) ?? deps.adapter.provider;
  const fallbackUsed = () => attempts.some((attempt) => attempt.kind === "fallback");
  const { usable, skipped } = deps.health
    ? deps.health.plan(deps.modelChain, startedAt)
    : { usable: [...deps.modelChain], skipped: [] };

  const finish = <R extends AiResult<T>>(result: R, usage?: TokenUsage, notes?: ValidationNotes): R => {
    deps.telemetry({
      event: "ai.interaction",
      interactionId: request.interactionId,
      operation: request.operation,
      promptVersion: request.promptVersion,
      outcome: result.ok ? "success" : result.code,
      fallbackUsed: result.fallbackUsed,
      attempts: [...result.attempts],
      ...(skipped.length ? { skipped } : {}),
      totalLatencyMs: now() - startedAt,
      ...(usage ? { usage } : {}),
      ...(notes ? { notes } : {}),
    });
    return result;
  };

  const fail = (code: AiFailureCode, notes?: ValidationNotes) =>
    finish(
      { ok: false as const, code, retryable: isRetryableLater(code), fallbackUsed: fallbackUsed(), attempts },
      undefined,
      notes,
    );

  // Every model is out of daily quota: say so without spending a request.
  if (usable.length === 0) return fail("quota_exhausted");

  for (const [modelIndex, model] of usable.entries()) {
    for (let onModel = 0; onModel < budget.maxAttemptsPerModel; onModel++) {
      if (callerSignal?.aborted) return fail("cancelled");

      const remaining = deadlineAt - now();
      if (remaining < budget.minAttemptMs) return fail(attempts.length ? lastCode : "deadline_exhausted");

      const kind: AttemptKind = onModel > 0 ? "retry" : modelIndex > 0 ? "fallback" : "initial";
      const attemptStarted = now();
      const result = await deps.adapter.generate({
        model,
        systemInstruction: request.systemInstruction,
        userContent: request.userContent,
        responseJsonSchema: request.responseJsonSchema,
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
        thinkingLevel: deps.thinkingLevel ?? defaultThinkingLevel(model),
        signal: attemptSignal(Math.min(budget.perAttemptMs, remaining), callerSignal),
      });
      const latencyMs = now() - attemptStarted;
      const n = attempts.length + 1;
      const debug = (reply: string | null, outcome: string) =>
        deps.debug?.({ operation: request.operation, promptVersion: request.promptVersion, n, model, kind, latencyMs, sent: request.userContent, reply, result: outcome });

      if (result.ok) {
        const validation = request.validate(result.text);
        debug(result.text, validation.ok ? "ok" : validation.code);
        deps.health?.report(model, "success", now());
        if (validation.ok) {
          attempts.push({ n, provider: providerOf(model), model, kind, status: "success", latencyMs });
          return finish(
            { ok: true as const, value: validation.value, model, fallbackUsed: fallbackUsed(), attempts, ...(result.usage ? { usage: result.usage } : {}) },
            result.usage,
            validation.notes,
          );
        }
        // Malformed output is not a transport problem: no blind retry, no fallback.
        attempts.push({ n, provider: providerOf(model), model, kind, status: "failure", errorClass: validation.code, latencyMs });
        return fail(validation.code, validation.notes);
      }

      const code: AiFailureCode = callerSignal?.aborted ? "cancelled" : result.error.code;
      debug(null, result.error.httpStatus !== undefined ? `${code} (HTTP ${result.error.httpStatus})` : code);
      attempts.push({
        n,
        provider: providerOf(model),
        model,
        kind,
        status: "failure",
        errorClass: code,
        ...(result.error.httpStatus !== undefined ? { httpStatus: result.error.httpStatus } : {}),
        latencyMs,
      });
      lastCode = code;
      deps.health?.report(model, code, now(), result.error.retryAfterMs);

      if (!canFallBack(code)) return fail(code); // 400, 401/403, refusal, truncation, cancelled
      if (!canRetrySameModel(code)) break; // 404 or timeout: go to the next model at once
      if (onModel + 1 >= budget.maxAttemptsPerModel) break;

      const wait =
        code === "rate_limited" && result.error.retryAfterMs !== undefined
          ? result.error.retryAfterMs
          : backoffMs(onModel, budget, random);
      // A wait that would not leave room for the retry is skipped: go to the next model.
      if (now() + wait + budget.minAttemptMs > deadlineAt) break;
      await sleep(wait, callerSignal);
    }
  }

  // Only a daily quota everywhere earns the "limit reached" message; otherwise report
  // the last temporary problem that was not a quota.
  const everyModelOutOfQuota =
    attempts.every((attempt) => attempt.errorClass === "quota_exhausted") &&
    skipped.every((entry) => entry.reason === "exhausted");
  if (everyModelOutOfQuota) return fail("quota_exhausted");
  const lastTransient = [...attempts].reverse().find((attempt) => attempt.errorClass !== "quota_exhausted");
  return fail(lastTransient?.errorClass ?? lastCode);
}
