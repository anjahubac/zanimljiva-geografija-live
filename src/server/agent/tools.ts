import { z } from "zod";
import type { MissReason } from "@contracts/coach.schemas";
import {
  MAX_ANSWER_LENGTH,
  categorySchema,
  type Category,
  type Language,
  type Letter,
} from "@contracts/game.schemas";
import { compactFold } from "@domain/fold-letters";
import { checkAnswerLocally } from "@domain/validate-answer";
import { RUN_LIMITS } from "./limits";

/*
 * The coach's tools (contracts/tools.md). The model may only *propose* an
 * action; this file decides whether it runs. Every tool has its own entry,
 * its own argument schema and scope check, and its own result check — there
 * is deliberately no generic `execute(name, args)`.
 *
 * Validation order for every proposal: input schema → run scope → repeat
 * guard → execute (timed) → result size and schema. A refused proposal never
 * runs, and the caller does not count it as a tool call.
 *
 * Read-only: nothing here writes, reads the opponent's sheet, or reaches AI,
 * network, files or state. No import from rooms/, socket/ or ai/.
 */

/** What the run knows about the caller's round, frozen by the orchestrator. */
export type FocusEntry = { category: Category; yourAnswer: string; whyMissed: MissReason };
export type RoundSnapshot = { letter: Letter; alphabet: Language; focus: readonly FocusEntry[] };

export const CANDIDATE_FAILURES = ["too_short", "wrong_letter", "same_as_yours"] as const;
export type CandidateFailure = (typeof CANDIDATE_FAILURES)[number];

/** One checked word, referenced by its id in the final answer. */
export type EvidenceItem = {
  id: string;
  callId: string;
  category: Category;
  term: string;
  passes: boolean;
  failure: CandidateFailure | null;
};

export type ToolScope = {
  snapshot: RoundSnapshot;
  /** Every item checked so far in this run, in order. */
  evidence: readonly EvidenceItem[];
  toolCallsUsed: number;
};

export type ToolRefusal = "invalid_tool_args" | "repeated_call" | "tool_failed";

/** A passing item: the letter rule accepted it and it is not the caller's own answer. */
export const isPassing = (item: EvidenceItem): boolean => item.passes;

/** The repeat guard's key: the same folding as scoring, so "Sava" and " sava" are one candidate. */
const checkedKey = (category: Category, term: string): string => `${category}:${compactFold(term)}`;

const hasControlCharacter = (value: string) => /\p{Cc}/u.test(value);

/* -------------------------------------------------------- check_candidates */

const candidateArgsSchema = z
  .object({
    candidates: z
      .array(
        z
          .object({
            category: categorySchema,
            term: z
              .string()
              .refine((term) => !hasControlCharacter(term), "control character")
              .transform((term) => term.trim())
              .pipe(z.string().min(1).max(MAX_ANSWER_LENGTH)),
          })
          .strict(),
      )
      .min(1)
      .max(RUN_LIMITS.maxCandidatesPerCall),
  })
  .strict();
export type CandidateArgs = z.infer<typeof candidateArgsSchema>;

const candidateItemSchema = z
  .object({
    id: z.string().regex(/^c\d{1,2}$/),
    category: categorySchema,
    term: z.string().min(1).max(MAX_ANSWER_LENGTH),
    passes: z.boolean(),
    failure: z.enum(CANDIDATE_FAILURES).nullable(),
  })
  .strict()
  .refine((item) => (item.failure === null) === item.passes, "failure is null exactly when the item passes");

const candidateResultSchema = z
  .object({
    callId: z.string().regex(/^t\d$/),
    items: z.array(candidateItemSchema).min(1).max(RUN_LIMITS.maxCandidatesPerCall),
  })
  .strict();
export type CandidateResult = z.infer<typeof candidateResultSchema>;

/** Where the next call's ids start; the tool itself keeps no state. */
type Numbering = { callId: string; firstItem: number };

/** The tool proper: validity step 1 of the game itself on each candidate. Pure. */
export function runCheckCandidates(args: CandidateArgs, snapshot: RoundSnapshot, numbering: Numbering): CandidateResult {
  return {
    callId: numbering.callId,
    items: args.candidates.map(({ category, term }, index) => {
      const local = checkAnswerLocally(term, snapshot.letter, snapshot.alphabet);
      const own = snapshot.focus.find((entry) => entry.category === category)?.yourAnswer ?? "";
      let failure: CandidateFailure | null = null;
      if (!local.ok) failure = local.reason === "wrong_letter" ? "wrong_letter" : "too_short";
      else if (own.trim() !== "" && compactFold(own) === compactFold(term)) failure = "same_as_yours";
      return { id: `c${numbering.firstItem + index}`, category, term, passes: failure === null, failure };
    }),
  };
}

