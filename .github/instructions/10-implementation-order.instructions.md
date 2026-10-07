---
description: "The ordered, file-by-file build sequence with exported signatures and per-step exit criteria. The primary driver file for an implementation model."
applyTo: "**/*"
---

# Implementation Order Instructions

This is the build order. Do the steps in this sequence, one at a time. Do not
skip ahead, do not batch several steps into one edit, and do not start a step
whose predecessor's exit criteria have not actually passed.

## Working agreement for the implementation model

Before writing code in a step:

1. State in one or two sentences what this step changes.
2. List the files you will create or edit.
3. State any assumption you are making, and continue — do not stop to ask about
   a decision that `Plan.md` or modules 11-13 already lock down.

After writing code in a step:

4. Run the step's exit command and paste the real output.
5. If it fails, fix the cause. Do not weaken the test, the schema, or the
   threshold.
6. Stop and report if the same failure survives three attempts. Include goal,
   expected, actual, what you checked, and a precise question.

Never claim a command passed unless it ran in this session. Never mark a step
done with a failing typecheck, lint, or test.

## Step 0 — Repository skeleton

Create, in this order: `.gitignore`, `package.json`, `tsconfig.json`,
`vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `.env.example`,
`index.html`, `README.md`. Contents come verbatim from module 11.

**Exit:** `npm install && npm run typecheck && npm run lint` pass.

## Step 1 — Week 3 documents (before any application code)

Create `docs/GAME_SPEC.md`, `docs/BUILD_PROMPT_V1.md`, `docs/CONTEXT_MANIFEST.md`,
`docs/EVALS.md` (E1-E4 written as *expectations*, before anything runs), and
`docs/AI_USAGE_LOG.md`. Content requirements are in `Plan.md` §14.

**Exit:** all five files exist, `EVALS.md` contains expected results and no
actual results, and `GAME_SPEC.md` is marked frozen.

## Step 2 — Contracts

Create `src/contracts/game.schemas.ts` and `src/contracts/socket.schemas.ts`
exactly as module 12 specifies, then `tests/unit/contracts.test.ts` and
`tests/unit/config.test.ts`.

**Exit:** `npm run test:unit` passes; each schema has a valid case, a malformed
case, and an extra-key rejection case.

## Step 3 — Domain (pure, no I/O, no clock, no randomness)

```ts
// src/domain/normalize-answer.ts
export function normalizeAnswer(raw: string): string;

// src/domain/validate-answer.ts
export function isValidAnswer(raw: string, letter: string): boolean;
// Since Plan.md §2B.13: isValidAnswer(raw, letter, alphabet), and the letter
// rule is startsWithLetter(text, letter, alphabet) with the Serbian digraphs.

// src/domain/score-category.ts
export function scoreCategory(
  category: Category,
  player1Raw: string,
  player2Raw: string,
  letter: Letter,
): CategoryScore;

// src/domain/score-round.ts
export function scoreRound(
  answers1: Record<Category, string>,
  answers2: Record<Category, string>,
  letter: Letter,
): { scores: CategoryScore[]; player1Total: number; player2Total: number;
     outcome: "player_1" | "player_2" | "draw" };
```

`normalizeAnswer` and `isValidAnswer` bodies are given verbatim in `Plan.md` §7.
Use them as written. Validity is decided before comparison; comparison happens
only between two valid normalized answers.

**Exit:** `tests/unit/normalize-answer.test.ts`, `validate-answer.test.ts` and
`score-category.test.ts` pass, including every row of the `Plan.md` §6 table.

## Step 4 — Server primitives

```ts
// src/server/clock.ts           -> Clock, Scheduler, systemClock, systemScheduler (module 13)
// src/server/config.ts          -> loadConfig(env: NodeJS.ProcessEnv): ServerConfig
// src/server/ids.ts             -> generateRoomCode(): string, generateRoundId(): string,
//                                  generateResumeToken(): string   // all via node:crypto
// src/server/letters.ts         -> LetterSelector, randomLetterSelector
```

**Exit:** `npm run test:unit` passes; `loadConfig` rejects out-of-range values
with a readable message.

## Step 5 — Room store and state machine (no sockets yet)

```ts
// src/server/rooms/room-store.ts
export type Room = { /* internal, never serialized to a client */ };
export function createRoomStore(deps: { clock: Clock; scheduler: Scheduler;
  selectLetter: LetterSelector; config: ServerConfig }): RoomStore;

