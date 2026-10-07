# EVIDENCE_005 — Zanimljiva Geografija Live, Week 5

Evidence for Week 5, a bounded agentic feature: the round coach (`Plan.md`
§2C). Week 4's evidence stays in `EVIDENCE_004.md`.

Rule for this file, as for Weeks 3 and 4: nothing is written here that was not
actually observed. A placeholder stays a placeholder until the run that fills
it has happened. Sources are named for every result.

**State on 2026-10-07: built on `feature/round-coach`** (W5-0 → W5-11, Core
plus O1 and O6), with 6 live runs. W5-12's demo rehearsal and the
contributions table (§8) are still open.

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
| C1–C16, C19 (Core) | pass — W5-7 (loop), W5-8 (wire) |
| C17 (O1), C18 (O6) | pass — W5-10a, W5-10b |
| Mutation checks | 4 of 4 caught, then restored — see below |
| L1–L3 (live) | 6 runs, 2026-10-07: L1 holds (every suggestion shown starts with Lj; no unhandled error); L2 holds (country never suggested); L3 not confirmed for "Ljutica", and the referee accepted the invented "Ljlama" — see §4 |

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

Re-run after the "only valid and checked answers" change (2026-10-07, same
method; the fourth change now targets the rewritten final validation):

| Change | Must fail | Observed |
| --- | --- | --- |
| Skip the allowlist check | C4, C16 | 4 failed / 40 passed: C4, C16, C10, C13 "final at step 1" |
| Skip the repeat guard | C9 | 1 failed / 43 passed: C9 |
| Skip the deadline check before a step | C11 | 1 failed / 43 passed: C11 |
| Trust the model's citation (keep only "the id exists") | C13 | 3 failed / 41 passed: C13 failed id and other category, C17 referee-rejected citation. The unknown-id case still fails safe, because the mutation keeps the "id exists" check |

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
| W5-8 store, limits, socket | 2026-10-07 | after `22607b5` | `npm test` | red first (8 cases: no handler, acks timed out); then 33 files, 594 tests passed, A1–A6 included | implementation session |
| W5-9 client | 2026-10-07 | after `2bdba5b` | `npm run verify` | red first (panel module missing); then typecheck, lint, build clean; 34 files, 607 tests passed | implementation session |
| W5-10 docs | 2026-10-07 | after `75ccc54` | `npm run verify` | pass — 34 files, 607 tests; typecheck, lint, build clean (documentation only) | implementation session |
| W5-10a O1 `verify_terms` | 2026-10-07 | after `8fdf755` | `npx vitest run tests/unit/coach-agent.test.ts && npm run verify` | red first (18 cases); C2 conflicted with FR-016 once O1 was built — the owner chose FR-016, noted in `AGENT_EVALS.md` under C2; then 37 loop tests and verify passed — 34 files, 625 tests | implementation session |
| W5-10b O6 run details | 2026-10-07 | after `0a2df04` | `npm run verify` | red first (4 cases); then 34 files, 629 tests passed; typecheck, lint, build clean | implementation session |
| W5-11 live, Gemini | 2026-10-07 | after `502a9b1` | `AI_PROVIDER_ORDER=gemini npm run smoke:coach -- 3` | 3 runs: 3 `completed`; 9 model steps, 12 provider attempts (all first-attempt successes), 6 tool calls (3 check, 3 verify); 4.8–5.3 s each | run logs below |
| W5-11 live, Groq | 2026-10-07 | after `502a9b1` | `AI_PROVIDER_ORDER=groq npm run smoke:coach -- 3` | 3 runs: 1 `failed` (`invalid_tool_args`), 2 `incomplete` (`invalid_tool_args`, `final_invalid`); 6 model steps, 8 provider attempts (1 rate-limited, then fallback), 3 tool calls (2 check, 1 verify); 0.9–3.7 s each | run logs below |
| Prompt `coach-step.v2` | 2026-10-07 | after `34c5a8c` | `npx vitest run tests/unit/ai-features.test.ts tests/unit/coach-agent.test.ts`, then `npm run verify` | the owner saw "Euphrates" suggested to a Serbian player; red first (v2 missing), then 72 tests passed; verify below | implementation session |
| Only valid and checked answers, `coach-step.v3` | 2026-10-07 | after `40c033f` | `npx vitest run` and `npm run verify` | the owner saw an unchecked "Rosno more" in the model's summary and "Rtnj" for Rtanj; decision in `Plan.md` §2C.16; red first (19 loop, 8 contract/client/wire cases); a mis-attributed `call_budget` found and fixed on the way; then 34 files, 637 tests; mutation checks re-run, 4/4 | implementation session |

