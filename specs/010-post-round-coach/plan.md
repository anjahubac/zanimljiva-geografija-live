# Implementation Plan: Bounded post-round AI coach

**Branch**: `010-post-round-coach` | **Date**: 2026-10-07 | **Spec**: [spec.md](spec.md)

## Summary

Add an optional, private coach after a human's round reaches canonical results. It reviews only detached structured facts from that human's completed score, uses exactly two model decisions and one deterministic read-only `analyze_round` tool, and returns controlled Serbian/English text only after application validation. The existing game result, scoring, checker and provider operation behavior remain authoritative and unchanged.

## Technical Context

**Language/Version**: TypeScript, Node >=22.13, browser React/Vite.\
**Primary Dependencies**: Existing Node, Socket.IO, React, Zod and provider-neutral AI gateway; no added package.\
**Storage**: Bounded in-memory source/run/cache inside existing room lifecycle; no database.\
**Testing**: Vitest unit/integration tests, scripted fake provider and real local Socket.IO integration; existing `npm run verify`.\
**Target Platform**: Existing same-origin browser client and single Node server.\
**Project Type**: Client/server web app.\
**Performance Goals**: One shared 30 s run deadline, <=8 s per provider attempt, <=250 ms tool computation, <=16 KB validated tool result; coach-only client ack timeout 32 s.\
**Constraints**: 2 model decisions, 1 actual tool execution, <=3 total provider attempts, <=2 per step, <=1 recovery and <=1 configured model/provider fallback; five admitted runs per trusted visitor/hour; shared daily counter checks and charges each physical coach attempt. Raw/normalized answers and opponent/identity/credential data are forbidden from coach context. Legacy gateway defaults and legacy ack behavior remain unchanged.\
**Scale/Scope**: One in-memory active room/round and one run per human seat; optional results-screen action in all three existing game modes.

## Constitution Check

- Server authority and socket-bound identity: PASS by design; all caller claims are strict-parsed and ignored for ownership.
- Hidden-answer privacy: PASS by design; own structured flags/reasons/points only, private terminal ack, no broadcast.
- Canonical single close and scoring: PASS by design; snapshot derives from the exact final computation and does not re-run validity/scoring.
- No new service/dependency/storage or out-of-scope tool: PASS.
- Consumer mapping and before/after matrix: PASS in [impact-analysis.md](impact-analysis.md); re-run inventory before shared producer edits.
- Test-first/fake-first and truthful evidence: PASS as planned; actual W04 baseline is recorded in `research.md` and `docs/EVIDENCE_W05.md`.
- Authorization: the user explicitly authorized implementation of the already approved spec, flow, tool contract and impact design. Root reviews plan consistency before runtime edits; ask the owner only if implementation would change approved behavior, limits, data flow, identity/source authority or quota semantics.

## Architecture and implementation order

