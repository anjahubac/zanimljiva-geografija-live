import { randomUUID } from "node:crypto";
import {
  COACH_MAX_MODEL_TEXT_BYTES,
  coachCompletedResultSchema,
  coachFinalProposalSchema,
  coachRunViewSchema,
  coachStopReasonSchema,
  coachToolProposalEnvelopeSchema,
  coachSourceSchema,
  type CoachRunView,
  type CoachSource,
  type CoachToolResult,
} from "@contracts/coach.schemas";
import { analyzeRound, parseAnalyzeRoundArgs, validateAnalyzeRoundResult } from "./analyze-round";

export type CoachStep = 1 | 2;
export type CoachValidationTrace =
  | { kind: "proposal"; step: CoachStep; shape: "tool_request" | "final" | "refusal" | "malformed"; toolName?: "analyze_round" | "unknown"; outcome: "accepted" | "rejected"; reason?: CoachRunView["stopReason"] }
  | { kind: "tool"; toolName: "analyze_round" | "unknown"; execution: "executed" | "not_executed"; resultValidation: "accepted" | "rejected" | "not_run"; reason?: CoachRunView["stopReason"] };
export type CoachModelRequest = { step: CoachStep; system: string; content: string; signal: AbortSignal; deadlineAt: number; now: () => number; onAttempt: () => boolean };
export type CoachModelResponse = { ok: true; text: string; model: string; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } } | { ok: false; reason: "provider_failed" | "rate_limit" | "provider_timeout" | "quota_exhausted" | "cancelled" | "provider_refusal" | "invalid_model_proposal" | "deadline" | "provider_attempt_limit" };
export type CoachModel = (request: CoachModelRequest) => Promise<CoachModelResponse>;

export type CoachEngineOptions = {
  runId?: string;
  roundId: string;
  source: CoachSource;
  language: "sr" | "en";
  sourceVersion: string;
  model: CoachModel;
  authorizeAndCharge: () => boolean;
  signal?: AbortSignal;
  now?: () => number;
  schedule?: (atMs: number, fn: () => void) => () => void;
  isCurrent?: () => boolean;
  onValidation?: (record: CoachValidationTrace) => void;
  analyze?: (source: CoachSource, args: ReturnType<typeof parseAnalyzeRoundArgs>, signal: AbortSignal) => Promise<unknown> | unknown;
};

const encoder = new TextEncoder();
const json = (value: unknown) => JSON.stringify(value);
const baseSystem = (language: "sr" | "en") =>
  `You are a bounded practice reviewer. Language: ${language}. Use only supplied facts. Never claim geography, ability, trends, or history. Do not write prose. First reply exactly one JSON tool_request for analyze_round with focus overview, blank_categories, or rejected_answers. After its checked result, reply exactly one final with findingIds, eligible recommendation tuples, completed true. No other tool, no extra fields.`;

function parseModelText(text: string): unknown {
  if (encoder.encode(text).byteLength > COACH_MAX_MODEL_TEXT_BYTES) throw new Error("invalid_model_proposal");
  try { return JSON.parse(text) as unknown; } catch { throw new Error("invalid_model_proposal"); }
}

function eligibleTuple(rec: CoachToolResult["eligibleRecommendations"][number], proposed: unknown): boolean {
  return json(rec) === json(proposed);
}

