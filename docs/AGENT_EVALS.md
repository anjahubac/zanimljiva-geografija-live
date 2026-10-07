# W05 Agent Evals — post-round coach

**Written:** 2026-10-07, before implementation.
**Status (2026-10-07):** Full automated verification passed (555 tests across 40 files). The mapping below records executed automated coverage and its limits; live-provider, interactive browser and pair gates remain PENDING in [EVIDENCE_W05](EVIDENCE_W05.md).
**Sources:** [Spec](../specs/010-post-round-coach/spec.md), [flow](AGENT_FLOW.md), [contracts](TOOL_CONTRACTS.md).

## Fixture and fake discipline

Use synthetic completed-round snapshots with all eight categories and declared expected observations. Never rely on a live geography model for deterministic tests. Preserve existing scoring/AI evals unchanged in intent.

The fake model/transport must script tool proposals, unknown tools, malformed names/args/JSON, premature finals, refusal, final choices, provider throws/hangs, repeat/different proposals and late results. Record actual call counts and received bounded context. Inject clock/scheduler/random as the existing test recipes require; real Socket.IO integration tests do not use global fake timers.

Every case checks relevant counts, exactly one terminal outcome, no canonical mutation and no private data leakage. Deep-copy the game before each admitted/rejected path; source copies/results must not alias it. Actual test-file names and command evidence will be filled when implemented.

## Preregistered scenarios