Live-run budget (W05 §44): ≤ 15 agent runs in development, ≤ 3 in the demo.
Used: **6** in development (3 Gemini, 3 Groq), 0 in the demo.

### Run logs (W5-11, live, 2026-10-07)

The fixed round: letter Lj, Serbian alphabet; the player left river blank,
wrote "Lav" for animal and "Ljubljana" for country (wrong category). Each line
is the `agent.run` record exactly as `npm run smoke:coach` printed it, in run
order: Gemini 1–3, then Groq 1–3. They hold no answer, word, prompt, reply or
key by construction.

```json
{"event":"agent.run","runId":"c22a9cae-0881-4e63-996e-03c7869ea384","goal":"fill_gaps","promptVersion":"coach-step.v1","status":"completed","stopReason":"goal_completed","steps":[{"n":1,"action":"check_candidates","decision":"allowed","attempts":[{"n":1,"provider":"gemini","model":"gemini-3.5-flash-lite","kind":"initial","status":"success","latencyMs":1270}],"usage":{"inputTokens":947,"outputTokens":94,"totalTokens":1041},"tool":{"name":"check_candidates","items":2,"passed":2,"latencyMs":2}},{"n":2,"action":"verify_terms","decision":"allowed","attempts":[{"n":1,"provider":"gemini","model":"gemini-3.5-flash-lite","kind":"initial","status":"success","latencyMs":1078}],"usage":{"inputTokens":1012,"outputTokens":51,"totalTokens":1063},"tool":{"name":"verify_terms","items":2,"passed":1,"latencyMs":1468,"attempts":[{"n":1,"provider":"gemini","model":"gemini-3.5-flash-lite","kind":"initial","status":"success","latencyMs":1464}]}},{"n":3,"action":"final","decision":"allowed","attempts":[{"n":1,"provider":"gemini","model":"gemini-3.5-flash-lite","kind":"initial","status":"success","latencyMs":1459}],"usage":{"inputTokens":1050,"outputTokens":149,"totalTokens":1199}}],"totals":{"modelSteps":3,"providerAttempts":4,"toolCalls":2,"elapsedMs":5280}}
{"event":"agent.run","runId":"01eb388a-e944-42a7-b3fb-2921f40b74e6","goal":"fill_gaps","promptVersion":"coach-step.v1","status":"completed","stopReason":"goal_completed","steps":[{"n":1,"action":"check_candidates","decision":"allowed","attempts":[{"n":1,"provider":"gemini","model":"gemini-3.5-flash-lite","kind":"initial","status":"success","latencyMs":1241}],"usage":{"inputTokens":947,"outputTokens":94,"totalTokens":1041},"tool":{"name":"check_candidates","items":2,"passed":2,"latencyMs":0}},{"n":2,"action":"verify_terms","decision":"allowed","attempts":[{"n":1,"provider":"gemini","model":"gemini-3.5-flash-lite","kind":"initial","status":"success","latencyMs":1026}],"usage":{"inputTokens":1012,"outputTokens":51,"totalTokens":1063},"tool":{"name":"verify_terms","items":2,"passed":2,"latencyMs":1130,"attempts":[{"n":1,"provider":"gemini","model":"gemini-3.5-flash-lite","kind":"initial","status":"success","latencyMs":1128}]}},{"n":3,"action":"final","decision":"allowed","attempts":[{"n":1,"provider":"gemini","model":"gemini-3.5-flash-lite","kind":"initial","status":"success","latencyMs":1443}],"usage":{"inputTokens":1047,"outputTokens":160,"totalTokens":1207}}],"totals":{"modelSteps":3,"providerAttempts":4,"toolCalls":2,"elapsedMs":4840}}
{"event":"agent.run","runId":"53cf5f1b-030c-4123-9a84-69ea6a942c4e","goal":"fill_gaps","promptVersion":"coach-step.v1","status":"completed","stopReason":"goal_completed","steps":[{"n":1,"action":"check_candidates","decision":"allowed","attempts":[{"n":1,"provider":"gemini","model":"gemini-3.5-flash-lite","kind":"initial","status":"success","latencyMs":1522}],"usage":{"inputTokens":947,"outputTokens":97,"totalTokens":1044},"tool":{"name":"check_candidates","items":2,"passed":1,"latencyMs":0}},{"n":2,"action":"verify_terms","decision":"allowed","attempts":[{"n":1,"provider":"gemini","model":"gemini-3.5-flash-lite","kind":"initial","status":"success","latencyMs":1086}],"usage":{"inputTokens":1017,"outputTokens":48,"totalTokens":1065},"tool":{"name":"verify_terms","items":1,"passed":1,"latencyMs":1158,"attempts":[{"n":1,"provider":"gemini","model":"gemini-3.5-flash-lite","kind":"initial","status":"success","latencyMs":1157}]}},{"n":3,"action":"final","decision":"allowed","attempts":[{"n":1,"provider":"gemini","model":"gemini-3.5-flash-lite","kind":"initial","status":"success","latencyMs":1281}],"usage":{"inputTokens":1038,"outputTokens":138,"totalTokens":1176}}],"totals":{"modelSteps":3,"providerAttempts":4,"toolCalls":2,"elapsedMs":5049}}
{"event":"agent.run","runId":"3ac759b2-da34-49dc-a700-ec0508c38892","goal":"fill_gaps","promptVersion":"coach-step.v1","status":"failed","stopReason":"invalid_tool_args","steps":[{"n":1,"action":"check_candidates","decision":"rejected","attempts":[{"n":1,"provider":"groq","model":"openai/gpt-oss-120b","kind":"initial","status":"success","latencyMs":873}],"usage":{"inputTokens":1280,"outputTokens":213,"totalTokens":1493},"rejectReason":"invalid_tool_args"}],"totals":{"modelSteps":1,"providerAttempts":1,"toolCalls":0,"elapsedMs":874}}
{"event":"agent.run","runId":"d5adc7c2-aec8-46f0-8376-13f7fe1fa96b","goal":"fill_gaps","promptVersion":"coach-step.v1","status":"incomplete","stopReason":"invalid_tool_args","steps":[{"n":1,"action":"check_candidates","decision":"allowed","attempts":[{"n":1,"provider":"groq","model":"openai/gpt-oss-120b","kind":"initial","status":"success","latencyMs":1380}],"usage":{"inputTokens":1280,"outputTokens":401,"totalTokens":1681},"tool":{"name":"check_candidates","items":2,"passed":2,"latencyMs":2}},{"n":2,"action":"check_candidates","decision":"rejected","attempts":[{"n":1,"provider":"groq","model":"openai/gpt-oss-120b","kind":"initial","status":"success","latencyMs":1107}],"usage":{"inputTokens":1347,"outputTokens":437,"totalTokens":1784},"rejectReason":"invalid_tool_args"}],"totals":{"modelSteps":2,"providerAttempts":2,"toolCalls":1,"elapsedMs":2489}}
{"event":"agent.run","runId":"bf6268d8-1d6a-48c7-b930-7f3de30cf311","goal":"fill_gaps","promptVersion":"coach-step.v1","status":"incomplete","stopReason":"final_invalid","steps":[{"n":1,"action":"check_candidates","decision":"allowed","attempts":[{"n":1,"provider":"groq","model":"openai/gpt-oss-120b","kind":"initial","status":"success","latencyMs":1530}],"usage":{"inputTokens":1280,"outputTokens":628,"totalTokens":1908},"tool":{"name":"check_candidates","items":5,"passed":5,"latencyMs":1}},{"n":2,"action":"verify_terms","decision":"allowed","attempts":[{"n":1,"provider":"groq","model":"openai/gpt-oss-120b","kind":"initial","status":"success","latencyMs":563}],"usage":{"inputTokens":1420,"outputTokens":185,"totalTokens":1605},"tool":{"name":"verify_terms","items":5,"passed":2,"latencyMs":781,"attempts":[{"n":1,"provider":"groq","model":"openai/gpt-oss-120b","kind":"initial","status":"failure","errorClass":"rate_limited","httpStatus":429,"latencyMs":47},{"n":2,"provider":"groq","model":"openai/gpt-oss-20b","kind":"fallback","status":"success","latencyMs":730}]}},{"n":3,"action":"final","decision":"rejected","attempts":[{"n":1,"provider":"groq","model":"openai/gpt-oss-20b","kind":"initial","status":"success","latencyMs":815}],"usage":{"inputTokens":1508,"outputTokens":237,"totalTokens":1745},"rejectReason":"final_invalid"}],"totals":{"modelSteps":3,"providerAttempts":5,"toolCalls":2,"elapsedMs":3690}}
```