/** Two strict decisions, one real deterministic tool call, and a checked terminal view. */
export async function runCoachEngine(options: CoachEngineOptions): Promise<CoachRunView> {
  const runId = options.runId ?? randomUUID();
  const now = options.now ?? Date.now;
  const start = now();
  const deadline = start + 30_000;
  const schedule = options.schedule ?? ((atMs: number, fn: () => void) => { const timer = setTimeout(fn, Math.max(0, atMs - now())); return () => clearTimeout(timer); });
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const cancelDeadline = schedule(deadline, () => controller.abort());
  const counters = { steps: 0, tools: 0, attempts: 0 };
  const state = { runId, status: "created" as "created" | "running" | "completed" | "stopped" | "failed", phase: "proposal" as "proposal" | "tool" | "final" | "terminal", startedAt: start, deadlineAt: deadline, sourceVersion: options.sourceVersion, terminal: false };
  let selected: CoachToolResult | null = null;
  let actionKey = "";
  const trace = (record: CoachValidationTrace) => { try { options.onValidation?.(record); } catch { /* Trace callbacks do not affect a run. */ } };
  const assertCurrent = () => {
    if (controller.signal.aborted || now() >= deadline) throw new Error(options.signal?.aborted ? "cancelled" : "deadline");
    if (options.isCurrent && !options.isCurrent()) throw new Error("cancelled");
  };
  const finish = (status: "completed" | "stopped" | "failed", reason: CoachRunView["stopReason"], result: CoachRunView["result"]): CoachRunView => {
    if (state.terminal) throw new Error("terminal");
    const view = coachRunViewSchema.parse({ runId: state.runId, roundId: options.roundId, status, stopReason: reason, stepCount: counters.steps, toolCallCount: counters.tools, providerAttemptCount: counters.attempts, elapsedMs: Math.max(0, Math.min(30_000, now() - start)), result });
    state.terminal = true;
    state.status = status;
    state.phase = "terminal";
    return view;
  };
  try {
    const source = coachSourceSchema.parse(options.source);
    const remaining = () => deadline - now();
    const raceBounded = async <T>(promise: Promise<T>, ms: number, timeoutReason: string): Promise<T> => {
      let cancelTimeout: (() => void) | undefined;
      let abortListener: (() => void) | undefined;
      const competitors: Promise<T>[] = [promise, new Promise<T>((_, reject) => {
        cancelTimeout = schedule(now() + Math.max(1, ms), () => reject(new Error(timeoutReason)));
        abortListener = () => reject(new Error(options.signal?.aborted ? "cancelled" : "deadline"));
        controller.signal.addEventListener("abort", abortListener, { once: true });
      })];
      try { return await Promise.race(competitors); }
      finally { cancelTimeout?.(); if (abortListener) controller.signal.removeEventListener("abort", abortListener); }
    };
    const invoke = async (step: CoachStep, content: string): Promise<unknown> => {
      assertCurrent();
      state.status = "running";
      counters.steps += 1;
      state.phase = step === 1 ? "proposal" : "final";
      const responsePromise = options.model({ step, system: baseSystem(options.language), content, signal: controller.signal, deadlineAt: deadline, now, onAttempt: () => {
        try { assertCurrent(); } catch { return false; }
        if (counters.attempts >= 3 || !options.authorizeAndCharge()) return false;
        counters.attempts += 1;
        return true;
      } });
      const response = await raceBounded(responsePromise, remaining(), "deadline");
      assertCurrent();
      if (!response.ok) throw new Error(response.reason === "invalid_model_proposal" ? (step === 1 ? "invalid_model_proposal" : "invalid_final") : response.reason);
      try { return parseModelText(response.text); }
      catch {
        const reason = step === 1 ? "invalid_model_proposal" : "invalid_final";
        trace({ kind: "proposal", step, shape: "malformed", outcome: "rejected", reason });
        throw new Error(reason);
      }
    };

    const first = await invoke(1, json({ goal: "review_round", letter: source.letter, alphabet: source.alphabet, verified: source.verified }));
    const firstEnvelope = coachToolProposalEnvelopeSchema.safeParse(first);
    if (!firstEnvelope.success) {
      if (first && typeof first === "object" && (first as { kind?: unknown }).kind === "refusal") {
        trace({ kind: "proposal", step: 1, shape: "refusal", outcome: "rejected", reason: "provider_refusal" });
        throw new Error("provider_refusal");
      }
      trace({ kind: "proposal", step: 1, shape: "malformed", outcome: "rejected", reason: "invalid_model_proposal" });
      throw new Error("invalid_model_proposal");
    }
    const toolName = firstEnvelope.data.toolRequest.name === "analyze_round" ? "analyze_round" : "unknown";
    if (toolName !== "analyze_round") {
      trace({ kind: "proposal", step: 1, shape: "tool_request", toolName, outcome: "rejected", reason: "unknown_tool" });
      trace({ kind: "tool", toolName, execution: "not_executed", resultValidation: "not_run", reason: "unknown_tool" });
      throw new Error("unknown_tool");
    }
    let args: ReturnType<typeof parseAnalyzeRoundArgs>;
    try { args = parseAnalyzeRoundArgs(firstEnvelope.data.toolRequest.arguments); }
    catch {
      trace({ kind: "proposal", step: 1, shape: "tool_request", toolName, outcome: "rejected", reason: "invalid_tool_arguments" });
      trace({ kind: "tool", toolName, execution: "not_executed", resultValidation: "not_run", reason: "invalid_tool_arguments" });
      throw new Error("invalid_tool_arguments");
    }
    trace({ kind: "proposal", step: 1, shape: "tool_request", toolName, outcome: "accepted" });
    assertCurrent();
    actionKey = json({ name: firstEnvelope.data.toolRequest.name, args, sourceVersion: state.sourceVersion });
    if (counters.tools >= 1 || remaining() <= 0) throw new Error("tool_call_limit");
    const toolStart = now();
    let toolStarted = false;
    state.phase = "tool";
    try {
      const rawTool = await raceBounded(Promise.resolve().then(() => {
        assertCurrent();
        toolStarted = true;
        counters.tools += 1;
        return (options.analyze ?? ((trusted, toolArgs) => analyzeRound(trusted, options.sourceVersion, toolArgs)))(source, args, controller.signal);
      }), Math.min(250, remaining()), "tool_timeout");
      selected = validateAnalyzeRoundResult(rawTool, source, options.sourceVersion, args.focus);
      assertCurrent();
      if (now() - toolStart > 250 || remaining() <= 0) throw new Error("tool_timeout");
      if (!selected) throw new Error("invalid_tool_result");
      trace({ kind: "tool", toolName, execution: "executed", resultValidation: "accepted" });
    } catch (error) {
      let reason = String((error as Error)?.message ?? "tool_failed");
      if (!coachStopReasonSchema.safeParse(reason).success || !["tool_timeout", "deadline", "cancelled", "invalid_tool_result"].includes(reason)) reason = "tool_failed";
      trace({ kind: "tool", toolName, execution: toolStarted ? "executed" : "not_executed", resultValidation: toolStarted ? "rejected" : "not_run", reason: reason as CoachRunView["stopReason"] });
      throw error;
    }

    const second = await invoke(2, json({ goal: "review_round", evidence: selected.evidence, eligibleRecommendations: selected.eligibleRecommendations, priorityEvidenceIds: selected.priorityEvidenceIds }));
    assertCurrent();
    const final = coachFinalProposalSchema.safeParse(second);
    if (!final.success) {
      if (second && typeof second === "object" && (second as { kind?: unknown }).kind === "refusal") {
        trace({ kind: "proposal", step: 2, shape: "refusal", outcome: "rejected", reason: "provider_refusal" });
        throw new Error("provider_refusal");
      }
      if (second && typeof second === "object" && (second as { kind?: unknown }).kind === "tool_request") {
        const repeated = coachToolProposalEnvelopeSchema.safeParse(second);
        if (!repeated.success) {
          trace({ kind: "proposal", step: 2, shape: "malformed", outcome: "rejected", reason: "invalid_model_proposal" });
          throw new Error("invalid_model_proposal");
        }
        const repeatedName = repeated.data.toolRequest.name === "analyze_round" ? "analyze_round" : "unknown";
        if (repeatedName !== "analyze_round") {
          trace({ kind: "proposal", step: 2, shape: "tool_request", toolName: repeatedName, outcome: "rejected", reason: "unknown_tool" });
          throw new Error("unknown_tool");
        }
        let repeatedArgs: ReturnType<typeof parseAnalyzeRoundArgs>;
        try { repeatedArgs = parseAnalyzeRoundArgs(repeated.data.toolRequest.arguments); }
        catch {
          trace({ kind: "proposal", step: 2, shape: "tool_request", toolName: repeatedName, outcome: "rejected", reason: "invalid_tool_arguments" });
          throw new Error("invalid_tool_arguments");
        }
        const repeatedKey = json({ name: repeated.data.toolRequest.name, args: repeatedArgs, sourceVersion: state.sourceVersion });
        const reason = repeatedKey === actionKey ? "repeated_action" : "tool_call_limit";
        trace({ kind: "proposal", step: 2, shape: "tool_request", toolName: repeatedName, outcome: "rejected", reason });
        throw new Error(reason);
      }
      trace({ kind: "proposal", step: 2, shape: "malformed", outcome: "rejected", reason: "invalid_final" });
      throw new Error("invalid_final");
    }
    if (new Set(final.data.final.findingIds).size !== final.data.final.findingIds.length || final.data.final.findingIds.some((id) => !selected!.evidence.some((entry) => entry.id === id))) {
      trace({ kind: "proposal", step: 2, shape: "final", outcome: "rejected", reason: "insufficient_evidence" });
      throw new Error("insufficient_evidence");
    }
    if (final.data.final.recommendations.some((rec) => !selected!.eligibleRecommendations.some((allowed) => eligibleTuple(allowed, rec)))) {
      trace({ kind: "proposal", step: 2, shape: "final", outcome: "rejected", reason: "invalid_final" });
      throw new Error("invalid_final");
    }
    assertCurrent();

    const limitations = selected.verified ? ["single_round", "checker_can_be_wrong"] as const : ["single_round", "local_rule_only"] as const;
    const result: NonNullable<CoachRunView["result"]> = {
      summary: { findingIds: final.data.final.findingIds },
      recommendations: final.data.final.recommendations,
      evidence: selected.evidence,
      confidence: selected.verified ? "medium" : "low",
      limitations: [...limitations],
      completed: true,
    };
    if (!coachCompletedResultSchema.safeParse(result).success) {
      trace({ kind: "proposal", step: 2, shape: "final", outcome: "rejected", reason: "invalid_final" });
      throw new Error("invalid_final");
    }
    trace({ kind: "proposal", step: 2, shape: "final", outcome: "accepted" });
    return finish("completed", "completed", result);
  } catch (error) {
    let errorReason = String((error as Error)?.message ?? "provider_failed");
    if (state.phase === "tool" && !["tool_timeout", "deadline", "cancelled", "invalid_tool_result"].includes(errorReason)) errorReason = "tool_failed";
    const reason = errorReason as CoachRunView["stopReason"];
    const validReason = coachStopReasonSchema.safeParse(reason).success ? reason : "provider_failed";
    const failed = ["tool_failed", "tool_timeout", "provider_failed", "provider_timeout", "rate_limit"].includes(validReason);
    return finish(failed ? "failed" : "stopped", validReason, null);
  } finally {
    state.terminal = true;
    state.status = state.status === "running" ? "stopped" : state.status;
    cancelDeadline();
    controller.abort();
    options.signal?.removeEventListener("abort", abort);
  }
}
