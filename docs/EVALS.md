# EVALS — Zanimljiva Geografija Live

**Expectations written on 2026-09-22, before any gameplay code existed.**

Rule for this file: the _Expected_ column is frozen once written. After the one
controlled change in Step 10, the identical scenarios are re-run and the results
are appended to the Run log below. Expectations are never edited to match what
the code turned out to do.

## Pre-registered evaluations

### E1 — Synchronized start is fair

| Field        | Value                                                                                                                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenario     | P1 creates a room; P2 joins; P1 sends `room:client-ready`; then P2 sends `room:client-ready`.                                                                                                                                                                       |
| Expected     | Nothing is scheduled after P1's ready alone. After P2's ready, both clients receive `round:scheduled` with deeply equal payloads: same `roundId`, `letter`, `categories`, `startsAt`, `endsAt`. `startsAt > serverNow` and `endsAt - startsAt === roundDurationMs`. |
| Fails if     | Either client receives a letter early, the payloads differ in any field, or `startsAt` is in the past.                                                                                                                                                              |
| Automated by | `tests/integration/synchronized-start.test.ts`                                                                                                                                                                                                                      |

### E2 — The round closes and scores exactly once

| Field        | Value                                                                                                                                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenario     | P1 presses Finished 1 ms before the deadline; the deadline then fires. Repeated for: both finish early; neither finishes; duplicate Finished from the same player.                                                                      |
| Expected     | Exactly one `round:revealed` and one `round:results` per player, all carrying the same `roundId`. Totals are identical in both players' payloads. A duplicate Finished is acked without a second reveal and without changing any score. |
| Fails if     | Any player receives two reveals, two results, or different totals from their opponent.                                                                                                                                                  |
| Automated by | `tests/integration/close-and-score.test.ts`                                                                                                                                                                                             |

### E3 — Invalid input never mutates canonical state

| Field        | Value                                                                                                                                                                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scenario     | A third socket tries to join a full room; a draft carries an unknown category; a draft carries an extra `score` key; a draft arrives before `startsAt`; a draft arrives after `endsAt`; a draft arrives after that player finished; a draft carries a stale `roundId`.                                                         |
| Expected     | Each is rejected through the ack with the matching code from the module 12 registry (`ROOM_FULL`, `INVALID_PAYLOAD`, `INVALID_PAYLOAD`, `TOO_EARLY`, `TOO_LATE`, `ALREADY_FINISHED`, `ROUND_STALE`). After each rejection, a fresh room-state projection is byte-identical to the one captured immediately before the attempt. |
| Fails if     | Any rejection changes phase, membership, drafts or scores; or an error message leaks a stack, path, token or answer.                                                                                                                                                                                                           |
| Automated by | `tests/integration/rejections.test.ts`                                                                                                                                                                                                                                                                                         |

### E4 — Opponent disconnect is never shown during a round

**Observed 2026-09-23 by the product owner**, in two browser profiles at commit
`c1b3192`, while probing the `Plan.md` §13 failure matrix by hand. Written here
**before** any fix.

| Field              | Value                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reproduction       | P1 and P2 start a round. During the live round, P2 either refreshes their tab or closes it. P1 stays on the answer sheet and watches.                                                                                                                                                                                                                                 |
| Observed (wrong)   | Nothing on P1's screen changes. P1 keeps reading `UI_SR.opponentStillPlaying` — "Protivnik još igra." — for the rest of the round, although P2's socket is gone. P1 plays on believing there is an opponent, and only learns otherwise at the reveal.                                                                                                                 |
| Expected (the fix) | While the round is live, P1 is told that the opponent is no longer connected, and the message is announced politely rather than only appearing silently. The round itself is unchanged: the timer keeps running, accepted drafts are retained, and the deadline still closes and scores exactly once.                                                                 |
| Signal it is gone  | A test that drops P2's socket mid-round and asserts the disconnect is visible in what P1's screen renders — not merely present in the socket payload. The existing payload assertion stays as it is.                                                                                                                                                                  |
| Why it survived    | `tests/integration/room-lifecycle.test.ts:145` asserts `connected === false` on the **server projection**, and passes. The projection is correct. The client reducer derives `opponentFinished` from that same payload but never derives `connected`, and no round screen reads it — `player.connected` is rendered only in `WaitingScreen`, before the round starts. |
| Fails if           | A defect is invented, or the baseline is overwritten before it is captured.                                                                                                                                                                                                                                                                                           |
| Automated by       | _to fill at Step 10, written before the fix_                                                                                                                                                                                                                                                                                                                          |

This is a genuine behavioral defect against `Plan.md` §13, whose "One player
disconnects" row requires the remaining player to **show connection status**.
It was not manufactured: the probe list was drawn up before it was run, and
three of the four probes came back clean (see `EVIDENCE_003.md` §2.2).

## Supporting expectations (not part of E1–E4, still pre-registered)

| ID  | Scenario                                                                    | Expected                         |
| --- | --------------------------------------------------------------------------- | -------------------------------- |
| S1  | Two different valid answers in one category                                 | 10 / 10, reason `both_different` |
| S2  | `"Srbija"` vs `" srbija "`                                                  | 5 / 5, reason `same_answer`      |
| S3  | Valid vs blank                                                              | 10 / 0, reason `only_player_1`   |
| S4  | Blank vs valid                                                              | 0 / 10, reason `only_player_2`   |
| S5  | `"Beograd"` for letter `S` vs blank                                         | 0 / 0, reason `neither`          |
| S6  | 41-character answer                                                         | invalid, rejected by schema      |
| S7  | Opponent's typed draft, inspected across every event received before reveal | absent from all payloads         |

## Run log

| Run                     | Date                 | Code state | Command                           | E1       | E2       | E3            | E4   | Notes                                                                                                                                 |
| ----------------------- | -------------------- | ---------- | --------------------------------- | -------- | -------- | ------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline (automated)    | 2026-09-22           | `481535a`  | `npm run verify`                  | pass (3) | pass (7) | pass (16)     | open | 223 tests, 13 files. Manual two-computer round not yet run, so E4 is still unfilled — see `EVIDENCE_003.md` §2.                       |
| Pre-change (automated)  | 2026-09-23           | `c1b3192`  | `npm run verify`                  | pass (3) | pass (7) | pass (16)     | open | 261 tests, 19 files. Re-run at HEAD so Step 10 has a before/after pair at the same code state. Expectations unchanged.                |
| Manual browser round    | 2026-09-23           | `c1b3192`  | two browser profiles, one machine | pass     | pass     | not exercised | open | Played by the product owner. Both close paths; no defect observed. Happy path only, single system clock — see `EVIDENCE_003.md` §2.1. |
| After controlled change | _to fill at Step 10_ | _commit_   | `npm run verify`                  |          |          |               |      |                                                                                                                                       |
