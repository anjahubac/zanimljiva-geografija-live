---
description: "Index and routing guide for the Zanimljiva Geografija Live engineering instructions."
applyTo: "**/*"
---

# Project Instructions Index

## Purpose

Use this file to select the smallest relevant instruction set for a task. Product requirements remain in `docs/GAME_SPEC.md`; sequencing and ownership remain in `Plan.md`. The instruction modules provide stable engineering guidance and must not silently expand game scope.

## Priority order

1. Current user request and explicitly agreed acceptance criteria
2. `docs/GAME_SPEC.md`
3. Week 3 and Week 4 submission criteria captured in `Plan.md` and the required `docs/` artifacts
4. `Plan.md` (its §2B wins over its older sections)
5. Relevant numbered instruction modules
6. `.github/copilot-instructions.md`
7. General repository documentation

Stop and report a conflict instead of guessing when two higher-priority sources disagree.

## Instruction modules

1. [01-architecture.instructions.md](instructions/01-architecture.instructions.md) - layers, dependencies, room state, data flow, and server authority.
2. [02-conventions.instructions.md](instructions/02-conventions.instructions.md) - TypeScript, React, naming, runtime validation, errors, time, and normalization.
3. [03-testing.instructions.md](instructions/03-testing.instructions.md) - deterministic unit, integration, UI, privacy, race, and Week 3 eval checks.
4. [04-workflow.instructions.md](instructions/04-workflow.instructions.md) - two-developer workflow, baseline capture, controlled change, verification, and handoff.
5. [05-security.instructions.md](instructions/05-security.instructions.md) - identity, hidden answers, room isolation, validation, secrets, and logging.
6. [06-build-and-commands.instructions.md](instructions/06-build-and-commands.instructions.md) - canonical local, test, build, and production commands.
7. [07-common-tasks.instructions.md](instructions/07-common-tasks.instructions.md) - playbooks for events, scoring, room lifecycle, UI, AI prompts and features, and docs.
8. [08-code-review.instructions.md](instructions/08-code-review.instructions.md) - correctness and risk checklist.
9. [09-external-services.instructions.md](instructions/09-external-services.instructions.md) - deployment topology, WebSocket hosting, remote operations, and production smoke tests.
10. [10-implementation-order.instructions.md](instructions/10-implementation-order.instructions.md) - the ordered file-by-file build sequence, exported signatures, per-step exit criteria, and the accessibility floor.
11. [11-stack-and-scaffold.instructions.md](instructions/11-stack-and-scaffold.instructions.md) - exact dependency versions, config file contents, and npm scripts.
12. [12-contracts-and-errors.instructions.md](instructions/12-contracts-and-errors.instructions.md) - where each Zod schema lives in `src/contracts` (the code is authoritative), the socket event map, and the closed error-code registry.
13. [13-test-recipes.instructions.md](instructions/13-test-recipes.instructions.md) - injected clock/scheduler pattern, socket test helpers, worked tests, and the required test inventory.

## Reading order for an implementation model

For current W05 coach implementation, the ordered driver is still module 10,
but follow its Week 5 pointer to `specs/010-post-round-coach/tasks.md` and the
approved contract/impact documents before applying task-sized edits. Preserve
the historical W03/W04 routes below for work in those features.

If you are about to write application code, read exactly these, in this order,
and nothing else first:

1. `Plan.md` sections 2B (Week 4 — wins over older sections), 2A, 4, 5, 6, 7, 8, 12, 21
2. `.github/copilot-instructions.md`
3. `10-implementation-order.instructions.md` (your driver)
4. `11-stack-and-scaffold.instructions.md` (only during Step 0)
5. `12-contracts-and-errors.instructions.md` (Steps 2, 6, 7)
6. `13-test-recipes.instructions.md` (any step that adds a test)

Modules 01-09 are reference material. Open one when the routing matrix below
sends you there, not by default.

## Routing matrix

| Task | Read first | Usually also read |
| --- | --- | --- |
| Scaffold the repository | Stack and scaffold (11) | Implementation order (10) |
| Implement the next build step | Implementation order (10) | Contracts (12), test recipes (13) |
| Write or fix a test | Test recipes (13) | Testing (03), implementation order (10) |
| Add or change an error code | Contracts and errors (12) | Security, testing |
| Change a gameplay or scoring rule | `GAME_SPEC.md`, Architecture | Testing, conventions, review |
| Change room phases, start, finish, or timeout | Architecture | Testing, security, review |
| Add/change a Socket.IO event | Architecture | Conventions, testing, security |
| Change a runtime schema | Conventions | Architecture, testing, review |
| Change hidden/public room projections | Security | Architecture, testing, review |
| Change a React screen | Architecture | Conventions, testing |
| Change answer normalization or validity | `GAME_SPEC.md`, Conventions | Testing, common tasks |
| Change the W04 checker, bot or hints | `Plan.md` §2B, Common tasks | Security, testing, `docs/AI_EVALS.md` |
| Change the W05 post-round coach | `specs/010-post-round-coach/tasks.md`, `Plan.md` §2C and `impact-analysis.md` | Security, testing, `docs/AGENT_EVALS.md`, `docs/EVIDENCE_W05.md` |
| Change AI providers, models or keys | External services, `Plan.md` §2B.5 | Security, build and commands |
| Run/build/lint/test | Build and commands | Testing, workflow |
| Deploy or change hosting | External services | Build and commands, security, workflow |
| Capture baseline/evidence or prepare handoff | Workflow | Testing, code review; Week 4 evidence goes in `docs/EVIDENCE_004.md` |
| Update agent instructions | Workflow | Relevant module, code review |

## Planned repository baseline

Exact versions and config file contents live in module 11; the summary below is
orientation only.

- Node.js 20+ and strict TypeScript with ESM
- React and Vite browser client
- Node HTTP server with Socket.IO
- Shared Zod runtime schemas and inferred types
- Pure domain functions for answer normalization, validation, and scoring
- Temporary in-memory two-player rooms (a seat may be the server's AI opponent)
- Server-only calls to Google Gemini and Groq, through `src/server/ai/service.ts`
- Vitest unit and integration tests
- One deployed Node process serving both the SPA and Socket.IO endpoint

Until scaffolding exists, treat these as the approved target in `Plan.md`, not as claims that scripts or packages already exist.

## Maintenance rules

- Keep instructions aligned with the implemented repository.
- Update the most specific module when a stable rule changes.
- Keep deadline tasks and current status in `Plan.md`, not duplicated throughout the instruction files.
- Keep exact gameplay behavior in `GAME_SPEC.md`.
- Remove sample-project placeholders instead of adapting them implicitly.
- Do not copy generic remotes, credentials, VM commands, bot rules, persistence assumptions, or package versions into this project.