What each report showed (printed by the script after the log, judged by hand
against L1–L3 in `docs/AGENT_EVALS.md`):

| Run | Status (stop reason) | Country | River | Animal | Notes |
| --- | --- | --- | --- | --- | --- |
| Gemini 1 | completed (`goal_completed`) | none | Ljutica, letter rule + referee | none | Summary in Serbian |
| Gemini 2 | completed (`goal_completed`) | none | Ljutica, letter rule + referee | **"Ljlama"**, letter rule + referee | "Ljlama" is not a word (llama is "lama"); the referee accepted it. Summary garbled ("Libija da počinje drugačije") |
| Gemini 3 | completed (`goal_completed`) | none | Ljutica, letter rule + referee | none | |
| Groq 1 | failed (`invalid_tool_args`) | — | — | — | Step 1's arguments were refused; nothing ran |
| Groq 2 | incomplete (`invalid_tool_args`) | none | Ljubljanica, letter rule | none | Step 2's re-check was refused |
| Groq 3 | incomplete (`final_invalid`) | none | Ljuta, letter rule + referee | none | The referee rejected 3 of 5 words; the final was refused whole |

Findings, not fixed in this session:

- **The referee can accept an invented word** ("Ljlama" for animal). The
  letter rule and the referee both passed it, so the report showed it as
  checked by both. O1 narrows Core's gap but does not close it.
