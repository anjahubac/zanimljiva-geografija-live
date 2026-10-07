/*
 * Every bound on a coach run, in one frozen object (`Plan.md` §2C.8, decided
 * in §2C.16). The application enforces each of these, never the model: they
 * are checked before every step and every tool call.
 */
export const RUN_LIMITS = Object.freeze({
  /** propose → one revision → final. */
  maxModelSteps: 3,
  /** Tool executions; a refused proposal is not one. */
  maxToolCalls: 2,
  /** One retry or one fallback per step. */
  maxAttemptsPerStep: 2,
  /** Below 3 × 2, so the run cap binds (eval C12). */
  maxAttemptsPerRun: 5,
  perAttemptMs: 6_000,
  perStepMs: 10_000,
  runDeadlineMs: 25_000,
  /** No step starts with less time than this left. */
  minStepMs: 2_000,
  /** Two words for each of the eight categories, so each has a backup (owner, 2026-10-07). */
  maxCandidatesPerCall: 16,
  maxCandidatesPerCategory: 2,
  /** `check_candidates` is synchronous; over this it counts as failed. */
  toolTimeMs: 100,
  /** 16 items of 40-character terms with two-byte letters fit. */
  maxToolResultBytes: 4_096,
  /*
   * The repair (owner, 2026-10-07): after the report's referee check, one more
   * model step for the categories still without an accepted word, then the
   * referee. On top of the figures above: in all at most 4 steps, 3 tool
   * calls, 7 provider attempts and 35 s.
   */
  repairModelSteps: 1,
  repairToolCalls: 1,
  /** One model attempt and one referee attempt: no retry, no fallback. */
  repairAttempts: 2,
  repairExtraMs: 10_000,
});
