# Feature Specification: Hints

**Feature Branch**: `main` (built before Spec Kit)

**Created**: 2026-09-30 — **reconstructed after the build**

**Status**: Implemented locally (commit `6232482`)

**Source of truth**: `Plan.md` §2B.8. This file summarizes and links; where it differs, the sources win.

## User Scenarios & Testing

### User Story 1 - A stuck player asks for a clue (Priority: P1)

During answering, a player may ask for a clue for one category (`round:hint`),
up to `HINTS_PER_ROUND` per round, one per category, one pending at a time. The
AI picks a well-known term and returns a short clue in the player's language;
the term itself never leaves the server.

**Acceptance Scenarios** — `tests/integration/ai-round.test.ts`:

1. **A4** — **Given** a hint is asked, **Then** the clue goes only to the caller; "no known term" costs nothing; the hinted cell is marked for both players at reveal; a hint that races the close is `ROUND_STALE` and not charged.

### Edge Cases

- A clue containing the term, or any 4 consecutive letters of it, is discarded (`hint-leak.ts`).
- A credit is spent only when a clue is shown.
- Errors: `AI_UNAVAILABLE`, `AI_LIMIT`, `HINT_LIMIT`, `RATE_LIMITED` (feature 008).
- Hints never change points.
