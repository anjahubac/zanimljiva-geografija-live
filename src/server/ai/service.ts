import { randomUUID } from "node:crypto";
import type { Category, Language, Letter } from "@contracts/game.schemas";
import { runBotAnswers } from "@server/features/bot-answers";
import { runCheck, type CheckVerdicts, type Sheets } from "@server/features/check-round";
import { runHint, type HintOutcome } from "@server/features/hint";
import { createDebugSink, type DebugEnv } from "./debug-log";
import type { GatewayDeps } from "./gateway";
import { createModelHealth } from "./model-health";
import { loadProviders, type ProviderEnv } from "./providers";
import { consoleTelemetry } from "./telemetry";
import type { AiFailureCode } from "./types";

/**
 * Everything the game asks of the AI, in game terms. The room store depends on
 * this interface only, so tests inject a fake and nothing reaches the network.
 * Every method resolves — a failure is a value, never a rejection — because a
 * round must never wait on an exception.
 */
export type HintResult = { ok: true; outcome: HintOutcome } | { ok: false; code: AiFailureCode };

export type AiService = {
  /** Null when the check could not be completed; the round falls back to the local rule. */
  checkRound(letter: Letter, sheets: Sheets): Promise<CheckVerdicts | null>;
  /** Null when the bot could not get answers; it then plays a blank sheet. */
  botAnswers(letter: Letter): Promise<Record<Category, string> | null>;
  hint(letter: Letter, category: Category, language: Language): Promise<HintResult>;
};

export function createAiService(deps: Omit<GatewayDeps, "telemetry"> & Partial<Pick<GatewayDeps, "telemetry">>): AiService {
  const gateway = (): GatewayDeps & { interactionId: string } => ({
    telemetry: consoleTelemetry,
    ...deps,
    interactionId: randomUUID(),
  });

  return {
    async checkRound(letter, sheets) {
      const result = await runCheck(letter, sheets, gateway()).catch(() => null);
      return result?.ok ? result.value : null;
    },
    async botAnswers(letter) {
      const result = await runBotAnswers(letter, gateway()).catch(() => null);
      return result?.ok ? result.value : null;
    },
    async hint(letter, category, language) {
      const result = await runHint(letter, category, language, gateway()).catch(() => null);
      if (!result) return { ok: false, code: "transport" };
      return result.ok ? { ok: true, outcome: result.value } : { ok: false, code: result.code };
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
