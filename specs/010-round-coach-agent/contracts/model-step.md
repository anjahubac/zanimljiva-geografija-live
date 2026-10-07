# Contract: one model step

What the orchestrator sends the model in each step, and what the model must
return. Prompt `coach-step.v1` (`src/server/prompts/coach-step.v1.ts`, research
R17). Everything the model returns is **untrusted input** and passes through
four checks in order: JSON parse → envelope schema → per-step allowlist →
arguments or final validation.


_Update 2026-10-07: the prompt is now `coach-step.v2`
(`src/server/prompts/coach-step.v2.ts`). v1 did not say which language a
proposed term should be in, so a Serbian player was shown "Euphrates" instead
of "Eufrat". v2 asks for the name the player would write in their interface
language, and the other language only when that name misses the round letter.
The request and response shapes are unchanged. This is a prompt hint: the game
accepts both languages, so code does not enforce it._
## Request (built by the server per step)

The system instruction is fixed per prompt version. The user content is one
JSON object; the player's answers appear only as JSON string values, with
control characters stripped:

```json
{
  "goal": "fill_gaps",
  "language": "sr",
  "letter": "Lj",
  "alphabet": "sr",
  "step": 2,
  "stepsLeft": 1,
  "toolCallsLeft": 1,
  "allowedActions": ["check_candidates", "final"],
  "focus": [
    { "category": "river",   "yourAnswer": "",          "whyMissed": "empty" },
    { "category": "animal",  "yourAnswer": "Lav",       "whyMissed": "wrong_letter" },
    { "category": "country", "yourAnswer": "Ljubljana", "whyMissed": "wrong_category" }
  ],
  "toolResults": [
    { "tool": "check_candidates", "callId": "t1", "items": [
      { "id": "c1", "category": "river",   "term": "Ljubljanica", "passes": true,  "failure": null },
      { "id": "c2", "category": "animal",  "term": "Lisica",      "passes": false, "failure": "wrong_letter" },
      { "id": "c3", "category": "country", "term": "Lihtenštajn", "passes": false, "failure": "wrong_letter" }
    ] }
  ]
}
```

Never included: the opponent's answers or name, scores, room code, round id,
socket ids, tokens, configuration, earlier model replies (FR-007).

Gateway settings per step: operation `coach-step`, `interactionId =
<runId>:s<n>`, temperature 0.2, max 600 output tokens, budget
`BUDGETS["coach-step"]` with `totalMs = min(10 s, time left in run)` and
`maxAttempts = min(2, attempts left in run)`, and the run's `AbortSignal`.

## Response envelope

One flat object (Gemini takes no `anyOf`). All fields required; unused ones
empty.

```ts
coachStepSchema = z.object({
  action: z.string().min(1).max(40),       // NOT an enum: the allowlist judges it (research R3)
  candidates: z.array(z.object({ category: z.string().max(20), term: z.string().max(60) }).strict()).max(16),
  evidenceIds: z.array(z.string().max(8)).max(16),          // verify_terms (O1)
  summary: z.string().max(400),
  tips: z.array(z.object({ category: z.string().max(20), evidenceId: z.string().max(8) }).strict()).max(16),
  confidence: z.string().max(10),
}).strict();
```

The envelope is deliberately loose (wide maxima, strings not enums) so that
every malformed **argument** reaches the tool's own validation and is recorded
as `invalid_tool_args`, not as `malformed_output`. `malformed_output` is only
for a reply that is not JSON or not this shape.

The JSON schema sent to the provider is stricter (enums for `action`,
`category`, `confidence`; `maxItems` 8), as a hint only.

## Checks after the envelope

1. **Allowlist.** `action` must be in this step's `allowedActions`
   (research R7). Otherwise nothing runs, and the stop reason says why:
   - not a name in `TOOLS` and not `final` → `unknown_tool`;
   - a tool in `TOOLS` that this step does not offer, on the last step or with
     no tool call left → `max_steps` (the limit removed it, eval C10);
   - a tool in `TOOLS` that this step does not offer for any other reason
     (`check_candidates` after every focus category passed, `verify_terms`
     with nothing to verify) → `invalid_tool_args`;
   - `final` when not offered (step 1) → `final_invalid`.
2. **Shape per action.**
   - `check_candidates`: `candidates` non-empty; `evidenceIds`, `summary`,
     `tips` empty; `confidence` empty.
   - `verify_terms` (O1): `evidenceIds` non-empty; everything else empty.
   - `final`: `summary`, `tips` and `confidence` set; `candidates` and
     `evidenceIds` empty.
   A mismatch → `invalid_tool_args` for a tool, `final_invalid` for a final.
3. **Arguments** — see [tools.md](tools.md).
4. **Final** — every rule below.

## Final validation (FR-019, research R9)

- `tips` lists every focus category exactly once and nothing else;
- each `evidenceId` is `""` (no suggestion) or the id of a **passing** evidence
  item of this run in the **same category** (with O1, not rejected by the
  referee);
- `summary`: 1–280 characters after trim, no control characters;
- `confidence`: `low`, `medium` or `high`.

Any failure rejects the whole final (`final_invalid`). On success the report's
suggestion text is copied from the evidence item, never from the model.
