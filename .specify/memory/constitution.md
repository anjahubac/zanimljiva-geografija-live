# Zanimljiva Geografija Live Constitution

This constitution does not restate the project's rules. They already exist, were
written before Spec Kit was added (2026-09-30, `Plan.md` §2B.12), and remain the
source of truth. Spec Kit commands (`/speckit-specify`, `/speckit-plan`,
`/speckit-tasks`, `/speckit-analyze`, …) must read them and check every spec,
plan and task list against them.

## Sources, in priority order

1. The current user request and explicitly agreed acceptance criteria
2. `docs/GAME_SPEC.md` — exact gameplay behavior
3. `Plan.md` — scope, decisions, state machine, schedule (§2B wins over older sections)
4. `.github/instructions/*.instructions.md` — engineering modules, routed by
   `.github/00-index.instructions.md`
5. `.github/copilot-instructions.md` — always-on guardrails
6. `CLAUDE.md` / `AGENTS.md` — agent entry point and honesty rules

When two of these disagree, stop and report the conflict instead of guessing
(`.github/00-index.instructions.md`, "Priority order").

## Core Principles

Each principle is a pointer. The linked text is authoritative.

### I. Server authority

The server owns identity, phase, letter, timestamps, validity and score. A
browser payload is never authoritative. — `CLAUDE.md` rule 1,
`.github/instructions/01-architecture.instructions.md`

### II. Fair synchronized start

A round is scheduled only after both seats are ready, with one identical
`roundId`, letter, `startsAt` and `endsAt` for both. — `CLAUDE.md` rule 2,
`Plan.md` §5 and §2B.3

### III. Hidden answers stay absent (NON-NEGOTIABLE)

An opponent's answers are absent from every payload before the canonical
reveal, and reach the AI only after both sheets are locked. — `CLAUDE.md`
rule 3, `.github/instructions/05-security.instructions.md`, `Plan.md` §2B.2

### IV. Close exactly once

Reveal and scoring happen exactly once, through one idempotent `closeRound`. —
`CLAUDE.md` rule 4, `Plan.md` §8 and §2B.2

### V. Locked scope

No dependency, service, database, feature or event that `Plan.md` does not
list. Stretch items are out of scope. A new spec that needs one is a scope
change: record the owner's decision in `Plan.md` before planning it. —
`CLAUDE.md` rule 5, `Plan.md` §4, `.github/instructions/11-stack-and-scaffold.instructions.md`

### VI. Evidence, not claims

Evals are written before the change they measure. Never claim a command passed
without running it in the session; never make a suite green by skipping,
deleting or weakening a test. — `CLAUDE.md` "Honesty rules",
`.github/instructions/03-testing.instructions.md`,
`.github/instructions/04-workflow.instructions.md`

## How Spec Kit fits this repository

- **`Plan.md` stays the plan of record.** A feature's `plan.md` under `specs/`
  covers that feature only and links the `Plan.md` section it implements; it
  does not copy constants, contracts or rules.
- **Contracts live in `src/contracts`** (`.github/instructions/12-contracts-and-errors.instructions.md`).
  A spec's `contracts/` folder may describe a new payload, but the Zod schema in
  `src/contracts` is authoritative once it exists.
- **Tasks follow module 10's discipline:** one step at a time, each with an exit
  command, run and reported before the next.
- **Features `001`–`008` were reconstructed** on 2026-09-30, after they were
  built. They are marked as such and are not evidence that the spec came first.
  New features start at `009`.

## Governance

Amending this constitution, or any rule it points to, follows
`.github/00-index.instructions.md` "Maintenance rules": update the most specific
source, record the decision in `Plan.md`, and keep `CLAUDE.md` and `AGENTS.md`
identical.

**Version**: 1.0.0 | **Ratified**: 2026-09-30 | **Last Amended**: 2026-09-30
