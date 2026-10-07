# W05 assignment coverage — post-round coach

**Created:** 2026-10-07
**Status (2026-10-07):** Runtime behavior and full automated verification are complete (555 tests across 40 files; typecheck/lint/build pass). Live demo, interactive browser review and pair-understanding gates remain PENDING.
**Inputs:** [weekly-assignment.md](../../../../weekly-assignment.md), [reliability addendum](../../../../week-05-bounded-agentic-workflows-reliable-integration-addendum.md).

## Every assignment section

| Section | How the specification covers it / required later evidence |
| --- | --- |
| 1 — Overview | Spec FR-005–006, flow: model → validated analysis → model → checked review |
| 2 — Same project | Existing Geografija W03/W04 infrastructure; FR-035, impact inventory; no new app |
| 3 — Agentic meaning | Fixed user goal, model-selected focus and evidence/advice choices, explicit application authority |
| 4 — Domain scenario | Own post-round practice advice, derived from existing game observations; not a copied demo |
| 5 — Define goal first | Spec stories, FR-001–018 and Assumptions; AGENT_FEATURE_SPEC answers goal/context/tools/limits/success/stop/output |
| 6 — SpecKit/SDD | Feature 010 uses existing spec template/constitution; feature pointer/checklist; plan/tasks next, before runtime code |
| 7 — Architecture | AGENT_FLOW backend orchestrator, existing model boundary, tool/result/final validation |
| 8 — Authority | FR-002,009–018; no arbitrary tools/provider/game writes |
| 9 — At least one meaningful tool | `analyze_round` calculates observations, totals and eligible practice choices |
| 10 — Tool contract | TOOL_CONTRACTS input/output/ownership/timeout/size/purity/errors |
| 11 — Allowlist | Exactly one trusted tool, never model-defined; C04 |
| 12 — Strict arguments | Focus-only exact input, bounded size, backend-bound source; C05 |
| 13 — Tool result validation | Eight categories, ten evidence records, consistency/source/byte checks; C07 |
| 14 — Two model steps | FR-006; C01 checks two logical steps and a real intermediate tool |
| 15 — Maximum steps | Two decisions; prevent a third call; C13 |
| 16 — Total deadline | One 30 s run plus 8 s attempt and 250 ms tool caps; C08,C09,C14 |
| 17 — Repeated-call detection | Normalized action plus source version, checked before extra execution; C12 |
| 18 — Stop conditions | FR-024–025 and AGENT_FLOW complete closed reason table |
| 19 — Final response contract | Structured summary references, recommendations, evidence, confidence, completion; TOOL_CONTRACTS |
| 20 — Evidence-based agent | Controlled choices and facts, checked evidence/category eligibility; C15–C19 |
| 21 — Context discipline | Own structured facts only; no answers/names/credentials/opponent/history; C21,C26 |
| 22 — Provider-neutral design | Existing service/gateway/adapters; impact table traces consumers |
| 23 — Retry vs step | Separate logical steps and actual attempts in run/logs; C09,C28 |
| 24 — Bounded retries/fallback | Three attempts, one recovery/fallback, same deadline; guard inside adapter attempt boundary |
| 25 — Call budget | FR-019,027–028; C09,C20,C23,C24 |
| 26 — Usage/observability | Bounded sanitized trace, available usage for each attempt; C28 |
| 27 — One logical run | Owner + completed round key, concurrent duplicate reuse; C20 |
| 28 — Error taxonomy | Existing admission errors + separate classified run reasons; C02–C15,C29 |
| 29 — Safe UI status | Loading/completed/stopped/failed, no internal details, leave available; C30 |
| 30 — Human-in-loop | No agent write action; operational bookkeeping only. A future game write would require a new spec and explicit approval |
| 31 — All Core requirements | Individually tracked below; none marked implemented prematurely |
| 32 — Minimal test matrix | AGENT_EVALS C01–C15 and explicit zero-tool/zero-provider assertions |
| 33 — Fake first/live second | Scripted fake/transport and controlled time; live opt-in only after checks |
| 34 — Required artifacts | Six exact doc paths below, with canonical links instead of duplication |
| 35 — Feature spec content | docs/AGENT_FEATURE_SPEC.md plus canonical Spec Kit spec |
| 36 — Flow diagram | docs/AGENT_FLOW.md Mermaid diagram, counters and terminal paths |
| 37 — Tool contracts content | docs/TOOL_CONTRACTS.md explicit required fields and final transport contracts |
| 38 — At least five evals | 31 preregistered scenarios with required success/invalid tool/args/failure/loop paths |
| 39 — Evidence content | docs/EVIDENCE_W05.md records architecture links and pending observed proof inventory |
| 40 — Run log | EVIDENCE_W05 trace requirements; actual sanitized traces must be added after execution |
| 41 — Security checklist | Guarded backend authority, own-only facts, no tools/secrets/prose leakage, budgets, private response; relevant C-tests |
| 42 — Stretch limit | Only reuse existing bounded fallback and evidence-quality eval; no second tool/dynamic planner/write/dashboard |
| 43 — Out of scope | Spec Assumptions and impact decisions; no swarm/RAG/DB/shell/browser/deploy |
| 44 — Development budget | AGENT_EVALS: recommended ≤15 development live runs and ≤3 final-demo live runs; log counts separately |
| 45 — Pair workflow | Role swap and actual human contribution/explanation gates; EVIDENCE_W05 pair record |
| 46 — Workflow order | Stabilize W04 → spec → plan/contracts/tasks review → fake tests → bounded implementation → live/evidence → final review/local commit |
| 47 — Seven-minute demo | AGENT_EVALS demo sequence with live success and fake denial/failure |
| 48 — Grading | User value, specification, architecture, contracts, validation, bounds, reliability, tests, evidence and pair understanding each have explicit gates; no polish/autonomy expansion |
| 49 — Good vs weak solution | No arbitrary execution; application validates all transitions and final choices |
| 50 — Success definition | FR-006–040 and SC-001–009; pending evidence prevents premature completion |

