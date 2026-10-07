# EVIDENCE_005 — Zanimljiva Geografija Live, Week 5

Evidence for Week 5, a bounded agentic feature: the round coach (`Plan.md`
§2C). Week 4's evidence stays in `EVIDENCE_004.md`.

Rule for this file, as for Weeks 3 and 4: nothing is written here that was not
actually observed. A placeholder stays a placeholder until the run that fills
it has happened. Sources are named for every result.

**State on 2026-10-07: approved and specified, not built.** Only §1, §2 and the
first row of §4 hold observations so far.

## Where each W05 artifact is

The assignment's names (W05 §34) mapped to this repository, without
duplicating Spec Kit's documents:

| W05 artifact | Here |
| --- | --- |
| `AGENT_FEATURE_SPEC.md` | `specs/010-round-coach-agent/spec.md` (and `plan.md`, `research.md`) |
| `AGENT_FLOW.md` | `docs/AGENT_FLOW.md` |
| `TOOL_CONTRACTS.md` | `specs/010-round-coach-agent/contracts/tools.md` |
| `AGENT_EVALS.md` | `docs/AGENT_EVALS.md` |
| `EVIDENCE_W05.md` | this file |
| `AI_USAGE_LOG.md` | `docs/AI_USAGE_LOG.md` |

---

## 1. Scope change

### W5-1 — The round coach, approved (2026-10-07)

- **Asked by the owner:** a Week 5 plan from the W05 assignment, then "Go with
  suggested changes, add them to Plan and all the docs, don't start
  implementation yet."
- **Decided:** every recommendation in `Plan.md` §2C.15, recorded in §2C.16:
  the round coach; goal `fill_gaps`; event `round:coach`; the limits of §2C.8;
  a final with bad evidence rejected whole; options O1 and O6; this file's
  name; W4-7 before the live runs.
- **Recorded in:** `Plan.md` §2C.16, `docs/GAME_SPEC.md` Amendment 8,
  `specs/010-round-coach-agent`.

---

## 2. Baseline before Week 5

| Item | Value | Source |
| --- | --- | --- |
| Code state | `4dea3b5` on `main` (last Week 4 commit) | git history |
| `npm run verify` | pass — 30 test files, 490 tests; typecheck, lint, build clean | planning session 2026-10-07 (`AI_USAGE_LOG.md` 012) |
| Live AI | never called: W4-7 not run | `docs/AI_EVALS.md` run log |
| Deployed | no: W4-9 not run | `docs/EVIDENCE_004.md` §4 |

---

## 3. Evals written before the code

C1–C19 and L1–L3, with expected results: `docs/AGENT_EVALS.md`, committed
2026-10-07, before any code. Mutation checks pre-registered there too.

| Eval group | Result |
| --- | --- |
| C1–C16, C19 (Core) | not run — not built |
| C17 (O1), C18 (O6) | not run — not built |
| Mutation checks | 4 of 4 caught, then restored — see below |
| L1–L3 (live) | not run — needs W4-7 and the owner's key |

### Mutation checks (T035, 2026-10-07, W5-7)

Each change was applied by a script to the working tree, `npx vitest run
tests/unit/coach-agent.test.ts` was run, and the file was restored from a
copy; afterwards `tests/unit/agent-tools.test.ts` and `coach-agent.test.ts`
passed 56/56 and `git diff` showed no change to `tools.ts`.

| Change | Where | Must fail | Observed |
| --- | --- | --- | --- |
| Skip the allowlist check (`if (false && !allowed.includes(action))`) | `coach-agent.ts` | C4, C16 | 4 failed / 25 passed: C4, C16, plus C10 and C13 "final at step 1", which also depend on the per-step allowlist. In C4 the tool then **ran** on `delete_room`'s arguments |
| Skip the repeat guard | `tools.ts` | C9 | 1 failed / 28 passed: C9 |
| Skip the deadline check before a step | `coach-agent.ts` | C11 | 1 failed / 28 passed: C11 (a third model step was called) |
| Trust the model's citation: take the cited id's text without checking pass and category | `coach-agent.ts` | C13 | 3 failed / 26 passed: C13 failed id, unknown id, other category's id |

---

## 4. Runs

