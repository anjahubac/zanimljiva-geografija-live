import type { CoachStep } from "@contracts/ai-output.schemas";
import { coachReportSchema, type CoachReport, type CoachStopReason, type CoachTip } from "@contracts/coach.schemas";
import { MAX_ANSWER_LENGTH, type Category, type Language, type PlayerSlot } from "@contracts/game.schemas";
import { startsWithLetter } from "@domain/validate-answer";
import { answerKey, type NamedVerdict } from "@server/features/check-round";
import { canFallBack } from "@server/ai/classify";
import { BUDGETS } from "@server/ai/retry-policy";
import type { AiService, CoachStepResult, VerifyTermsResult } from "@server/ai/service";
import type { AiFailureCode, ProviderAttempt } from "@server/ai/types";
import { COACH_STEP_PROMPT_VERSION, type CoachStepInput } from "@server/prompts/coach-step.v3";
import { RUN_LIMITS } from "./limits";
import type { AgentRunRecord, RunLogSink, StepRecord } from "./run-log";
import {
  TOOLS,
  askReferee,
  isPassing,
  isToolName,
  type EvidenceItem,
  type RefereeSheets,
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

/**
 * A provider failure is the run's budget (`call_budget`) only when the run's
 * remaining attempts narrowed this call below the per-step 2, all of them
 * were used, and the failure is one the gateway would otherwise have retried
 * or passed to the next model. Anything else keeps the provider's reason.
 */
function failureReason(code: AiFailureCode, granted: number, used: number): CoachStopReason | "cancelled" {
  const narrowedByRun = granted < RUN_LIMITS.maxAttemptsPerStep && used >= granted;
  return narrowedByRun && canFallBack(code) ? "call_budget" : stopReasonFor(code);
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

/**
 * The final, whole (contracts/model-step.md "Final validation"): every focus
 * category exactly once, each with "" or a passing item of this run in the same
 * category, a confidence, and no model text (owner, 2026-10-07: the summary is
 * the game's). Returns the cited item per category, or null.
 */
function validateFinal(
  envelope: CoachStep,
  snapshot: RoundSnapshot,
  evidence: readonly EvidenceItem[],
): { cited: Map<Category, EvidenceItem | null>; confidence: (typeof CONFIDENCE)[number] } | null {
  if (envelope.candidates.length > 0 || envelope.evidenceIds.length > 0 || envelope.summary !== "") return null;
  const confidence = CONFIDENCE.find((level) => level === envelope.confidence);
  if (!confidence) return null;

  if (envelope.tips.length !== snapshot.focus.length) return null;
  const ids = new Map<string, string>();
  for (const tip of envelope.tips) {
    if (ids.has(tip.category)) return null;
    ids.set(tip.category, tip.evidenceId);
  }

  const cited = new Map<Category, EvidenceItem | null>();
  for (const entry of snapshot.focus) {
    const evidenceId = ids.get(entry.category);
    if (evidenceId === undefined) return null;
    if (evidenceId === "") {
      cited.set(entry.category, null);
      continue;
    }
    const item = evidence.find((each) => each.id === evidenceId);
    if (!item || !isPassing(item) || item.category !== entry.category) return null;
    cited.set(entry.category, item);
  }
  return { cited, confidence };
}

/** Any other stop: per category, the passing word to offer — one the referee accepted, else the first. */
function bestPassing(snapshot: RoundSnapshot, evidence: readonly EvidenceItem[]): Map<Category, EvidenceItem | null> {
  return new Map(
    snapshot.focus.map((entry) => {
      const passing = evidence.filter((each) => each.category === entry.category && isPassing(each));
      return [entry.category, passing.find((each) => each.referee === "accepted") ?? passing[0] ?? null];
    }),
  );
}

/**
 * The spelling to show for an accepted word: the referee's name in the
 * player's language when it starts with the round letter, else the name the
 * referee checked the letter on. Never the model's spelling when the referee
 * gave one ("Rtnj" → "Rtanj").
 */
function shownName(verdict: NamedVerdict, language: Language, snapshot: RoundSnapshot): string | undefined {
  if (!verdict.valid || !verdict.names) return undefined;
  const { names } = verdict;
  const preferred = language === "sr" ? names.sr : names.en;
  return [preferred, names.checked].find(
    (name): name is string =>
      name !== null &&
      name.length <= MAX_ANSWER_LENGTH &&
      !/\p{Cc}/u.test(name) &&
      startsWithLetter(name, snapshot.letter, snapshot.alphabet),
  );
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

  let refereeCheck: AgentRunRecord["refereeCheck"];

  /**
   * One referee call, bound to the run's time, attempts and signal. Returns the
   * verdict lookup, or the stop reason it failed with. Used by `verify_terms`
   * and by the game's own check before a report.
   */
  const callReferee = async (
    sheets: RefereeSheets,
    interactionId: string,
    attempts: ProviderAttempt[],
  ): Promise<{ verdictOf: (slot: PlayerSlot, category: Category) => RefereeVerdict | undefined } | { failed: CoachStopReason | "cancelled" }> => {
    if (deps.signal.aborted) return { failed: "cancelled" };
    const timeLeft = deadlineAt - deps.now();
    const attemptsNow = RUN_LIMITS.maxAttemptsPerRun - attemptsUsed;
    if (timeLeft < RUN_LIMITS.minStepMs) return { failed: "deadline" };
    if (attemptsNow <= 0) return { failed: "call_budget" };
    const verified = await deps.ai
      .verifyTerms(snapshot.letter, snapshot.alphabet, sheets, {
        interactionId,
        budget: {
          ...BUDGETS["check-round"],
          totalMs: Math.min(RUN_LIMITS.perStepMs, timeLeft),
          maxAttempts: Math.min(RUN_LIMITS.maxAttemptsPerStep, attemptsNow),
        },
        signal: deps.signal,
      })
      .catch((): VerifyTermsResult => ({ ok: false, code: "transport", attempts: [] }));
    attempts.push(...verified.attempts);
    attemptsUsed += verified.attempts.length;
    if (!verified.ok) {
      const granted = Math.min(RUN_LIMITS.maxAttemptsPerStep, attemptsNow);
      return { failed: failureReason(verified.code, granted, verified.attempts.length) };
    }
    return {
      verdictOf: (slot, category) => {
        const verdict = verified.verdicts.get(answerKey(slot, category));
        if (!verdict) return undefined;
        if (!verdict.valid) return { valid: false, reason: verdict.reason };
        const name = shownName(verdict, context.language, snapshot);
        return name ? { valid: true, name } : { valid: true };
      },
    };
  };

  /** Records what the referee said about each word, and the spelling to show. */
  const applyVerdicts = (items: ReadonlyArray<{ id: string; verdict: "accepted" | "rejected" | "unverified"; name?: string }>) => {
    for (const verdict of items) {
      const item = evidence.find((each) => each.id === verdict.id)!;
      item.referee = verdict.verdict === "unverified" ? "not_checked" : verdict.verdict;
      if (verdict.name) item.shownAs = verdict.name;
    }
  };

  /**
   * Ends the run. Owner, 2026-10-07: only valid and checked answers reach the
   * player. Whatever the stop, the words that would be shown and that the
   * referee has not accepted go to the referee first (not a tool call; its
   * attempts count toward the run's 5), and only accepted words are shown, in
   * the referee's spelling. No model text is shown.
   */
  const finish = async (
    stopReason: CoachStopReason | "cancelled",
    final?: { cited: Map<Category, EvidenceItem | null>; confidence: (typeof CONFIDENCE)[number] },
  ): Promise<CoachRunOutcome> => {
    let outcome: CoachStopReason | "cancelled" = stopReason;
    let chosen = new Map<Category, EvidenceItem | null>();

    if (stopReason !== "cancelled") {
      chosen = final ? final.cited : bestPassing(snapshot, evidence);
      const toCheck = [...chosen.values()].filter(
        (item): item is EvidenceItem => item !== null && item.referee !== "accepted",
      );
      if (toCheck.length > 0) {
        const attempts: ProviderAttempt[] = [];
        let failed: CoachStopReason | "cancelled" | null = null;
        const items = await askReferee(toCheck, async (sheets) => {
          const answer = await callReferee(sheets, `${context.runId}:check`, attempts);
          if ("failed" in answer) {
            failed = answer.failed;
            return null;
          }
          return answer.verdictOf;
        });
        if (items) applyVerdicts(items);
        refereeCheck = {
          items: toCheck.length,
          accepted: (items ?? []).filter((item) => item.verdict === "accepted").length,
          attempts,
        };
        if (failed === "cancelled" || deps.signal.aborted) outcome = "cancelled";
        // A failed check turns a completed run partial; any other stop keeps its own reason.
        else if (failed && final) outcome = failed;
      }
    }

    const tips: CoachTip[] = snapshot.focus.map((entry) => {
      const item = chosen.get(entry.category) ?? null;
      const shown = item !== null && item.referee === "accepted" ? (item.shownAs ?? item.term) : null;
      return {
        category: entry.category,
        yourAnswer: entry.yourAnswer,
        whyMissed: entry.whyMissed,
        suggestion: shown,
        checkedBy: shown === null ? null : "letter_rule_and_referee",
      };
    });
    const anyShown = tips.some((tip) => tip.suggestion !== null);
    const report: Omit<CoachReport, "run"> | null =
      outcome === "cancelled"
        ? null
        : outcome === "goal_completed" && final
          ? { status: "completed", tips, confidence: final.confidence, stopReason: "goal_completed" }
          : { status: anyShown ? "incomplete" : "failed", tips, confidence: null, stopReason: outcome };

    const totals = { modelSteps: steps.length, providerAttempts: attemptsUsed, toolCalls, elapsedMs: deps.now() - startedAt };
    const record: AgentRunRecord = {
      event: "agent.run",
      runId: context.runId,
      goal: context.goal,
      promptVersion: COACH_STEP_PROMPT_VERSION,
      status: report ? report.status : "cancelled",
      stopReason: outcome,
      steps,
      ...(refereeCheck ? { refereeCheck } : {}),
      totals,
    };
    deps.log(record);
    if (!report) return { cancelled: true };

    // O6: the run log's totals and the last provider that answered — no content.
    const lastSuccess = [
      ...steps.flatMap((each) => [...each.attempts, ...(each.tool?.attempts ?? [])]),
      ...(refereeCheck?.attempts ?? []),
    ]
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
      const reason = failureReason(result.code, Math.min(RUN_LIMITS.maxAttemptsPerStep, attemptsLeft), result.attempts.length);
      if (reason === "malformed_output") step.rejectReason = "malformed_output";
      return finish(reason);
    }

    if (result.usage) step.usage = result.usage;
    const { envelope } = result;
    step.action = loggableAction(envelope.action);

    const reject = (reason: Exclude<CoachStopReason, "goal_completed">): Promise<CoachRunOutcome> => {
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
      const valid = validateFinal(envelope, snapshot, evidence);
      if (!valid) return reject("final_invalid");
      step.decision = "allowed";
      return finish("goal_completed", valid);
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
          // A referee failure is not a tool failure: the words stay unjudged, and the
          // game asks again before the report.
          referee: async (sheets) => {
            const answer = await callReferee(sheets, `${context.runId}:s${n}:verify`, refereeAttempts);
            return "failed" in answer ? null : answer.verdictOf;
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
      applyVerdicts(outcome.result.items);
      // The model sees ids and verdicts only, never the referee's spelling.
      toolResults.push({
        tool: "verify_terms",
        callId: outcome.result.callId,
        items: outcome.result.items.map(({ id, verdict, reason }) => ({ id, verdict, reason })),
      });
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
