# Contract: round:coach

Current runtime definitions: `src/contracts/coach.schemas.ts`, event name in
`src/contracts/socket.schemas.ts`. One caller-only acknowledgement; no
server-to-client event and no broadcast.

## Request

```ts
coachRequestSchema = z.object({
  roundId: roundIdSchema,
  goal: z.enum(["fill_gaps"]),
  focus: z.array(categorySchema).min(1).max(CATEGORY_COUNT),
  language: languageSchema,
}).strict().refine(r => new Set(r.focus).size === r.focus.length);
```

```json
{"roundId":"03f34af0-96d7-402e-862c-e0247d1a6371","goal":"fill_gaps","focus":["river","animal"],"language":"sr"}
```

## Server checks in order

| # | Check | Failure |
| --- | --- | --- |
| 1 | strict schema, distinct focus, event frequency | INVALID_PAYLOAD / RATE_LIMITED |
| 2 | caller's socket belongs to a human seat in a room | NOT_IN_ROOM |
| 3 | roundId is the room's current round | ROUND_STALE |
| 4 | phase results with a reveal snapshot | WRONG_PHASE |
| 5 | every focus category is invalid for the caller at reveal | INVALID_PAYLOAD |
| 6 | AI service configured | AI_UNAVAILABLE |
| 7 | cached report → return; running promise → join | 0 new AI calls |
| 8 | daily budget, then visitor's hourly budget | AI_LIMIT / RATE_LIMITED |
| 9 | charge one visitor run and start | — |

The common socket wrapper catches throws as generic `INTERNAL`. Refused
requests cost no AI calls or visitor run. One report per player/round is cached
in memory; changing focus or language later does not create another run.

## Ack

`Ack<CoachReport>`: `{ ok: true, data } | { ok: false, error }`.
The report is strict, with **no summary field**:

```ts
coachReportSchema = z.object({
  status: z.enum(["completed", "incomplete", "failed"]),
  tips: z.array(coachTipSchema).min(1).max(CATEGORY_COUNT),
  confidence: z.enum(["low", "medium", "high"]).nullable(),
  stopReason: coachStopReasonSchema, // cancelled is log-only
  run: runDetailsSchema.optional(), // populated by the built O6 implementation
}).strict().refine(r => (r.status === "completed") === (r.confidence !== null));
```

Each strict tip has `category`, `yourAnswer` (≤ 40 chars), `whyMissed`,
`suggestion` (1–40 chars or null), and `checkedBy` (`letter_rule`,
`letter_rule_and_referee`, or null in the compatibility schema). The current
producer emits only `letter_rule_and_referee` when suggestion is set, otherwise
null. Its word was accepted by the referee in this run and passed the letter
rule; spelling comes from that evidence, never final model prose.

`run` contains exactly `modelSteps` (0–4), `toolCalls` (0–3),
`providerAttempts` (0–7), `provider` (Gemini/Groq or null), `model` (or null),
`elapsedMs`, `stopReason`. It contains no prompt, answer or candidate.

Completed example (illustrative, not live evidence):

```json
{
  "ok": true,
  "data": {
    "status": "completed",
    "tips": [
      {"category":"river","yourAnswer":"","whyMissed":"empty","suggestion":"Ljubljanica","checkedBy":"letter_rule_and_referee"},
      {"category":"animal","yourAnswer":"Lav","whyMissed":"wrong_letter","suggestion":null,"checkedBy":null}
    ],
    "confidence": "medium",
    "stopReason": "goal_completed",
    "run": {"modelSteps":3,"toolCalls":2,"providerAttempts":5,"provider":"gemini","model":"fake-model","elapsedMs":5000,"stopReason":"goal_completed"}
  }
}
```

Incomplete example (earlier river evidence accepted, main loop stopped):

```json
{"ok":true,"data":{"status":"incomplete","confidence":null,"tips":[{"category":"river","yourAnswer":"","whyMissed":"empty","suggestion":"Ljubljanica","checkedBy":"letter_rule_and_referee"},{"category":"animal","yourAnswer":"Lav","whyMissed":"wrong_letter","suggestion":null,"checkedBy":null}],"stopReason":"repeated_call"}}
```

`completed` means a valid final and no application-check failure; it may contain
empty categories after repair. Other stops yield incomplete if at least one
accepted word is shown, failed otherwise. Failed repair keeps the earlier
status. Disconnect/reap → abort, `cancelled` log, no report/ack.

## Client

`requestCoach` in `src/client/socket/game-socket.ts` uses a **45 s** ack timeout,
then parses with `ackSchema(coachReportSchema)`. Timeout shows could-not-complete.
The client writes its summary from checked tip counts. Status, reasons and
Details labels come from SR/EN strings; raw codes/chain-of-thought are not shown.

## Errors

No new error code: INVALID_PAYLOAD, NOT_IN_ROOM, ROUND_STALE, WRONG_PHASE,
AI_UNAVAILABLE, AI_LIMIT, RATE_LIMITED, INTERNAL.