| ID | Scenario | Exact expected outcome | Covers | Observed |
| --- | --- | --- | --- | --- |
| C01 | Verified successful review with blank, rejected, hinted and accepted-duplicate categories | Exactly 2 model steps, 2 provider attempts, 1 tool; valid findings and 1–2 eligible recommendations; completed once | FR-001,004–008,011–016 | PENDING |
| C02 | Invalid initial request, extra player/score/provider field, bad goal/language, oversize input | Preflight rejection; 0 provider calls, 0 tools, no admission charge | FR-002–003,017,027,034 | PENDING |
| C03 | Request before results, stale round, foreign room/caller, disconnected human | Appropriate existing ack error; 0 provider/tool calls; no hidden fields in any response | FR-002–003,017,030 | PENDING |
| C04 | Unknown tool such as `delete_database` | `unknown_tool`; toolCallCount === 0; no filesystem/network/game action | FR-009,018,024,034 | PENDING |
| C05 | Invalid focus, extra tool argument, forged owner/resource, oversize args | `invalid_tool_arguments`; 0 executions | FR-009,017,034 | PENDING |
| C06 | Malformed JSON/schema, extra keys or final answer at step 1 | `invalid_model_proposal`; 0 tools; no blind retry or success | FR-007,009,022,024 | PENDING |
| C07 | Tool returns missing/duplicate category, impossible totals/points, stale source, extra secret/raw field or oversize output | `invalid_tool_result`; no model step 2; discarded output | FR-010,017 | PENDING |
| C08 | Tool throws or exceeds its budget | `tool_failed` or `tool_timeout`; no step 2 | FR-020,024–025 | PENDING |
| C09 | Provider timeout, 5xx or transport failure then recovery | At most 1 recovery across run, at most 2 attempts in one step and 3 overall; abort signal observed; success or classified safe failure | FR-019–022,025,028 | PENDING |
| C10 | Authentication/configuration error or no key | No blind retry/fallback for auth/config; safe unavailable outcome; no tool if failure precedes tool | FR-018,022,024 | PENDING |
| C11 | Temporary 429 / excessive Retry-After / provider quota | Backoff only within remaining deadline; one configured fallback at most; daily app exhaustion never bypassed | FR-019–022,024,028 | PENDING |
| C12 | Step 2 repeats same valid tool + focus + version | `repeated_action`; still 1 executed tool and no third model step | FR-009,023 | PENDING |
| C13 | Step 2 requests a different valid focus/tool action | `tool_call_limit`; no additional tool or provider call. The engine has no third-decision transition; `step_limit` remains a reserved stop code, not an exercised branch | FR-019,023–024 | PENDING |
| C14 | Fake dependency ignores abort and returns after 30 s | `deadline` exactly once; late result ignored; no subsequent provider/tool; bounded UI terminal state | FR-020,025,029 | PENDING |
| C15 | Step 2 invalid final: fabricated ID, mismatched category, ineligible code, duplicated choices, unrestricted prose | `invalid_final`; `result: null`; no successful review rendered | FR-011–015 | PENDING |
| C16 | Accepted duplicate worth five points | Evidence describes accepted duplicate; `vary_answers` eligible, error/correction advice ineligible | FR-008,012–016 | PENDING |
| C17 | Blank and hinted cells, including all eight blank | Blank/hint observations only; no cause/ability/cheating/penalty assertion; eligible recall/hint practice | FR-008,012–016 | PENDING |
| C18 | Unverified round | Low confidence, local-rule limitation; category/existence correction options absent/rejected | FR-008,012–015 | PENDING |
| C19 | All eight accepted / no recorded weaknesses | Qualified maintenance recommendation; no fabricated weakness; valid 1-recommendation success | FR-011–015 | PENDING |
| C20 | Double click, concurrent duplicate, cached terminal failure/success | Same run reused; counts/admission unchanged; no post-terminal rerun | FR-005,026–028 | PENDING |
| C21 | Two human seats analyze in friend/random/AI modes | Source/output isolated; only requesting socket receives its response; never include opponent rows in provider/tool data | FR-001–004,017,030 | PENDING |
| C22 | Leave, disconnect, cleanup and provider completion race | Cancellation/terminal outcome wins once; no late delivery, no source/cache retained after removal; original result counts unchanged | FR-016,025–026,030 | PENDING |
| C23 | Five visitor admissions, reconnect/forged header, sixth admission | Sixth denied; allowance uses transport address and survives socket change; invalid/duplicate input not charged | FR-027 | PENDING |
| C24 | Shared daily remaining budget / simultaneous coaching attempts / retry or fallback | Atomic check/charge prevents over-admission of coach attempts; failures counted; no fourth attempt; W04 checker priority/default behavior preserved | FR-019,021,028 | PENDING |
| C25 | Mutation of returned tool/result data; coach success/failure | Canonical game and captured source unchanged; no scoring/checker rerun or duplicate reveal/result | FR-004,016 | PENDING |
| C26 | Injection strings in synthetic raw answers; injected extra fields in tool/model data | Raw answers absent from provider/tool context; extra instruction-bearing fields rejected; allowlist unchanged; no secret or action leakage | FR-009–013,017–018,031 | PENDING |
| C27 | SR/EN interface, mixed answer language, Serbian digraph/diacritic and English W round; language switch | Identical checked evidence/rules; correct localized presentation; switch requires no new run/call | FR-029–030; Story 4 | PENDING |
| C28 | Available usage on failed and successful attempts; missing usage | Count returned tokens across every available attempt; unknown stays unknown; bounded logs omit prompts/replies/secrets/addresses | FR-031–032 | PENDING |
| C29 | Provider refusal / unavailable eligible evidence | Classified refusal or insufficient-evidence stop; no guessed final result | FR-011–012,022,024 | PENDING |
| C30 | Coach loading/completed/stopped/failed UI; malformed/stale ack | Safe accessible SR/EN text; leave available; strict ack parse; wrong run/round cannot overwrite current screen | FR-029–030 | PENDING |
| C31 | Existing full regression suite and W04 smoke-readiness gate | Record baseline; legacy synchronization, privacy, letters, score, hints, checker/fallback behavior preserved; pending live work clearly labeled | FR-035–036 | PENDING |

## Commands and result recording

This matrix is preregistered; the mapping below records actual automated coverage without treating a unit test as live/browser/pair evidence. Runtime gates: targeted tests per implementation step, then `npm.cmd run verify`; record exact output and tested revision in EVIDENCE_W05. Repeat checks only after meaningful changes/failures.

Before implementation, record the real W04 baseline. Before W05 live work, check existing adapter availability with the already documented opt-in W04 smoke path and record its actual results without erasing its historical pending state.

## Implementation mapping (observed 2026-10-07)

The final `npm.cmd run verify` passed: typecheck, lint, **555 tests across 40 files** (7.01 s), Vite client build (90 modules, 1.74 s) and tsup server build (142.09 KB, 286 ms). This mapping identifies automated coverage; it does not claim every variation in the broader preregistered case was executed. Live provider, interactive browser and pair gates remain pending. The fake E2E command also ran and wrote the four sanitized artifacts linked in [EVIDENCE_W05](EVIDENCE_W05.md).

