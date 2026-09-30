# Feature Specification: Play a random person

**Feature Branch**: `main` (built before Spec Kit)

**Created**: 2026-09-30 — **reconstructed after the build**

**Status**: Implemented (2026-09-23, commit `c1b3192`; kept when accounts were removed in `6232482`)

**Source of truth**: `Plan.md` §2 "Two ways into a room", §2B.1. This file summarizes and links; where it differs, the sources win.

## User Scenarios & Testing

### User Story 1 - Get matched with a stranger (Priority: P1)

A player without a friend to invite joins a first-come queue. The second player
to queue is put into a room with the first, which then follows exactly the
friend-room path (feature 001), so every timing, privacy and scoring guarantee
applies unchanged.

**Acceptance Scenarios** — `tests/integration/quick-play.test.ts`:

1. **Given** one player is queued, **When** a second queues, **Then** both land in one room.
2. **Given** a queued player, **When** they ask again, **Then** they get the same queued state, not a second entry.
3. **Given** a queued player, **When** they cancel or disconnect, **Then** nobody is matched with them.
4. **Given** a player already in a room, **When** they try to queue, **Then** they are refused.
5. **Given** a malformed queue request, **Then** it is rejected and the queue is unchanged.

### Edge Cases

- Since feature 009 (`Plan.md` §2B.13) the queue entry keeps the waiting player's language, which becomes the room's alphabet; the arriving player's language is ignored. Tests: `tests/integration/alphabet.test.ts`.
- The queue is in memory beside the rooms; a restart loses it (accepted, `Plan.md` §13).
- The rule "an account is never matched with itself" went away with accounts (§2B.1); matching is now "oldest waiting socket first".
