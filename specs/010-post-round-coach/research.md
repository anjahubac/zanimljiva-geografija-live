# Research: Bounded post-round AI coach

**Date:** 2026-10-07\
**Status:** Planning only. No runtime implementation or feature tests are claimed.

## Decisions

### R1. Preserve a detached source from the canonical completion computation

`closeRound` locks the round and `completeRound` computes validity, checker reasons, points, totals, verification and constructs `round:revealed`/`round:results`. It does not retain those final facts. Reusing locked raw answers later and re-running local validity would erase the checker verdict and could misrepresent scoring. Construct a bounded, detached, own-seat coach source only after exact checked/validated canonical reveal/results data has been constructed from final score computation. Room phase/results time may be set before result delivery completes, so admission requires explicit snapshot-ready state. Do not change reveal/result payloads or call checker/scorer again. Include the exact round letter; eight records with category, blank, accepted, recorded reject reason or null, hinted, points and scoring reason; alphabet, verified status and own total. Keep internal identity metadata separate from provider/tool projection. Omit raw/normalized answers and opponent/identity/transport data.

### R2. Run coaching after results through a private request/ack

Add one strict `round:coach` request `{ roundId, goalId: "review_round", language }` and a terminal async acknowledgement. The socket handler derives the bound human seat and current room/round from server state, verifies results are complete and source ownership is exact, then invokes the coach orchestrator. Do not broadcast coach state or create progress/cancel events. Client acknowledgement timeout is coach-only at 32 seconds; the legacy `emitAck` helper and other operations have no timeout today and remain unchanged.

### R3. Use one fixed goal, one read-only allowlisted tool and two decisions

The first model decision may propose only `analyze_round` and strict arguments with focus `overview | blank_categories | rejected_answers`. The backend binds the selected user's source and validates the tool allowlist and arguments before execution. The deterministic tool computes category/round totals and ten evidence records (eight category records, totals and verification), plus eligible practice recommendations. It receives no caller-controlled source selector. The second model decision selects 1–3 finding IDs and 1–2 eligible recommendation tuples. Backend validation checks every selection against the tool evidence and domain eligibility. Application dictionaries render the final factual summary and advice in Serbian or English; model prose and geography examples are not rendered.

### R4. Distinguish unknown tools from malformed requests

The proposal envelope must be parsed before allowlist lookup; an unknown but structurally valid name produces the `unknown_tool` stop reason, while malformed JSON/schema or bad arguments remain distinct. Every rejected proposal executes zero tools. Tool output must pass strict schema, source-version, factual consistency and 16 KB checks before the second model call.

### R5. Bound actual provider attempts over the full run

Use a coach-only controller around every adapter call because the current gateway's retry loop can traverse multiple models, and wrapping two logical interactions alone cannot enforce three total physical attempts. The run has two logical model steps, one executed tool, at most three actual provider attempts overall, at most two attempts per step, at most one recovery and one configured cross-provider fallback, an 8-second per-attempt timeout, and a 30-second shared deadline including waits and validation. Start no call without an atomic quota check/charge; use both abort signals and an independent timer, and ignore late results. Preserve existing gateway budgets and behavior for `check-round`, `hint`, and `bot-answers`.

### R6. Add a narrow coach capability without expanding the legacy AiService fake contract

Existing `AiService` is consumed by `room-store.ts`, `src/server/index.ts`/`createGameServer`, `tests/helpers/test-server.ts`, `tests/fakes/fake-ai.ts`, and unit/integration tests. Adding a required method to `AiService` would force every legacy fake and injected service to change. Define a sibling optional coach capability/dependency threaded through existing server construction and room-store deps, with helpers/fakes updated explicitly; do not make it a new mandatory member of legacy `AiService`. Provide a scriptable fake that exercises the real coach engine/tool/validators. Preserve existing methods and legacy fake behavior.

### R7. Extend shared usage accounting additively and preserve its mixed-unit semantics

`usage-limits.ts` currently checks daily budget and charges the per-visitor hourly action, while `countedAi` in `room-store.ts` counts one per service operation; provider retries are not individually counted. Do not globally redefine W04 units or change checker priority. Add an atomic operation for W05 that checks and charges each actual physical coach attempt against the same shared daily counter; keep hourly run admission separate at five admitted coach runs per visitor per hour. Charge the run once when accepted work starts, not for malformed/duplicate/preflight-denied requests. Treat a coach run as one-use per human seat/round, caching terminal outcomes (including failure) until round/room cleanup. Record the mixed daily counter units explicitly: W04 service operations plus W05 actual coach attempts. Do not claim the counter is a hard cap on every physical W04 provider call.

### R8. Collect only usage actually returned by adapters

Gateway telemetry currently attaches usage only when the whole interaction succeeds with valid structured output; malformed successful responses lose available usage, while transport errors do not expose usage in the current adapter contract. For coach, accumulate returned input/output/total token fields across every actual attempt, including invalid structured output, and leave missing values unknown. Do not infer transport-error token usage or convert unknown to zero. Keep raw debug logging disabled for coach. Bound generation to <=1,024 output tokens and reject decoded model text >8,192 bytes before JSON parsing. Existing operation telemetry semantics remain unchanged unless a compatibility-safe additive extension is required.

### R9. Keep terminal failures safe and preserve canonical game behavior

Admission errors use existing stable game error codes where applicable. Run terminal status/reasons use the closed table in `docs/AGENT_FLOW.md` and final/result fields use `docs/TOOL_CONTRACTS.md`; do not create alternate names or shapes here. No error may change game result, score, reveal count, hint penalty, or opponent projection. Existing disconnect and room TTL paths cancel active work and release source/cache. No-key configuration fails closed for coaching; production must retain quota guard.

### R10. Do not alter other products of the gateway or add infrastructure

No dependencies, database, history/account system, service, new scoring, model-authored free prose, second tool, browser/network/filesystem capability, deploy, or live call in unit tests. Legacy request acknowledgement behavior is unchanged. Existing W04 behavior remains the regression baseline.

## Consumer and compatibility notes

The canonical impact inventory is [impact-analysis.md](impact-analysis.md). Before editing a shared producer, re-run its recorded `rg` search and update consumers together. Primary consumers include `completeRound` and store lifecycle; strict socket event schemas, event map, handler and client adapter/reducer/results screen/i18n; `AiOperation` consumers `BUDGETS`, `retry-policy`, gateway telemetry/debug and tests; `UsageLimits` and `countedAi`; fake service construction and shared server test helper; room cleanup/disconnect; and security/workflow docs. Coach timeout applies only to the new client operation, not generic acknowledgements.

## W04 baseline result

Initial attempts exposed setup issues: PowerShell rejected `npm.ps1`, install via default cache failed with `EPERM`, and sandboxed Vitest/esbuild could not read a parent directory. With exact lockfile packages installed via workspace-local npm cache and approved network access, `npm.cmd run verify` passed: typecheck and lint clean; Vitest **490 tests across 30 files passed**; Vite client build and tsup server build succeeded. This is the actual pre-runtime W04 baseline. Live provider readiness remains separately pending; no credential values were read or printed.
