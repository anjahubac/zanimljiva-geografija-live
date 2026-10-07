# Data model: Round coach

Phase 1 of [plan.md](plan.md). Current shapes are described here; the built zod
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
| `roundId` | the room's current round (`ROUND_STALE` otherwise); the phase must be `results`, with the round revealed (`WRONG_PHASE` otherwise) |
| `goal` | `"fill_gaps"` (the only value) |
| `focus` | 1–8 distinct categories, each one where the caller has `valid: false` (`INVALID_PAYLOAD` otherwise) |
| `language` | `"sr"` or `"en"`; the player's language (for the referee's spelling and the prompt) |

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
| `startedAt`, `deadlineAt` | from the injected clock; `deadlineAt = startedAt + 25 s`; optional repair uses original start + 35 s |
| `stepsUsed` (≤ 4), `toolCallsUsed` (≤ 3), `attemptsUsed` (≤ 7) | main limits 3/2/5, optional repair adds at most 1/1/2; checked before interactions |
| `evidence` | `EvidenceItem[]` in order |
| `checked` | keys derived from evidence as `category:compactFold(term)`, for the repeat guard |
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

main stop → application-owned referee check → optional repair after valid final
status = goal_completed ? completed : (some accepted suggestion shown ? incomplete : failed)
failed/refused repair preserves the prior status; cancellation sends no report
```

## StepRecord (run log, typed fields only)

| Field | Meaning |
| --- | --- |
| `n` | step number |
| `action` | the action named by the model, or `null` if the envelope failed |
| `decision` | `allowed`, `rejected`, or null before a validated action |
| `rejectReason` | `unknown_tool`, `invalid_tool_args`, `repeated_call`, `malformed_output`, `final_invalid`, `max_steps` |
| `attempts` | `ProviderAttempt[]` from `AiResult.attempts` (provider, model, kind, status, error class, latency) |
| `tool` | `{ name, items, passed, latencyMs, attempts? }` when a tool ran; O1 referee attempts included |
| `repair` | optional `true` for the extra model decision |
| `usage` | token counts when the provider gave them |

## EvidenceItem (tool output, normalized)

| Field | Meaning |
| --- | --- |
| `id` | `c1`, `c2`, … unique in the run |
| `callId` | `t1`, `t2`, or `t3` (repair) |
| `category` | a focus category |
| `term` | the candidate, trimmed, ≤ 40 characters |
| `passes` | the game's letter rule accepted it and it is not the caller's own answer |
| `failure` | `too_short`, `wrong_letter`, `same_as_yours`, or `null` |
| `referee` | `accepted`, `rejected` or `not_checked` |

A **passing** item for model citations: `passes` and `referee !== "rejected"`.
A **displayable** item must be referee-accepted. `shownAs` optionally holds
the referee's spelling after the letter check.

## CoachReport (server → caller, the ack)

| Field | Rule |
| --- | --- |
| `status` | `completed`, `incomplete`, `failed` |
| `tips[]` | one per focus category, in category order |
| `tips[].category` | the focus category |
| `tips[].yourAnswer` | from the reveal (`raw`) |
| `tips[].whyMissed` | a `MissReason`, from the reveal |
| `tips[].suggestion` | accepted evidence's `shownAs` when supplied, otherwise its `term`, or `null` |
| `tips[].checkedBy` | current producer: `letter_rule_and_referee` for a suggestion, otherwise null; compatibility schema still accepts `letter_rule` |
| `confidence` | `low`, `medium`, `high`; `completed` only, else `null` |
| `stopReason` | a `CoachStopReason` (below); `cancelled` is never sent |
| `run` (O6) | `{ modelSteps, toolCalls, providerAttempts, provider, model, elapsedMs, stopReason }`; `provider`/`model` of the last successful attempt, or `null` |

For `incomplete`, only referee-accepted evidence may supply a suggestion.
`completed` can have empty categories after a bounded unsuccessful repair.
The report has no summary field; the client writes its sentence from checked
tip counts. The client stops waiting at 45 s.

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
→ `deadline`; `cancelled` → `cancelled`. A retryable gateway stop maps to `call_budget` only when the run's remaining
attempts narrowed that interaction below its usual two and all granted
attempts were used. Other provider failures keep their specific reason.

_Update 2026-10-07 (owner: "a suggestion for every category", `Plan.md` §2C.16, last entry): `RUN_LIMITS` gains
`repairModelSteps` 1, `repairToolCalls` 1, `repairAttempts` 2 and
`repairExtraMs` 10 s; `maxCandidatesPerCall` is 16 and `maxToolResultBytes`
4 KB. `agent.run` may carry `refereeCheck: { items, accepted, attempts }`
and `repair: { categories, items, accepted, attempts }`. No words or raw
answers are recorded._
