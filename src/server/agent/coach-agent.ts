import type { CoachStep } from "@contracts/ai-output.schemas";
import {
  COACH_SUMMARY_MAX,
  coachReportSchema,
  type CoachReport,
  type CoachStopReason,
  type CoachTip,
} from "@contracts/coach.schemas";
import type { Language } from "@contracts/game.schemas";
import { answerKey } from "@server/features/check-round";
import { BUDGETS } from "@server/ai/retry-policy";
import type { AiService, CoachStepResult } from "@server/ai/service";
import type { AiFailureCode } from "@server/ai/types";
import { COACH_STEP_PROMPT_VERSION, type CoachStepInput } from "@server/prompts/coach-step.v2";
import { RUN_LIMITS } from "./limits";
import type { AgentRunRecord, RunLogSink, StepRecord } from "./run-log";
import {
  TOOLS,
  isPassing,
  isToolName,
  type EvidenceItem,
  type RefereeVerdict,
  type RoundSnapshot,
  type ToolDeps,
} from "./tools";

/*
 * The round coach's bounded loop (`Plan.md` §2C.4, contracts/model-step.md).
 * The model proposes; this function decides. Every step:
 *
 *   limits (signal, deadline, attempts) → one model step through the gateway
 *   → envelope (by the service) → this step's allowlist → the action's shape
 *   → the tool's own argument, scope and repeat checks → run the tool → its
 *   result check → evidence. A final is validated whole against the evidence.
 *
 * Stops are the application's, never only the model's. A refused proposal
 * never runs and never counts as a tool call. The report's suggestion text is
 * copied from a passing tool item of this run, never from the model.
 * Read-only: nothing here writes game state or sees the opponent's sheet.
 */

export type CoachRunContext = {
  runId: string;
  goal: "fill_gaps";
  /** The summary's language: the caller's interface language. */
  language: Language;
  snapshot: RoundSnapshot;
};

export type CoachRunDeps = {
  ai: Pick<AiService, "coachStep" | "verifyTerms">;
  now: () => number;
  /** Aborted when the player leaves or the room is reaped. */
  signal: AbortSignal;
  log: RunLogSink;
  /** Tests only: replace the tool to make it throw or misbehave (eval C6). */
  toolImpl?: ToolDeps["impl"];
};

/** A cancelled run sends nothing (§2C.9). */
export type CoachRunOutcome = { cancelled: true } | { cancelled: false; report: CoachReport };

type Action = "check_candidates" | "verify_terms" | "final";

const CONFIDENCE = ["low", "medium", "high"] as const;

/** data-model.md: the gateway's failure classes as the coach's stop reasons. */
function stopReasonFor(code: AiFailureCode): CoachStopReason | "cancelled" {
  if (code === "timeout") return "provider_timeout";
  if (code === "rate_limited") return "rate_limited";
  if (code === "quota_exhausted") return "quota_exhausted";
  if (code === "deadline_exhausted") return "deadline";
  if (code === "cancelled") return "cancelled";
  if (code.startsWith("invalid_output:")) return "malformed_output";
  return "provider_unavailable";
}

/** Research R7 (with O1): what a step may do, from the run's state alone. */
function allowedActions(step: number, toolCalls: number, snapshot: RoundSnapshot, evidence: readonly EvidenceItem[]): Action[] {
  if (step === 1) return ["check_candidates"];
  const toolLeft = step < RUN_LIMITS.maxModelSteps && toolCalls < RUN_LIMITS.maxToolCalls;
  const solved = new Set(evidence.filter(isPassing).map((item) => item.category));
  const unsolved = snapshot.focus.some((entry) => !solved.has(entry.category));
  const unverified = evidence.some((item) => isPassing(item) && item.referee !== "accepted" && item.referee !== "rejected");
  const actions: Action[] = [];
  if (toolLeft && unsolved) actions.push("check_candidates");
  if (toolLeft && unverified) actions.push("verify_terms");
  actions.push("final");
  return actions;
}

const checkedByOf = (item: EvidenceItem): "letter_rule" | "letter_rule_and_referee" =>
  item.referee === "accepted" ? "letter_rule_and_referee" : "letter_rule";

