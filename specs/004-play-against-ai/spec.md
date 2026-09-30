# Feature Specification: Play against AI

**Feature Branch**: `main` (built before Spec Kit)

**Created**: 2026-09-30 — **reconstructed after the build**

**Status**: Implemented locally (commit `6232482`)

**Source of truth**: `Plan.md` §2B.3. This file summarizes and links; where it differs, the sources win.

## User Scenarios & Testing

### User Story 1 - A solo player gets an opponent (Priority: P1)

A third lobby button (`room:play-ai`) seats a server-side bot in the second
seat. The bot is ready when seated, so the round is scheduled from the human's
own `room:client-ready`, through the same `scheduleRound` as every room. The
bot keeps a random 5–7 answers, finishes at 55–85% of the round, and its sheet
goes through the same checker as the human's.

**Acceptance Scenarios** — `tests/integration/ai-round.test.ts`:

1. **A5** — **Given** an AI room, **When** the human is ready, **Then** the round is scheduled; the bot's answers are absent from every payload until reveal; they are judged in the same checker request.
2. **A6** — **Given** the bot's AI call fails, **Then** the bot plays blank, results show `botFailed: true`, and the human's round scores normally.

### Edge Cases

- No AI key → `AI_UNAVAILABLE` and the lobby says so.
- The name `AI` is reserved; the bot never queues for a random person and never uses hints.
- Randomness is injected, so tests are deterministic.