- **Groq's agent proposes arguments the tool refuses** in 2 of 3 runs. The run
  log records `invalid_tool_args` but, by design, not which argument failed, so
  the cause was not diagnosed; finding it would take more live runs or a
  per-reason count in the log (a scope change). Every refusal ended safely, and
  no unsupported word was shown.
- Whether "Ljutica" is a real river was not confirmed in this session (L3 needs
  a person).

### Rejected-tool evidence (eval C4)

Produced on 2026-10-07 by a one-off script (deleted afterwards) calling
`runCoach` with a fake AI whose step 1 proposes `delete_room`, and an injected
tool that counts its executions — the same setup as C4's test:

```text
proposal: {"action":"delete_room","candidates":[{"category":"river","term":"Ljubljanica"}]}
run log: {"event":"agent.run","runId":"c4-evidence","goal":"fill_gaps","promptVersion":"coach-step.v1","status":"failed","stopReason":"unknown_tool","steps":[{"n":1,"action":"delete_room","decision":"rejected","attempts":[{"n":1,"provider":"gemini","model":"fake-model","kind":"initial","status":"success","latencyMs":0}],"rejectReason":"unknown_tool"}],"totals":{"modelSteps":1,"providerAttempts":1,"toolCalls":0,"elapsedMs":0}}
tool executions: 0
```

The report was `failed` with `unknown_tool` and no suggestion.

---

## 5. Architecture, provider and tool registry

Design: `docs/AGENT_FLOW.md`. Confirmed against the built code on 2026-10-07:

| Part | Where |
| --- | --- |
| Request and report contracts | `src/contracts/coach.schemas.ts`; step envelope and its JSON schema in `src/contracts/ai-output.schemas.ts`; event `round:coach` in `src/contracts/socket.schemas.ts` |
| Limits | `RUN_LIMITS` in `src/server/agent/limits.ts` (3 steps, 2 tool calls, 2 attempts per step, 5 per run, 6 s / 10 s / 25 s, 2 s minimum, 8 candidates, 2 per category, 100 ms tool time, 2 KB result) |
| Tool registry | `TOOLS` in `src/server/agent/tools.ts`: `check_candidates` (pure letter rule) and `verify_terms` (O1, ids only, the W04 referee through `runCheck`) |
| The loop | `runCoach` in `src/server/agent/coach-agent.ts`: per-step allowlist, shape, tool checks, final validation, evidence-only reports, run details (O6) |
| Run log | `agent.run` in `src/server/agent/run-log.ts`; each step's `ai.interaction` line has `interactionId = <runId>:s<n>` |
| Prompt | `coach-step.v1` in `src/server/prompts/coach-step.v1.ts`, temperature 0.2, 600 output tokens |
| Provider | the Week 4 gateway and chain, Gemini ⇄ Groq (`Plan.md` §2B.5), with the new optional `RetryBudget.maxAttempts`; budget `BUDGETS["coach-step"]` |
| Store and socket | `requestCoach` in `src/server/rooms/room-store.ts` (reveal snapshot, checks, single-flight, limits, abort); handler in `src/server/socket/register-handlers.ts` |
| Client | `src/client/screens/CoachPanel.tsx`, `requestCoach` with a 30 s ack timeout in `src/client/socket/game-socket.ts` |
| Live check | `scripts/coach-smoke.ts`, `npm run smoke:coach` (at most 3 runs per invocation) |

