# W05 coach — consumers, before/after matrix and decision record

**Reviewed:** 2026-10-07, read-only source inspection before specification edits.
**Base:** Anja's `origin/main`, fetched this session, `4dea3b59e35c5dc89a09776cea43bb5e8487ad5e`.
**Branch:** `010-post-round-coach`, local only, no upstream configured.
**Status:** Proposed implementation boundaries; owner review required before code/contracts/quota changes.

## Producer and consumer inventory

| Producer / current shape | Consumers and expected shape | Proposed change / preservation |
| --- | --- | --- |
| `room-store.ts` `completeRound`: creates `RoundRevealed` with both category sheets and `RoundResults` with scores, totals, verified/botFailed | `Delivery` union; socket server delivery wiring; client socket subscribers; reducer `revealed`/`results`; `PlayerApp`; `ResultsScreen`; room/privacy/score/AI integration tests | Capture a detached completed-result source from these exact computed values. Existing events, payloads, scores and one-time delivery count remain unchanged |
| Internal `Round` / `Room`, including `revealed`, `resultsAt`, players' locked answers | scheduling, `closeRound`, `completeRound`, projections, disconnect, cleanup, store tests and test helpers | Add bounded completed-source/coach bookkeeping in the owning server layer. No source before canonical completion, no recomputation, no expansion of public room projections |
| `getRoomBySocket`, current socket binding / active round | existing handlers and room-store operations | Resolve coach ownership here; no caller-selected player or bypass based on a shareable room code |
| `socket.schemas.ts` strict requests, event constants and existing `Ack<T>` | `register-handlers.ts`, `game-socket.ts`, `PlayerApp`, reducer, contracts/socket/client tests | Add isolated `round:coach` request/ack and coach schemas; no change to legacy event shape. All new boundary types inferred once from schemas |
| `errors.ts` closed game-error registry / localized code lookup | server `fail`, handlers, `strings.ts`, socket client, UI tests | Reuse existing admission error codes. Define closed coach terminal reasons separately; add their safe SR/EN presentation without changing existing meanings |
| `game.schemas.ts` categories, letters/alphabet, validity and score enums, server config | domain normalization/validation/scoring, room creation/letter selector, prompts/features, clients, config/store/integration tests | Reuse exact enums; add only separate coach allowance config if approved. No new category/letter/score/reject vocabulary |
| `AiService` in `service.ts`: checkRound, botAnswers, hint; failure-as-value methods | `room-store.ts`, `countedAi`, `index.ts`, `tests/fakes/fake-ai.ts`, `tests/helpers/test-server.ts`, AI-feature/integration tests, `scripts/ai-smoke.ts` | Add a separate narrow coach step capability through the same service module, preferably a sibling interface so legacy fakes need no new mandatory method. No SDK calls in orchestrator; choose exact shape in SpecKit plan |
| `AiOperation` union (`check-round`, `hint`, `bot-answers`) | typed `BUDGETS` record, feature requests, gateway, telemetry and debug records/tests | Proposed additive coach operation; update exhaustive records and tests together. Preserve old budgets and prompt IDs |
| `gateway.generate` / `AiRequest`: per-interaction budget, parse/schema/semantic validator, optional abort; `AiResult`: attempt records, usage | check-round/hint/bot feature services, `AiService`, gateway/retry/provider-health/fallback tests | Add optional W05 run attempt/deadline guard at the actual adapter-call boundary; old calls retain defaults. Current usage reports successful attempt only, so coach needs attempt-level available usage aggregation, not invented totals |
| Provider adapters / `ModelCall`, configured model chain, classification and model health | gateway, routing adapter, provider tests and smoke script | Reuse wire handling/configured allowlist; do not add SDK/dependency or hardcode new model specs. Guard retries/fallback inside the same run budget |
| `UsageLimits`: `LimitedAction` = aiRoom/hint; config hourly counts; `countCall` increments daily logical operations | room `countedAi`, hint/AI-room admission, `index.ts`, config loader, `usage-limits`/config/AI-limits tests | Add separate coach per-visitor count and atomic physical-attempt admission against shared daily count. Keep W04 counting and checker exception unchanged; document mixed units honestly |
| `GameState`/reducer and `PlayerApp` lifecycle | screen selection, result props, socket listeners, client tests | Keep coach presentation separate from game phase. Guard run/round identity, reset on remount/new room, ignore late results |
| `game-socket.ts` generic ack parser/timeouts and disconnect | all client actions and subscription tests | New coach-specific 32 s ack timeout with strict response parsing; preserve every old request timeout and ack type |
| `strings.ts` / i18n labels in sr/en | every screen/error lookup; client render tests | Add closed coach fact/recommendation/reason wording in both dictionaries. Alphabet stays server-owned; language switch re-renders codes without AI |
| `markDisconnected`, room cleanup TTL, timers | server handlers, store tests, lifecycle integration tests | Cancel pending own runs, remove run/source/cache on room removal; no new midgame leave, reconnect or rematch behavior |
| Required docs, Spec Kit feature pointer and agent entry files | human reviewers, `/speckit-plan`, `/speckit-tasks`, future coding sessions | Point at feature 010, preserve historical W03/W04 evidence, mark feature as specified rather than implemented |