1. Keep canonical `spec.md`, assignment-coverage checklist, impact inventory and `Plan.md` authoritative. Resolve this plan/research/contracts/tasks as a coherent design, then obtain root review before runtime work.
2. W04 baseline is captured with installed lockfile dependencies; exact result is preserved in `research.md` and `docs/EVIDENCE_W05.md`.
3. Add coach request/result schemas in `src/contracts/coach.schemas.ts` and client event mapping in `src/contracts/socket.schemas.ts`. `contracts/coach-contract.md` indexes the canonical `docs/TOOL_CONTRACTS.md`; it must not redefine its run view or result shape. Do not add progress, cancellation, or broadcast events.
4. Add immutable detached own-seat source in `src/server/rooms/room-store.ts` only after canonical `RoundRevealed` and `RoundResults` values are constructed from exact computed facts. Require explicit snapshot-ready state because room phase/results time may precede result construction/delivery. Never call checker/scorer again.
5. Add pure `analyze_round` tool and closed recommendation/fact dictionaries; validate schema, all ten evidence records, consistency, source version and byte bound.
6. Add a sibling coach capability in `src/server/ai/service.ts` and thread it through `src/server/index.ts`/`createGameServer` to `src/server/rooms/room-store.ts`; update `tests/helpers/test-server.ts` and coach-only fake wiring. Do not require a new method from legacy `AiService` or alter `tests/fakes/fake-ai.ts` semantics. Extend `src/server/ai/types.ts`, `retry-policy.ts`, `gateway.ts`, `config.ts`, `src/contracts/game.schemas.ts` and `.env.example` only for approved coach operation/attempt settings. Put a run-wide guard at physical adapter attempt boundary, preserving W04 budgets. Limit each model output to 1,024 tokens and reject decoded text >8,192 UTF-8 bytes before parse. Accumulate only adapter-returned usage per physical attempt (including malformed structured output); absent usage stays unknown. Disable raw debug logging for coach.
7. Add atomic check/charge per actual coach attempt to `src/server/usage-limits.ts`; preserve W04 logical service-operation counts and checker priority. Add hourly admission, per-human/round one-run cache, terminal reuse and disconnect/cleanup lifecycle in `src/server/rooms/room-store.ts`.
8. Add authorization and private terminal ack in `src/server/socket/register-handlers.ts`; wire `src/client/socket/game-socket.ts`, `src/client/state/useGameState.ts`, `src/client/App.tsx`, `src/client/screens/ResultsScreen.tsx`, `src/client/strings.ts` and `src/client/i18n.tsx`. Add strict ack parsing and coach-only 32 s timeout. Language changes re-render locally without a new run.
9. Implement C01–C31 with fake-driven/unit/socket tests plus `scripts/coach-fake-e2e.ts` against the real engine/tool/validators and a scripted model/transport. Run targeted tests and `npm.cmd run verify`, then local browser verification. Add explicit opt-in `scripts/coach-smoke.ts`; only execute after fake/full tests and a presence-only credential check, with synthetic fixtures and sanitized evidence. No public mock endpoint or production bypass.
10. Update required documentation, readiness and evidence in the same implementation pass; keep runtime completion checkboxes unchecked until evidence exists.

## Consumer inventory reference

See [impact-analysis.md](impact-analysis.md) for the complete producer/consumer list and before/after surface matrix. Key areas: canonical close/result construction and lifecycle cleanup; `AiService` and its callsites/fakes/helpers; `AiOperation` consumers in retry budgets, telemetry and debug log; `UsageLimits` and the `countedAi` wrapper; socket schemas/event map/handler; client ack adapter/reducer/results UI/i18n; tests and W05 artifacts. Existing generic ack behavior has no timeout and is not to be changed.

## Project Structure

```text
src/contracts/                 coach + socket strict schemas and inferred types
src/server/features/analyze-round.ts deterministic tool/evidence facts
src/server/features/post-round-coach.ts orchestrator and final validation
src/server/ai/                 coach-only operation, attempt guard and usage trace
src/server/rooms/room-store.ts canonical source, per-human run and cleanup lifecycle
src/server/socket/              request authorization and private terminal ack
src/client/socket/              coach-only bounded ack adapter
src/client/state/               loading/terminal coach state
src/client/screens/ResultsScreen.tsx results action and rendered controlled review
src/client/strings.ts           SR/EN closed dictionaries
src/client/i18n.tsx              language context
src/client/App.tsx              results action wiring
tests/unit/                       validators, tool, engine, limits, lifecycle
tests/integration/                real socket privacy, authorization, races and regression
scripts/                          private fake end-to-end and explicit live smoke scripts
specs/010-post-round-coach/      plan, research, model, contracts, quickstart, tasks
docs/                           evals, evidence and usage trail
```

**Structure Decision**: Extend the existing single repository across its established contracts/domain/server/client/tests layers. Actual UI entry points are `src/client/App.tsx`, `src/client/screens/ResultsScreen.tsx`, `src/client/strings.ts` and `src/client/i18n.tsx`. No new project or service.

## Risk controls and release gates

- A forged request cannot select room/seat/source; handler uses socket-bound identity and current completed room.
- Result payload remains canonical; coach data is private and detached.
- Physical call guard must be inside/below gateway attempt loop, not just around logical service calls.
- Usage telemetry distinguishes logical steps from actual attempts; account only tokens returned by adapters and preserve unknown values.
- Failed/terminal run is cached for that seat/round to prevent repeated spend.
- Existing quotas are in-memory and mixed-unit by design; W04 counts are logical service operations and W05 adds physical attempts. Do not describe the setting as a strict global physical-call cap.
- Do not demo live until W04 baseline, fake matrix, full regression and opt-in controls are verified.

## Complexity Tracking

No constitution violation, additional dependency, project, persistence layer, or service is proposed. The attempt-level guard and atomic shared quota path are the smallest mechanisms that satisfy the approved strict W05 attempt bound while retaining W04 retry semantics.