/** The final's tips, if the final is valid (contracts/model-step.md "Final validation"). */
function validateFinal(envelope: CoachStep, snapshot: RoundSnapshot, evidence: readonly EvidenceItem[]): CoachReport | null {
  if (envelope.candidates.length > 0 || envelope.evidenceIds.length > 0) return null;

  const summary = envelope.summary.trim();
  if (summary.length < 1 || summary.length > COACH_SUMMARY_MAX || /\p{Cc}/u.test(summary)) return null;
  const confidence = CONFIDENCE.find((level) => level === envelope.confidence);
  if (!confidence) return null;

  // Every focus category exactly once, and nothing else.
  if (envelope.tips.length !== snapshot.focus.length) return null;
  const cited = new Map<string, string>();
  for (const tip of envelope.tips) {
    if (cited.has(tip.category)) return null;
    cited.set(tip.category, tip.evidenceId);
  }

  const tips: CoachTip[] = [];
  for (const entry of snapshot.focus) {
    const evidenceId = cited.get(entry.category);
    if (evidenceId === undefined) return null;
    let suggestion: string | null = null;
    if (evidenceId !== "") {
      // A passing item of this run, in the same category; its text, not the model's.
      const item = evidence.find((each) => each.id === evidenceId);
      if (!item || !isPassing(item) || item.category !== entry.category) return null;
      suggestion = item.term;
    }
    const item = evidenceId === "" ? undefined : evidence.find((each) => each.id === evidenceId);
    tips.push({
      category: entry.category,
      yourAnswer: entry.yourAnswer,
      whyMissed: entry.whyMissed,
      suggestion,
      checkedBy: suggestion === null || !item ? null : checkedByOf(item),
    });
  }

  return { status: "completed", summary, tips, confidence, stopReason: "goal_completed" };
}

/** Any stop but a valid final: evidence only, no model text (research R10). */
function evidenceReport(stopReason: CoachStopReason, snapshot: RoundSnapshot, evidence: readonly EvidenceItem[]): CoachReport {
  const tips: CoachTip[] = snapshot.focus.map((entry) => {
    const item = evidence.find((each) => each.category === entry.category && isPassing(each));
    return {
      category: entry.category,
      yourAnswer: entry.yourAnswer,
      whyMissed: entry.whyMissed,
      suggestion: item ? item.term : null,
      checkedBy: item ? checkedByOf(item) : null,
    };
  });
  const anyPassed = tips.some((tip) => tip.suggestion !== null);
  return { status: anyPassed ? "incomplete" : "failed", summary: null, tips, confidence: null, stopReason };
}

/** The model's action name, for the log only if it is a plain identifier. */
const loggableAction = (action: string): string => (/^[A-Za-z0-9_.:-]{1,40}$/.test(action) ? action : "(not an identifier)");