| Cases | Automated coverage | Evidence status |
| --- | --- | --- |
| C01 | `tests/unit/coach-engine.test.ts` mixed verified fixture and 2/1/2 contract; fake E2E `success.json` uses synthetic fixture | Automated success observed; fake E2E fixture itself is all-blank, so mixed engine case is separate; no live claim |
| C02-C03 | `tests/unit/coach-contracts.test.ts`, `tests/unit/room-store.test.ts`, `tests/integration/post-round-coach.test.ts`, `tests/unit/game-socket-coach.test.ts` | Invalid/extra fields, wrong phase and stale round covered; foreign-room coach request not separately exercised |
| C04-C08, C12-C15, C29 | `tests/unit/coach-engine.test.ts`, `tests/unit/analyze-round.test.ts`, `tests/unit/coach-attempt-guard.test.ts`; fake E2E unknown/failure/deadline | Named unit/fake cases include step-1 and step-2 refusal, zero-tool denial, and final validation; every C variant is not live |
| C09-C11, C24, C28 | `tests/unit/coach-attempt-guard.test.ts`, `tests/unit/coach-telemetry.test.ts`, `tests/unit/usage-limits.test.ts`, `tests/unit/config.test.ts` | Attempt/retry/usage/quota tests pass; real provider usage/quota behavior pending |
| C16-C19, C27, C30 | `tests/unit/analyze-round.test.ts`, `tests/unit/coach-engine.test.ts` (verified/unverified all-accepted maintenance), `tests/unit/coach-copy.test.ts`, `tests/unit/client-ai.test.ts`, `tests/unit/game-socket-coach.test.ts`, `tests/integration/post-round-coach.test.ts` | Evidence rules, representative localized SSR reasons, both letter alphabets across game modes, socket timeout/abort and stale ack covered; manual accessibility review pending |
| C20-C22, C25-C26 | `tests/unit/room-store.test.ts`, `tests/integration/post-round-coach.test.ts` | Duplicate/cache, disconnect/TTL, both friend seats, random/AI human seat, sentinels and canonical results covered; not every cross-room/race permutation |
| C23 | `tests/unit/usage-limits.test.ts`, `tests/unit/config.test.ts`, `tests/integration/post-round-coach.test.ts` | Five runs across new socket connections/rooms, forged forwarded headers and sixth admission denial observed with exactly ten model calls; deployment proxy configuration remains unexercised |
| C31 | W04 baseline verify passed; final W05 `npm.cmd run verify` passed 555 tests across 40 files plus typecheck, lint and both builds | Automated regression PASS; live W04/W05 smoke remains pending |

The exact observed fake runs are `docs/runs/w05/{success,unknown_tool,provider_failure,deadline}.json`. Their usage fields are scripted fake values, not live provider accounting. The `coach:smoke` live path is opt-in and was not run because no provider credentials were present.

## Live quality and evidence plan

Explicit opt-in only, after fake suites pass. Use synthetic public/nonprivate fixtures; server-side keys, trusted configured model chain, run/attempt/deadline guards enabled. Never automatically load/run live calls as part of ordinary tests. Do not commit credentials, prompts or provider replies.

Development recommendation: at most **15 live agent runs**, final demo at most **3**; record runs separately from attempts/retries/tools. This budget is for W05 coaching runs; any W04 readiness smoke calls are separately counted in the usage log.

| Live fixture | Preregistered quality gate | Result |
| --- | --- | --- |
| Verified mixed observations | Supported findings, eligible advice, two decisions/one tool, no invented weakness | PENDING |
| Unverified round | Low confidence and visible local-rule limitation; no independent category/existence claim | PENDING |
| All accepted with duplicate/hint variants | Accepted duplicates and hints correctly qualified, no invented penalty | PENDING |

Record date, provider/model, status, latency, steps, actual attempts, tools, available tokens, terminal reason, validator outcomes and agreement with fixture facts. A live refusal or failure is a real observed failure, not evidence of success. Missing credentials leave the live-demo gate pending.

## Pair understanding and seven-minute demo

Each member explains tool choice, where proposals/results are validated, why limits exist, why a rejected tool executes zero times, and why coaching cannot alter canonical results. Swap driver/reviewer roles and record actual contributions.

Demo allocation: 0:00–0:45 goal; 0:45–1:30 architecture; 1:30–3:00 observed success; 3:00–4:00 limits/validation; 4:00–5:00 fake unknown-tool or timeout path; 5:00–6:00 actual tests; 6:00–7:00 sanitized evidence, limitations and pair contributions. Success uses a limited live run; denied/failure cases use deterministic fakes without wasting real calls.
