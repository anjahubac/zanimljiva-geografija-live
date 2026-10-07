# GAME_SPEC — Zanimljiva Geografija Live

**Status:** FROZEN for Week 3 Core as of 2026-09-22.
Changing anything in this file after this point is a scope change and must be
recorded in `docs/EVIDENCE_003.md` with a reason.

**Amendment 8 — 2026-10-07, at the product owner's request. Approved; Core
built 2026-10-07 on `feature/round-coach`.** After a round's results, a human player may ask a **round coach**
(_Trener partije_) what they could have written in the categories where they
scored 0. Server-side, an AI proposes words, the game's own letter rule checks
them, and the AI may revise once; the player then gets a short report, in
their language, whose every suggestion passed that check (and, with option
O1, the answer referee). Coaching is read-only: it changes no answer, validity
mark, point or result, it reaches only the player who asked, and it never uses
the opponent's answers. One run per player per round, and the run is bounded
in steps, checks, AI attempts and time. Nothing about the round itself — sheet,
letter, timing, judging, scoring — changes. Recorded in `Plan.md` §2C and
§2C.16, `docs/EVIDENCE_005.md` (W5-1) and `specs/010-round-coach-agent`.
_2026-10-07, owner:_ only words the answer referee accepted are shown, in the
referee's spelling, and the summary is written by the game, not the AI.

**Amendment 7 — 2026-09-30, at the product owner's request.** The round
letter is no longer limited to `A, B, D, K, M, S, V` (§5). A room's letter
comes from the whole alphabet of the player who opened it: the creator of a
friend room, the player facing the AI, or the player already waiting in the
random queue. Serbian: the 30 letters of the Latin alphabet, A B C Č Ć D Dž Đ E
F G H I J K L Lj M N Nj O P R S Š T U V Z Ž. English: the 26 letters A–Z. In a
Serbian room Lj, Nj and Dž are letters of their own, so L, N and D do not take a
word starting with them; an English room has no such rule. Diacritics are still
respected, and answers are still accepted in either language. Recorded in
`Plan.md` §2B.13 and `specs/009-full-alphabet-letters`.

**Amendment 6 — 2026-09-30, at the product owner's request.** The waiting
screen has a **Leave game** button in every mode. Before a round is scheduled,
a room whose last connected human leaves is closed at once, and its code no
longer lets anyone join. Once a round is scheduled, leaving does not end it:
the round runs to its deadline, as before. Recorded in `docs/EVIDENCE_004.md`
(W4-2) and `Plan.md` §2B.10.

**Amendment 5 — 2026-09-30, Week 4, at the product owner's request.** This
amendment supersedes Amendment 3 and parts of §5 and §7; `Plan.md` §2B holds
the full design. (a) **Accounts are removed.** Every player is a guest who
types a display name. (b) **Three ways to play:** a friend by room code, a
random person from a first-come queue, or an **AI opponent** seated by the
server. (c) **Validity (§5 rule 4) is now AI-checked.** An answer must still
pass the local rule (at least two characters, right letter), and then an AI
checker (Google Gemini, with Groq as fallback) must accept it as a real term of
its category. If the AI is unavailable or takes more than 20 seconds, the local
rule alone decides and the results say so. Scoring (§5 rule 7) is unchanged.
(d) **Hints:** two per player per round; a hinted category is marked for both
players at the reveal. (e) **Serbian and English:** the interface is in either
language, and answers count in either. (f) A **judging** phase sits between the
end of answering and the results. In §7, accounts are excluded again, while
matchmaking, AI hints and AI judging are no longer excluded. Recorded in
`docs/EVIDENCE_004.md` (W4-1).

**Amendment 3 — 2026-09-22, at the product owner's request.** _Superseded by
Amendment 5 (accounts removed on 2026-09-30); kept as written for the history._ Real accounts,
profiles and persistent personal history are now included as an extension to
Core. Players register with their email address, a display name and a password,
or continue as guests. The email address is the identity, matched case- and
whitespace-insensitively, so one address is one account. Sign-in with Google
was asked about and is **not** included: it needs an external identity provider
and a new dependency, and is recorded as a proposal in `Plan.md` §2.
Login works across devices using the same server. Each
completed round saves the account holder's eight answers, validity, category
points, letter, date, opponent display name, outcome and totals. Only the
authenticated owner can read their history; no drafts are persisted or exposed
through history before close. Duplicate closes must not duplicate points.
The profile shows lifetime points and paginated completed rounds. Room-code
play and all existing round rules remain. Matchmaking is proposed, not added.
The exclusions in §7 describe the original Core, except as amended here.

**Amendment 2 — 2026-09-22, at the product owner's request.** An answer must
now be at least two characters after normalization: the round letter typed back
on its own no longer scores. The round is 150 seconds instead of 90, for nine
categories rather than six. Both are recorded in `docs/EVIDENCE_003.md`.

