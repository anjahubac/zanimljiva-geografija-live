import { randomUUID } from "node:crypto";
import { COACH_STEP_JSON_SCHEMA, coachStepSchema, type CoachStep } from "@contracts/ai-output.schemas";
import type { Category, Language, Letter } from "@contracts/game.schemas";
import { runBotAnswers } from "@server/features/bot-answers";
import { runCheck, type CheckVerdicts, type NamedVerdict, type Sheets } from "@server/features/check-round";
import { runHint, type HintOutcome } from "@server/features/hint";
import {
  buildCoachStepContent,
  COACH_STEP_PROMPT_VERSION,
  COACH_STEP_SYSTEM_INSTRUCTIONS,
  type CoachStepInput,
} from "@server/prompts/coach-step.v4";
import { generate } from "./gateway";
import { createDebugSink, type DebugEnv } from "./debug-log";
import type { GatewayDeps } from "./gateway";
import { createModelHealth } from "./model-health";
import { loadProviders, type ProviderEnv } from "./providers";
import { consoleTelemetry } from "./telemetry";
import type { AiFailureCode, AiProvider, ProviderAttempt, RetryBudget, TokenUsage, Validation } from "./types";

/**
 * Everything the game asks of the AI, in game terms. The room store depends on
 * this interface only, so tests inject a fake and nothing reaches the network.
 * Every method resolves — a failure is a value, never a rejection — because a
 * round must never wait on an exception.
 */
export type HintResult = { ok: true; outcome: HintOutcome } | { ok: false; code: AiFailureCode };

/** Set per step by the coach orchestrator (`Plan.md` §2C.8). */
export type CoachStepOptions = { interactionId: string; budget: RetryBudget; signal?: AbortSignal };

/** One coach step: the parsed envelope, never judged here — the orchestrator's allowlist does that. */
export type CoachStepResult =
  | { ok: true; envelope: CoachStep; attempts: ProviderAttempt[]; model: string; provider: AiProvider; usage?: TokenUsage }
  | { ok: false; code: AiFailureCode; attempts: ProviderAttempt[] };

/** O1: the referee on the coach's passing words; failures are values, as everywhere. */
export type VerifyTermsResult =
  | { ok: true; verdicts: Map<string, NamedVerdict>; attempts: ProviderAttempt[] }
  | { ok: false; code: AiFailureCode; attempts: ProviderAttempt[] };

/** JSON parse and the envelope schema only (contracts/model-step.md). Exported for tests. */
export function validateCoachStep(text: string): Validation<CoachStep> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, code: "invalid_output:json" };
  }
  const parsed = coachStepSchema.safeParse(json);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, code: "invalid_output:schema" };
}

export type AiService = {
  /** Null when the check could not be completed; the round falls back to the local rule. */
  checkRound(letter: Letter, alphabet: Language, sheets: Sheets): Promise<CheckVerdicts | null>;
  /** Null when the bot could not get answers; it then plays a blank sheet. */
  botAnswers(letter: Letter, alphabet: Language): Promise<Record<Category, string> | null>;
  /** `alphabet` is the room's letter set (§2B.13); `language` is the clue's language. */
  hint(letter: Letter, alphabet: Language, category: Category, language: Language): Promise<HintResult>;
  /** Week 5 (§2C): one model step of the round coach, with the run's budget and signal. */
  coachStep(input: CoachStepInput, options: CoachStepOptions): Promise<CoachStepResult>;
  /** O1 (§2C.16): the W04 checker (`check-round.v3`, unchanged) on the coach's cited words only. */
  verifyTerms(letter: Letter, alphabet: Language, sheets: Sheets, options: CoachStepOptions): Promise<VerifyTermsResult>;
};

export function createAiService(deps: Omit<GatewayDeps, "telemetry"> & Partial<Pick<GatewayDeps, "telemetry">>): AiService {
  const gateway = (): GatewayDeps & { interactionId: string } => ({
    telemetry: consoleTelemetry,
    ...deps,
    interactionId: randomUUID(),
  });

  return {
    async checkRound(letter, alphabet, sheets) {
      const result = await runCheck(letter, alphabet, sheets, gateway()).catch(() => null);
      return result?.ok ? result.value : null;
    },
    async botAnswers(letter, alphabet) {
      const result = await runBotAnswers(letter, alphabet, gateway()).catch(() => null);
      return result?.ok ? result.value : null;
    },
    async hint(letter, alphabet, category, language) {
      const result = await runHint(letter, alphabet, category, language, gateway()).catch(() => null);
      if (!result) return { ok: false, code: "transport" };
      return result.ok ? { ok: true, outcome: result.value } : { ok: false, code: result.code };
    },
    async coachStep(input, options) {
      const deps = gateway();
      const result = await generate(
        {
          operation: "coach-step",
          promptVersion: COACH_STEP_PROMPT_VERSION,
          interactionId: options.interactionId,
          systemInstruction: COACH_STEP_SYSTEM_INSTRUCTIONS[input.alphabet],
          userContent: buildCoachStepContent(input),
          responseJsonSchema: COACH_STEP_JSON_SCHEMA,
          temperature: 0.2,
          maxOutputTokens: 600,
          budget: options.budget,
          validate: validateCoachStep,
        },
        deps,
        options.signal,
      ).catch(() => null);
      if (!result) return { ok: false, code: "transport", attempts: [] };
      if (!result.ok) return { ok: false, code: result.code, attempts: result.attempts };
      const last = result.attempts[result.attempts.length - 1];
      return {
        ok: true,
        envelope: result.value,
        attempts: result.attempts,
        model: result.model,
        provider: last?.provider ?? deps.adapter.provider,
        ...(result.usage ? { usage: result.usage } : {}),
      };
    },
    async verifyTerms(letter, alphabet, sheets, options) {
      const deps = { ...gateway(), interactionId: options.interactionId };
      const result = await runCheck(letter, alphabet, sheets, deps, {
        budget: options.budget,
        withNames: true,
        ...(options.signal ? { signal: options.signal } : {}),
      }).catch(() => null);
      if (!result) return { ok: false, code: "transport", attempts: [] };
      return result.ok
        ? { ok: true, verdicts: result.value, attempts: result.attempts }
        : { ok: false, code: result.code, attempts: result.attempts };
    },
  };
}

/**
 * Production wiring: Gemini and/or Groq, configured from the environment, each
 * the other's fallback (`providers.ts`). Returns null when neither has a key,
 * and the game then runs on the local letter rule only.
 */
export function createAiServiceFromEnv(
  env: ProviderEnv & DebugEnv,
): { service: AiService; providers: string[] } | null {
  const setup = loadProviders(env);
  if (!setup) return null;

  const debug = createDebugSink(env);
  const service = createAiService({
    adapter: setup.adapter,
    modelChain: setup.modelChain,
    thinkingLevel: setup.thinkingLevel,
    health: createModelHealth(),
    ...(debug ? { debug } : {}),
  });
  return { service, providers: setup.providers };
}