export async function runCoach(context: CoachRunContext, deps: CoachRunDeps): Promise<CoachRunOutcome> {
  const { snapshot } = context;
  const startedAt = deps.now();
  const deadlineAt = startedAt + RUN_LIMITS.runDeadlineMs;

  const evidence: EvidenceItem[] = [];
  const toolResults: CoachStepInput["toolResults"] = [];
  const steps: StepRecord[] = [];
  let toolCalls = 0;
  let attemptsUsed = 0;

  const finish = (stopReason: CoachStopReason | "cancelled", completed?: CoachReport): CoachRunOutcome => {
    const report = stopReason === "cancelled" ? null : (completed ?? evidenceReport(stopReason, snapshot, evidence));
    const totals = { modelSteps: steps.length, providerAttempts: attemptsUsed, toolCalls, elapsedMs: deps.now() - startedAt };
    const record: AgentRunRecord = {
      event: "agent.run",
      runId: context.runId,
      goal: context.goal,
      promptVersion: COACH_STEP_PROMPT_VERSION,
      status: report ? report.status : "cancelled",
      stopReason,
      steps,
      totals,
    };
    deps.log(record);
    if (!report) return { cancelled: true };

    // O6: the run log's totals and the last provider that answered — no content.
    const lastSuccess = steps
      .flatMap((each) => [...each.attempts, ...(each.tool?.attempts ?? [])])
      .filter((attempt) => attempt.status === "success")
      .at(-1);
    const run = {
      ...totals,
      provider: lastSuccess?.provider ?? null,
      model: lastSuccess?.model ?? null,
      stopReason: report.stopReason,
    };
    return { cancelled: false, report: coachReportSchema.parse({ ...report, run }) };
  };

  for (let n = 1; n <= RUN_LIMITS.maxModelSteps; n++) {
    // Limits, checked by the application before every step.
    if (deps.signal.aborted) return finish("cancelled");
    const left = deadlineAt - deps.now();
    if (left < RUN_LIMITS.minStepMs) return finish("deadline");
    const attemptsLeft = RUN_LIMITS.maxAttemptsPerRun - attemptsUsed;
    if (attemptsLeft <= 0) return finish("call_budget");

    const allowed = allowedActions(n, toolCalls, snapshot, evidence);
    const input: CoachStepInput = {
      goal: context.goal,
      language: context.language,
      letter: snapshot.letter,
      alphabet: snapshot.alphabet,
      step: n,
      stepsLeft: RUN_LIMITS.maxModelSteps - n,
      toolCallsLeft: RUN_LIMITS.maxToolCalls - toolCalls,
      allowedActions: allowed,
      focus: snapshot.focus,
      toolResults,
    };

    const result: CoachStepResult = await deps.ai
      .coachStep(input, {
        interactionId: `${context.runId}:s${n}`,
        budget: {
          ...BUDGETS["coach-step"],
          totalMs: Math.min(RUN_LIMITS.perStepMs, left),
          maxAttempts: Math.min(RUN_LIMITS.maxAttemptsPerStep, attemptsLeft),
        },
        signal: deps.signal,
      })
      // The service never rejects; if it did, it is a provider problem, not a crash.
      .catch((): CoachStepResult => ({ ok: false, code: "transport", attempts: [] }));

    attemptsUsed += result.attempts.length;
    const step: StepRecord = { n, action: null, decision: null, attempts: result.attempts };
    steps.push(step);

    if (deps.signal.aborted) return finish("cancelled");
    if (!result.ok) {
      const reason = stopReasonFor(result.code);
      if (reason === "malformed_output") step.rejectReason = "malformed_output";
      // The gateway stopped on the run's attempt cap: the run's budget, not the provider, ended it.
      const spent = attemptsUsed >= RUN_LIMITS.maxAttemptsPerRun && reason !== "malformed_output" && reason !== "cancelled";
      return finish(spent ? "call_budget" : reason);
    }

    if (result.usage) step.usage = result.usage;
    const { envelope } = result;
    step.action = loggableAction(envelope.action);

    const reject = (reason: Exclude<CoachStopReason, "goal_completed">): CoachRunOutcome => {
      step.decision = "rejected";
      if (reason === "unknown_tool" || reason === "invalid_tool_args" || reason === "repeated_call" || reason === "final_invalid" || reason === "max_steps") {
        step.rejectReason = reason;
      }
      return finish(reason);
    };

    // 1. The allowlist of this step. Nothing runs for an action it does not hold.
    if (!(allowed as string[]).includes(envelope.action)) {
      if (envelope.action === "final") return reject("final_invalid");
      if (!isToolName(envelope.action)) return reject("unknown_tool");
      const lastChance = n === RUN_LIMITS.maxModelSteps || toolCalls >= RUN_LIMITS.maxToolCalls;
      return reject(lastChance ? "max_steps" : "invalid_tool_args");
    }

    if (envelope.action === "final") {
      // 4. The final, whole.
      const report = validateFinal(envelope, snapshot, evidence);
      if (!report) return reject("final_invalid");
      step.decision = "allowed";
      return finish("goal_completed", report);
    }

    if (envelope.action === "verify_terms") {
      // 2. The shape of a verify call: ids only.
      const verifyShaped =
        envelope.candidates.length === 0 &&
        envelope.summary === "" &&
        envelope.tips.length === 0 &&
        envelope.confidence === "";
      if (!verifyShaped) return reject("invalid_tool_args");

      // 3. Ids checked inside the tool; the referee shares the run's time, attempts and signal.
      const toolStarted = deps.now();
      const refereeAttempts: StepRecord["attempts"] = [];
      const outcome = await TOOLS.verify_terms(
        { evidenceIds: envelope.evidenceIds },
        { snapshot, evidence, toolCallsUsed: toolCalls },
        {
          now: deps.now,
          referee: async (sheets) => {
            const timeLeft = deadlineAt - deps.now();
            const attemptsNow = RUN_LIMITS.maxAttemptsPerRun - attemptsUsed;
            if (timeLeft < RUN_LIMITS.minStepMs || attemptsNow <= 0) return null;
            const verified = await deps.ai
              .verifyTerms(snapshot.letter, snapshot.alphabet, sheets, {
                interactionId: `${context.runId}:s${n}:verify`,
                budget: {
                  ...BUDGETS["check-round"],
                  totalMs: Math.min(RUN_LIMITS.perStepMs, timeLeft),
                  maxAttempts: Math.min(RUN_LIMITS.maxAttemptsPerStep, attemptsNow),
                },
                signal: deps.signal,
              })
              .catch(() => null);
            if (!verified) return null;
            refereeAttempts.push(...verified.attempts);
            attemptsUsed += verified.attempts.length;
            if (!verified.ok) return null;
            return (slot, category): RefereeVerdict | undefined => {
              const verdict = verified.verdicts.get(answerKey(slot, category));
              if (!verdict) return undefined;
              return verdict.valid ? { valid: true } : { valid: false, reason: verdict.reason };
            };
          },
        },
      );
      if (deps.signal.aborted) return finish("cancelled");
      if (!outcome.ok) {
        if (outcome.reason === "tool_failed") {
          toolCalls += 1;
          step.decision = "allowed";
          step.tool = { name: "verify_terms", items: 0, passed: 0, latencyMs: deps.now() - toolStarted, attempts: refereeAttempts };
          return finish("tool_failed");
        }
        return reject(outcome.reason);
      }

      toolCalls += 1;
      step.decision = "allowed";
      for (const verdict of outcome.result.items) {
        const item = evidence.find((each) => each.id === verdict.id)!;
        item.referee = verdict.verdict === "unverified" ? "not_checked" : verdict.verdict;
      }
      toolResults.push({ tool: "verify_terms", callId: outcome.result.callId, items: outcome.result.items });
      step.tool = {
        name: "verify_terms",
        items: outcome.result.items.length,
        passed: outcome.result.items.filter((item) => item.verdict === "accepted").length,
        latencyMs: deps.now() - toolStarted,
        attempts: refereeAttempts,
      };
      continue;
    }

    // 2. The shape of a tool call: candidates only.
    const toolShaped =
      envelope.candidates.length > 0 &&
      envelope.evidenceIds.length === 0 &&
      envelope.summary === "" &&
      envelope.tips.length === 0 &&
      envelope.confidence === "";
    if (!toolShaped) return reject("invalid_tool_args");

    // 3. Arguments, scope and repeats inside the tool's own entry, then the tool.
    const toolStarted = deps.now();
    const outcome = TOOLS.check_candidates(
      { candidates: envelope.candidates },
      { snapshot, evidence, toolCallsUsed: toolCalls },
      { now: deps.now, ...(deps.toolImpl ? { impl: deps.toolImpl } : {}) },
    );
    if (!outcome.ok) {
      if (outcome.reason === "tool_failed") {
        // It ran and failed: an execution, not a refusal. No retry.
        toolCalls += 1;
        step.decision = "allowed";
        step.tool = { name: "check_candidates", items: 0, passed: 0, latencyMs: deps.now() - toolStarted };
        return finish("tool_failed");
      }
      return reject(outcome.reason);
    }

    toolCalls += 1;
    step.decision = "allowed";
    const items = outcome.result.items.map((item) => ({ ...item, callId: outcome.result.callId }));
    evidence.push(...items);
    toolResults.push({ tool: "check_candidates", callId: outcome.result.callId, items: outcome.result.items });
    step.tool = {
      name: "check_candidates",
      items: items.length,
      passed: items.filter(isPassing).length,
      latencyMs: deps.now() - toolStarted,
    };
  }

  // Step 3 always offers only `final`, so this is reached only if that ever changes.
  return finish("max_steps");
}
