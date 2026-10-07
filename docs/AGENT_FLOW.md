# AGENT_FLOW — the round coach

**Current implementation: `coach-step.v6`, built on `feature/round-coach`.**
Design: `Plan.md` §2C.16–§2C.17; contracts in
`specs/010-round-coach-agent/contracts/`. Earlier flows are preserved in git.

## Architecture

```text
Browser: results sheet + CoachPanel
  │ round:coach { roundId, goal, focus, language }
  ▼
Socket handler: event rate limit → strict request schema → generic errors
  ▼
room-store.requestCoach: ownership → results phase → missed categories
  → configured AI → cached/pending report → usage limits → reveal snapshot
  ▼
agent/coach-agent.runCoach                 RUN_LIMITS (application-owned)
  │ model step                              │ validate tool/final
  ▼                                         ▼
AiService.coachStep                    TOOLS.check_candidates (pure)
  │                                   TOOLS.verify_terms (O1, ids only)
  ▼                                         │
W04 gateway ←──────────────────── AiService.verifyTerms (W04 referee)
  │ retries / fallback / deadline / attempt cap
  ▼
Gemini ⇄ Groq adapters (server-only keys)

runCoach → application-owned referee check → optional bounded repair
  → runtime-validated CoachReport → caller-only ack → CoachPanel
```

The browser never runs the loop, calls a tool, or receives a prompt or raw
model reply. Coaching reads only the caller's revealed misses; it never
changes scores or any canonical round state.

## One logical run

```text
Goal: fill_gaps, on selected categories where the caller scored 0
  │
  ├─ bad request / ownership / phase / scope / AI / usage limits → refusal
  │      INVALID_PAYLOAD / NOT_IN_ROOM / ROUND_STALE / WRONG_PHASE /
  │      AI_UNAVAILABLE / AI_LIMIT / RATE_LIMITED; 0 provider calls
  ├─ report already cached → same report, 0 calls
  ├─ run pending → join that promise, no second run
  ▼
Charge one visitor run; runId; main deadline = start + 25 s
  ▼
For main step n = 1..3:
  signal? ≥ 2 s left? provider attempts left? → otherwise stop
  AI step (≤ 2 attempts, ≤ 10 s interaction, ≤ 6 s per attempt)
    → JSON + loose envelope validation
    → per-step allowlist + action shape
    → tool argument schema + scope + repeat guard, OR final evidence check

  Step 1: check_candidates only
  Step 2: final; check_candidates for unsolved categories; verify_terms for
          unjudged passing ids, only with a tool execution left
  Step 3: final only

  Allowed tool → execute → validate normalized result → evidence → next step
    check_candidates: ≤ 16 terms, ≤ 2/category, 40 chars, ≤ 100 ms, ≤ 4 KB
    verify_terms: passing unjudged ids only → W04 referee, ≤ 4 KB result
  Refused proposal → stop; no tool execution counted for that proposal
  Valid final → every focus category once; same-run passing citations;
                summary empty; confidence low / medium / high
  ▼
Application-owned referee check before any non-cancelled report:
  choose passing words (including categories final left empty)
  → chosen word + one backup per category that lacks an accepted choice
  → referee only with attempts left and ≥ 2 s of the main deadline left
  → only referee-accepted words can be displayed
     failure after a valid final changes its stop reason/status
     other main-loop failures keep their original stop reason
  ▼
Valid final and successful check, but categories still empty?
  ├─ no → report
  └─ yes → one optional repair, only with ≥ 4 s of start + 35 s left
      model sees only empty focus categories + earlier normalized evidence
      + referee_check verdicts by id
      → check_candidates only; 1 model attempt; 1 extra tool execution
      → passing new words → referee, 1 attempt
      → accepted words added; no subsequent final
      → refused/failed repair preserves prior status and accepted suggestions
  ▼
Runtime validation → report ack to caller only → UI + optional Details (O6)
```

Cancellation at any stage (caller disconnects or room is reaped) aborts the
run, logs `cancelled`, and sends no report. The client stops waiting at 45 s.

## Limits and counters

| Bound | Main loop + application check | Including optional repair |
| --- | ---: | ---: |
| Model decisions | 3 | 4 |
| Tool executions | 2 | 3 |
| Provider attempts, including referee | 5 | 7 |
| Deadline from original start | 25 s | 35 s |

A retry/fallback is an attempt, not a model decision. The application-owned
referee check and repair referee are provider interactions, not model-requested
tool executions. Every model/referee interaction counts toward the shared
daily AI budget. A visitor is limited to 6 runs/hour by default.

## Stops and reports

The application enforces every stop, including the optional repair's fixed
allowlist, single attempts and deadline. The model can end the main loop only
with a validated final.

| Stop reason | Application check | Eval |
| --- | --- | --- |
| goal_completed | final validation; application check did not fail | C1, C2, C20–C22 |
| unknown_tool | name outside TOOLS and not final | C4, C16 |
| invalid_tool_args | shape, args, scope or known tool not offered | C5, C17 |
| repeated_call | category + folded term already checked | C9, C22 |
| tool_failed | throw, invalid result, size or local tool time | C6 |
| provider_timeout / provider_unavailable / rate_limited / quota_exhausted | gateway failure | C7, C8 |
| malformed_output | JSON/envelope rejection, no blind retry | C19 |
| final_invalid | missing/duplicate focus, bad evidence or nonempty summary | C13, C17 |
| max_steps | tool proposed on last main step / tool budget spent | C10 |
| deadline | insufficient time before an interaction | C11, C22 |
| call_budget | provider-attempt cap | C12 |
| cancelled (log only) | disconnect/reap signal | wire cancellation tests |

`completed` means a valid final and no application-check failure; it may still
contain empty categories. Otherwise `incomplete` requires at least one shown,
referee-accepted suggestion; with none, status is `failed`. A failed repair
leaves this prior outcome intact. No unverified word is displayed.

## Observable evidence

One `agent.run` record holds runId, promptVersion, step decisions and attempts,
tool counts, application referee-check attempts, optional repair counts,
status, stopReason and totals. No terms, answers, prompts, replies or keys.
Interaction ids are `<runId>:s<n>`, `<runId>:s<n>:verify`, `<runId>:check` and
`<runId>:repair`. See `docs/EVIDENCE_005.md` for actual logs and known limits.
