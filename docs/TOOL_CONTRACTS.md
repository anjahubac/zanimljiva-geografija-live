# W05 Tool and Result Contracts — post-round coach

**Status:** Implemented contract, 2026-10-07. Runtime source of truth is [coach.schemas.ts](../src/contracts/coach.schemas.ts) and the event alias in `src/contracts/socket.schemas.ts`; this document is the review index, not a second schema.
**Source:** [Spec](../specs/010-post-round-coach/spec.md), [impact review](../specs/010-post-round-coach/impact-analysis.md).
Boundary schemas live once in `src/contracts` and types are inferred from them. The implementation is checked against the exact request, terminal ack and tool/result shapes below.

## User request and authorization

Proposed new client event: `round:coach`, through the existing Socket.IO handler and ack envelope.

Strict request fields: `roundId` (existing round identifier format), `goalId` (only `review_round`), `language` (`sr` or `en`). Maximum serialized request size: 512 UTF-8 bytes. No raw text, player slot, score, room code, provider/model, tools or evidence may be supplied by the browser.

Infer the owner from the socket binding. Require an existing completed room, the same current round, a connected human seat and an available canonical completed snapshot. Validate before provider admission. Errors reuse `INVALID_PAYLOAD`, `NOT_IN_ROOM`, `ROOM_NOT_FOUND`, `WRONG_PHASE`, `ROUND_STALE`, `RATE_LIMITED`, `AI_LIMIT`, `AI_UNAVAILABLE`, `INTERNAL` as applicable. Run-stop reasons use the separate flow contract.

Transport choice: asynchronous terminal ack only, `{ok: true, data: CoachRunView}` after an admitted run completes/stops/fails; preflight rejections use `{ok: false, error}`. The socket client needs a W05-specific ack timeout of 32 seconds; legacy request timeouts remain unchanged. Loading is a safe UI state while waiting, not an authority boundary. A late ack cannot update a departed screen.

## Tool: `analyze_round`

| Field | Contract |
| --- | --- |
| Purpose | Compute accurate per-category observations, totals and eligible practice suggestions for the caller's exact completed sheet |
| Mode | READ ONLY / deterministic local operation; no provider or network call |
| Allowed caller | Backend coach orchestrator during its tool phase after a valid first-step proposal |
| Input schema | Exactly `{ focus }`, where focus is `overview`, `blank_categories` or `rejected_answers`; extra keys rejected; cap 128 UTF-8 bytes |
| Authorization/scope | Owner, source snapshot and source version are bound by the application; model cannot choose a room, round, player or arbitrary resource |
| Source | Detached, checked snapshot captured from the actual canonical reveal/result construction; never reconstruct AI decisions or rerun scoring/checking |
| Input bounds | Exactly the existing eight unique categories, bounded enums and 0/5/10 points; bounded computation |
| Timeout | 250 ms, shortened by remaining total deadline |
| Maximum result | 16,384 UTF-8 bytes; schema then byte-size then semantic validation |
| Forbidden behavior | Mutate game/snapshot/run ownership, change score/verdicts/hints, reveal opponent fields, expose secrets, read files, use shell/SQL, fetch URLs, call providers or execute another tool |
| Failure behavior | Invalid proposal executes zero tools; invalid output is not sent to model; throw/timeout becomes classified terminal failure |
| Purity evidence | Deep comparison of canonical game before/after; mutating the returned object cannot mutate its source |

The allowlist contains exactly this tool. The model cannot add tools or alter the allowlist.

## Private completed source

The current close path computes canonical `RoundRevealed` and `RoundResults` once and emits them; it does not retain a standalone result object. Implementation must add an immutable completed-result source at that point, using the exact checked objects already constructed. It must not emit new reveal/results or retain copies of live drafts for the coach.

For each human seat, project eight category records containing only: category, blank flag, accepted flag, recorded reject reason or null, hinted flag, points and recorded scoring reason. Include letter, alphabet, verified status and own total. Internal round/source identity stays server-side. No raw/normalized answers or opponent rows are needed in the coach projection.

The source version is immutable for the run. Missing, inconsistent or removed source fails closed; cleanup retains no additional history.

## Normalized tool output

Strict fields:

- `sourceVersion`: opaque internal version bound to this run; included for backend validation and stripped from provider context if it identifies a resource.
- `focus`: the validated focus.
- `letter`, `alphabet`, `verified`.
- `totals`: eight categories; integer blank, accepted, rejected-nonblank, hinted and accepted-duplicate counts in 0..8; own points in 0..80. Blank + accepted + rejected-nonblank equals eight; points sum matches canonical total.
- `cells`: exactly eight unique category records, in canonical category order, with the flags/reasons/points from the private source.
- `evidence`: exactly ten records: one `totals`, one `verification` and `cell:<category>` for each category. Each has a closed `kind` and typed facts; evidence contains no free-form alleged fact.
- `eligibleRecommendations`: at most 40 unique tuples of approved code, category (or null), and one to three required evidence IDs. Derived deterministically from the cells/totals.
- `priorityEvidenceIds`: exactly the ten supplied evidence IDs, once each. Requested focus determines ordering; stable canonical order resolves ties. Overview prioritizes rejected nonblank cells, then blanks, hints, accepted duplicates, remaining accepted cells, totals and verification. Blank/rejected focus puts that group first, then the overview order. Empty focus groups naturally fall through.

