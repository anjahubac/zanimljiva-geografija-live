# Implementation Plan: Letters from the whole alphabet

**Branch**: `main` (no feature branch) | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/009-full-alphabet-letters/spec.md`. Decision of record: `Plan.md` §2B.13.

## Summary

A room gets an **alphabet** (`sr` or `en`), taken from the opener's interface
language on `room:create`, `room:quick-play` or `room:play-ai` and fixed for
the room. The round letter is drawn from that alphabet: 30 Serbian Latin
letters (with Lj, Nj, Dž) or 26 English letters. The letter rule gains one
input, the alphabet: in Serbian rooms L, N and D exclude Lj, Nj and Dž. Every
place the letter is checked (local rule, the checker's recognised name, the
bot sheet, the hint term) passes the room's alphabet. The bot and hint prompts
get new versions that are told the alphabet. See [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript (strict), Node 22 — unchanged (module 11)

**Primary Dependencies**: Socket.IO, Zod, React/Vite — unchanged; **no new dependency**

**Storage**: N/A (rooms stay in memory)

**Testing**: Vitest; unit tests for the pure letter rule, integration tests with real Socket.IO clients, injected clock and letter selector, and the fake AI (module 13)

**Target Platform**: one Node service serving the browser client (unchanged)

**Project Type**: web application, single service (`src/server`, `src/client`, shared `src/contracts`, pure `src/domain`)

**Performance Goals**: N/A — drawing a letter and a prefix check are constant-time

**Constraints**: server authority over the letter; the opener's language is a preference, like the display name, and is validated by schema

**Scale/Scope**: 2 alphabets, 34 distinct letters; ~15 source files, ~12 test files touched

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
| --- | --- | --- |
| I. Server authority | The server picks the letter from the room's alphabet. The client sends only its language, validated by `languageSchema`, which picks a set; it cannot pick or influence the letter itself. | Pass |
| II. Fair synchronized start | Letter still chosen once, in `scheduleRound`, after both seats are ready; the same `round:scheduled` payload goes to both. | Pass |
| III. Hidden answers | No payload changes except three request schemas gaining `language`. Nothing about answers moves. | Pass |
| IV. Close exactly once | `closeRound` unchanged apart from passing the alphabet to the checker and the local rule. | Pass |
| V. Locked scope | Owner decision recorded in `Plan.md` §2B.13 before this plan. No dependency, service, database or event added. | Pass |
| VI. Evidence, not claims | Tests for the new rule are written first; `npm run verify` result reported; live AI smoke still not run (no key), stated as a limitation. | Pass |

Post-design re-check (after Phase 1): unchanged — the design adds one field to
three request schemas and one field to the room, and no event.

## Project Structure

### Documentation (this feature)

```text
specs/009-full-alphabet-letters/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── socket-requests.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/contracts/game.schemas.ts        # SERBIAN_LETTERS, ENGLISH_LETTERS, ALPHABETS, letterSchema over their union
src/contracts/socket.schemas.ts      # language on create / quick-play / play-ai requests
src/domain/validate-answer.ts        # letter rule takes the alphabet; Serbian digraph exclusion
src/domain/score-category.ts         # passes the alphabet through (local-rule scoring)
src/domain/score-round.ts            # same
src/server/letters.ts                # LetterSelector(alphabet) → Letter
src/server/rooms/room-store.ts       # Room.alphabet; queue entries keep the waiting player's language
src/server/socket/register-handlers.ts
src/server/ai/service.ts             # checkRound / botAnswers / hint take the alphabet
src/server/features/check-round.ts   # validateCheck / runCheck pass the alphabet to the letter rule
src/server/features/bot-answers.ts   # bot sheet blanked under the room's rule
src/server/features/hint.ts          # hint term checked under the room's rule (FR-011)
src/server/prompts/category-rules.ts # letter rule text per alphabet
src/server/prompts/bot-answers.v2.ts # replaces v1: told the alphabet
src/server/prompts/hint.v3.ts        # replaces v2: told the alphabet
src/client/socket/game-socket.ts     # sends the language when opening a room
src/client/App.tsx                   # passes the current interface language
src/client/app.css                   # the letter keeps its case (Lj, not LJ)
scripts/ai-smoke.ts                  # passes the alphabet; one English-alphabet bot case

tests/unit/validate-answer.test.ts   # digraph and alphabet cases
tests/unit/contracts.test.ts         # alphabets and request schemas
tests/unit/server-primitives.test.ts # selector draws every letter of each alphabet and nothing else
tests/unit/ai-features.test.ts       # bot / hint / checker under each alphabet
tests/integration/alphabet.test.ts   # new: opener's language decides, in all three modes
tests/fakes/fake-ai.ts, tests/helpers/test-server.ts, existing integration tests (request payloads gain `language`)
```

**Structure Decision**: existing single-service layout; the rule lives in
`src/domain`, the sets in `src/contracts`, the choice of alphabet in the room
store (module 01 layering).

## Complexity Tracking

No constitution violations.
