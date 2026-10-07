# W05 Agent Feature Specification — post-round coach

**Status (2026-10-07):** Implementation and automated verification complete; final verify passed 555 tests across 40 files plus typecheck, lint and both builds. Live provider, interactive browser QA and pair evidence remain pending.

The canonical Spec Kit specification is [specs/010-post-round-coach/spec.md](../specs/010-post-round-coach/spec.md). This assignment-facing entry point links that source rather than maintaining a second specification.

| Assignment question | Answer / authoritative location |
| --- | --- |
| User problem and goal | Review my completed round and recommend up to two things to practice; spec Stories 1–2 |
| Input | Current round reference, fixed coaching goal, requested interface language; ownership and results resolved on the server |
| Allowed context | Own completed-category observations, totals, alphabet/letter and verification limitations; spec FR-004, FR-017 |
| Allowed tool | `analyze_round`, deterministic and read-only; [TOOL_CONTRACTS](TOOL_CONTRACTS.md) |
| Forbidden actions | Rejudge, change scores/answers/hints/phase, read another player's sheet, invent answers, arbitrary network/filesystem/shell; spec FR-016–018 and Assumptions |
| Successful flow | Two model steps with one actual checked tool execution; [AGENT_FLOW](AGENT_FLOW.md) |
| Maximum steps / tool calls | 2 / 1 |
| Total deadline / per-call timeout | 30,000 ms for the run / at most 8,000 ms per provider attempt |
| Call budget | 3 total provider attempts; at most 2 in either step; at most 1 recovery and 1 configured-model/provider fallback for the whole run |
| Tool timeout / result cap | 250 ms / 16,384 UTF-8 bytes |
| Admission budget | One admitted run per human/round; 5 per visitor/hour; each actual coaching provider attempt checks/consumes shared daily allowance |
| Completion | Supported findings/recommendations validated against checked tool evidence; application owns `completed` |
| Partial/incomplete | Terminal `stopped`, `result: null`, safe reason; no unvalidated partial advice is presented |
| Failure | Terminal `failed`, `result: null`, safe localized explanation; game results stay available |
| Output | Structured summary references, recommendation choices, evidence, confidence, limitations, completion flag; TOOL_CONTRACTS final-response section |
| Stop conditions | Spec FR-024–026; explicit state transitions in AGENT_FLOW |
| Approval points | None inside the read-only run. The user authorized the approved design; root consistency review passed before implementation. Owner clarification is required only for a proposed design deviation. |
| Out of scope | Persistent history, corrected geography answers, a second tool, write actions, new services/dependencies, deployment |

## Planning and completion gates

1. Specification quality: [requirements checklist](../specs/010-post-round-coach/checklists/requirements.md).
2. All W05 requirements: [assignment coverage](../specs/010-post-round-coach/checklists/assignment-coverage.md).
3. Upfront consumers and before/after cases: [impact analysis](../specs/010-post-round-coach/impact-analysis.md).
4. Preregistered tests and live quality gates: [AGENT_EVALS](AGENT_EVALS.md).
5. Observed verification and pair contribution: [EVIDENCE_W05](EVIDENCE_W05.md).
6. AI-assisted work and live call counts: [AI_USAGE_LOG](AI_USAGE_LOG.md).

File presence alone does not complete the assignment. Evidence rows remain pending until execution is observed. The final local commit happens after the agreed milestone; no push, PR or deployment is authorized.