Evidence IDs are local to this output and never identify other players. Empty-string answers are represented only as blank flags. Invalid point/verdict combinations, extra categories, missing/duplicate IDs, inappropriate reject reasons, unexpected keys or inconsistent totals invalidate the output.

## Approved recommendation eligibility

| Code | Category | Required support / meaning |
| --- | --- | --- |
| `practice_recall` | One blank category | Its blank cell evidence; suggest timed recall, without asserting the cause of the blank |
| `check_category` | One nonblank rejected category | Recorded `wrong_category`, in a verified round; describe the checker's decision rather than an independent fact |
| `check_letter` | One nonblank rejected category | Recorded `wrong_letter`; refer to the existing round alphabet/letter rule |
| `check_length` | One nonblank rejected category | Recorded `too_short`; use the existing minimum-length rule |
| `review_rejected_term` | One nonblank rejected category | Recorded `not_real`, `historical` or `unrecognized`, verified round; suggest review, no replacement answer or definitive new verdict |
| `practice_without_hint` | One hinted category | Its hint-use evidence; optional practice, no cheating/penalty assertion |
| `vary_answers` | One accepted duplicate category | Its accepted five-point duplicate evidence; valid answer, optional variation for future play |
| `maintain_approach` | null | `totals` and `verification` showing all eight accepted, no blanks/rejections; qualified as locally accepted if unverified |

Different suggestions may apply to one cell, but the final review selects at most one recommendation per category (and `maintain_approach` at most once). Do not insist on two suggestions when only one is useful. Unverified sources may only use local-rule/blank/hint/duplicate/qualified-maintenance options, never category/existence verdicts.

No code generates geography examples, diagnoses ability or changes a game rule. Approved translations must use the exact recorded facts and attribute any AI rejection to the original checker.

## Model boundary and final decision

Step 1 successful shape: strict `kind: "tool_request"`, `toolRequest: {name: "analyze_round", arguments: {focus}}`. Runtime validation first checks a bounded proposal envelope (tool name string of 1–64 characters), then looks up the name in the trusted allowlist, then validates that tool's strict arguments. This preserves a distinct `unknown_tool` reason instead of treating every unknown name as a generic schema error. The provider's requested output contract advertises only the permitted name. No final/refusal is treated as success. A refusal is a safe terminal outcome.

Step 2: strict `kind: "final"`, `final: { findingIds, recommendations, completed: true }`.

- `findingIds`: one to three unique IDs present in the validated tool output.
- `recommendations`: one or two strict records `{code, category, evidenceIds}`, each an eligible tuple, with one to three unique supplied evidence IDs. No extra fields, narrative, score, resource ID or unknown recommendation is accepted.
- `completed` is a model proposal only; the backend accepts completion after all validation. Unsupported findings, mismatched category/evidence, duplicated recommendations or wrong phase stop the run.
- `refusal` may stop either step; another tool request in step 2 is classified and never executed.

Minimum provider context for step 1: trusted instruction, fixed goal, letter/alphabet, verified status, language and allowed contract. Step 2 adds the normalized checked evidence and eligible options. Source/run/room/owner identifiers, names, addresses, answers and diagnostics are stripped. Tool definitions/results are data, never authority to alter system rules.

Each step requests at most 1,024 output tokens; decoded model text is capped at 8,192 UTF-8 bytes before JSON parsing. Oversize text is an invalid structured response, never truncated into an apparently valid result. Production admission requires the configured quota/attempt guard; absent guards fail closed. These additions apply to the coach operation only.

## User-facing final-response contract

`CoachRunView` has strict fields `runId`, `roundId`, `status`, `stopReason`, `stepCount`, `toolCallCount`, `providerAttemptCount`, `elapsedMs`, and `result`.

An admitted terminal response has status `completed`, `stopped` or `failed`. `completed` requires reason `completed` and a validated result; all other outcomes require `result: null`. Counts/times are bounded. Only the requesting socket receives it; round/run IDs support stale-response checks, never go into model prompts.

Validated `result` fields:

- `summary: { findingIds }`: selected evidence IDs, with descriptions generated only from checked facts.
- `recommendations`: checked approved choices with supporting IDs.
- `evidence`: the ten checked structured records, without source version or private identifiers.
- `confidence`: `medium` when verified, `low` otherwise; assigned by the application.
- `limitations`: includes `single_round` and `checker_can_be_wrong` for verified rounds, or `single_round` and `local_rule_only` for unverified rounds.
- `completed: true`: application-assigned only after final validation.

SR/EN dictionaries render summary, advice and evidence as escaped plain text from these structures. No raw model prose or Markdown/HTML is rendered. This retains structured results, enables exact factual checking and allows language switches without another model run. It intentionally limits narrative variety.

## Evidence and log caps

At most two step records, three provider attempts, one executed tool and two proposal-validation records per run. A sanitized trace is capped at 16,384 UTF-8 bytes. Log available usage from all attempts; absent usage remains unknown. No raw prompt/reply logging for this operation, including optional local debug mode. Synthetic evidence may contain declared fixture observations; real user content is never committed.