Search basis: `rg` across `src`, `tests`, `scripts` for `AiService`, `AiOperation`, `BUDGETS`, `LimitedAction`, `UsageLimitsConfig`, `CLIENT_EVENTS`, `SERVER_EVENTS`, `roundRevealed`, `roundResults`, `countedAi` and lifecycle functions. Re-run the searches in planning and immediately before changing shared producer shapes; this inventory records the inspected base, not a guarantee that future commits have no new consumer.

## Before / after surface × case matrix

| Surface × case | Current behavior | Proposed W05 behavior |
| --- | --- | --- |
| Friend/random/AI match × final results | One reveal/result; caller sees both sheets | Same reveal/result plus optional private coach for either human |
| Any match × answering/judging | Coaching absent; drafts private | Early coaching rejected with zero provider/tool work; drafts still absent |
| Server source × AI verdict differs from local rule | Final result constructed and emitted; no standalone result snapshot | Add immutable source from exact final values; never recompute from local validity |
| Human seat 1/2 × ownership | Server socket mapping owns identity | Same binding owns coach source/output; payload cannot select seat |
| Opponent × requested analysis | No coaching | No analysis request/status/result sent to opponent and no opponent answer sent to model |
| SR interface × SR/EN alphabet | Localized UI, server-owned alphabet | Same rules plus Serbian coach wording from checked facts |
| EN interface × SR/EN alphabet | Localized UI, server-owned alphabet | Same rules plus English coach wording from the same checked facts |
| UI language switch × finished coach | Not applicable | Re-render without new run/provider call |
| Verified × rejected term/category | Original AI checker reason and points displayed | Attribute the same recorded reason; no independent rejudgment or stronger assertion |
| Unverified × locally accepted answer | Marked unverified, local rule only | Qualified low-confidence review; no claim of real term/correct category |
| Accepted duplicate × five points | Valid same-answer score | Optional variation advice; never label incorrect |
| Blank/hinted × category | Blank may score zero; hint is marked without penalty | Report observation, not psychological cause or invented penalty |
| No key/provider failure × optional feature | Game continues with existing fallback | Game unchanged; coach unavailable/safely failed, no guessed review |
| Double click/terminal failure × same seat/round | No coaching | Reuse one run, no extra spend, no rerun in same round |
| Leave/TTL × active analysis | Existing disconnect/cleanup | Cancel coach, discard late result, remove bounded source/cache |
| W04 quota × daily count | One count per service operation; retries not individually counted | Preserve existing unit/priority; every actual W05 attempt adds one count with an atomic budget check |
| Coach quota × hourly admission | None | Separate five-run visitor limit; duplicate/preflight rejected requests do not charge |
| Gateway × legacy operation | Existing per-interaction retry/fallback budgets | Unchanged legacy defaults; coach shares stricter run-wide guard |
| Storage/dependencies/deployment | In-memory rooms, existing stack | In-memory bounded coach metadata; no DB, package, service or deployment |

## Decisions and pressure test

1. **One-round scope.** No history producer exists after accounts were removed. Adding persistent history would expand storage/privacy scope; excluded.
2. **Exact final source.** The current code does not retain canonical validity/scoring objects. Reusing only locked answers would silently turn AI-checked results into local-rule results. Capture the original computed facts instead; test both verified and fallback cases.
3. **Controlled rendering.** JSON plus evidence IDs cannot prove arbitrary narrative true. Let the model choose eligible advice and findings; approved wording renders checked facts. Cost: less conversational variety; benefit: enforceable semantic checks in both languages.
4. **Separate optional analysis.** An agent in `closeRound` could multiply latency/calls and break exactly-once results. Coach runs only after results, outside that path.
5. **Small quota extension.** A global conversion from W04 logical calls to physical attempts would change existing behavior and tests. Preserve it; count W05 attempts correctly against the shared counter and report the mixed-unit limitation. Checker priority stays intact, so the existing daily setting is not a hard cap on all game-provider requests.
6. **Retry limitation.** Gateway fallback can traverse multiple models; wrapping it twice cannot guarantee a three-attempt run. Place a W05 guard before actual adapter calls, keep old defaults and test the legacy path.
7. **One run per seat/round.** This prevents duplicate spend and races. Cost: a transient terminal failure cannot be retried in the same round. The UI must explain this; a new round gets a new allowance.
8. **Minimal optional scope.** Reuse controlled cross-provider fallback and add evidence-quality evaluation; no dynamic plan, second tool, write approval, special observability dashboard or candidate revision feature.

## Readiness / next phase

The owner authorized specifying this solution and the local feature branch. This pass records proposed contract, permission and usage changes but implements none. Next: `/speckit-plan` for research, data model, exact contracts and tasks, then owner approval before runtime work under the owner's API/auth/multi-consumer planning rule.

Preserve the branch base and existing tests. At final implementation handoff, update GAME_SPEC as a clearly labeled W05 amendment, README user flow, `.github` contract/security maps, context manifest and evidence with actual behavior. No need to rewrite historical W03/W04 records during specification.
