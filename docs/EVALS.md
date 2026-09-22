# EVALS — Zanimljiva Geografija Live

**Expectations written on 2026-09-22, before any gameplay code existed.**

Rule for this file: the *Expected* column is frozen once written. After the one
controlled change in Step 10, the identical scenarios are re-run and the results
are appended to the Run log below. Expectations are never edited to match what
the code turned out to do.

## Pre-registered evaluations

### E1 — Synchronized start is fair

| Field | Value |
| --- | --- |
| Scenario | P1 creates a room; P2 joins; P1 sends `room:client-ready`; then P2 sends `room:client-ready`. |
| Expected | Nothing is scheduled after P1's ready alone. After P2's ready, both clients receive `round:scheduled` with deeply equal payloads: same `roundId`, `letter`, `categories`, `startsAt`, `endsAt`. `startsAt > serverNow` and `endsAt - startsAt === roundDurationMs`. |
| Fails if | Either client receives a letter early, the payloads differ in any field, or `startsAt` is in the past. |
| Automated by | `tests/integration/synchronized-start.test.ts` |

### E2 — The round closes and scores exactly once

| Field | Value |
| --- | --- |
| Scenario | P1 presses Finished 1 ms before the deadline; the deadline then fires. Repeated for: both finish early; neither finishes; duplicate Finished from the same player. |
| Expected | Exactly one `round:revealed` and one `round:results` per player, all carrying the same `roundId`. Totals are identical in both players' payloads. A duplicate Finished is acked without a second reveal and without changing any score. |
| Fails if | Any player receives two reveals, two results, or different totals from their opponent. |
| Automated by | `tests/integration/close-and-score.test.ts` |

### E3 — Invalid input never mutates canonical state

| Field | Value |
| --- | --- |
| Scenario | A third socket tries to join a full room; a draft carries an unknown category; a draft carries an extra `score` key; a draft arrives before `startsAt`; a draft arrives after `endsAt`; a draft arrives after that player finished; a draft carries a stale `roundId`. |
| Expected | Each is rejected through the ack with the matching code from the module 12 registry (`ROOM_FULL`, `INVALID_PAYLOAD`, `INVALID_PAYLOAD`, `TOO_EARLY`, `TOO_LATE`, `ALREADY_FINISHED`, `ROUND_STALE`). After each rejection, a fresh room-state projection is byte-identical to the one captured immediately before the attempt. |
| Fails if | Any rejection changes phase, membership, drafts or scores; or an error message leaks a stack, path, token or answer. |
| Automated by | `tests/integration/rejections.test.ts` |

### E4 — First genuine baseline defect

| Field | Value |
| --- | --- |
| Scenario | To be filled at Step 9 with the **first real defect observed** while running E1–E3 and the manual two-browser round against the untouched baseline. |
| Expected | Recorded before the fix: the exact reproduction, the observed wrong behavior, and the signal that will show it is gone. |
| Fails if | A defect is invented, or the baseline is overwritten before it is captured. |
| Automated by | _to fill at Step 9_ |

**E4 is deliberately empty.** Filling it in before running the baseline would be
fabricating evidence.

## Supporting expectations (not part of E1–E4, still pre-registered)

| ID | Scenario | Expected |
| --- | --- | --- |
| S1 | Two different valid answers in one category | 10 / 10, reason `both_different` |
| S2 | `"Srbija"` vs `" srbija "` | 5 / 5, reason `same_answer` |
| S3 | Valid vs blank | 10 / 0, reason `only_player_1` |
| S4 | Blank vs valid | 0 / 10, reason `only_player_2` |
| S5 | `"Beograd"` for letter `S` vs blank | 0 / 0, reason `neither` |
| S6 | 41-character answer | invalid, rejected by schema |
| S7 | Opponent's typed draft, inspected across every event received before reveal | absent from all payloads |

## Run log

| Run | Date | Code state | Command | E1 | E2 | E3 | E4 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Baseline | _to fill at Step 9_ | _commit_ | `npm run verify` | | | | | |
| After controlled change | _to fill at Step 10_ | _commit_ | `npm run verify` | | | | | |
