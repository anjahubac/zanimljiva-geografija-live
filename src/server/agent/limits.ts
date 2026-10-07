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
  maxCandidatesPerCall: 8,
  maxCandidatesPerCategory: 2,
  /** `check_candidates` is synchronous; over this it counts as failed. */
  toolTimeMs: 100,
  maxToolResultBytes: 2_048,
});
