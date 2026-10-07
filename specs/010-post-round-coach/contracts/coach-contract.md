# Contract: Post-round coach

**Canonical contract:** [docs/TOOL_CONTRACTS.md](../../../docs/TOOL_CONTRACTS.md). This file is an index and implementation mapping, not a second interface definition. Its exact event, request, run view, result/evidence shapes, terminal statuses/reasons, limits, and validation rules must remain identical to that document and [docs/AGENT_FLOW.md](../../../docs/AGENT_FLOW.md).

## Boundary summary

- Request: strict `round:coach` `{ roundId, goalId: "review_round", language }`, <=512 UTF-8 bytes. Socket-bound caller and completed canonical snapshot are server-derived; snapshot readiness is required in addition to results phase/time.
- Admitted request: async terminal `Ack<CoachRunView>` only; preflight rejection alone uses `ok:false` game error. Terminal statuses are `completed | stopped | failed`; stopped/failed outcomes are terminal `ok:true` views with `result:null`.
- `CoachRunView` fields: `runId`, `roundId`, `status`, `stopReason`, `stepCount`, `toolCallCount`, `providerAttemptCount`, `elapsedMs`, `result`. Completed requires `stopReason:"completed"` and a validated result; stopped/failed requires null result. Counts/times are bounded.
- Completed `result`: `summary:{findingIds}`, recommendations `{code,category,evidenceIds}`, exactly ten typed evidence records without source/private identifiers, application-assigned `confidence`, `limitations` array (`single_round` plus `checker_can_be_wrong` if verified or `local_rule_only` otherwise), and application-assigned `completed:true`.
- Model step 1 strict proposal: `{kind:"tool_request",toolRequest:{name:"analyze_round",arguments:{focus}}}`. Unknown but structurally valid names are classified separately before strict tool args. Exactly one allowlisted tool; args are only `{focus}`.
- Model step 2 strict final proposal: `{kind:"final",final:{findingIds,recommendations,completed:true}}`; no prose.
- Limits: two model steps, one tool, three attempts total, two per step, one recovery, one configured fallback, 30 s shared deadline, 8 s/attempt, 250 ms/tool, <=1,024 output tokens, <=8,192 decoded UTF-8 bytes before parse, <=16,384 tool-result/trace bytes.
- No raw answer/model text in user result or logs; telemetry may include available adapter usage per physical attempt, and absent usage remains unknown. Coach raw debug logging is disabled.

Use the existing strict Ack envelope and existing game errors for preflight. Run terminal reasons are the closed list in `docs/AGENT_FLOW.md`; do not create new game error codes. The coach-only ack has a 32-second client timeout; on timeout/disconnect abort work and suppress late ack/state updates. Generic ack behavior remains unchanged. No progress, cancel, or broadcast event is added. Read canonical TOOL_CONTRACTS for precise typed evidence, eligibility and failure rules; do not re-invent fields here.
