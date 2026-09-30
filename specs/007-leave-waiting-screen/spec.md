# Feature Specification: Leave the waiting screen

**Feature Branch**: `main` (built before Spec Kit)

**Created**: 2026-09-30 — **reconstructed after the build**

**Status**: Implemented locally (commit `6232482`)

**Source of truth**: `Plan.md` §2B.10. This file summarizes and links; where it differs, the sources win.

## User Scenarios & Testing

### User Story 1 - Stop waiting for a friend (Priority: P1)

On the waiting screen (`waiting_for_player`, `synchronizing`), in all three
modes, a **Leave game** (_Napusti partiju_) button releases the room. On a
friend room a note says the shared code will stop working. No new event: the
client remounts, the socket drops, and the disconnect handler runs.

**Acceptance Scenarios**:

1. **Given** a lobby with no connected human left, **Then** the room is removed at once and its code answers `ROOM_NOT_FOUND`. — `tests/unit/room-store.test.ts`, `tests/integration/room-lifecycle.test.ts`
2. **Given** a synchronizing room, **When** one of two humans leaves, **Then** the room stays; **When** both leave, **Then** it is released.
3. **Given** an AI room, **When** the human leaves, **Then** it is released (a bot does not keep a room alive). — `tests/integration/ai-round.test.ts`
4. The button renders where expected. — `tests/unit/client-ai.test.ts`

### Edge Cases

- Not offered mid-round: a round plays to its deadline (`Plan.md` §13).
