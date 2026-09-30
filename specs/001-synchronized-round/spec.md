# Feature Specification: One synchronized two-player round

**Feature Branch**: `main` (built before Spec Kit)

**Created**: 2026-09-30 — **reconstructed after the build**

**Status**: Implemented (2026-09-22, commits `b554f94`…`15f5792`, then `481535a`, `870c9af`)

**Source of truth**: `docs/GAME_SPEC.md`; `Plan.md` §3–§13. This file summarizes and links; where it differs, the sources win.

## User Scenarios & Testing

### User Story 1 - Play a friend (Priority: P1)

Player 1 creates a room and shares the code; Player 2 joins from another
computer. Both get the same letter, categories, start and deadline, fill the
sheet privately, and see one reveal and one score.

**Acceptance Scenarios** (pre-registered as evals in `docs/EVALS.md`):

1. **E1** — **Given** P1 is ready alone, **When** P2 becomes ready, **Then** both receive an identical `round:scheduled` with `startsAt` in the future. — `tests/integration/synchronized-start.test.ts`
2. **E2** — **Given** a round is open, **When** both finish or the deadline passes (or both race), **Then** exactly one reveal and one result per player, with identical totals. — `tests/integration/close-and-score.test.ts`
3. **E3** — **Given** any stale, early, late, malformed or cross-room input, **When** it arrives, **Then** it is rejected with a registry code and state is byte-identical. — `tests/integration/rejections.test.ts`
4. **E4** — **Given** a live round, **When** the opponent disconnects, **Then** the remaining player is told and the round still closes once. — `tests/integration/opponent-left.test.ts`

### Edge Cases

- Drafts are private and saved on the server, so a timeout does not depend on a last-millisecond message. — `tests/integration/drafts-privacy.test.ts`
- A single character is not an answer (`481535a`). — `tests/unit/validate-answer.test.ts`

## Requirements

Functional requirements, constants, the state machine and the event protocol
are in `Plan.md` §4–§12. Scoring is `Plan.md` §6 (10/5/10-0/0).

## Success Criteria

`docs/GAME_SPEC.md` §8 "Definition of Done". Evidence: `docs/EVIDENCE_003.md`.