## Core completion checklist (assignment §31)

Checked items below have named implementation/test evidence. Live provider, browser and human-contribution gates remain unchecked until observed.

- [x] Stable W04 continuation: FR-035, C31; `npm.cmd run verify` passed before W05 work (490 tests/30 files, typecheck, lint and builds).
- [x] Separate SpecKit feature implemented through plan/tasks: feature 010 package plus reviewed plan and implementation tasks.
- [x] Clear implemented user goal: FR-001, C01,C30; `coach-engine.test.ts`, socket integration and rendered result tests.
- [x] At least one implemented useful tool: FR-008, C01,C25; deterministic `analyze-round.test.ts` and real engine success.
- [x] Read-only/deterministic Core tool: FR-016, C25; tool/source tests and unchanged canonical-result integration checks.
- [x] Runtime tool allowlist: FR-009, C04; engine and fake E2E unknown-tool denial.
- [x] Strict input validation: FR-002–003,009, C02–C06; shared boundary-schema and integration tests.
- [x] Tool output validation: FR-010, C07; analyzer/engine/schema mutation tests.
- [x] At least two model steps per successful run: FR-006, C01; fake engine and socket integration.
- [x] At least one real intermediate execution: FR-006, C01; engine executes deterministic tool between decisions.
- [x] Maximum steps: FR-019, C13; engine and attempt-guard limit tests.
- [x] Total deadline: FR-020, C14; injected-scheduler engine and store late-result tests.
- [x] Per-call timeout: FR-020, C08–C09; attempt-guard and tool timeout tests.
- [x] Bounded provider retry: FR-021–022, C09–C11; attempt-guard retry/fallback/429 tests.
- [x] Call budget: FR-019,028, C24; usage-limit atomic admission tests.
- [x] Repetition/loop protection: FR-023, C12–C13; engine tests.
- [x] Structured final response: FR-014, C01,C30; canonical schema and client socket parsing tests.
- [x] Final runtime validation: FR-012–015, C15; invalid-final and terminal evidence tests.
- [x] Observed fake success flow: C01; sanitized `docs/runs/w05/success.json` (scripted fake, not live).
- [x] Observed invalid/forbidden-tool flow: C04–C05; zero-tool fake artifact and invalid-args engine test.
- [x] Observed provider failure flow: C09–C11; sanitized scripted fake failure artifact and guard failure tests.
- [x] Observed max-step/deadline flow: C13–C14; named engine/guard/store tests and deadline artifact.
- [x] Fake/mock path: FR-033–034; runnable `coach:fake-e2e` uses real engine/tool/validators.
- [ ] Limited live demo: FR-036, actual live log.
- [ ] Completed evidence: FR-037–038, observed artifacts/revision.
- [ ] Both members understand flow: FR-039, actual explanation/contribution record.

## Artifact presence and current evidence

- [x] [docs/AGENT_FEATURE_SPEC.md](../../../docs/AGENT_FEATURE_SPEC.md).
- [x] [docs/AGENT_FLOW.md](../../../docs/AGENT_FLOW.md).
- [x] [docs/TOOL_CONTRACTS.md](../../../docs/TOOL_CONTRACTS.md).
- [x] [docs/AGENT_EVALS.md](../../../docs/AGENT_EVALS.md).
- [x] [docs/EVIDENCE_W05.md](../../../docs/EVIDENCE_W05.md), records 555-test full verification and pending live/browser/pair gates.
- [x] [docs/AI_USAGE_LOG.md](../../../docs/AI_USAGE_LOG.md), preserves prior history and records zero live W05 provider calls.

## Addendum coverage and differences

| Addendum area | Coverage |
| --- | --- |
| §§1–4 run architecture/explicit state | Spec FR-005–006; AGENT_FLOW state, ownership, counters and source version |
| §5 provider-neutral boundary | Existing adapters retained; impact review of gateway/service/types/telemetry/retry consumers |
| §§6–8 proposals/tools/multilayer checks | TOOL_CONTRACTS preflight/allowlist/args/result/final checks; C02–C07,C15,C21 |
| §9 structured final result | Application-validated review and controlled rendering; no chain-of-thought |
| §10 limits/repetition | Strict shared step/tool/attempt/deadline bounds; C09,C12–C14,C24 |
| §11 retry/fallback/error classes | AGENT_FLOW closed failure table; original checker fallback never reused as guessed coaching success |
| §12 privacy/security | No raw answers/opponent/identity/secrets in provider context; no arbitrary or write tools; C21,C26,C28 |
| §13 observability/evidence | EVIDENCE_W05 observed proof inventory and bounded run-record shape |
| §14 fake-first plan | AGENT_EVALS success, tool failure, auth, 429, transport, timeout, repetition, limits, cancellation and injection |
| §15 live test | Explicit opt-in, synthetic fixtures, real call counts and pending credential gate |
| §§16–17 scenario/phases | Domain-specific analysis; specify → plan → tasks → fake → guards → live → evidence |
| §18 acceptance | All mandatory items in Core checklist; runtime statuses pending |
| §§19–20 exclusions/common mistakes | Recorded assumptions and pressure-test decisions; backend authority and shared budget guards |

Where the addendum calls repetition detection/provider neutrality “preferred” but the assignment's Core requires them, this specification follows the stricter assignment. Addendum fake cancellation coverage is included even though a separate UI cancel button is Stretch; existing leave/disconnect cancels the run. Optional write approval/idempotency are not Core because no model-authorized write is available; duplicate-run safety is still required.
