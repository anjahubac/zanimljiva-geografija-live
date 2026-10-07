# Tasks: Bounded post-round AI coach

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contract index](contracts/coach-contract.md), [quickstart](quickstart.md), [impact analysis](impact-analysis.md).\
**Status (2026-10-07)**: Automated implementation and full regression verification are complete. Remaining product evidence gates are live provider, interactive browser/accessibility review and human pair contribution/explanation.

## Phase 1: Baseline and consumer inventory

**Purpose**: Establish W04 continuation and preserve shared producer/consumer awareness.

- [X] T001 Record the passing W04 `npm.cmd run verify` baseline in `docs/EVIDENCE_W05.md`: typecheck/lint clean, 490 tests across 30 files, client/server builds succeeded; record initial setup/sandbox failures and successful workaround honestly.
- [X] T002 [P] Re-run the `rg` consumer searches in `specs/010-post-round-coach/impact-analysis.md`; inspected the current `AiService`, `AiOperation`, budgets, quota, socket events, result construction, ack and lifecycle consumers before any shared producer changes.

## Phase 2: Foundational schemas, snapshot, tool and runtime limits

**Purpose**: Shared prerequisites for all stories.

- [X] T003 Add strict request, CoachRunView and coach IDs/reasons schemas in `src/contracts/coach.schemas.ts`; map the event/type in `src/contracts/socket.schemas.ts` without adding progress/cancel/broadcast events.
- [X] T004 [P] Add synthetic source fixtures and scriptable provider/transport fake in `tests/fakes/fake-coach.ts`; leave legacy `tests/fakes/fake-ai.ts` behavior and required interface unchanged.
- [X] T005 Capture immutable per-human source only after canonical `RoundRevealed`/`RoundResults` values are constructed from the exact computed checker/scoring facts in `src/server/rooms/room-store.ts`; gate coach admission on explicit source readiness; test verified and fallback facts, detachment, no rejudge/rescore and unchanged reveal/results in `tests/unit/room-store.test.ts`.
- [X] T006 Add strict `analyze_round` args/output schemas and deterministic tool in `src/server/features/analyze-round.ts`; test 8 categories, ten evidence records, totals/points/reasons, eligibility, version and size in `tests/unit/analyze-round.test.ts`.
- [X] T007 Add SR/EN closed coach dictionaries in the existing `src/client/strings.ts` and `src/client/i18n.tsx`; test controlled rendering and language switching without new provider work in `tests/unit/coach-copy.test.ts`.
- [X] T008 Add coach-only operation and config bounds in `src/server/ai/types.ts`, `src/server/ai/retry-policy.ts`, `src/server/config.ts`, `src/contracts/game.schemas.ts` and `.env.example`; preserve W04 defaults and cover `tests/unit/config.test.ts` and `tests/unit/classify-and-retry.test.ts`.
- [X] T009 Add atomic daily check/charge per physical coach attempt and separate five-run/hour admission in `src/server/usage-limits.ts`; test concurrent attempts/admissions while preserving W04 logical operation counts and checker priority in `tests/unit/usage-limits.test.ts`.
- [X] T010 Add coach-only guard at each real adapter invocation in `src/server/ai/coach-attempt-guard.ts`; test 2 steps, 1 tool, 3 total/2 per step, 1 recovery/fallback, 30 s deadline, 8 s attempt, 1,024 output tokens, 8,192 decoded-byte cap, abort/late suppression, available usage and unchanged legacy gateway in `tests/unit/coach-attempt-guard.test.ts`.
- [X] T011 Add proposal parsing, allowlist/unknown-tool separation, strict args, tool result and final choice validation in `src/server/features/coach-engine.ts`; rejected proposals must execute zero tools in `tests/unit/coach-engine.test.ts`.
- [X] T012 Add bounded sanitized coach telemetry in `src/server/ai/coach-telemetry.ts`; test available usage on malformed successful output, absent usage as unknown, 16 KB trace cap, no prompt/reply/answer/identity/secrets, and no coach raw debug logging.