export type RoomStore = {
  createRoom(displayName: string, socketId: string): { room: Room; resumeToken: string };
  joinRoom(roomCode: string, displayName: string, socketId: string): Result<...>;
  markClientReady(roomCode: string, socketId: string): Result<...>;
  applyDraft(input: DraftRequest, socketId: string): Result<DraftAck>;
  finish(roundId: string, socketId: string): Result<...>;
  closeRound(roundId: string, reason: "both_finished" | "deadline"): void; // idempotent
  projectRoomState(room: Room, slot: 1 | 2): RoomState;                    // per recipient
  cleanup(): void;
};
```

Implement `closeRound` in the order given in `Plan.md` §12: return early unless
this is the current open round; mark closed **first**; cancel the timer; lock
both drafts; normalize and validate; emit reveal; score; emit results.

Write this layer so it can be tested without Socket.IO — the socket layer only
translates events into these calls.

**Exit:** unit tests cover the full phase machine, idempotent close, and the
per-recipient projection containing no opponent draft.

## Step 6 — Socket layer

```ts
// src/server/socket/register-handlers.ts -> registerHandlers(io, store)
// src/server/index.ts -> createGameServer({ config, clock, scheduler, selectLetter })
```

Each handler: parse with the Zod schema → on failure ack `INVALID_PAYLOAD` and
return → resolve the player from the socket, never from the payload → check
phase and time → call the store → ack → emit the recipient-specific projections.
Serve `dist/client` statically with an SPA fallback, and expose `/healthz`.

**Exit:** `tests/integration/room-lifecycle.test.ts` and
`synchronized-start.test.ts` (E1) pass.

## Step 7 — Drafts, finish, close, score over the wire

**Exit:** `drafts-privacy.test.ts`, `close-and-score.test.ts` (E2) and
`rejections.test.ts` (E3) pass. `npm run verify` passes.

## Step 8 — Client

Build screens in this order, each rendering only parsed server projections:
`LobbyScreen` → `JoinScreen` → `WaitingScreen` → `CountdownScreen` →
`AnswerScreen` → `WaitingForOpponentScreen` → `ResultsScreen`.

```ts
// src/client/socket/game-socket.ts -> connect, typed emit-with-ack, typed subscriptions
// src/client/state/useGameState.ts -> one reducer over server events; no canonical logic
```

Client rules that are easy to get wrong:

- The countdown is presentation only. When it hits zero, show a locked state and
  wait for the server's reveal. Do not self-close the round.
- Debounce drafts at 300 ms, and send immediately on blur and on Finish.
- Disable inputs on an accepted finish ack, not optimistically.
- Show a pending / saved / rejected indicator for every draft.
- The opponent's answers must be absent from client state before reveal — not
  present and hidden by CSS.
- Leaving a room (the waiting screen's Leave game, the results sheet's way
  back) remounts `App` so the socket drops. Do not add a leave event
  (`Plan.md` §2B.10).

**Exit:** two browser profiles complete a full local round; `npm run verify` passes.

## Step 9 — Baseline capture

Before any polish or fixing: run the pre-written evals unchanged, save the real
output, screenshots, and the commit hash into `docs/EVIDENCE_003.md`. Tag or
copy the code state. Pick the first genuine defect you actually observed.

**Exit:** the baseline is reproducible from what is recorded, not from memory.

## Step 10 — One controlled change

Write claim, signal, hypothesis, smallest change, and verification *first*.
Change one variable. Re-run the identical evals. Record actual results and the
limitation. Do not edit the eval expectations after seeing the baseline.

## Step 11 — Harden, deploy, verify

Complete the failure matrix in `Plan.md` §13, deploy one instance to a
WebSocket-capable host, verify `/healthz`, SPA refresh, WSS upgrade, and a full
two-computer round. Capture evidence without exposing tokens or in-round answers.

## Week 4 — steps after the Week 3 build

Steps 0–11 above are the Week 3 build. All are done except Step 11's
deployment and two-computer round, which moved to W4-9 below. Week 4 work (`Plan.md` §2B) follows the
same working agreement, and its step list with results is `Plan.md` §2B.6.
Before starting a Week 4 step:

1. Read `Plan.md` §2B and the section for the feature you touch (2B.2 checker,
   2B.3 AI opponent, 2B.5 providers, 2B.8 hints, 2B.9 languages, 2B.10 leaving).
2. Write the eval first: a fake-AI integration case next to A1–A6 in
   `tests/integration/ai-round.test.ts` for game behavior, or a new expected
   verdict in `scripts/ai-smoke.ts` / `docs/AI_EVALS.md` for model behavior.
3. Every test uses the fakes in `tests/fakes/`; no test calls a real provider.

Remaining Week 4 steps, in order:

- **W4-7:** add keys and run `npm run smoke:ai` once per provider; record the
  agreement in `docs/AI_EVALS.md`. **Exit:** both rows in its run log filled.
- **W4-8:** one controlled change against that baseline, written first in
  `docs/EVIDENCE_004.md` §5. **Exit:** the same 16 cases re-run; A1–A6 pass.
- **W4-9:** deploy to Render (§2B.7), then play one round per mode, the
  friend round on two physical computers. Set `TRUST_PROXY_HOPS` for Render
  and confirm two visitors on different networks get separate AI limits
  (§2B.11). **Exit:** module 09's production checks, including one
  `verified: true` round.

The AI usage limit (§2B.11) was accepted and built on 2026-09-30.

## Week 5 — the round coach (bounded agentic feature)

**Approved 2026-10-07, specified, not built.** Do not start until the owner
asks. Design of record: `Plan.md` §2C and its decisions in §2C.16. The task
list is `specs/010-round-coach-agent/tasks.md`; it follows this order and
these exits. Before a Week 5 step:

1. Read `Plan.md` §2C, the spec and the contract for the part you touch
   (`specs/010-round-coach-agent/contracts/`: `coach-socket.md`,
   `model-step.md`, `tools.md`).
2. The evals are already written (`docs/AGENT_EVALS.md`, C1–C19). Write the
   test for the eval first and watch it fail; never change an expected result
   to match the code.
3. Every test uses fakes. Loop tests drive the **real gateway** through
   `tests/fakes/fake-adapter.ts` and `fakeTime`; wire tests use
   `tests/fakes/fake-ai.ts`. No test calls a provider.

Rules particular to the agent:

- The model's output is untrusted input. Only the actions in `TOOLS`
  (`src/server/agent/tools.ts`) and offered in the current step may run, each
  through its own argument schema and scope check. No generic
  `execute(name, args)`. A refused proposal never runs and never counts as a
  tool call.
- The application stops the run, never only the model: steps, tool calls,
  attempts and time come from `RUN_LIMITS` and are checked before every step.
- A suggestion shown to a player is copied from a passing tool result of the
  same run, never from the model's text.
- Read-only: no tool or code path of the coach may write answers, validity,
  points, phase or timers, or read the opponent's sheet.
- Adding a tool, a limit, an event or a field the contracts do not list is a
  scope change: record the owner's decision in `Plan.md` first.

| Step | Work | Exit |
| --- | --- | --- |
| W5-0 | Baseline `npm run verify`; W4-7 with the owner's keys (blocks W5-11 only) | `npm run verify` |
| W5-4 | Contracts: `coach.schemas.ts`, step envelope, event name, config key | `npm run typecheck && npx vitest run tests/unit/contracts.test.ts tests/unit/config.test.ts` |
| W5-5 | `agent/limits.ts`, `agent/tools.ts` (`check_candidates`) | `npx vitest run tests/unit/agent-tools.test.ts` |
| W5-6 | Gateway `maxAttempts`, `BUDGETS["coach-step"]`, prompt `coach-step.v1`, `AiService.coachStep`, fakes | `npm run typecheck && npx vitest run tests/unit/gateway.test.ts tests/unit/ai-features.test.ts` |
| W5-7 | `agent/coach-agent.ts`, `agent/run-log.ts`; mutation checks | `npx vitest run tests/unit/agent-tools.test.ts tests/unit/coach-agent.test.ts` |
| W5-8 | Room store (reveal snapshot, `requestCoach`), usage limits, socket handler | `npm test` |
| W5-9 | Client: `CoachPanel`, `requestCoach` with a 30 s ack timeout, SR/EN strings | `npm run verify` |
| W5-10 | Modules 05, 07, 12; `.env.example`; README; GAME_SPEC Amendment 8 status | `npm run verify` |
| W5-10a | O1 `verify_terms` (only once C1–C16 and C19 pass) | `npx vitest run tests/unit/coach-agent.test.ts && npm run verify` |
| W5-10b | O6 run details | `npm run verify` |
| W5-11 | `npm run smoke:coach`, once per provider; ≤ 15 live runs | run logs in `docs/EVIDENCE_005.md` |
| W5-12 | Evidence, security checklist, demo (≤ 3 live runs) | `npm run verify`; owner reviews the diff |

W5-1 to W5-3 (spec, plan, evals) were done as documents on 2026-10-07.

## Accessibility and UX floor (applies from Step 8)

Not decoration — these are acceptance criteria:

- Every input has a real `<label>`; placeholders are not labels.
- The countdown and phase changes are announced via `aria-live="polite"`.
- Visible keyboard focus everywhere; the form is completable without a mouse.
- Errors appear as text next to the relevant control, not only as a toast.
- Text contrast at least 4.5:1; never colour alone to convey valid/invalid.
- Works at 1280×720 and at a 360 px-wide viewport without horizontal scrolling.
- Category labels come from `CATEGORY_LABELS` for the current language, and
  every other string from `src/client/strings.ts` in both Serbian and English;
  no hard-coded strings scattered through components.

## Definition of done for every step

- [ ] Behavior matches `GAME_SPEC.md` and `Plan.md`; nothing extra was added.
- [ ] New logic lives in the layer that owns it (module 01).
- [ ] Boundary data was parsed with a schema from `src/contracts`, not cast.
- [ ] A success test **and** a rejection/edge test were added.
- [ ] `npm run verify` passed, with output reported.
- [ ] No secret, token, `.env`, or pre-reveal answer is in source, logs, or docs.
- [ ] Known limitations were stated plainly.
