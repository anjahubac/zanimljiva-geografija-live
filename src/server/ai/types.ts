import type { ThinkingLevel } from "./config";

/*
 * Provider-neutral contract between the feature services, the gateway and the
 * provider adapter (W04 addendum §2). Feature code never sees wire formats;
 * the adapter never decides retries or business validity.
 */

export type AiOperation = "check-round" | "hint" | "bot-answers" | "post-round-coach";
/** Providers the gateway can route to (`Plan.md` §2B.5). */
export type AiProvider = "gemini" | "groq";
export type AttemptKind = "initial" | "retry" | "fallback";

/** research R5. Stable internal classes; the browser never sees them. */
export type AiFailureCode =
  | "invalid_request"
  | "auth_config"
  | "not_configured"
  | "model_unavailable"
  | "timeout"
  | "transport"
  | "rate_limited"
  | "quota_exhausted"
  | "provider_transient"
  | "safety_refusal"
  | "invalid_output:truncated"
  | "invalid_output:empty"
  | "invalid_output:json"
  | "invalid_output:schema"
  | "invalid_output:semantic"
  | "cancelled"
  | "deadline_exhausted";

export type TokenUsage = { inputTokens?: number; outputTokens?: number; totalTokens?: number };

export type ProviderError = { code: AiFailureCode; httpStatus?: number; retryAfterMs?: number };

export type AdapterResult =
  | { ok: true; text: string; usage?: TokenUsage }
  | { ok: false; error: ProviderError };

/** One provider call, fully specified by the gateway. */
export type ModelCall = {
  model: string;
  systemInstruction: string;
  userContent: string;
  responseJsonSchema: object;
  temperature: number;
  maxOutputTokens: number;
  thinkingLevel: ThinkingLevel | null;
  signal: AbortSignal;
};

export interface ProviderAdapter {
  readonly provider: AiProvider;
  /** A routing adapter serves several providers; it names the one behind each model. */
  providerOf?(model: string): AiProvider;
  generate(call: ModelCall): Promise<AdapterResult>;
}

export type RetryBudget = {
  /** Timeout of one attempt (never longer than what is left of the deadline). */
  perAttemptMs: number;
  /** One deadline shared by every retry and fallback of the interaction. */
  totalMs: number;
  maxAttemptsPerModel: number;
  backoffBaseMs: number;
  backoffCapMs: number;
  /** No attempt starts with less time than this left. */
  minAttemptMs: number;
};

/** Counts only — never content — for telemetry. */
export type ValidationNotes = Record<string, number>;

export type Validation<T> =
  | { ok: true; value: T; notes?: ValidationNotes }
  | { ok: false; code: Extract<AiFailureCode, `invalid_output:${string}`>; notes?: ValidationNotes };

export type AiRequest<T> = {
  operation: AiOperation;
  promptVersion: string;
  interactionId: string;
  systemInstruction: string;
  userContent: string;
  responseJsonSchema: object;
  temperature: number;
  maxOutputTokens: number;
  budget: RetryBudget;
  /** Parse → schema → semantic validation of the model's text (W04 PDF §8). */
  validate(text: string): Validation<T>;
};

export type ProviderAttempt = {
  n: number;
  provider: AiProvider;
  model: string;
  kind: AttemptKind;
  status: "success" | "failure";
  errorClass?: AiFailureCode;
  httpStatus?: number;
  latencyMs: number;
};

export type AiResult<T> =
  | { ok: true; value: T; model: string; fallbackUsed: boolean; attempts: ProviderAttempt[]; usage?: TokenUsage }
  | { ok: false; code: AiFailureCode; retryable: boolean; fallbackUsed: boolean; attempts: ProviderAttempt[] };
