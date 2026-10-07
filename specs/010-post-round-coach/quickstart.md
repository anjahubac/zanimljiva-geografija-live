# Quickstart: W05 post-round coach verification

This is the implementation verification checklist. W04 baseline passed; W05 commands are executable gates and current results are recorded in `docs/EVIDENCE_W05.md`.

## Before runtime work

1. The user explicitly authorized implementation of the already approved detailed spec package. Root reviews plan consistency; request owner input only for a behavior/design change outside that approval.
2. Preserve the W04 baseline (`npm.cmd run verify`: typecheck/lint clean, 490 tests across 30 files, client/server builds succeeded) and preregistered `docs/AGENT_EVALS.md` cases; do not weaken tests or change expectations after observing results.

## Fake-first implementation checks

1. Implement strict schemas, detached source and deterministic `analyze_round`; verify eight category records, totals, verification, recommendation eligibility, exact source ownership and byte bounds with synthetic fixtures.
2. Run `npm.cmd run coach:fake-e2e` (`scripts/coach-fake-e2e.ts`) with scripted fake model/transport against the real engine/tool/validators. It records four scenarios: success (two decisions/one tool), denied unknown tool (zero tools), provider failure and deadline. This does not replace the broader unit/integration suite mapped to C01-C31 in `docs/AGENT_EVALS.md`. No fake bypasses production validation and no public/mock production API is added.
3. Exercise a real local Socket.IO round in friend, random and AI modes. For either human seat, verify results-only admission, private terminal ack, language switch without rerun, no opponent delivery, and unchanged reveal/score. Exercise preflight denial, quota, concurrent duplicate, disconnect and room cleanup.
4. Run targeted tests, then `npm.cmd run verify`; inspect `git diff --check`, full diff and status. Record exact commands/results and limitations.

## Opt-in live checks (only after fake checks pass)

Check credential readiness by presence only; never print/log key values. The current check found no `.env` and no provider key variables, so live demo readiness remains pending. `coach:smoke` is opt-in. In PowerShell, run `$env:COACH_LIVE_SMOKE = '1'; npm.cmd run coach:smoke`, then clear the opt-in with `Remove-Item Env:COACH_LIVE_SMOKE`. Optional `COACH_SMOKE_MODE=development` permits at most 15 live runs; `COACH_SMOKE_MODE=demo` permits at most 3. Use synthetic public/nonprivate fixtures, configured server keys and active run guards. Count logical runs, physical attempts, recovery/fallback, tools and available usage separately. Test verified mixed observations, unverified local-only evidence and all-accepted/duplicate/hint observations. Record real result/refusal/failure honestly; never include prompts, replies, answers, keys, addresses or tokens.

## Completion gates

Runtime behavior and full automated verification are complete: final `npm.cmd run verify` passed 555 tests across 40 files, typecheck, lint and both builds. The fake E2E and smoke readiness results are recorded in `docs/EVIDENCE_W05.md`. Live demo, interactive browser/accessibility review and pair-contribution/explanation gates remain pending until actual evidence exists.
