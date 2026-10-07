# Feature Specification: Bounded post-round AI coach

**Feature Branch**: `010-post-round-coach`

**Created**: 2026-10-07

**Status**: Specification complete; awaiting implementation-plan approval. No runtime implementation or feature test results yet.

**Input**: The owner accepted the proposed Week 5 coach for Zanimljiva Geografija, requested Spec Kit, full assignment coverage and required artifacts, a local branch from Anja's main, and no push. This pass specifies the feature; it does not authorize implementation of new contracts or quota behavior.

**Source of truth**: This specification owns feature behavior. `Plan.md` §2C records scope and decisions. [Assignment coverage](checklists/assignment-coverage.md) maps the supplied W05 assignment and addendum. [Impact analysis](impact-analysis.md) records existing producers and consumers. Proposed technical contracts are in [TOOL_CONTRACTS](../../docs/TOOL_CONTRACTS.md); implemented runtime schemas will be authoritative when they exist.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Get useful advice about my completed round (Priority: P1)

After seeing a round's final results, a human player chooses **Analyze my round** with the goal: **Review this round and recommend up to two things I can practice**. The coach selects an analysis focus, reads checked evidence about that player's completed sheet, then selects useful recommendations supported by that evidence. It produces a short localized review. The player can continue to the lobby without waiting for the coach.

**Why this priority**: Gives an actionable next step while extending the existing AI integration through two model decisions and one meaningful local analysis.

**Independent Test**: Complete a synthetic round with blanks, a rejected answer and an accepted duplicate. Request analysis and verify the advice against that player's exact revealed results.

**Acceptance Scenarios**:

1. **Given** final results with two blank categories and a wrong-category rejection, **When** the player requests coaching, **Then** the coach returns one or two supported practice suggestions, names the relevant categories, and limits its review to this round.
2. **Given** an accepted answer worth five points because the opponent used the same answer, **When** reviewed, **Then** it is described as an accepted duplicate, never as an incorrect answer.
3. **Given** a hinted answer, **When** reviewed, **Then** hint usage is reported without implying cheating, lack of knowledge or a score penalty.
4. **Given** eight accepted answers without hints or duplicates, **When** reviewed, **Then** the coach may recommend maintaining the approach and must not invent a weakness.
5. **Given** all eight categories blank, **When** reviewed, **Then** the coach reports the blanks and may suggest recall practice without claiming why the player left them blank.
6. **Given** either human seat in friend, random or AI-opponent play, **When** coaching runs, **Then** only the requesting human's evidence and private coaching result are used.

### User Story 2 - Keep analysis private and honest about its evidence (Priority: P1)

The player receives a review grounded in their own completed sheet. It explains what the recorded results show, without rejudging geography, comparing hidden sheets or diagnosing long-term ability.

**Why this priority**: Existing score decisions and answer privacy are critical product boundaries.

**Independent Test**: Try early, stale, cross-room and spoofed-player requests; then review an unverified round and check that its limitations are visible.

**Acceptance Scenarios**:

1. **Given** any phase before final results, **When** analysis is requested, **Then** it is rejected before any model or analysis-tool execution.
2. **Given** a forged player identity, foreign round, extra score field or unknown request field, **When** submitted, **Then** the request is rejected without changing the game or contacting a provider.
3. **Given** results scored using only the local length/letter rules, **When** reviewed, **Then** the coach explicitly says category/existence checking was unavailable and does not treat local acceptance as proof that a term is real.
4. **Given** the original checker rejected an answer, **When** reviewed, **Then** the coach attributes that rejection to this round's checker; it never presents it as an independently established geography fact.
5. **Given** both players are viewing results, **When** one requests coaching, **Then** the opponent receives no coaching request, status, output or provider data.
6. **Given** a review, **When** evidence is inspected, **Then** every finding and suggestion references evidence supplied by the analysis operation; nonexistent evidence or mismatched categories invalidate the result.

### User Story 3 - Finish safely when analysis cannot complete (Priority: P1)

The player sees a clear loading status, a completed review, or a safe stopped/failed status. Coaching never delays scoring, reopens a round or prevents leaving results.

**Why this priority**: An optional analysis must remain bounded and cannot break the existing game.

**Independent Test**: Use scripted model responses and controlled time to exercise rejected operations, timeouts, repeated proposals, exhausted limits and late replies.

