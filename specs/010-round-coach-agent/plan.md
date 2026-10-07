# Implementation Plan: Round coach (_Trener partije_)

**Branch**: `feature/round-coach` | **Date**: 2026-10-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/010-round-coach-agent/spec.md`. Decisions of record: `Plan.md` §2C.17 (current design) and §2C.16 (owner's decisions, 2026-10-07).

**Status**: Built on `feature/round-coach`, through `coach-step.v6`. Core, O1, O6, backup candidates and one bounded repair are implemented. Remaining submission work is tracked in `tasks.md`.

## Summary

After a round's results, a human player sends `round:coach` with goal
`fill_gaps`, a focus list of their 0-point categories and their language. The
server runs a **bounded agent loop**: each model step goes through the existing
W04 gateway (Gemini ⇄ Groq, retries, telemetry) as one structured-JSON call,
and returns either a tool proposal or a final answer. The application validates
every proposal against an explicit **allowlist** and strict argument schemas,
runs the one Core tool, `check_candidates` (the game's own pure letter rule),
validates its result, and feeds it back. The run stops on a valid final or on
an application-owned limit: 3 model steps, 2 tool calls, 2 provider attempts
per step and 5 per run, 25 s. The final must cite passing evidence for every
suggestion, or it is rejected whole. The player gets a caller-only report:
completed, incomplete (evidence-only) or failed. Points never change. O1 (`verify_terms`) and O6 (run details) are built.
Before display, an application-owned referee check validates unjudged words,
with one backup per category. A valid final may then get one repair step for
still-empty categories: in all at most 4 steps, 3 tool executions, 7 attempts
and 35 s. Only referee-accepted words are displayed, in the referee's
spelling; the client writes the summary. Design history is in [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript (strict), Node 22 — unchanged (module 11)

**Primary Dependencies**: Socket.IO, Zod, React/Vite — unchanged; **no new dependency**. The AI goes through the existing `fetch`-based Gemini and Groq adapters.

**Storage**: N/A. The report lives in memory with the finished room (`COMPLETED_ROOM_TTL_MS`, 5 min), like everything else.

**Testing**: Vitest. The orchestrator is tested with the **real gateway**, `tests/fakes/fake-adapter.ts` (scripted text, provider errors, `"hang"`) and `fakeTime`, so retries, fallbacks and timeouts are real code paths. The room store and socket are tested with `tests/fakes/fake-ai.ts`, extended with `coachStep`, and real Socket.IO clients with an injected clock and scheduler (module 13). No test calls a provider.

**Target Platform**: the one Node service (unchanged)

**Project Type**: web application, single service (`src/server`, `src/client`, shared `src/contracts`, pure `src/domain`)

**Performance Goals**: main loop and check within 25 s; optional repair within 35 s from original start; client acknowledgement timeout 45 s. Provider-attempt counts include every referee call. The tool is constant-time per candidate.

**Constraints**: read-only after reveal (FR-024); caller-only (FR-025); the model is never an authority (allowlist, schemas, evidence); budgets are explicit constants with tests; one gateway change, backward compatible (optional `maxAttempts`).

**Scale/Scope**: one new client event, no new server event, no new error code, one new config key (`COACH_RUNS_PER_VISITOR_HOUR`), one new npm script (`smoke:coach`, no dependency). About 8 new source files, about 15 touched, 4 new test files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
| --- | --- | --- |
| I. Server authority | The loop, the tools and the AI calls run on the server only. The player is resolved from the socket, never from the payload. The model proposes; the allowlist, argument schemas and final-evidence check decide. Points, validity and phase are never written. | Pass |
| II. Fair synchronized start | Untouched: coaching is possible only in phase `results`, after the round. | Pass |
| III. Hidden answers | Coaching starts only after `round:revealed`. The model gets only the caller's own answers; the opponent's sheet is never read by a tool or put in a prompt (FR-007, C14). The report is an ack to the caller only. | Pass |
| IV. Close exactly once | `closeRound`/`completeRound` gain one line: keeping the already-parsed reveal on the round as a read-only snapshot. No new path to reveal or score; A1–A6 must still pass. | Pass |
| V. Locked scope | Owner's decision recorded in `Plan.md` §2C.16 before this plan: the event `round:coach`, the config key, O1 and O6. No dependency, service, database or new error code. | Pass |
| VI. Evidence, not claims | Evals C1–C19 pre-registered in `docs/AGENT_EVALS.md` before any code; mutation checks recorded; six v1 smoke runs logged in `docs/EVIDENCE_005.md`. Development/demo bounds are ≤ 15/3; full browser-inclusive accounting remains open in T066. | Pass |

Post-design re-check (after Phase 1): unchanged. The design adds one request
schema, one ack schema, one model-step schema, a tool registry and an
orchestrator; nothing in the reveal or scoring path changes behaviour.

## Project Structure

### Documentation (this feature)

```text
specs/010-round-coach-agent/
├── spec.md                    # what and why
├── plan.md                    # this file
├── research.md                # Phase 0: decisions R1–R17
├── data-model.md              # Phase 1: run, step, evidence, report
├── quickstart.md              # Phase 1: how to validate
├── contracts/
│   ├── coach-socket.md        # round:coach request and ack
│   ├── model-step.md          # what the model gets and must return, per step
│   └── tools.md               # TOOL_CONTRACTS (W05 §37) for both tools
├── checklists/requirements.md
└── tasks.md                   # /speckit-tasks

