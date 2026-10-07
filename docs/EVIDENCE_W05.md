# W05 Evidence — bounded post-round coach

**Status (2026-10-07):** Runtime implementation, fake-first evidence and full automated verification are complete. W05 is not complete: live provider demo, interactive browser QA and human pair-contribution evidence remain pending.

## Provenance and scope

The user authorized implementation of the approved feature design; root consistency review passed. The work is on `010-post-round-coach`, based on `4dea3b59e35c5dc89a09776cea43bb5e8487ad5e`. No push, PR, deployment or external message has been made. The local reviewed milestone is identified by the commit containing this evidence. See [Plan §2C](../Plan.md) and [consumer/before-after impact analysis](../specs/010-post-round-coach/impact-analysis.md).

The actual W04 baseline command `npm.cmd run verify` passed: typecheck and lint clean, 490 tests across 30 files passed, and client/server builds succeeded. Setup first encountered an npm cache `EPERM`; `npm.cmd ci --cache C:/Users/ac200/OneDrive/SITA-AIBOOTCAMP/week5/.npm-cache` using the existing lockfile resolved it. Vitest/esbuild subprocess execution was also denied in the default sandbox; the approved verification invocation with escalation then passed. No lockfile or dependency upgrade was made.

The feature adds an optional, private results-screen review from the requesting human's exact captured canonical results. It uses two model decisions and one read-only `analyze_round` tool. It does not change scoring, checker verdicts, reveal flow, or game answers. The original W04 baseline is verified: `npm.cmd run verify` passed typecheck/lint/build and 490 tests across 30 files. Initial setup/sandbox failures and successful resolution are recorded above and in Plan.

## Actual W05 evidence

| Proof | Observed command/artifact | Status |
| --- | --- | --- |
| Fake successful run | `npm.cmd run coach:fake-e2e`; [success.json](runs/w05/success.json): 2 decisions, 1 executed tool, 2 adapter calls, 10 evidence records | PASS (scripted fake) |
| Unknown-tool denial | Same command; [unknown_tool.json](runs/w05/unknown_tool.json): 1 decision, 0 tools, 1 adapter call | PASS (scripted fake) |
| Provider failure | Same command; [provider_failure.json](runs/w05/provider_failure.json), classified terminal failure | PASS (scripted fake) |
| Deadline classification | Same command; [deadline.json](runs/w05/deadline.json) records a terminal deadline case. Late dependency suppression is independently asserted by `tests/unit/coach-engine.test.ts` and `tests/unit/room-store.test.ts` | PASS (scripted fake/unit) |
| Focused unit/integration suites | Latest targeted pass: 52 tests across 5 files (engine refusal/maintenance, alphabet, quota integration and UI); prior coach pass: 90 across 8; earlier broad focused pass: 147 across 13. Latest typecheck and lint passed | PASS (targeted scope) |
| Live provider readiness | No `.env`; presence check found neither provider key. Default `npm.cmd run coach:smoke` returned `not_run`; explicit `COACH_LIVE_SMOKE=1 npm.cmd run coach:smoke` returned `pending/no provider credential configured`; both exit 0 with zero live calls | PENDING (credentials absent) |
| Browser/accessibility review | CUA inventory returned no apps/browsers; `createBrowserTab('iab',...)` returned `Browser is not available: iab`; native apps disabled | PENDING (environment unavailable) |
| Human pair understanding and role swap | Actual participation not recorded | PENDING |
| Final full `npm.cmd run verify` | PASS, exit 0: typecheck, lint, 555 tests across 40 files (7.01 s test duration), Vite client build (90 modules, 1.74 s), tsup server build (142.09 KB, 286 ms) | PASS |
| Final fake E2E rerun | PASS, exit 0: success 2 decisions/1 tool/2 attempts; unknown-tool, provider-failure and deadline each 1 decision/0 tools/1 attempt; four JSON artifacts refreshed | PASS (scripted fake) |
| Documentation/diff check | Root check: 21 Markdown documents, 85 local links, no broken links; all 50 assignment sections mapped; AGENTS/CLAUDE identical. Normal `git diff --check` and staged `git diff --cached --check` exit 0 after Markdown/EOF whitespace cleanup | PASS |
| Final local commit/revision | Root owns the final local commit. The commit containing this evidence is the reviewed milestone; no self-referential hash is embedded in this file | ROOT FINAL MILESTONE |

The token values in fake run traces are scripted fake-provider values; they are not live provider or billing evidence. The scripts use synthetic fixtures and do not include raw answers, prompts, model replies, secrets, addresses or identity fields in saved evidence. The initial final-verification attempt failed only lint: three unused imports and two explicit `any` payload captures. These were corrected using typed JSON schemas and the full verification rerun passed without weakening lint or tests.

## Feature artifacts

- [Canonical feature spec](../specs/010-post-round-coach/spec.md), [tasks](../specs/010-post-round-coach/tasks.md), [impact analysis](../specs/010-post-round-coach/impact-analysis.md), [review log](../specs/010-post-round-coach/review-log.md).
- [Agent flow](AGENT_FLOW.md), [tool contracts](TOOL_CONTRACTS.md), [preregistered evaluations](AGENT_EVALS.md), [assignment coverage](../specs/010-post-round-coach/checklists/assignment-coverage.md).
- [AI usage log](AI_USAGE_LOG.md).

## Limitations and risks

A single round supports observations, not a longitudinal ability assessment. The coach repeats recorded checker decisions with attribution and cannot correct scores; unverified rounds support only local-rule and sheet observations. Advice uses a closed vocabulary, without generated geography answers or conversational prose. One admitted run per seat/round means a terminal failure cannot be retried within that round. Rooms, snapshots, runs and visitor limits are in memory; restart clears them. Shared visitor addresses share one hourly allowance, so configured proxy trust must be correct. W04 daily usage retains its logical-operation unit while W05 charges each coach physical attempt; existing checker-priority behavior means this is not a universal hard physical-call cap.

## Pair contribution record

| Member | Actual driver work | Actual review/evidence work | Role swap / explanation demonstrated |
| --- | --- | --- | --- |
| Member 1 — name pending owner/pair input | PENDING | PENDING | PENDING |
| Member 2 — name pending owner/pair input | PENDING | PENDING | PENDING |

Assistant-authored work is not proof of human contribution or understanding. Record actual participation before final submission.