**Acceptance Scenarios**:

1. **Given** an unknown tool or invalid arguments, **When** proposed, **Then** the tool executes zero times and the run stops with a classified reason.
2. **Given** malformed output, refusal or invalid evidence references, **When** returned, **Then** no successful review is displayed.
3. **Given** the model asks for the same analysis again without new evidence, **When** the second proposal arrives, **Then** repeated-action protection stops the run without another tool execution.
4. **Given** a slow or non-cooperative provider, **When** the total 30-second analysis deadline expires, **Then** the run becomes terminal; late results cannot revive it.
5. **Given** a second analysis click while a run is active or already terminal, **When** handled, **Then** the existing run is reused and no new model call is made.
6. **Given** the player leaves, disconnects or their room is removed, **When** analysis is active, **Then** the run is cancelled and late output is discarded.
7. **Given** no configured provider or a spent analysis allowance, **When** requested, **Then** the player sees a localized safe explanation and the existing results remain available.

### User Story 4 - Use coaching in either interface language (Priority: P2)

The same analysis is available in Serbian and English, independently of the room's alphabet and the language used in answers.

**Why this priority**: Both language surfaces are already part of the product.

**Independent Test**: Render one checked coaching result in both languages, including a Serbian digraph round and an English-only letter round.

**Acceptance Scenarios**:

1. **Given** Serbian or English interface language, **When** a run completes, **Then** the review, evidence descriptions, recommendations, status and errors use that language.
2. **Given** a Serbian room and an English interface, **When** reviewed, **Then** the room's alphabet and recorded letter verdicts stay Serbian while the review is English.
3. **Given** a language switch after analysis, **When** the review is displayed again, **Then** its checked findings are translated without another provider call.

### Edge Cases