**Amendment 4 — 2026-09-23, at the product owner's request.** `lake` (Jezero)
was removed from the category set, which is now eight: Država, Grad, Reka,
Planina, More, Životinja, Biljka, Predmet. Amendment 1 below records the set as
nine and is left as written, so the history stays auditable. Round length is
unchanged at 150 seconds. Recorded in `docs/EVIDENCE_003.md`.

**Amendment 1 — 2026-09-22, at the product owner's request.** The category set
grew from six to nine: `lake` (Jezero), `sea` (More) and `thing` (Predmet) were
added, and the order now reads Država, Grad, Reka, Planina, Jezero, More,
Životinja, Biljka, Predmet. Every "six categories" below became "nine". Nothing
else in this document changed: the rules, scoring, timing, privacy model and
exclusions are untouched. Recorded in `docs/EVIDENCE_003.md`. The pre-registered
evaluations in `EVALS.md` are unaffected — none of them names a category count.

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
have loaded, the server picks one random letter (since Amendment 7, from the
whole alphabet of the language of the player who opened the room) and schedules a single shared
start time and deadline, so neither player can see the letter earlier than the
other. Each player privately fills in eight geography categories for that letter,
and the answers are revealed and scored only after both players finish or the
server deadline passes.

## 3. Player objective and controls

**Objective:** score more points than your opponent by writing a valid answer in
each of the eight categories, and by choosing answers your opponent did not.

**Controls:** keyboard only — a name field, a room-code field, eight text inputs
(one per category), and a **Finished** button. No mouse is required and there
are no timed reflex actions.

_Week 4 (Amendments 5, 6):_ the start screen also offers three modes (a friend,
a random person, the AI); the sheet has a **hint** button per category (two
hints per round); the header has a Serbian/English switch; the waiting screen
has **Leave game**. All are ordinary buttons, reachable by keyboard.

## 4. Core loop and round-completion condition

```text
create or join a room
  -> both screens load and acknowledge automatically
  -> shared 3-second countdown
  -> 150 seconds of private typing across eight categories
  -> the round closes when BOTH players press Finished, or when the server
     deadline is reached, whichever happens first
  -> both answer sets are revealed at the same moment
  -> the server scores every category and declares a winner or a draw
```

One round per room. The round-completion condition is server-decided; a browser
countdown reaching zero does not itself end the round.

## 5. Key rules

1. Both players receive the identical round: same letter, same eight categories,
   same `startsAt`, same `endsAt`.
2. The letter is chosen by the server **only after both clients are ready**, and
   is never revealed to one player before the other.
3. At most one answer per category per player; at most 40 characters.
4. An answer is **valid** when, after normalization, it is **at least two
   characters** and starts with the round letter. Geographic and semantic
   correctness is **not** checked. _(Amendment 5: the AI checker now also
   judges it. Amendment 7: in a Serbian room, L, N and D do not take a word
   starting with Lj, Nj or Dž.)_
5. Answers are invisible to the opponent until the reveal.
6. **Finished** permanently locks that player's answers and cannot be undone.
7. Scoring per category: two different valid answers → 10 each; the same valid
   answer → 5 each; only one valid answer → 10 and 0; neither valid → 0 and 0.
8. The server alone decides identity, phase, timing, validity and points.

Supported letters: `A, B, D, K, M, S, V`. _Superseded by Amendment 7: the whole Serbian or English alphabet._
Categories: Država, Grad, Reka, Planina, More, Životinja, Biljka, Predmet.

## 6. Minimum visual requirement

Readable, keyboard-accessible HTML with labelled inputs, a visible countdown, a
clear phase indicator (waiting / countdown / answering / waiting for opponent /
checking answers (Week 4) / results), a per-field saved-or-pending indicator, and a results table showing
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

Letters (Amendment 7):

- [ ] A Serbian room's letter is one of the 30 Serbian Latin letters and an
      English room's one of A–Z, taken from the language of the player who
      opened the room.
- [ ] In a Serbian room, "Ljubljana" is rejected for L and accepted for Lj; in
      an English room it is accepted for L.

Week 4 additions (Amendment 5):

- [ ] An invented answer that passes the letter rule is rejected by the AI
      checker, with its reason shown; `Serbia` and `Srbija` score as the same
      answer.
- [ ] When the AI is unavailable or exceeds 20 seconds, the round is still
      scored, by the letter rule, and the results say so.
- [ ] The AI opponent's answers are absent from every payload before the
      reveal (automated absence assertion).
- [ ] A hint never contains its term; a hinted category is marked for both
      players at the reveal.
- [ ] Every screen reads correctly in Serbian and in English.
- [ ] The live AI check is run and recorded in `docs/AI_EVALS.md`.

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

_Week 4 (Amendment 5):_ the server now also calls an external AI (Google
Gemini, with Groq as fallback) to check answers, play the AI opponent and write
hints. This is still not a second service of ours: no database, no queue, no
second process. The AI is called only by the server, with the key kept in the
server environment, and the game never depends on it: if it fails, the round
is scored by the letter rule. The same backend is what makes this possible;
answers could not be sent to an AI from the browser without exposing the key
and the opponent's answers.