export type ToolDeps = {
  /** Injected so the 100 ms guard is testable; the tool itself never reads a clock. */
  now: () => number;
  /** Tests replace the tool to make it throw, hang or return a bad shape. */
  impl?: (args: CandidateArgs, snapshot: RoundSnapshot, numbering: Numbering) => CandidateResult;
};

export type ToolOutcome = { ok: true; result: CandidateResult } | { ok: false; reason: ToolRefusal };

/**
 * The only way `check_candidates` runs. `proposal` is the model's arguments,
 * untrusted. Never throws: every failure is a refusal reason.
 */
export function checkCandidates(proposal: unknown, scope: ToolScope, deps: ToolDeps): ToolOutcome {
  // 1. Input schema.
  const parsed = candidateArgsSchema.safeParse(proposal);
  if (!parsed.success) return { ok: false, reason: "invalid_tool_args" };
  const args = parsed.data;

  // 2. Run scope: a call left; focus categories only, none already solved;
  //    at most two per category; no duplicate inside the call.
  if (scope.toolCallsUsed >= RUN_LIMITS.maxToolCalls) return { ok: false, reason: "invalid_tool_args" };
  const focus = new Set(scope.snapshot.focus.map((entry) => entry.category));
  const solved = new Set(scope.evidence.filter(isPassing).map((item) => item.category));
  const perCategory = new Map<Category, number>();
  const inCall = new Set<string>();
  for (const { category, term } of args.candidates) {
    if (!focus.has(category) || solved.has(category)) return { ok: false, reason: "invalid_tool_args" };
    perCategory.set(category, (perCategory.get(category) ?? 0) + 1);
    if (perCategory.get(category)! > RUN_LIMITS.maxCandidatesPerCategory) return { ok: false, reason: "invalid_tool_args" };
    const key = checkedKey(category, term);
    if (inCall.has(key)) return { ok: false, reason: "invalid_tool_args" };
    inCall.add(key);
  }

  // 3. Repeat guard: nothing already checked in this run.
  const checked = new Set(scope.evidence.map((item) => checkedKey(item.category, item.term)));
  if ([...inCall].some((key) => checked.has(key))) return { ok: false, reason: "repeated_call" };

  // 4. Execute, timed. A deterministic tool would fail the same way again, so no retry.
  const numbering = { callId: `t${scope.toolCallsUsed + 1}`, firstItem: scope.evidence.length + 1 };
  const impl = deps.impl ?? runCheckCandidates;
  const started = deps.now();
  let raw: unknown;
  try {
    raw = impl(args, scope.snapshot, numbering);
  } catch {
    return { ok: false, reason: "tool_failed" };
  }
  if (deps.now() - started > RUN_LIMITS.toolTimeMs) return { ok: false, reason: "tool_failed" };

  // 5. Result: size first, then shape, then that it answers exactly what was asked.
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(raw);
  } catch {
    return { ok: false, reason: "tool_failed" };
  }
  if (serialized === undefined || new TextEncoder().encode(serialized).length > RUN_LIMITS.maxToolResultBytes) {
    return { ok: false, reason: "tool_failed" };
  }
  const result = candidateResultSchema.safeParse(raw);
  if (!result.success || result.data.callId !== numbering.callId) return { ok: false, reason: "tool_failed" };
  const answersRequest =
    result.data.items.length === args.candidates.length &&
    result.data.items.every(
      (item, index) =>
        item.id === `c${numbering.firstItem + index}` &&
        item.category === args.candidates[index]!.category &&
        item.term === args.candidates[index]!.term,
    );
  if (!answersRequest) return { ok: false, reason: "tool_failed" };

  return { ok: true, result: result.data };
}

/* --------------------------------------------------------------- allowlist */

/** The allowlist. `final` is the terminal action, not a tool. */
export const TOOLS = Object.freeze({
  check_candidates: checkCandidates,
});
export type ToolName = keyof typeof TOOLS;

/** Own keys only, so "toString" or "__proto__" can never name a tool. */
export function isToolName(name: string): name is ToolName {
  return Object.prototype.hasOwnProperty.call(TOOLS, name);
}
