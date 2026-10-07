# Data Model: Bounded post-round AI coach

**Canonical semantics:** [docs/AGENT_FLOW.md](../../docs/AGENT_FLOW.md). **Canonical shapes and typed evidence:** [docs/TOOL_CONTRACTS.md](../../docs/TOOL_CONTRACTS.md). These planning artifacts must not redefine either contract. No database or migration is introduced.

## Private completed source

For each human seat, create a detached immutable snapshot only after canonical `RoundRevealed` and `RoundResults` values have been constructed from the actual validation/checker/scoring result. Do not rerun the checker or scorer and do not reconstruct from locked answers. Results phase/time alone is insufficient for coach admission: require explicit source snapshot readiness. Include exactly the approved source fields: eight unique category records with category, blank, accepted, recorded reject reason or null, hinted, points and scoring reason; plus round letter, alphabet, verified status and own total. Keep internal owner/round/source identity outside the provider/tool projection. No raw/normalized answers, recognized names, opponent rows, display name, socket ID, room code, address, tokens, prompts or replies.

## Run bookkeeping

Use the exact `CoachRun` statuses and fields from AGENT_FLOW: `created | running | completed | stopped | failed`; explicit proposal/tool/final/terminal phase; step, attempt, recovery/fallback and tool counters; start/deadline; abort; bounded action/result/log records; and one immutable terminal state. Admission accounting is separate from status. Key each run by server-bound human seat plus current completed round; concurrent duplicates reuse pending or terminal work, including failure. Clear source/cache/run on room cleanup; cancel on disconnect and suppress late output.

## Analysis and user result

`AnalyzeRoundArgs` and `AnalysisResult`, recommendation eligibility, ten evidence records, ordered evidence IDs, `CoachRunView`, and completed result use the exact types and semantics in `docs/TOOL_CONTRACTS.md`. Enforce strict fields, canonical category coverage, totals/points consistency, source version and byte limits. The result includes `summary.findingIds`, eligible recommendations with support IDs, all ten typed evidence records, application-assigned confidence, and a limitations array containing `single_round` plus the correct verified/unverified limitation. Stopped/failed runs have `result:null`.

## Usage and privacy invariants

The existing daily counter keeps its W04 logical service-operation unit and gains one atomic check/charge per actual W05 physical attempt. Hourly admission is five admitted runs per transport-derived visitor/hour; malformed/preflight-denied/duplicate calls are not charged. Do not claim this mixed-unit counter caps every W04 provider attempt. Model output is limited to 1,024 tokens and 8,192 decoded UTF-8 bytes before parse; tool result and sanitized trace are each bounded to 16,384 bytes. Missing provider usage stays unknown. No raw coach debug log.