- A blank may mean time pressure, difficult letter or missing recall; its cause is unknown.
- One round cannot establish a persistent weakness or performance trend.
- Five points for a duplicate are valid points; hints do not reduce points.
- AI checking can be wrong; coaching never reverses or strengthens its verdict.
- Low-term letters, digraphs and diacritics use recorded decisions; the coach does not reevaluate them.
- An unverified round supports blank/length/letter/hint/duplicate observations, not existence or category-verification claims.
- A failed bot may explain the opponent's empty sheet; the coach does not use that sheet or judge difficulty from the match outcome.
- Room cleanup, socket disconnect, provider response and deadline may race; exactly one terminal status wins.
- Two humans may analyze concurrently; their run ownership, budgets and outputs remain isolated.
- User-authored answers can contain instructions; raw answer strings are unnecessary for coaching and are excluded from model context and analysis-tool output.
- Terminal runs are retained only while their completed room exists; refresh/reconnect and durable history remain unsupported.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Coaching MUST be opt-in on the final-results screen in all three play modes, for either human seat, with the fixed user goal stated in Story 1.
- **FR-002**: The application MUST derive the caller and completed round from the existing server-owned connection binding; client claims of identity, scores, validity or opponent data MUST NOT be accepted.
- **FR-003**: Requests MUST be rejected before model/tool execution unless the requesting human belongs to the current round, the completed room still exists and its canonical reveal/results are available.
- **FR-004**: A review MUST use a stable copy of the exact final decisions and points already revealed for the caller. Re-running the checker or reconstructing AI verdicts from local letter checks is forbidden.
- **FR-005**: Each admitted request MUST have one logical run with a goal, owner, source version, status, step and attempt counts, tool count, deadline, action history, checked evidence and terminal reason.
- **FR-006**: A successful run MUST contain exactly two model decisions and exactly one real read-only/deterministic analysis execution between them.
- **FR-007**: The first decision MUST propose the allowlisted analysis with one permitted focus: overview, blank categories or rejected answers. A premature final answer MUST be rejected.
- **FR-008**: The analysis MUST compute category observations, bounded totals and supported practice options from the caller's completed results. Its focus MUST influence the ordering of evidence; facts MUST remain accurate and complete enough to validate a review.
- **FR-009**: Tool names, strict argument shapes, scope, current run status, repetition and remaining budget MUST be checked before execution. Unknown or invalid proposals MUST cause zero execution for that proposal.
- **FR-010**: Analysis results MUST be checked for structure, completeness, numeric consistency, permitted values, source version and size before a subsequent model decision receives them.
- **FR-011**: The second model decision MUST select one to three findings and one or two supported practice recommendations, with valid evidence references and matching categories. Another tool request MUST NOT execute.
- **FR-012**: Final validation MUST verify shape, supported recommendation eligibility, unique/available evidence references, category matching and this-round scope. Unsupported claims MUST fail closed.
- **FR-013**: Findings and recommendations MUST be selected from controlled, evidence-linked choices. Displayed factual descriptions and advice MUST be generated from checked facts and approved localized wording; unrestricted model prose MUST NOT become an authoritative review.
- **FR-014**: The user-facing result MUST contain a short summary, recommendations, inspectable evidence, confidence, evidence limitations and an application-approved completion indication.
- **FR-015**: Confidence MUST be assigned by the application: medium for checker-verified results and low for unverified results. High confidence is unavailable for this single-round coach. The verified flag MUST NOT imply infallibility.
- **FR-016**: Coaching MUST NOT change answers, validity, score, hints, phase, round timing, reveal count or result count. Only bounded coaching bookkeeping and an additive completed-result snapshot may be stored.
- **FR-017**: Model context and tool results MUST exclude raw/normalized answer text, opponent entries, names, room codes, socket identifiers, private credentials, addresses, secrets and unrelated history.
- **FR-018**: Provider requests MUST use the existing server-side provider boundary. Model/provider selection MUST come from trusted configuration, never from the model or browser.
- **FR-019**: Limits MUST be explicit and enforced before work: two model steps, one tool execution, three total provider attempts, two attempts maximum in one step, one recovery attempt maximum across the run and one provider/model fallback maximum across the run.
- **FR-020**: The entire run MUST have one 30-second deadline, including provider calls, waits, validation and tool work. Individual provider attempts MUST be capped at eight seconds and tool work at 250 milliseconds, shortened by remaining time.
- **FR-021**: A model step is a new decision; a retry is another attempt at that same decision. Both MUST be recorded separately and retries/fallback MUST consume the shared attempt/time budget.
- **FR-022**: A transient failure MAY receive the one allowed recovery if time and attempts remain. Authentication/configuration errors, malformed responses, refusal, invalid arguments and unsupported operations MUST NOT receive blind retries.
- **FR-023**: The same tool, normalized arguments and source version requested without progress MUST stop the run as repeated action. A different second tool proposal MUST stop due to the permitted phase/tool budget.
- **FR-024**: Success, invalid proposal, unknown tool, invalid arguments, invalid tool result, tool failure/timeout, provider failure/timeout, rate/quota exhaustion, invalid final response, insufficient evidence, step limit, tool limit, attempt limit, deadline and cancellation MUST have classified terminal reasons.
- **FR-025**: Terminal status MUST be assigned exactly once. Cancellation/deadline MUST stop further work, signal active requests and suppress late output even if a dependency ignores cancellation.
- **FR-026**: At most one admitted run per human seat and completed round MUST exist. Duplicate clicks MUST reuse the in-flight or terminal result without spending more calls; a terminal failure has no rerun in that round.
- **FR-027**: Coaching MUST have a separate per-visitor allowance of five admitted runs per hour, using the existing transport-derived visitor rule. Admission is charged once when model work begins, including runs that later fail; invalid preflight and duplicate requests MUST not consume this allowance.
- **FR-028**: Every actual coaching provider attempt, including retry/fallback, MUST atomically check and consume the existing shared daily AI allowance before starting. A failure consumes its attempt; unused attempts are not charged. Existing checker priority and W04 hint/AI-room semantics MUST remain intact.
- **FR-029**: The interface MUST show idle/loading/completed/stopped/failed state, safe localized reasons and accessible evidence. It MUST remain possible to leave results while coaching runs.
- **FR-030**: Coaching MUST be delivered only to its requesting connection; no broadcast may contain its status or result. Stale client completions MUST be ignored.
- **FR-031**: Evidence and logs MUST record run/step/attempt relationships, tools proposed/executed/rejected, validation outcomes, providers/models, latency, available token counts and terminal reasons without secrets, raw prompts/replies or private reasoning.
- **FR-032**: Total token usage MUST include each attempt for which usage is returned; unavailable usage MUST be marked unknown, not reported as zero. Counts alone MUST suffice for failure evidence.
- **FR-033**: Fake-provider tests MUST precede live testing and cover successful decisions, denied actions, malformed output, bad tool results, limits, retries/fallback, cancellation, privacy and domain-specific factual honesty.
- **FR-034**: At least one automated denial test MUST assert zero tool executions, and preflight tests MUST assert zero provider calls.
- **FR-035**: Existing W03/W04 checks MUST remain valid. Before runtime work, their baseline MUST be run and recorded honestly; existing pending W04 live evaluation MUST remain visible.
- **FR-036**: A small explicitly configured live demo MUST be performed after fake tests and provider readiness, with nonprivate fixtures and bounded runs. Missing credentials MUST be reported as pending, never as a pass.
- **FR-037**: All six assignment-named document paths MUST exist: feature spec, flow, tool contracts, evals, W05 evidence and AI usage log. Spec Kit documents MAY be linked as canonical sources to avoid duplicate specifications.
- **FR-038**: The evidence package MUST include observed success, rejected-tool and failure traces, real test output, revision identifiers, known limitations and attributable contributions from both pair members before W05 is marked complete.
- **FR-039**: Both members MUST be able to explain authority, tool choice, validation, budgets and stop behavior. Roles MUST be swapped during the work and actual participation recorded.
- **FR-040**: Specification, implementation readiness and assignment completion MUST remain distinct states. Planning/contracts require owner review before runtime changes; local commit is a final milestone, and push/PR/deploy are excluded from this request.

