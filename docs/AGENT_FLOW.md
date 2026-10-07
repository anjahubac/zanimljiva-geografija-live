# AGENT_FLOW — the round coach

The flow of one coaching run, with every check and every stop. Design of
record: `Plan.md` §2C and §2C.16; contracts in
`specs/010-round-coach-agent/contracts/`. **Approved 2026-10-07, not built.**

## Architecture

```text
Browser (results sheet)                 Server (one Node process)
─────────────────────                   ───────────────────────────────────────────────
CoachPanel ── round:coach ──────────►  register-handlers  (rate limit, zod, INTERNAL on throw)
   ▲                                          │
   │  ack: CoachReport (caller only)          ▼
   └───────────────────────────────── room-store.requestCoach
                                        eligibility · single-flight · usage limits · snapshot
                                              │
                                              ▼
                                       agent/coach-agent.runCoach   ◄── RUN_LIMITS (agent/limits.ts)
                                        allowlist · args · repeats · budgets · final check
                                         │                  │
                         model step      ▼                  ▼   tool
                              ai/service.coachStep     agent/tools.ts
                                         │              check_candidates (pure, Core)
                                         ▼              verify_terms (O1 → W04 referee)
                              ai/gateway.generate
                              retries · fallback · deadline · maxAttempts
                                         │
                                         ▼
                              Gemini ⇄ Groq adapters (fetch; key server-side only)
```

The browser never runs a step, never sees a prompt or a model reply, and
never calls a tool.

## One run

```text
User goal: "fill_gaps" on focus [river, animal, country]
   │
   ▼
Validate request ─────────────── fail → INVALID_PAYLOAD / NOT_IN_ROOM / ROUND_STALE /
   │                                     WRONG_PHASE / AI_UNAVAILABLE / AI_LIMIT /
   │                                     RATE_LIMITED            (0 provider calls)
   ▼
Already coached this round? ──── yes → same report (0 calls) │ running → wait for it
   │ no
   ▼
Charge the visitor one run; runId; deadline = now + 25 s
   │
   ▼
┌─► Before step n: n ≤ 3? ≥ 2 s left? attempts left? ── no → STOP max_steps / deadline / call_budget
│      │
│      ▼
│   AI step n  (gateway: ≤ 2 attempts, ≤ 10 s, run signal; retry/fallback = attempts, not steps)
│      │ provider failed ─────────────────────────────────► STOP provider_timeout / _unavailable /
│      │                                                         rate_limited / quota_exhausted
│      ▼
│   Parse + envelope schema ── fail ───────────────────────► STOP malformed_output
│      │
│      ▼
│   Action allowed in THIS step?
│      ├─ not in TOOLS, not final ─────────────────────────► STOP unknown_tool        (tool not run)
│      ├─ known tool not offered, last step ───────────────► STOP max_steps           (tool not run)
│      ├─ known tool not offered, other reason ────────────► STOP invalid_tool_args   (tool not run)
│      └─ final not offered (step 1) ──────────────────────► STOP final_invalid
│      │
│      ├── tool ──► Validate args + run scope
│      │               ├─ invalid / out of scope ──────────► STOP invalid_tool_args   (tool not run)
│      │               └─ already checked ─────────────────► STOP repeated_call       (tool not run)
│      │            Execute tool (read-only)
│      │            Validate result (shape, ≤ 2 KB, ≤ 100 ms)
│      │               └─ fail / throw ────────────────────► STOP tool_failed
│      │            Add items to this run's evidence
└──────┘            (all focus solved → next step offers no check_candidates)
       │
       └── final ─► Validate final: every focus category once; every cited id
                    passes, is in its category (and with O1 not rejected);
                    summary 1–280 chars; confidence set
                       ├─ fail ────────────────────────────► STOP final_invalid
                       └─ ok ──────────────────────────────► STOP goal_completed
   │
   ▼
Report: completed (goal_completed) │ incomplete (other stop, ≥ 1 pass: evidence only)
        │ failed (other stop, nothing passed)
Suggestion text copied from evidence; your answer and why from the reveal
   │
   ▼
Ack to the caller only ─► UI: "Analiza je gotova." / "Analiza je delimična." /
                              "Analiza nije mogla bezbedno da se završi."
Player leaves or the room is reaped at any point ──► abort → cancelled (no ack)
```

## Who stops the run

The application, always. The model can only end a run early by giving a valid
final; every other stop is a check in code that runs **before** the model is
asked again. No `while (true)`: the step loop is `for n in 1..3`.

| Stop | Checked in | Eval |
| --- | --- | --- |
| `goal_completed` | final validation | C1, C2 |
| `unknown_tool` | allowlist | C4, C16 |
| `invalid_tool_args` | argument schema and run scope | C5 |
| `repeated_call` | repeat guard | C9 |
| `tool_failed` | result validation | C6 |
| `provider_timeout`, `provider_unavailable`, `rate_limited`, `quota_exhausted` | gateway result | C7, C8 |
| `malformed_output` | envelope schema | covered in `ai-features.test.ts` (T016) |
| `final_invalid` | final validation | C13, C17 |
| `max_steps` | step limit | C10 |
| `deadline` | time check before each step; run signal | C11 |
| `call_budget` | attempts left in the run | C12 |
| `cancelled` | run signal (disconnect, reap) | T038 |

## Example run log (expected shape, C1)

```text
Run ID: <runId>          Goal: fill_gaps (river, animal, country), Lj / sr
Step 1  model: <model>   decision: check_candidates   allowed
        tool: check_candidates   items 3, passed 1   (c1 river ✓, c2 animal ✗ wrong_letter, c3 country ✗ wrong_letter)
Step 2  model: <model>   decision: check_candidates   allowed
        tool: check_candidates   items 1, passed 1   (c4 animal ✓)
Step 3  model: <model>   decision: final              allowed   → valid
Stop reason: goal_completed   Model steps: 3   Provider attempts: 3   Tool calls: 2   Elapsed: <ms>
```

Real run logs record no candidate words or answers; the words in brackets
above are for the reader only. The model's reasoning is never asked for or
stored.
