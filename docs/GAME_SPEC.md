# GAME_SPEC — Zanimljiva Geografija Live

**Status:** FROZEN for Week 3 Core as of 2026-09-22.
Changing anything in this file after this point is a scope change and must be
recorded in `docs/EVIDENCE_003.md` with a reason.

**Authority:** this file is the authoritative description of game behavior.
`Plan.md` holds sequencing, architecture and ownership; where the two disagree
about *behavior*, this file wins.

## 1. Project name

Zanimljiva Geografija Live — a two-player, two-computer online version of the
Serbian pen-and-paper game.

## 2. Description

Two people, each on their own computer, play one synchronized round of
Zanimljiva Geografija in the browser. One player creates a room and shares a
six-character code; the second player joins with it. Once both game screens
have loaded, the server picks one random letter and schedules a single shared
start time and deadline, so neither player can see the letter earlier than the
other. Each player privately fills in six geography categories for that letter,
and the answers are revealed and scored only after both players finish or the
server deadline passes.

## 3. Player objective and controls

**Objective:** score more points than your opponent by writing a valid answer in
each of the six categories, and by choosing answers your opponent did not.

**Controls:** keyboard only — a name field, a room-code field, six text inputs
(one per category), and a **Finished** button. No mouse is required and there
are no timed reflex actions.

## 4. Core loop and round-completion condition

```text
create or join a room
  -> both screens load and acknowledge automatically
  -> shared 3-second countdown
  -> 90 seconds of private typing across six categories
  -> the round closes when BOTH players press Finished, or when the server
     deadline is reached, whichever happens first
  -> both answer sets are revealed at the same moment
  -> the server scores every category and declares a winner or a draw
```

One round per room. The round-completion condition is server-decided; a browser
countdown reaching zero does not itself end the round.

## 5. Key rules

1. Both players receive the identical round: same letter, same six categories,
   same `startsAt`, same `endsAt`.
2. The letter is chosen by the server **only after both clients are ready**, and
   is never revealed to one player before the other.
3. At most one answer per category per player; at most 40 characters.
4. An answer is **valid** when, after normalization, it is non-empty and starts
   with the round letter. Geographic and semantic correctness is **not** checked.
5. Answers are invisible to the opponent until the reveal.
6. **Finished** permanently locks that player's answers and cannot be undone.
7. Scoring per category: two different valid answers → 10 each; the same valid
   answer → 5 each; only one valid answer → 10 and 0; neither valid → 0 and 0.
8. The server alone decides identity, phase, timing, validity and points.

Supported letters: `A, B, D, K, M, S, V`.
Categories: Država, Grad, Reka, Planina, Biljka, Životinja.

## 6. Minimum visual requirement

Readable, keyboard-accessible HTML with labelled inputs, a visible countdown, a
clear phase indicator (waiting / countdown / answering / waiting for opponent /
results), a per-field saved-or-pending indicator, and a results table showing
both answers, validity and points side by side. Light styling only. Animation,
theming and artwork are explicitly not required.

## 7. Explicit exclusions

Accounts, passwords, more than two players, spectators, matchmaking, chat,
database, persistent history or leaderboards, reconnect/resume after refresh,
replay in the same room, a geography dictionary or any semantic answer checking,
external geography APIs, AI hints or AI judging, Cyrillic input and
Cyrillic/Latin equivalence, anti-cheat guarantees, mobile-native apps.

## 8. Definition of Done (verifiable)

- [ ] Two players on two physically separate computers create and join one room
      through the deployed URL.
- [ ] Neither player sees the letter before the shared countdown begins.
- [ ] Both clients receive byte-identical `roundId`, `letter`, `categories`,
      `startsAt` and `endsAt`.
- [ ] Neither client holds the opponent's answers in memory before the reveal
      (verified by an automated absence assertion, not by looking at the UI).
- [ ] Pressing Finished locks that player's answers; a later edit is rejected.
- [ ] Both-finished and deadline paths each reveal and score exactly once.
- [ ] All five scoring outcomes are demonstrated by passing tests.
- [ ] Every client-to-server event is parsed by a shared runtime schema, and a
      rejected event leaves canonical state unchanged.
- [ ] `npm run verify` passes and the output is recorded.
- [ ] `/healthz`, SPA refresh and a full round work on the deployed URL.

## 9. Instructor approval

> **NOT YET OBTAINED — blocking for submission, not for implementation.**
>
> | Field | Value |
> | --- | --- |
> | Requested on | _to fill_ |
> | Approved by | _to fill_ |
> | Approved on | _to fill_ |
> | Conditions | _to fill_ |

This game is not an arcade game, and Week 3 guidance leans arcade. Approval is
required for the domain choice and for the minimal real-time backend.

## 10. Why a backend is necessary, not decorative

The game's central fairness property — that neither player learns the letter
before the other, and that both share one authoritative deadline — cannot be
established by two browsers alone. It requires a single authority that chooses
the letter after both clients are ready, holds the answers privately until the
reveal, and decides timing. That is one Node process with Socket.IO and in-memory
rooms: no database, no accounts, no second service, one replica. This is the
minimum infrastructure that makes the stated game possible, and every component
of it appears in the fairness argument above.