### Key Entities

- **Completed-round source**: Exact final decisions and points with the round's immutable alphabet/letter and verification status; limited to its completed-room lifetime.
- **Coach run**: A short-lived, owner-bound process that tracks decisions, attempts, checked evidence and one terminal outcome.
- **Analysis evidence**: Deterministic observations and totals about eight categories, identified within the run's source version.
- **Practice option**: An approved recommendation tied to evidence that makes it eligible; no new geography answer or diagnosis.
- **Coach review**: Checked finding references and recommendation choices plus application-rendered summary, evidence limitations and confidence.
- **Safe run record**: Bounded operational counts, validation outcomes and reason; separate from sensitive canonical game data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In every preregistered successful scenario, the requesting player receives a review of the current completed round with one to three findings and one or two supported recommendations.
- **SC-002**: In every evaluated review, all factual descriptions match the recorded results and every recommendation has an inspectable supporting observation.
- **SC-003**: In every unverified, duplicate-answer, hinted-answer and blank-answer scenario, the review respects the limitations in Story 2 and invents no independent geography fact or long-term weakness.
- **SC-004**: Every admitted analysis reaches one completed, stopped or failed outcome within 30 seconds; a later response cannot change that outcome.
- **SC-005**: In all rejection, failure, cancellation and success scenarios, players retain the same answers, points and result/reveal counts that they had without coaching.
- **SC-006**: All privacy scenarios prevent another player's data or private coaching output from reaching an unauthorized recipient.
- **SC-007**: Serbian and English users can start, understand and inspect the same checked review; switching presentation language requires no additional analysis.
- **SC-008**: Repeated requests in one round cannot create additional analyses or spend extra provider attempts; admitted runs never exceed their declared limits.
- **SC-009**: The handoff contains all required artifacts with observed success, denial and failure evidence, actual check results, known limitations and contributions from both members; pending work is explicitly distinguishable from completed work.

## Assumptions

- Scope is one completed round, one read-only tool and two model steps. Long-term memory, training gameplay, new facts/corrected answers, a second tool and automatic actions are excluded.
- Choosing the goal button is a user goal; arbitrary free-text coaching instructions are unnecessary for Core.
- Controlled recommendation wording trades conversational variety for exact semantic validation. The model still selects focus, relevant findings and recommendation priorities from evidence.
- The coach may use the current provider routing boundary but is not a provider migration or a global W04 quota-accounting rewrite.
- The existing daily counter currently measures W04 service operations, while W05 must add actual coaching attempts. This mixed unit is an explicit existing limitation; a global change would need separate approval and consumer review.
- Coaching bookkeeping writes are application-owned operational state, not agent-authorized game mutations. No human-approval UI is needed because the model has no write action.
- Room restart/expiry discards coaching state. No accounts, database, filesystem tool, arbitrary network tool, browser agent, swarm, new dependency or deployment is needed.
- Implementation and live evidence will be produced only in later phases; this specification does not assert that the assignment is already complete.
