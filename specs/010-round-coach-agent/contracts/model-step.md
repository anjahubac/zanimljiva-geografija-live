# Contract: one model step

**Current prompt: `coach-step.v6`**, in `src/server/prompts/coach-step.v6.ts`.
The request is built by the server. Every response is untrusted and passes
JSON parse → envelope schema → current-step allowlist → action shape →
argument/scope or final-evidence validation. The model never chooses a provider.

## Request

One JSON user message per decision:

```json
{
  "goal": "fill_gaps",
  "language": "sr",
  "letter": "Lj",
  "alphabet": "sr",
  "step": 2,
  "stepsLeft": 1,
  "toolCallsLeft": 1,
  "allowedActions": ["check_candidates", "verify_terms", "final"],
  "focus": [
    { "category": "river", "yourAnswer": "", "whyMissed": "empty" },
    { "category": "animal", "yourAnswer": "Lav", "whyMissed": "wrong_letter" }
  ],
  "toolResults": [
    { "tool": "check_candidates", "callId": "t1", "items": [
      { "id": "c1", "category": "river", "term": "Ljubljanica", "passes": true, "failure": null },
      { "id": "c2", "category": "animal", "term": "Lisica", "passes": false, "failure": "wrong_letter" }
    ] }
  ]
}
```

`yourAnswer` is ≤ 40 characters; control characters are stripped and answers
are JSON data. Never included: opponent answers/name, scores, room/round/socket
ids, tokens, settings, other rooms or earlier raw model replies.

Normalized evidence is one of:

- `check_candidates`: `tool`, `callId`, items with `id`, `category`, `term`,
  `passes`, `failure`.
- `verify_terms`: `tool`, `callId`, items with `id`, `verdict`, `reason`.
- `referee_check` (repair only): `tool`, items with `id`, `verdict`, `reason`.

Referee spelling is never sent back to the model. Each main decision uses
operation `coach-step`, interaction id `<runId>:s<n>`, temperature 0.2,
600 output tokens, ≤ 6 s per attempt, ≤ min(10 s, time left) per interaction,
and ≤ min(2, remaining attempts) attempts. All main decisions and referee
interactions share 5 attempts and the original start + 25 s deadline.

## Response envelope

Defined once in `src/contracts/ai-output.schemas.ts`:

```ts
coachStepSchema = z.object({
  action: z.string().min(1).max(40),
  candidates: z.array(z.object({ category: z.string().max(20), term: z.string().max(60) }).strict()).max(32),
  evidenceIds: z.array(z.string().max(8)).max(32),
  summary: z.string().max(400),
  tips: z.array(z.object({ category: z.string().max(20), evidenceId: z.string().max(8) }).strict()).max(16),
  confidence: z.string().max(10),
}).strict();
```

All fields required. The loose envelope lets unknown actions and invalid
arguments reach the application's own checks. The provider JSON schema is a
hint with enums and tighter maxima: 16 candidates/ids, 8 tips. Neither schema
allows the model to execute anything directly.

Examples (unused fields empty):

```json
{"action":"check_candidates","candidates":[{"category":"river","term":"Ljubljanica"}],"evidenceIds":[],"summary":"","tips":[],"confidence":""}
```

```json
{"action":"verify_terms","candidates":[],"evidenceIds":["c1"],"summary":"","tips":[],"confidence":""}
```

```json
{"action":"final","candidates":[],"evidenceIds":[],"summary":"","tips":[{"category":"river","evidenceId":"c1"},{"category":"animal","evidenceId":""}],"confidence":"medium"}
```

## Allowlist and action shape

- Main step 1: `check_candidates` only.
- Later main steps: `final`; `check_candidates` only before step 3 with a
  tool execution left and an unsolved focus category; `verify_terms` only
  before step 3 with a tool execution left and unjudged passing items.
- Main step 3: `final` only.
- Optional repair: `check_candidates` only, no final afterwards.

Name outside `TOOLS` and not `final` → `unknown_tool`. A known tool removed
by the step/tool limit → `max_steps`; otherwise a known tool not offered →
`invalid_tool_args`. A final on step 1 or in repair → `final_invalid`.
Refused proposals cause 0 executions for that proposal.

`check_candidates` fills only candidates; `verify_terms` fills only evidenceIds;
`final` fills only tips and confidence. `summary` MUST always be empty.
Mixed/invalid action shapes produce `invalid_tool_args` for tools or
`final_invalid` for final. Arguments then pass [tools.md](tools.md).

## Final validation and application check

- Every focus category appears exactly once, with no extra category.
- Citation is empty or references a passing item of this run in that category;
  a referee-rejected item cannot be cited.
- Summary is exactly `""`; confidence is `low`, `medium` or `high`.

Failure rejects the whole final. An empty citation permits the application to
choose an existing passing candidate; it does not guarantee an empty report tip.
Before any report, the application sends unjudged chosen words and one backup
per category to the existing referee, within the main time/attempt budget.
Only accepted words are displayed, in the referee's spelling when supplied
and still matching the letter. No model-written prose reaches the report.

## Optional repair

Only after a valid final without an application-check failure, for categories
still empty and with no passing unjudged item. Its request has `step` equal
to the next model decision, `stepsLeft: 0`, `toolCallsLeft: 1`,
`allowedActions: ["check_candidates"]`, focus restricted to those categories,
and prior normalized evidence plus `referee_check` verdicts when available.

It starts only with ≥ 4 s remaining before original start + 35 s. It gets
one model attempt, one extra tool execution and one referee attempt, no retry
or fallback, no next final. Failed/refused repair leaves the earlier report
intact; accepted words are added. Overall maxima: 4 model decisions, 3 tool
executions, 7 attempts, 35 s. Client wait: 45 s.

## Version history

v1: original Core/O1 flow. v2: prefer names in the player's language. v3: empty
model summary, application referee check, accepted spelling. v4: 16 candidates,
backup and one repair. v5: systematic category recall guidance; no web search
or word list. v6: Serbian transcription guidance and regional recall order;
the shared referee prompt is now `check-round.v4`. These prompt changes do not
change the schemas or limits. Historical expectations remain in `docs/AGENT_EVALS.md` and git.
