# Tasks: Letters from the whole alphabet

**Input**: Design documents from `specs/009-full-alphabet-letters/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/socket-requests.md](contracts/socket-requests.md)

**Status**: all tasks done 2026-09-30; `npm run verify` 490 tests, 30 files. C1 from `/speckit-analyze` (switching language keeps the alphabet) is covered in T014.

**Tests**: required. The project's definition of done (module 10) needs a success test and a rejection/edge test for every behaviour change, written before the code they check.

**Organization**: US1 and US2 (Serbian and English letter sets) share one mechanism and are delivered together in Phase 3; US3 (whose language) is Phase 4; US4 (bot and hints) is Phase 5.

## Phase 1: Setup

- [X] T001 Run `npm run verify` on the current tree and record the baseline test count before any change (reported in the handoff; `docs/EVIDENCE_004.md` §4 row added in T030)

---

## Phase 2: Foundational (blocks every story)

- [X] T002 In `src/contracts/game.schemas.ts` replace `SUPPORTED_LETTERS` with `SERBIAN_LETTERS` (30, order from data-model.md), `ENGLISH_LETTERS` (26) and `ALPHABETS: Record<Language, readonly Letter[]>`; `letterSchema` becomes `z.enum` over their de-duplicated union (34); move `LANGUAGES` above it so the order compiles
- [X] T003 In `src/domain/validate-answer.ts` give `startsWithLetter`, `checkAnswerLocally` and `isValidAnswer` a required `alphabet: Language` parameter; in `sr`, L/N/D reject text starting with lj/nj/dž (after normalization)
- [X] T004 Pass the alphabet through `scoreCategory` in `src/domain/score-category.ts` and `scoreRound` in `src/domain/score-round.ts`
- [X] T005 `LetterSelector` becomes `(alphabet: Language) => Letter` in `src/server/letters.ts`, drawing uniformly from `ALPHABETS[alphabet]`

---

## Phase 3: US1 + US2 — the letter comes from the whole alphabet, digraphs strict in Serbian (P1) 🎯 MVP

**Goal**: any of the 30 Serbian or 26 English letters can be drawn; the letter rule applies the Serbian digraph exclusion.

**Independent test**: unit tests on the selector and the rule; an integration round with an injected `Lj` letter.

### Tests first

- [X] T006 [P] [US1] In `tests/unit/validate-answer.test.ts` pass `"sr"` to existing cases and add: `Ljubljana` fits `Lj` and not `L` in `sr`; `London` fits `L`; `Njemačka` fails `N`; `Džakarta` fails `D`, `Danska` fits `D`; `Šabac` fits `Š`, `Sabac` does not; single-codepoint `ǈubljana` fits `Lj`
- [X] T007 [P] [US2] In the same file add `en` cases: `Ljubljana` fits `L`; `Čačak` fails `C`, `Cairo` fits `C`; `Washington` fits `W`
- [X] T008 [P] [US1] In `tests/unit/server-primitives.test.ts` replace the 7-letter test: over enough draws with a seeded loop, `randomLetterSelector("sr")` returns all 30 Serbian letters and nothing else, `("en")` all 26 and nothing else
- [X] T009 [P] [US1] In `tests/unit/contracts.test.ts` replace the `SUPPORTED_LETTERS` test: sets have 30 and 26 letters, `letterSchema` accepts `Lj`, `Dž`, `Q` and rejects `LJ`, `lj`, `s`, `1`
- [X] T010 [P] [US1] In `tests/unit/score-category.test.ts` pass the alphabet; add one case where `Ljubljana` scores 0 under `L`/`sr` and 10 under `L`/`en`

### Implementation

- [X] T011 [US1] In `src/server/rooms/room-store.ts` add `alphabet` to `Room` and `Round`; `scheduleRound` calls `selectLetter(room.alphabet)`; the local-rule fallback in `completeRound` passes `round.alphabet`
- [X] T012 [US1] In `src/server/features/check-round.ts` pass the alphabet to `planCheck`, `validateCheck` and `runCheck` and on to `checkAnswerLocally` / `startsWithLetter`; in `src/server/ai/service.ts` `checkRound(letter, alphabet, sheets)`; `countedAi` in `room-store.ts` and `tests/fakes/fake-ai.ts` follow
- [X] T013 [US1] In `src/client/app.css` make `.letter strong` `text-transform: none` so `Lj` is not shown as `LJ`

**Checkpoint**: typecheck clean; the new unit tests pass.

---

## Phase 4: US3 — the opener's language fixes the room's alphabet (P1)

**Goal**: `language` on the three opening requests; the waiting player's language wins a random match.

**Independent test**: `tests/integration/alphabet.test.ts` with a recording letter selector.

### Tests first

- [X] T014 [US3] Create `tests/integration/alphabet.test.ts`: a recording `selectLetter` (via `tests/helpers/test-server.ts`) sees `sr` for a Serbian creator with an English joiner; `en` for an English waiting player matched with a Serbian arrival; `sr` for a Serbian player against the AI; a create/quick-play/play-ai without `language` or with `"de"` is `INVALID_PAYLOAD` and leaves no room or queue entry
- [X] T015 [US3] In `tests/unit/contracts.test.ts` add request-schema cases: `language` required on the three opening requests, not accepted on `room:join`

### Implementation

- [X] T016 [US3] In `src/contracts/socket.schemas.ts` add `language: languageSchema` to `createRoomRequestSchema`, `quickPlayRequestSchema`, `playAiRequestSchema`
- [X] T017 [US3] In `src/server/rooms/room-store.ts` `createRoom`, `quickPlay`, `createAiRoom` take the alphabet; queue entries keep `language`; a match opens the room with the waiting partner's language
- [X] T018 [US3] In `src/server/socket/register-handlers.ts` pass `input.language` to the three store calls
- [X] T019 [US3] In `tests/helpers/test-server.ts` let `selectLetter` be injected (default `() => letter`)
- [X] T020 [US3] Update existing opening payloads/calls with `language: "sr"` in `tests/integration/*.test.ts` and `tests/unit/room-store.test.ts` (fixture update for the new contract, no assertion changed)
- [X] T021 [US3] In `src/client/socket/game-socket.ts` `createRoom`, `quickPlay`, `playAi` take the language; in `src/client/App.tsx` pass the current interface language (the `languageRef` already used for hints)

**Checkpoint**: `npm run verify` green; A1–A6 still pass.

---

## Phase 5: US4 — the AI opponent and hints follow the round's alphabet (P2)

**Goal**: new prompt versions told the alphabet; code checks their terms with the room's rule.

### Tests first

- [X] T022 [P] [US4] In `tests/unit/ai-features.test.ts` pass the alphabet to existing calls and add: bot `Ljubljana` for `L`/`sr` blanked, `Washington` for `W`/`en` kept; hint term `Njemačka` for `N`/`sr` rejected; hint with `term` "Vašington", `termEn` "Washington" for `W`/`en` accepted and for `W`/`sr` rejected; checker recognising `Džakarta` for written `Dzakarta` under `D`/`sr` → `wrong_letter`, under `D`/`en` → accepted
- [X] T023 [P] [US4] In `tests/integration/ai-round.test.ts` assert the fake AI's `botCalls`/`hintCalls`/`checkCalls` receive the room's alphabet

### Implementation

- [X] T024 [US4] In `src/server/prompts/category-rules.ts` replace `LETTER_RULE` with `letterRule(alphabet)`: `sr` — Serbian Latin name starts with the letter, diacritics respected, L/N/D exclude Lj/Nj/Dž; `en` — the Serbian Latin or the English name starts with the letter, diacritics respected
- [X] T025 [US4] Replace `src/server/prompts/bot-answers.v1.ts` with `bot-answers.v2.ts` (content carries `alphabet`; in `en` the bot may write the English name when that is the one that fits) and `src/server/prompts/hint.v2.ts` with `hint.v3.ts` (content carries `alphabet`)
- [X] T026 [US4] In `src/server/features/bot-answers.ts` and `src/server/features/hint.ts` take the alphabet; the hint term fits if the Serbian name fits, or in `en` also the English name (FR-011); `src/server/ai/service.ts` `botAnswers(letter, alphabet)`, `hint(letter, alphabet, category, language)`; `room-store.ts` passes `round.alphabet`
- [X] T027 [US4] In `scripts/ai-smoke.ts` pass the alphabet and add an English-alphabet bot sheet for `W`

**Checkpoint**: `npm run verify` green.

---

## Phase 6: Polish and documents

- [X] T028 [P] `docs/GAME_SPEC.md`: Amendment 7 (whole alphabets, opener's language, digraphs); mark §5's "Supported letters" line as superseded
- [X] T029 [P] `Plan.md`: mark the old letter lines (§ product brief, locked decisions) superseded by §2B.13; add a §2B.6 row for this step with its real result
- [X] T030 [P] `docs/EVIDENCE_004.md` §4: run row with the real `npm run verify` result
- [X] T031 [P] `.github/instructions/02-conventions`, `07-common-tasks`, `12-contracts-and-errors`, `13-test-recipes`: replace the fixed-allowlist text with the two alphabets
- [X] T032 [P] `specs/README.md`: add row 009
- [X] T033 Run `npm run verify` and report the real output; mark tasks done here

## Dependencies

- Phase 2 blocks everything (the rule's signature and `Letter` change).
- Phase 3 → Phase 4 (the room needs an alphabet field before the requests can fill it) → Phase 5 (the bot/hint read `round.alphabet`).
- Phase 6 after Phase 5.

## Parallel opportunities

- T006–T010 are separate test files.
- T022 and T023 are separate files.
- T028–T032 are separate documents.

## Implementation strategy

The MVP is Phases 2–4: letters from both alphabets, the digraph rule and the
opener's language. Phase 5 keeps the AI features consistent with the new
letters; without it the bot and hints still work but ignore the digraph rule in
their prompts. Each phase ends with its checkpoint command.
