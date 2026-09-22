---
description: "Deterministic tests, real-time integration checks, privacy assertions, race coverage, and Week 3 eval evidence."
applyTo: "**/*"
---

# Testing Instructions

## Required confidence

Every behavior change needs a meaningful success case and rejection or edge case. State, privacy, timing, scoring, and schema changes need direct observable assertions. A function merely existing is not evidence that the multiplayer contract works.

## Test layers

- `tests/unit`: pure normalization, validity, scoring, totals, and schema tests.
- `tests/integration`: real server with two or more Socket.IO test clients, fake clock, fixed letter selector, room lifecycle, privacy, rejection, and race cases.
- `tests/helpers`: deterministic clocks, room builders, socket clients, and known answer fixtures.
- Client component tests are optional for the deadline but must not replace server integration coverage.

## Determinism

- Inject a fixed clock into room orchestration.
- Inject a fixed letter selector.
- Advance fake time rather than using real waits.
- Give every test isolated room state and close all sockets/timers afterward.
- Avoid network calls, production credentials, shared mutable fixtures, and random test order dependencies.

## Minimum scoring tests

- Different valid answers: 10 points each.
- Same answer after normalization: 5 points each.
- Only Player 1 valid: 10 and 0.
- Only Player 2 valid: 0 and 10.
- Both blank or invalid: 0 each.
- Whitespace and case variants compare as the same answer.
- Wrong-letter, over-length, and unsupported-category inputs are rejected or invalid according to the spec.

## Minimum server integration tests

- Second player joining and both clients acknowledging the loaded game screen yields one shared `roundId`, letter, `startsAt`, and `endsAt`.
- A third player cannot join and existing room state remains unchanged.
- A client cannot act as the other player by including a forged identity.
- The active projection never contains the opponent's drafts.
- A newer accepted draft revision wins; stale revisions do not overwrite it.
- A finished player cannot change answers.
- One finished player sees only that the opponent has or has not finished.
- Both players finishing closes and reveals once.
- Deadline closes and reveals once when one or neither player finished.
- A finish/deadline race closes, validates, and scores exactly once.
- Duplicate finish and duplicate close triggers are idempotent.
- Early, late, malformed, stale-round, and cross-room events do not mutate canonical state.
- Result payloads match the server's locked submissions and scoring reasons.

## Privacy assertions

Assert absence as well as presence. Before reveal, inspect every server event received by each test client and prove it does not include:

- Opponent answer values
- Opponent normalized answers
- Opponent draft revisions if unnecessary
- Resume tokens belonging to either opponent
- Internal room objects or validation caches

## Week 3 eval protocol

Define E1-E4 expectations in `docs/EVALS.md` before execution. Preserve the baseline results and repeat the identical scenarios after one controlled change.

- E1: two-player synchronized start
- E2: both-finish/deadline boundary reveals exactly once
- E3: invalid third-player or malformed-input path leaves state unchanged
- E4: first genuine baseline regression

At least one baseline eval must expose a real issue. Do not seed a fake bug. Record the exact command, result, date, relevant commit/state identifier, and evidence location.

## Verification commands

Once scaffolded, run targeted tests while iterating, followed by:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Report every skipped or unavailable command and why. A successful local test does not replace the deployed two-computer smoke test.

## Manual production smoke test

Use two physical computers and separate browser sessions. Verify create/join, automatic synchronization, one shared countdown/letter/deadline, private drafts, early finish, timeout, single reveal, all scoring patterns feasible in the answer set, safe errors, and documented disconnect behavior.
