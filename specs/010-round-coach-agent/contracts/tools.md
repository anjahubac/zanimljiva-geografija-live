# Tool contracts (W05 `TOOL_CONTRACTS.md`)

The allowlist, in code (`src/server/agent/tools.ts`):

```ts
const TOOLS = {
  check_candidates,          // Core
  verify_terms,              // O1, added at W5-10a
} as const;
```

`final` is the terminal action, not a tool. A name outside `TOOLS`, or a tool
not in the current step's `allowedActions` ([model-step.md](model-step.md)),
is **refused before anything runs**: `unknown_tool`, and the run's tool-call
counter does not move. There is no generic `execute(name, args)`: each tool is
called through its own entry, after its own argument schema and scope check.

Validation order for every proposal (W05 §12): tool name → input schema →
run scope → resource ownership (the run is bound to one room, round and
player by the server) → limits → execute → result schema and size → evidence.

---

## `check_candidates` — Core

| Field | Contract |
| --- | --- |
| **Name** | `check_candidates` |
| **Purpose** | Apply validity step 1 of the game itself — `checkAnswerLocally` with the room's alphabet (minimum length, starting letter, diacritics, Serbian Lj/Nj/Dž) — to words the agent proposes, so it learns which would pass and why not. This is the rule the models get wrong most often (`Plan.md` §2B.13), so the tool corrects the agent with evidence. |
| **Read/Write** | **Read-only**, deterministic, pure. Same input, same output. |
| **Input schema** | `{ candidates: Array<{ category: Category; term: string }> }` — 1–8 items; ≤ 2 per category; `term` 1–40 characters after trim (`MAX_ANSWER_LENGTH`), no control characters (`\p{Cc}`); categories from `CATEGORIES` |
| **Scope (run)** | each `category` is a focus category with **no passing item yet** in this run; no `(category, compactFold(term))` already checked in this run (else `repeated_call`); a tool call left (≤ 2 per run) |
| **Output schema** | `{ callId: "t1" \| "t2"; items: Array<{ id: string; category: Category; term: string; passes: boolean; failure: "too_short" \| "wrong_letter" \| "same_as_yours" \| null }> }` — one item per candidate, in order; `id` `c<n>` unique in the run; `failure` is `null` exactly when `passes` |
| **`same_as_yours`** | the candidate folds (`compactFold`) to the caller's own non-counting answer in that category: proposing it back teaches nothing |
| **Allowed caller** | the coach orchestrator only. Not a socket event; not reachable from the browser; never called by the model directly |
| **Authorization** | bound by the server to one (room, round, player); reads only that player's revealed answers and the round's `letter` and `alphabet` from `Round.reveal` |
| **Timeout** | synchronous; the call is timed, and over **100 ms** counts as a failure |
| **Max result size** | 8 items; ≤ **2 KB** serialized; checked before the model sees it |
| **Must not** | change any state (answers, validity, points, phase, timers, limits); read the opponent's sheet; use AI, network, files or the clock; log terms; throw past the orchestrator |
| **Failure behavior** | throws, runs over 100 ms, or returns a result that fails its schema or size → `tool_failed`; the run stops (`incomplete` if earlier evidence passed, else `failed`). **No retry**: a deterministic tool would fail the same way |
| **Invalid input behavior** | schema or scope failure → `invalid_tool_args`; repeat → `repeated_call`. The tool **does not run**; the tool-call counter stays where it was (C4, C5, C9) |

Example, letter Lj, Serbian alphabet, the caller wrote "Lav" for animal:

```json
in:  { "candidates": [ { "category": "animal", "term": "Lisica" }, { "category": "animal", "term": "lav" } ] }
out: { "callId": "t1", "items": [
       { "id": "c1", "category": "animal", "term": "Lisica", "passes": false, "failure": "wrong_letter" },
       { "id": "c2", "category": "animal", "term": "lav",    "passes": false, "failure": "wrong_letter" } ] }
```

**Failure order:** `too_short`, then `wrong_letter`, then `same_as_yours`. So
"lav" above reports the letter failure. `same_as_yours` matters when the
caller's own answer passed the letter rule but the referee rejected it: with
"Ljubljana" rejected for country as `wrong_category`, proposing "Ljubljana"
again for country is `same_as_yours`, not a pass.

---

## `verify_terms` — O1 (built at W5-10a on 2026-10-07, after Core was green)

_Built as written below. Its model-facing result is `{ tool: "verify_terms",
callId, items: [{ id, verdict, reason }] }` in the next step's `toolResults`;
the referee's provider attempts are logged under that step's `tool.attempts`._

| Field | Contract |
| --- | --- |
| **Name** | `verify_terms` |
| **Purpose** | Ask the existing W04 referee whether words that already passed `check_candidates` are real terms of their category, closing Core's gap (a word can pass the letter rule and still be invented) |
| **Read/Write** | **Read-only**. Not deterministic: it makes one AI call |
| **Input schema** | `{ evidenceIds: string[] }` — 1–8 ids, distinct |
| **Scope (run)** | every id is a **passing** `check_candidates` item of this run, not yet verified; a tool call left. Ids only: **no new text** can reach the referee through this tool |
| **Output schema** | `{ callId; items: Array<{ id; verdict: "accepted" \| "rejected" \| "unverified"; reason: RejectReason \| null }> }` — one per id |
| **How** | builds at most two sheets (≤ 1 word per category each) from the cited items and calls `runCheck` (`check-round.v3`, unchanged) with its existing code-side overrides: resemblance to the written word, and the letter decided by code |
| **Allowed caller** | the coach orchestrator only |
| **Authorization** | same binding as `check_candidates`; never sees the caller's or the opponent's answers, only the cited candidates |
| **Budget** | counts as one of the run's **2 tool calls**; its provider attempts count toward the run's **5**; its call counts toward `AI_DAILY_CALL_BUDGET`. Budget per call: `totalMs = min(10 s, time left)`, `maxAttempts = min(2, attempts left)`, the run's signal |
| **Timeout** | the step budget above; the run deadline always wins |
| **Max result size** | 8 items; ≤ 1 KB |
| **Must not** | change any state; send anything but the cited terms, the letter and category names; log terms |
| **Failure behavior** | the referee fails (timeout, quota, bad output) → every cited item is `unverified`, the run **continues**, and those suggestions stay `checkedBy: "letter_rule"`. A `rejected` item stops being passing; a final that cites it is `final_invalid` |
| **Invalid input behavior** | unknown, failing, repeated or already-verified ids → `invalid_tool_args`; nothing runs |

---

## Forbidden to the agent in every form

Writing anything; the opponent's sheet; other rooms; rescoring; starting a
round; sending to the opponent; arbitrary functions, URLs, files or shell;
choosing a model or provider; more steps, calls, attempts or time than the run
allows (W05 §8). None of these has a tool, and the allowlist refuses any name
that is not in `TOOLS`.