docs/AGENT_FLOW.md             # diagram and stop conditions (W05 §36)
docs/AGENT_EVALS.md            # original C1–C19, approved amendments, C20–C22 and live checks
docs/EVIDENCE_005.md           # Week 5 evidence (W05 §39)
```

### Source Code (repository root)

```text
# New
src/contracts/coach.schemas.ts       # round:coach request, report (ack), stop reasons, run details (O6)
src/server/agent/limits.ts           # RUN_LIMITS: steps, tool calls, attempts, deadline, candidates
src/server/agent/tools.ts            # TOOLS allowlist; check_candidates; verify_terms (O1); arg + result validation
src/server/agent/coach-agent.ts      # the orchestrator: allowed actions per step, stop rules, final check, report
src/server/agent/run-log.ts          # the agent.run record (typed fields only) and its sink
src/server/prompts/coach-step.v6.ts  # current system instruction + bounded JSON content builder
src/client/screens/CoachPanel.tsx    # focus checkboxes, status, report, details (O6)
scripts/coach-smoke.ts               # limited live run on a fixed Lj round (npm run smoke:coach)

# Changed
src/contracts/ai-output.schemas.ts   # coach step envelope: zod + JSON schema sent to the provider
src/contracts/socket.schemas.ts      # CLIENT_EVENTS.coach = "round:coach"
src/contracts/game.schemas.ts        # serverConfigSchema.coachRunsPerVisitorHour (default 6)
src/server/config.ts                 # COACH_RUNS_PER_VISITOR_HOUR
src/server/ai/types.ts               # AiOperation += "coach-step"; RetryBudget.maxAttempts?
src/server/ai/gateway.ts             # honour maxAttempts (absent = unchanged)
src/server/ai/retry-policy.ts        # BUDGETS["coach-step"]
src/server/ai/service.ts             # coachStep(); verifyTerms() for O1
src/server/features/check-round.ts   # O1 only: optional budget and signal for runCheck
src/server/usage-limits.ts           # LimitedAction += "coach"
src/server/rooms/room-store.ts       # reveal snapshot on the round; player.coach; requestCoach; abort on leave/reap; countedAi.coachStep
src/server/socket/register-handlers.ts # round:coach handler (same handle() wrapper as round:hint)
src/client/socket/game-socket.ts     # requestCoach with a 45 s ack timeout
src/client/screens/ResultsScreen.tsx # mounts CoachPanel
src/client/strings.ts                # SR/EN strings and stop-reason texts
src/client/app.css                   # panel styles
.env.example, package.json (script only), README.md, docs/GAME_SPEC.md, .github modules 05/07/12

# Tests
tests/unit/agent-tools.test.ts       # check_candidates, args, scope, repeats, result validation (C5, C6)
tests/unit/coach-agent.test.ts       # loop with real gateway + fake adapter + fakeTime (C1, C2, C4–C13, C16, C17, C19–C22)
tests/unit/gateway.test.ts           # + maxAttempts cases; existing cases unchanged
tests/unit/contracts.test.ts         # + coach request/report/envelope valid and invalid
tests/integration/coach.test.ts      # over the wire: C3, C14, C15, single-flight, abort
tests/unit/client-coach.test.ts      # render: statuses, report, details (C18), no reasoning shown
tests/fakes/fake-ai.ts               # + coachStep / verifyTerms scripting
```

**Structure Decision**: the existing single-service layout. The agent is a
server module (`src/server/agent/`) beside `src/server/features/`, because it
orchestrates several AI calls and a tool rather than making one call. It
depends on `AiService` only (never on an adapter), and the room store depends
on the agent the way it depends on `AiService`, so tests inject fakes at either
level.

## Delivery order

`Plan.md` §2C.10 is the step list (W5-4 → W5-12, with O1 and O6 as W5-10a and
W5-10b, §2C.16). `tasks.md` breaks each step into tasks with exit commands.
Steps W5-4 to W5-10b use fakes only and need no key; W5-11 (live) needs W4-7
done first. W4-7 and six v1 coaching runs are recorded. W5-12 now aligns the
current documents, rechecks specification/task coverage, records verification
and prepares the demo. Current-version live runs and actual pair rehearsal
remain separate evidence gates. See `docs/EVIDENCE_005.md` for observed results.

## Complexity Tracking

No design conflicts with the constitution. Final submission evidence still
requires browser-run accounting and actual pair contributions/rehearsal.

| Addition | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Optional `maxAttempts` in the gateway | W05 requires a per-run call budget; the gateway bounds attempts only per model and by time | Wrapping the adapter would report fake failures to model health; shortening the chain would skip healthy fallbacks (research R5) |
| A new `src/server/agent/` folder | The loop is neither one feature call nor room logic | Putting it in the room store would mix a multi-step AI loop into the state machine that guards rules 1–4 |
