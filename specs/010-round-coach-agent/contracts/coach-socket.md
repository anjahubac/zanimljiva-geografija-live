# Contract: `round:coach`

The one new client event (`Plan.md` §2C.16 decision 3). Once built, the zod
schemas in `src/contracts/coach.schemas.ts` are authoritative and module 12's
event map lists this event. There is **no server-to-client event**: the report
travels only in the ack, so it reaches only the caller (FR-025).

## Request

```ts
coachRequestSchema = z.object({
  roundId: roundIdSchema,
  goal: z.literal("fill_gaps"),
  focus: z.array(categorySchema).min(1).max(CATEGORY_COUNT),   // distinct; refine
  language: languageSchema,                                    // "sr" | "en"
}).strict();
```

Example:

```json
{ "roundId": "r_3f…", "goal": "fill_gaps", "focus": ["river", "animal", "country"], "language": "sr" }
```

## Server checks, in order (each costs no AI and changes no state)

| # | Check | On failure |
| --- | --- | --- |
| 1 | payload matches the schema (strict, distinct focus) | `INVALID_PAYLOAD` |
| 2 | the socket is a player in a room | `NOT_IN_ROOM` |
| 3 | `roundId` is that room's round and the round has a reveal | `ROUND_STALE` |
| 4 | the room's phase is `results` | `WRONG_PHASE` |
| 5 | every focus category is `valid: false` for the caller | `INVALID_PAYLOAD` |
| 6 | an AI service is configured | `AI_UNAVAILABLE` |
| 7 | the caller already has a report for this round → return it; a run is pending → await it | — (0 AI calls) |
| 8 | daily AI budget left | `AI_LIMIT` |
| 9 | the visitor has coaching runs left this hour (6) | `RATE_LIMITED` |
| 10 | charge the visitor one run; start the run | — |

The bot has no socket, so it can never pass check 2. The request goes through
the same `handle()` wrapper as `round:hint`: per-socket event rate limit, zod
parse, and a generic `INTERNAL` on a thrown error.

## Ack

`Ack<CoachReport>` (`{ ok: true, data } | { ok: false, error }`), as every
other event.

```ts
coachReportSchema = z.object({
  status: z.enum(["completed", "incomplete", "failed"]),
  summary: z.string().min(1).max(280).nullable(),
  tips: z.array(z.object({
    category: categorySchema,
    yourAnswer: z.string().max(MAX_ANSWER_LENGTH),
    whyMissed: missReasonSchema,
    suggestion: z.string().min(1).max(MAX_ANSWER_LENGTH).nullable(),
    checkedBy: z.enum(["letter_rule", "letter_rule_and_referee"]).nullable(),
  }).strict()).min(1).max(CATEGORY_COUNT),
  confidence: z.enum(["low", "medium", "high"]).nullable(),
  stopReason: coachStopReasonSchema,             // never "cancelled"
  run: runDetailsSchema.optional(),              // O6
}).strict()
  .refine(r => (r.status === "completed") === (r.summary !== null && r.confidence !== null));
```

Completed example:

```json
{
  "ok": true,
  "data": {
    "status": "completed",
    "summary": "Za reku na Lj prolazi Ljubljanica. Za životinju nisam našao reč na Lj koja prolazi pravilo slova.",
    "tips": [
      { "category": "river", "yourAnswer": "", "whyMissed": "empty", "suggestion": "Ljubljanica", "checkedBy": "letter_rule" },
      { "category": "animal", "yourAnswer": "Lav", "whyMissed": "wrong_letter", "suggestion": null, "checkedBy": null }
    ],
    "confidence": "medium",
    "stopReason": "goal_completed"
  }
}
```

Incomplete example (stopped by `repeated_call` at step 2, after one pass):

```json
{ "ok": true, "data": { "status": "incomplete", "summary": null, "confidence": null,
  "tips": [ { "category": "river", "yourAnswer": "", "whyMissed": "empty", "suggestion": "Ljubljanica", "checkedBy": "letter_rule" },
            { "category": "animal", "yourAnswer": "Lav", "whyMissed": "wrong_letter", "suggestion": null, "checkedBy": null } ],
  "stopReason": "repeated_call" } }
```

## Client

- `requestCoach(input)` in `src/client/socket/game-socket.ts`, with a **30 s
  ack timeout** (the helper has none today); a timeout shows the "could not
  complete safely" text.
- Text per `status` and `stopReason` comes from `src/client/strings.ts` in the
  player's language; the codes themselves are never shown.

## Errors

No new error code. Reused: `INVALID_PAYLOAD`, `NOT_IN_ROOM`, `ROUND_STALE`,
`WRONG_PHASE`, `AI_UNAVAILABLE`, `AI_LIMIT`, `RATE_LIMITED`, `INTERNAL`.
