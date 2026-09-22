---
description: "Safe two-developer workflow for scope, baseline, controlled change, implementation, evidence, review, and handoff."
applyTo: "**/*"
---

# Workflow Instructions

## Before implementation

1. Read the current user request, `docs/GAME_SPEC.md`, `Plan.md`, and `.github/00-index.instructions.md`.
2. Load only the numbered instruction modules relevant to the task.
3. Inspect `git status --short --branch` and preserve unrelated user work.
4. Identify the owning layer, shared schemas, tests, and affected documentation.
5. Confirm that `docs/GAME_SPEC.md`, `docs/BUILD_PROMPT_V1.md`, `docs/CONTEXT_MANIFEST.md`, `docs/EVALS.md`, and the initial `docs/AI_USAGE_LOG.md` exist before the first major coding-agent build request.
6. Confirm the task does not silently add an out-of-scope service or feature.

## Two-developer protocol

- Agree on schemas and event meanings together before parallel implementation.
- Developer A primarily owns server synchronization and integration tests.
- Developer B primarily owns client flow, pure scoring/validation, and unit tests.
- Contracts, integration, eval execution, deployment smoke tests, and evidence are shared work.
- During each joint block, one developer drives while the other checks expectation, diff, and output. Swap halfway through.
- Review each other's first implementation block before integration.
- Record both code contributions and review/evidence contributions in `EVIDENCE_003.md`.
- Do not use parallel AI coding agents for the Core implementation; keep meaningful AI calls within the challenge budget and record them in `docs/AI_USAGE_LOG.md`.

## Baseline and controlled change

Before fixing the selected baseline problem, preserve:

- Prompt and context
- Recoverable code state or commit/tag
- Actual command output
- Screenshot or recording
- Initial test/eval status
- First genuine visible defect

Then document claim, signal, hypothesis, smallest change, verification, expected result, actual result, and limitation. Repeat the same pre-written evals. Do not move the goalposts after seeing the baseline.

## While editing

- Make the smallest complete change and update its tests in the same block.
- Preserve existing user edits and avoid unrelated formatting/refactors.
- Update schemas and all producers/consumers together.
- Treat changes to letter selection, timestamps, reveal, privacy, validity, or scoring as cross-layer behavior changes.
- If new infrastructure becomes necessary, record the reason and tradeoff before adding it.
- Stop expanding scope when a blocker persists for roughly 20 minutes. Record goal, expectation, actual result, checks attempted, evidence, and a precise question.

## Verification and handoff

- Run targeted checks, then the full relevant suite.
- Inspect `git diff --check`, `git diff`, and `git status --short`.
- Confirm no secrets, `.env`, tokens, private answers, logs, screenshots, or runtime data are staged.
- Report behavior delivered, tests/commands run, deployment/manual checks, baseline/eval evidence, known limitations, and remaining work.
- A local commit does not authorize push, PR, deployment, or external messages.

## Documentation synchronization

- Gameplay behavior: `docs/GAME_SPEC.md`
- Current sequence and ownership: `Plan.md`
- Setup and user flow: `README.md`
- Context selection: `docs/CONTEXT_MANIFEST.md`
- Planned/actual evals: `docs/EVALS.md`
- Baseline and controlled change: `docs/EVIDENCE_003.md`
- Significant AI calls: `docs/AI_USAGE_LOG.md`
- Deployment procedure/limitations: `DEPLOYMENT.md` if created

Update the most specific source first and avoid duplicating a rule across every file.
