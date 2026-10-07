# Data model: Round coach

Phase 1 of [plan.md](plan.md). Shapes are described here; once built, the zod
schemas in `src/contracts/coach.schemas.ts` and `src/contracts/ai-output.schemas.ts`
are authoritative (module 12). Nothing here is persisted: every entity lives in
memory with the finished room.

## Existing data the feature reads (unchanged)

| Data | Where | Used for |
| --- | --- | --- |
| Round letter, alphabet | `Round.letter`, `Round.alphabet` | the tool's letter rule, the prompt |
| The caller's revealed answers | `RoundRevealed.player1/2[]`: `category`, `raw`, `valid`, `reason` | focus categories (`valid: false`), `yourAnswer`, `whyMissed` |
| The caller's identity and slot | the socket → room → player (never the payload) | ownership |

**One addition to the round:** `Round.reveal: RoundRevealed | null`, set once
in `completeRound` from the object it already parses for `round:revealed`.
Read-only afterwards.

## CoachRequest (client → server, `round:coach`)

| Field | Rule |
| --- | --- |
| `roundId` | the room's current round, revealed (`ROUND_STALE` otherwise) |
| `goal` | `"fill_gaps"` (the only value) |
| `focus` | 1–8 distinct categories, each one where the caller has `valid: false` (`INVALID_PAYLOAD` otherwise) |
| `language` | `"sr"` or `"en"`; the summary's language |

Strict: any other key is `INVALID_PAYLOAD`. See [contracts/coach-socket.md](contracts/coach-socket.md).

## MissReason

`"empty"` plus the existing `REJECT_REASONS`: `too_short`, `wrong_letter`,
`not_real`, `wrong_category`, `historical`, `unrecognized`.

## CoachRun (server, per player per round)

| Field | Meaning |
| --- | --- |
| `runId` | random id, also the prefix of each step's `interactionId` |
| `focus` | `{ category, yourAnswer, whyMissed }[]` from the reveal |
| `letter`, `alphabet`, `language`, `goal` | copied at start |
| `startedAt`, `deadlineAt` | from the injected clock; `deadlineAt = startedAt + 25 s` |
| `stepsUsed` (≤ 3), `toolCallsUsed` (≤ 2), `attemptsUsed` (≤ 5) | counters, checked before every step |
| `evidence` | `EvidenceItem[]` in order |
| `checked` | set of `category:compactFold(term)`, for the repeat guard |
| `log` | `StepRecord[]` for the run log |
| `signal` | the run's `AbortSignal` |

Kept on the player as `coach`:

```text
null ──request──► running { promise, abort } ──settles──► done { report }
                        │
                        └─ disconnect / room reaped ──► (aborted; no report kept)
```

A request while `running` awaits the same promise; while `done` returns
`report` at once.

## Run state transitions

```text
start
  └► step n (n = 1..3)
       ├─ limits spent before the step ─────────────► stop(max_steps | deadline | call_budget)
       ├─ provider failure ─────────────────────────► stop(provider_* | rate_limited | quota_exhausted)
       ├─ envelope invalid ─────────────────────────► stop(malformed_output)
       ├─ action not in TOOLS and not final ────────► stop(unknown_tool)         toolCalls unchanged
       ├─ known tool not offered, last step ────────► stop(max_steps)            toolCalls unchanged
       ├─ known tool not offered, other reason ─────► stop(invalid_tool_args)    toolCalls unchanged
       ├─ final not offered (step 1) ───────────────► stop(final_invalid)
       ├─ args invalid / out of scope ──────────────► stop(invalid_tool_args)    toolCalls unchanged
       ├─ candidate already checked ────────────────► stop(repeated_call)        toolCalls unchanged
       ├─ tool → result invalid / throws / > 100 ms ► stop(tool_failed)
       ├─ tool → result valid ──────────────────────► evidence += items; next step
       ├─ final invalid ────────────────────────────► stop(final_invalid)
       └─ final valid ──────────────────────────────► stop(goal_completed)
  signal aborted at any point ──────────────────────► cancelled (no report)

status = goal_completed ? completed : (some evidence passed ? incomplete : failed)
```

## StepRecord (run log, typed fields only)

| Field | Meaning |
| --- | --- |
| `n` | step number |
| `action` | the action named by the model, or `null` if the envelope failed |
| `decision` | `allowed` or `rejected` |
| `rejectReason` | `unknown_tool`, `invalid_tool_args`, `repeated_call`, `malformed_output`, `final_invalid` |
| `attempts` | `ProviderAttempt[]` from `AiResult.attempts` (provider, model, kind, status, error class, latency) |
| `tool` | `{ name, items, passed, latencyMs }` when a tool ran |
| `usage` | token counts when the provider gave them |

## EvidenceItem (tool output, normalized)

| Field | Meaning |
| --- | --- |
| `id` | `c1`, `c2`, … unique in the run |
| `callId` | `t1` or `t2` |
| `category` | a focus category |
| `term` | the candidate, trimmed, ≤ 40 characters |
| `passes` | the game's letter rule accepted it and it is not the caller's own answer |
| `failure` | `too_short`, `wrong_letter`, `same_as_yours`, or `null` |
| `referee` (O1) | `accepted`, `rejected` or `not_checked` |

A **passing** item: `passes` and `referee !== "rejected"`.

## CoachReport (server → caller, the ack)

| Field | Rule |
| --- | --- |
| `status` | `completed`, `incomplete`, `failed` |
| `summary` | 1–280 characters, no control characters; `completed` only, else `null` |
| `tips[]` | one per focus category, in category order |
| `tips[].category` | the focus category |
| `tips[].yourAnswer` | from the reveal (`raw`) |
| `tips[].whyMissed` | a `MissReason`, from the reveal |
| `tips[].suggestion` | the cited evidence item's `term`, or `null` |
| `tips[].checkedBy` | `letter_rule`, or `letter_rule_and_referee` when the referee accepted it (O1); `null` with no suggestion |
| `confidence` | `low`, `medium`, `high`; `completed` only, else `null` |
| `stopReason` | a `CoachStopReason` (below); `cancelled` is never sent |
| `run` (O6) | `{ modelSteps, toolCalls, providerAttempts, provider, model, elapsedMs, stopReason }`; `provider`/`model` of the last successful attempt, or `null` |

For `incomplete`, each tip's suggestion is the first passing evidence item of
that category, or `null`.

## CoachStopReason

`goal_completed`, `unknown_tool`, `invalid_tool_args`, `repeated_call`,
`tool_failed`, `provider_timeout`, `provider_unavailable`, `rate_limited`,
`quota_exhausted`, `malformed_output`, `final_invalid`, `max_steps`,
`deadline`, `call_budget`, plus `cancelled` (log only).

Mapping from the gateway's `AiFailureCode`: `timeout` → `provider_timeout`;
`transport`, `provider_transient`, `model_unavailable`, `auth_config`,
`not_configured`, `invalid_request`, `safety_refusal` →
`provider_unavailable`; `rate_limited` → `rate_limited`; `quota_exhausted` →
`quota_exhausted`; `invalid_output:*` → `malformed_output`; `deadline_exhausted`
→ `deadline`; `cancelled` → `cancelled`. A gateway stop caused by
`maxAttempts` maps to `call_budget` when the run's attempts are spent.