---

## 6. Security checklist (W05 §41)

Where each line is planned to be enforced. Status changes only when a test or
a run shows it.

| W05 line | Enforcement | Shown by | Status |
| --- | --- | --- | --- |
| Provider key is server-side only | unchanged Week 4 wiring; the browser only emits `round:coach` and reads its ack | existing tests; code review | holds |
| The model cannot pick any tool | `TOOLS` allowlist and the step's `allowedActions` in `runCoach` | C4, C16; mutation check (allowlist removed → C4, C16 fail) | holds |
| Tool args are validated | each tool's argument schema, run scope and repeat guard in `tools.ts` | C5, C9, C17 bad ids; mutation check (repeat guard removed → C9 fails) | holds |
| Tool output is validated | result size, schema, and that it answers exactly what was asked; 100 ms timer | C6 | holds |
| No arbitrary filesystem or network access for the agent | `check_candidates` is pure; `verify_terms` reaches only the existing referee through `AiService` | code review: `tools.ts` imports nothing from rooms/, socket/ or ai/ | holds |
| Core agent does not change game state | reads `Round.reveal`; writes only `player.coach` | C14 (projections, round and phase identical before and after) | holds |
| No secrets in tool results | results built from typed fields only | C14 (no room code, token, round id or opponent word in any step input) | holds |
| Max steps | `RUN_LIMITS.maxModelSteps` = 3 | C10 | holds |
| Deadline | 25 s, checked before every step; each step's gateway budget ≤ time left | C11; mutation check (deadline check removed → C11 fails) | holds |
| Bounded retries | ≤ 2 attempts per step, ≤ 5 per run (gateway `maxAttempts`) | C7, C8, C12; Groq live run 3 used exactly 5 | holds |
| Logs hold no keys | `agent.run` of typed fields only | T032 run-log test; the 6 live logs above | holds |
| Final output is validated | final validation of `contracts/model-step.md`; only referee-accepted words shown, in the referee's spelling; no model text in the report (2026-10-07) | C13, C19; mutation check (model's citation trusted → C13 fails); Groq live run 3 | holds |
| User-facing errors hide internals | stop reasons become sentences in `strings.ts` | `client-coach.test.ts` (no code rendered) | holds |

--- | --- | --- | --- |
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

## 7. Known limitations

- One round of evidence: no history, by decision.
- Core checks the letter, not the fact; O1 narrows that gap but does not close
  it: live, the referee accepted the invented "Ljlama" (§4).
- With Groq the agent often proposes arguments the tool refuses (2 of 3 live
  runs); the run log does not say which argument, by design.
- A cancelled run sends no ack; the client then shows "could not complete
  safely" after its 30 s timeout.
- The report is in memory and disappears with the finished room (5 minutes).
- One status while waiting, not live step progress.
- Players behind one address share one hourly limit.
- 6 live runs are a small sample (3 per provider), all with `coach-step.v1`.
- The language of a suggested term is a prompt hint, not enforced; since the
  "checked answers" change the player sees the referee's name in their
  language when it gives one that starts with the letter, which covers most
  cases (Eufrat for a Serbian player). Neither has had a live run.
- Only referee-accepted words are shown, but the referee is an AI: live, it
  accepted the invented "Ljlama" once. The game cannot check facts by itself.
- The game's own referee check needs time and an attempt: a run stopped by the
  deadline or the attempt budget shows no suggestion at all.

---

## 8. Contributions

Split agreed in `Plan.md` §2C.15 item 7: person A drives W5-4 → W5-7 while B
reviews; B drives W5-8 → W5-12 while A reviews.

| Person | Implementation | Review / evidence |
| --- | --- | --- |
| _to fill_ | | |
| _to fill_ | | |
