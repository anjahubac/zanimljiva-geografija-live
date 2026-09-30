# Feature Specification: AI usage limits

**Feature Branch**: `main` (built before Spec Kit)

**Created**: 2026-09-30 — **reconstructed after the build**

**Status**: Implemented locally (commit `6232482`). `TRUST_PROXY_HOPS` must be set and confirmed at deployment (W4-9).

**Source of truth**: `Plan.md` §2B.11. This file summarizes and links; where it differs, the sources win.

## User Scenarios & Testing

### User Story 1 - One visitor cannot spend everyone's AI (Priority: P1)

Per visitor (IP) per hour: at most `AI_ROOMS_PER_VISITOR_HOUR` AI rooms and
`HINTS_PER_VISITOR_HOUR` hints, rejected with `RATE_LIMITED`.

### User Story 2 - The daily quota is protected (Priority: P1)

After `AI_DAILY_CALL_BUDGET` AI calls in a UTC day, new AI rooms and hints get
`AI_LIMIT`, but the checker still runs for rounds already played.

**Acceptance Scenarios** — `tests/integration/ai-limits.test.ts`, `tests/unit/usage-limits.test.ts`:

1. **Given** a play-AI-then-disconnect loop, **Then** it stops at the per-visitor limit.
2. **Given** a forged `x-forwarded-for`, **Then** it buys nothing.
3. **Given** a hint refused by the round's own rules, **Then** it is not charged.
4. **Given** the daily budget is spent, **Then** the checker still runs.

### Edge Cases

- Counts live in memory; a restart resets them.
- Players behind one address share one limit.
- `TRUST_PROXY_HOPS = 0` behind a proxy makes every visitor share one limit; the server warns at startup in production.