**Exit**: `npm.cmd run test:unit -- tests/unit/analyze-round.test.ts tests/unit/coach-engine.test.ts tests/unit/coach-attempt-guard.test.ts tests/unit/usage-limits.test.ts` and `npm.cmd run typecheck` pass.

## Phase 3: User Story 1 - Get useful advice about my completed round (P1)

**Goal**: A human gets checked practice advice from their own completed round.\
**Independent test**: Scripted model completes two decisions with exactly one real tool execution; requester receives a valid `CoachRunView` and controlled review.

- [X] T013 [US1] Compose two model decisions, deterministic tool, strict final validation and CoachRunView in `src/server/features/post-round-coach.ts`, using the exact canonical result contract in `docs/TOOL_CONTRACTS.md`; cover C01,C07,C15-C19,C25 in `tests/unit/post-round-coach.test.ts`.
- [X] T014 [US1] Add a sibling optional coach capability in `src/server/ai/service.ts`, thread through `src/server/index.ts`/`createGameServer` into `src/server/rooms/room-store.ts`, and wire `tests/helpers/test-server.ts` with coach fake; do not add a mandatory legacy `AiService` method.
- [X] T015 [US1] Add results/source-ready-only `round:coach` authorization and private terminal Ack in `src/server/socket/register-handlers.ts`; derive caller from socket binding; cover C03,C21 in `tests/integration/post-round-coach.test.ts`.
- [X] T016 [US1] Wire Analyze my round state/action in `src/client/screens/ResultsScreen.tsx`, `src/client/state/useGameState.ts`, `src/client/App.tsx`, `src/client/socket/game-socket.ts`, `src/client/strings.ts` and `src/client/i18n.tsx`; add only coach-specific 32 s aborting ack timeout and stale ack suppression; cover C30 in client tests.

**Exit**: `npm.cmd run test:unit -- tests/unit/post-round-coach.test.ts` and `npm.cmd run test:integration -- tests/integration/post-round-coach.test.ts` pass.

## Phase 4: User Story 2 - Keep analysis private and evidence-based (P1)

**Goal**: The review exposes only the caller's checked facts and never claims unsupported geography or ability facts.\
**Independent test**: Both seats in friend, random and AI modes produce isolated contexts and private results with valid limitations.

- [X] T017 [US2] Bind source/run/cache to human seat plus round and enforce one run per seat/round in `src/server/rooms/room-store.ts`; concurrent duplicate and terminal failure reuse tests cover C20.
- [X] T018 [US2] Assert no opponent row, raw answer, name, owner/socket/room/address, prompt/reply or secret in tool/model/telemetry/ack in `src/server/features/post-round-coach.ts` and `src/server/ai/coach-telemetry.ts`; cover C21,C26,C28.
- [X] T019 [US2] Render checked evidence, recommendation, confidence and both required limitation IDs through `src/client/strings.ts`/`src/client/i18n.tsx`; cover accepted duplicates, blanks/hints, verified checker reason and unverified cases C16-C19,C27.

**Exit**: `npm.cmd run test:integration -- tests/integration/post-round-coach.test.ts` plus targeted `tests/unit/coach-copy.test.ts` pass.

## Phase 5: User Story 3 - Finish safely when analysis cannot complete (P1)

**Goal**: Every error/limit/late/disconnect path terminates once without altering canonical game output.\
**Independent test**: Script provider/tool failures and races; assert exact counts, safe terminal outcome, zero forbidden tool work and unchanged game state.

