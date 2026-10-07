# Feature Specification: AI answer checker (Gemini ⇄ Groq)

**Feature Branch**: `main` (built before Spec Kit)

**Created**: 2026-09-30 — **reconstructed after the build**

**Status**: Implemented locally (commit `6232482`). Live eval ran on 2026-10-07 with `check-round.v3`: 16/16 agreement per provider on the fixed checker cases (`docs/AI_EVALS.md`). The current Week 5 workspace uses `check-round.v4`; its live recheck is not recorded.

**Source of truth**: `Plan.md` §2B.2 (checker, close path, safety) and §2B.5 (providers, fallback). This file summarizes and links; where it differs, the sources win.

## User Scenarios & Testing

### User Story 1 - Only real answers score (Priority: P1)

An answer that only starts with the right letter no longer scores. After both
sheets lock, the server sends every answer that passed the local rule to the AI
in one request, and an answer is valid only if the AI accepts it, the
recognised name resembles what was written, and that name starts with the
round letter. Scoring (§6) is applied to that validity.

**Acceptance Scenarios** (evals written before running; `tests/integration/ai-round.test.ts`):

1. **A1** — **Given** both players answered, **When** the AI rejects an invented answer, **Then** that cell is invalid with its reason, wrong-letter answers are never sent, and there is exactly one AI call.
2. **A2** — **Given** the checker is pending, **When** Finish races the deadline, **Then** one AI call, one reveal, one result.
3. **A3** — **Given** the checker returns nothing or never answers, **Then** the round is scored on the local rule, marked `verified: false`, via the 20 s room timeout.

### User Story 2 - One provider can stand in for the other (Priority: P2)

**Acceptance Scenarios** — `tests/unit/groq-and-fallback.test.ts`: Gemini quota spent → Groq answers and Gemini is skipped next round; Groq down → Gemini answers; both down → local rule.

### Edge Cases

- Answers are untrusted data (prompt injection); the reply is checked by JSON parse → Zod → semantic rules. — `tests/unit/ai-features.test.ts`
- No key configured is a supported mode: the local rule scores every round.

## Success Criteria

Agreement score of the live smoke eval, recorded in `docs/AI_EVALS.md` (16/16 per provider, 2026-10-07; small fixed sample).