| Run | Date | Code state | Command | Result | Source |
| --- | --- | --- | --- | --- | --- |
| Baseline | 2026-10-07 | `4dea3b5` | `npm ci && npm run verify` | pass — 490 tests, 30 files | `AI_USAGE_LOG.md` 012 |
| W5-0 baseline | 2026-10-07 | `d4c22c8` (`feature/round-coach`) | `npm run verify` | pass — 30 files, 490 tests; typecheck, lint, build clean | implementation session |
| W5-0 / W4-7, Gemini | 2026-10-07 | `d4c22c8` | `AI_PROVIDER_ORDER=gemini npm run smoke:ai` | 5 requests, all first-attempt successes; checker 16/16 | `docs/AI_EVALS.md` run log |
| W5-0 / W4-7, Groq | 2026-10-07 | `d4c22c8` | `AI_PROVIDER_ORDER=groq npm run smoke:ai` | 5 requests, all first-attempt successes; checker 16/16; both hint clues factually wrong | `docs/AI_EVALS.md` run log |
| W5-4 contracts | 2026-10-07 | after `df38235` | `npm run typecheck && npx vitest run tests/unit/contracts.test.ts tests/unit/config.test.ts` | red first (module missing, 8 config cases); then typecheck clean, 2 files, 128 tests passed | implementation session |
| W5-5 tool | 2026-10-07 | after `b052998` | `npx vitest run tests/unit/agent-tools.test.ts` | red first (module missing); then 1 file, 27 tests passed | implementation session |
| W5-6 gateway, budget, prompt, service | 2026-10-07 | after `26f80a6` | `npm run typecheck && npx vitest run tests/unit/gateway.test.ts tests/unit/ai-features.test.ts` | red first (3 gateway cases, prompt module missing); then typecheck clean, 2 files, 58 tests passed; every existing gateway case unchanged | implementation session |
| W5-7 loop | 2026-10-07 | after `8a06ea3` | `npx vitest run tests/unit/agent-tools.test.ts tests/unit/coach-agent.test.ts` | red first (module missing); then 2 files, 56 tests passed; 4/4 mutation checks caught | implementation session |
| After W5-4 … W5-10b | — | — | `npm run verify` | **not run** | — |
| Live, Gemini | — | — | `AI_PROVIDER_ORDER=gemini npm run smoke:coach` | **not run** | — |
| Live, Groq | — | — | `AI_PROVIDER_ORDER=groq npm run smoke:coach` | **not run** | — |

Live-run budget (W05 §44): ≤ 15 agent runs in development, ≤ 3 in the demo.
Used: **0**.

### Run logs

_None yet._ Each live run's log goes here as printed by `npm run smoke:coach`:
run id, steps with decision and status, tool calls with counts, provider
attempts, stop reason, elapsed time. No answers, words, prompts or keys.

### Rejected-tool evidence

_To fill from C4's test output once built:_ the proposal, the stop reason
`unknown_tool`, and `toolCallCount === 0`.

---

## 5. Architecture, provider and tool registry

Design: `docs/AGENT_FLOW.md`. Provider: the Week 4 chain, Gemini ⇄ Groq
(`Plan.md` §2B.5). Tools: `check_candidates` (Core), `verify_terms` (O1),
contracts in `specs/010-round-coach-agent/contracts/tools.md`. _To confirm
against the built code at W5-12._

---

## 6. Security checklist (W05 §41)

Where each line is planned to be enforced. Status changes only when a test or
a run shows it.

| W05 line | Planned enforcement | Shown by | Status |
| --- | --- | --- | --- |
| Provider key is server-side only | unchanged Week 4 wiring; the browser has no AI path | existing tests; code review | Week 4: holds |
| The model cannot pick any tool | `TOOLS` allowlist, per-step `allowedActions` | C4, C16 | planned |
| Tool args are validated | per-tool schema + run scope + repeat guard | C5, C9 | planned |
| Tool output is validated | result schema, size, time | C6 | planned |
| No arbitrary filesystem or network access for the agent | tools are pure (Core) or call the existing referee (O1) | code review | planned |
| Core agent does not change game state | read-only snapshot; no write path | C14 | planned |
| No secrets in tool results | results built from typed fields only | C14, code review | planned |
| Max steps | `RUN_LIMITS.maxModelSteps` = 3 | C10 | planned |
| Deadline | 25 s, checked before every step, plus the run signal | C11 | planned |
| Bounded retries | ≤ 2 attempts per step, ≤ 5 per run (gateway `maxAttempts`) | C7, C12 | planned |
| Logs hold no keys | run log of typed fields only | T032 | planned |
| Final output is validated | final validation of `contracts/model-step.md` | C13, C19 | planned |
| User-facing errors hide internals | stable codes → sentences in the client | T045 | planned |

---

## 7. Known limitations (planned design)

- One round of evidence: no history, by decision.
- Core checks the letter, not the fact; O1 narrows that gap.
- The report is in memory and disappears with the finished room (5 minutes).
- One status while waiting, not live step progress.
- Players behind one address share one hourly limit.
- The live AI is untested until W4-7.

---

## 8. Contributions

Split agreed in `Plan.md` §2C.15 item 7: person A drives W5-4 → W5-7 while B
reviews; B drives W5-8 → W5-12 while A reviews.

| Person | Implementation | Review / evidence |
| --- | --- | --- |
| _to fill_ | | |
| _to fill_ | | |