- [X] T020 [US3] Verify attempt/recovery/fallback/deadline/tool/repetition/final/refusal failures, fixed two-decision topology and no fourth physical attempt in `src/server/features/post-round-coach.ts`; `step_limit` is reserved because no third-decision transition exists; cover C04-C14,C29.
- [X] T021 [US3] Enforce per-attempt atomic daily charge and five trusted-visitor admissions/hour in `src/server/usage-limits.ts` and `src/server/rooms/room-store.ts`; cover new sockets/rooms, forged forwarding headers, concurrent attempt races and W04 priority C23-C24.
- [X] T022 [US3] Cancel active run and clear source/cache during disconnect/room TTL cleanup in `src/server/rooms/room-store.ts`; prevent late ack/state retention; cover C22.
- [X] T023 [US3] Verify unchanged reveal/result/score/checker/hint behavior through the full existing `npm.cmd run verify` regression suite plus coach canonical-output integration checks; cover C25,C31.

**Exit**: targeted coach, close/score, AI round and usage suites pass; `npm.cmd run typecheck` passes.

## Phase 6: User Story 4 - Use coaching in either language (P2)

**Goal**: Same validated review can be read in Serbian or English without another model run.\
**Independent test**: Switch language after completion; checked IDs/evidence stay fixed, localized copy changes, run/provider/tool counts do not.

- [X] T024 [US4] Complete accessible labels/status/findings/recommendations/confidence/limitations in `src/client/strings.ts`, `src/client/i18n.tsx` and `src/client/screens/ResultsScreen.tsx`; cover C27,C30.
- [X] T025 [US4] Verify exact round alphabet/checker facts are reused in all three modes without language-dependent rejudging in `src/server/rooms/room-store.ts`; cover Serbian digraph and English W synthetic fixtures C27.

**Exit**: client coach tests and all `tests/integration/post-round-coach.test.ts` cases pass.

## Phase 7: Runnable evaluation, evidence and final checks

- [X] T026 [P] Add package command `coach:fake-e2e` in `package.json` and `scripts/coach-fake-e2e.ts` that runs real engine/tool/validators with scripted fake model/transport; no public mock API or production bypass.
- [X] T027 [P] Add explicit opt-in `coach:smoke` in `package.json` and `scripts/coach-smoke.ts`; use credential-presence-only readiness checks, synthetic fixtures and active budgets; never print key values; enforce <=15 development and <=3 final demo live runs.
- [X] T028 Map every C01-C31 to test or future observed gate in `docs/AGENT_EVALS.md`; keep unrun/live cases pending.
- [X] T029 Record actual architecture/tests, sanitized trace, limits and risks in `docs/EVIDENCE_W05.md`; never invent live outcomes or pair contributions.
- [X] T030 Update `docs/AI_USAGE_LOG.md` with actual provider run/attempt/recovery/fallback/tool/known usage only.
- [X] T031 Update code-matched W05 docs in `Plan.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/GAME_SPEC.md`, `.github/instructions/05-security.instructions.md`, `.github/instructions/12-contracts-and-errors.instructions.md`, `.github/instructions/13-test-recipes.instructions.md` and `docs/CONTEXT_MANIFEST.md`.
- [X] T032 `npm.cmd run coach:fake-e2e` passed all four scenarios; final `npm.cmd run verify` passed typecheck/lint, 555 tests across 40 files, Vite (90 modules) and tsup (142.09 KB); local Socket.IO checks and normal `git diff --check` passed. Interactive browser review is unavailable here and remains pending; live/demo/pair gates remain pending because they were not completed.

## Dependencies and execution order

Baseline and root consistency review preceded runtime edits. T003-T012 establish shared contracts/source/tool/limits. US1 composes success; US2 verifies privacy/evidence; US3 covers limits/lifecycle and W04 regressions; US4 closes localization. Implementation tasks are complete. Stories depend on foundational work and are sequenced; the repository forbids parallel AI implementation. `[P]` is only used for separate-file fixture/docs work, not agent delegation.

## MVP and completion gates

MVP is US1: one verified synthetic run performs exactly two decisions, one real read-only tool, and returns a valid private checked review. It is not releasable without US2 privacy, US3 failure/budget behavior and passing W04 regression. US4 completes language support. All C01-C31 must map to tests or explicitly pending manual/live evidence. No task is checked until performed.
