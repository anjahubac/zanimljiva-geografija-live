# Agent Instructions — Zanimljiva Geografija Live

This repository's engineering rules live in `.github/`. They are not optional
context; read them before writing code.

## Read before your first edit

1. `.github/copilot-instructions.md` — always-on guardrails (short).
2. `.github/00-index.instructions.md` — reading order and routing table.
3. `Plan.md` — locked product scope, rules, state machine, schedule.

If you are implementing, your driver file is
`.github/instructions/10-implementation-order.instructions.md`. Steps 0–11 are
the Week 3 build; all are done except Step 11's deployment, which is now Week 4
step W4-9. New work follows its **Week 4** section and `Plan.md` §2B. Work one step at a time, and run each step's exit command before
moving on.

## The five rules that matter most

1. The **server** owns identity, phase, letter, timestamps, validity and score.
   A browser payload is never authoritative.
2. A round is scheduled only after **both seats** are ready, and both receive
   an identical `roundId`, letter, `startsAt` and `endsAt`. A human seat is
   ready only through its own `room:client-ready`; the AI opponent's seat is
   ready by the server when it is seated (`Plan.md` §2B.3).
3. An opponent's answers must be **absent** from every payload before the
   canonical reveal — not present and hidden in the UI.
4. Reveal and scoring happen **exactly once**, through one idempotent
   `closeRound`, whether triggered by both-finished or by the deadline.
5. Do not add a dependency, a service, a database, a feature, or an event that
   `Plan.md` does not list. Anything marked **Stretch** is out of scope.

## Honesty rules

- Never say a command passed unless you ran it in this session and saw the output.
- Never make tests pass by skipping, deleting, or weakening them.
- If the same failure survives three attempts, stop and report goal, expected,
  actual, what you checked, and a precise question.
- Do not push, deploy, or open a pull request unless explicitly asked.

<!-- SPECKIT START -->
## Spec Kit

Spec Kit is installed (`.specify/`, `.claude/skills/speckit-*`, `specs/`).
Its constitution, `.specify/memory/constitution.md`, points back to the rules
above; it does not replace them, and `Plan.md` stays the plan of record.
Features 001–008 in `specs/` were reconstructed after they were built. New
features start at 009 and use the full specify → plan → tasks flow.
<!-- SPECKIT END -->
