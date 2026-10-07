# EVIDENCE_004 — Zanimljiva Geografija Live, Week 4

Evidence for the Week 4 revision: the scope changes, the evals written before
the code, what was run and what it showed, and what is still open. Week 3's
evidence stays in `EVIDENCE_003.md`; the full Week 4 design is `Plan.md` §2B.

**Current handoff (2026-10-07):** Week 4 is committed on main; W4-7 ran
once per provider with `check-round.v3`, with 16/16 checker agreement on both. Its live details
and bot/hint quality findings are in `docs/AI_EVALS.md`. W4-8's controlled
change and W4-9's deployment remain open. Older dated observations below
are historical, not a claim that no live call has ever occurred.
The shared Week 5 workspace now uses `check-round.v4`; its Serbian spelling
and original-name guidance has passed fake tests but has no new live checker
eval recorded here. The v3 result above is not a v4 quality claim.

Rule for this file, as for Week 3: nothing is written here that was not
actually observed. A placeholder stays a placeholder until the run that fills
it has happened. Sources are named for every result.

---

## 1. Scope changes

`docs/GAME_SPEC.md` is frozen; each change below is a recorded amendment.

### W4-1 — No accounts, AI checker, AI opponent, hints, two languages (2026-09-30)

- **Requested by:** the product owner. A colleague had forked the game
  (`Cevizara1/zanimljiva-geografija-live`, `28ee792`) into single-player
  against AI on Vercel, which removed the friend and random-person modes. The
  owner wanted the AI as an **answer checker** and as a **third mode**, with
  both multiplayer modes kept.
- **Spec:** `GAME_SPEC.md` Amendment 5. **Design:** `Plan.md` §2B.1–2B.9.
- **Removed:** accounts, profiles, saved history and the SQLite file (reverses
  Week 3 SC-6 and SC-7). Every mode is guest play.
- **Added:**
  - an AI answer checker in the close path, one request per round, with a new
    `judging` phase and a 20-second fallback to the letter rule;
  - `room:play-ai`, a server-side AI opponent in seat 2;
  - `round:hint`, two hints per player per round;
  - a Serbian/English interface; answers count in either language;
  - error codes `AI_UNAVAILABLE`, `AI_LIMIT`, `HINT_LIMIT`.
- **Providers:** Google Gemini and Groq, free tiers, in one interleaved model
  chain, so the next try after a failure goes to the other provider (§2B.5).
  Gemini was chosen for its free calls. Its free tier may use requests to
  improve Google's products, and Serbia is not in the EEA/UK/Switzerland
  exception. The lobby tells players that answers go to Gemini and Groq.
- **Reused from the fork:** the AI gateway, adapters, model health, telemetry,
  letter folding, resemblance and hint-leak checks, fakes, and about 100 of its
  tests; the checker and hint features were adapted (§2B.4).

### W4-2 — Leave game on the waiting screen (2026-09-30)

- **Requested by:** the product owner — "a back button on screens when you wait
  for a friend, so you can leave the game, or a leave the game button".
- **Chosen:** a labelled **Leave game** (_Napusti partiju_), not a back arrow.
  Leaving releases the room and kills the code a friend was sent, which cannot
  be undone, so the button names the action. On a friend room a note under it
  says the code stops working.
- **Spec:** `GAME_SPEC.md` Amendment 6. **Design:** `Plan.md` §2B.10.
- **How:** no new event. The button drops the socket, as the results sheet's
  way back already did (Week 3 SC-8). One rule was added to
  `markDisconnected`: before a round is scheduled, a room with no connected
  human left is closed at once. Before, an abandoned lobby lived for 30 minutes
  and a friend could join it and wait forever.

### W4-3 — AI usage limit per visitor and per day (2026-09-30)

- **Requested by:** the product owner accepted the proposal in `Plan.md`
  §2B.11, with its numbers, after the Week 4 audit.
- **Why:** nothing bounded how much of the shared free AI quota one visitor
  could spend; the socket rate limit resets on reconnect.
- **Chosen:** per visitor per hour, 10 AI games and 20 hints; per UTC day,
  1,500 AI calls, after which no new AI games or hints, but played rounds are
  still checked. All four numbers are host settings. No new error code, event
  or dependency.
- **Design and limits:** `Plan.md` §2B.11 "As built".

---

## 2. Baseline before Week 4

| Item | Value | Source |
| --- | --- | --- |
| Code state | `main` at `8306d97` (last Week 3 commit) | git history |
| `npm run verify` | pass — 20 test files, 275 tests | Week 4 session (`AI_USAGE_LOG.md` 007); matches `EVALS.md` run log at `870c9af` |
| Modes | friend (room code), random person (queue), both requiring nothing from AI | `Plan.md` §2 |
| Validity | local rule only: at least 2 characters and the right letter | `GAME_SPEC.md` Amendment 2 |

---

## 3. Evals written before the code

### A1–A6 — the game's handling of the AI (automated, fake AI)

Scenarios and expectations were written in `Plan.md` §2B.6 before the code,
and are implemented in `tests/integration/ai-round.test.ts`.

| ID | Protects | Result (Week 4 session) |
| --- | --- | --- |
| A1 | The AI decides what counts; one call per round; wrong-letter answers never sent | Pass |
| A2 | Finish racing the deadline while the checker is pending closes once | Pass |
| A3 | A checker that fails or never answers still ends in a scored round | Pass |
| A4 | Hints: clue only to the caller, credit charged only when shown, hint racing the close | Pass |
| A5 | AI opponent: scheduled from the human's ready alone; its answers absent before reveal | Pass |
| A6 | The bot's AI call failing leaves the human's round unaffected | Pass |

A mutation check showed the evals can fail: making the bot keep all 8 answers
failed A5, and charging an extra hint failed A4 (`Plan.md` §2B.6).

### Live smoke check — the AI itself (manual, real providers)

16 answer verdicts with expectations written first, plus an AI opponent sheet
and two hints: `docs/AI_EVALS.md`. **Run 2026-10-07:** both providers agreed with 16/16 checker expectations;
see `docs/AI_EVALS.md` for bot/hint limitations.

### S8 — Leave game

Pre-registered in `EVALS.md`: the host leaving the waiting screen before
anyone joins removes the room, and its code answers `ROOM_NOT_FOUND`.

---

## 4. Runs

| Run | Date | Code state | Command | Result | Source |
| --- | --- | --- | --- | --- | --- |
| Baseline | 2026-09-30 | `8306d97` | `npm run verify` | pass — 275 tests, 20 files | Week 4 session (`AI_USAGE_LOG.md` 007) |
| After W4-1 | 2026-09-30 | uncommitted | `npm run verify` | pass — 431 tests, 27 files; A1–A6 pass | Week 4 session (`AI_USAGE_LOG.md` 007) |
| Browser, scripted AI | 2026-09-30 | uncommitted | `npm run dev`, AI replaced by a scripted stand-in | an AI round (bot, hint, language switch mid-round, results with reasons) and a friend round in two tabs (one SR, one EN); no server or console errors | Week 4 session (`AI_USAGE_LOG.md` 007) |
| After W4-2 | 2026-09-30 | uncommitted | `npm run verify` | pass — 437 tests, 27 files; the 4 new server tests fail with the new rule disabled | `AI_USAGE_LOG.md` 008 |
| After W4-3 | 2026-09-30 | uncommitted | `npm run verify` | pass — 456 tests, 29 files; with the limits disabled, the 5 integration cases in `ai-limits.test.ts` fail | `AI_USAGE_LOG.md` 010 |
| After 009 (whole alphabet) | 2026-09-30 | uncommitted | `npm run verify` | pass — 490 tests, 30 files; baseline before the change 458, 29; three mutation checks failed as expected | `AI_USAGE_LOG.md` 011 |
| Live AI, Gemini | 2026-10-07 | Week 5 baseline | `AI_PROVIDER_ORDER=gemini npm run smoke:ai` | 16/16 checker agreement; bot/hint observations | `AI_EVALS.md`, `AI_USAGE_LOG.md` 015 |
| Live AI, Groq | 2026-10-07 | Week 5 baseline | `AI_PROVIDER_ORDER=groq npm run smoke:ai` | 16/16 checker agreement; factually wrong hints recorded | `AI_EVALS.md`, `AI_USAGE_LOG.md` 015 |
| Deployed round | — | — | Render, one round per mode | **not run** | — |

---

## 5. Hypothesis and one controlled change — not yet done

Week 3 changed one variable and re-ran the identical evals (`EVIDENCE_003.md`
§3). Week 4 has no such pair yet. The natural candidate, proposed here and not
started:

- **Baseline:** the first live smoke run, per provider, recorded in
  `AI_EVALS.md` (agreement out of 16).
- **Controlled change:** one change to the checker prompt (`check-round.v3` →
  `v4`), aimed at the cases that disagreed, with nothing else changed.
- **Verification:** re-run the same 16 cases on the same models; A1–A6 must
  still pass.

Write the claim, signal and hypothesis here **before** changing the prompt.

---

## 6. Open findings

1. **AI usage limit — resolved locally, unconfirmed on the host.** The owner
   accepted `Plan.md` §2B.11 and it is built (W4-3 below). Still open:
   `TRUST_PROXY_HOPS` for Render is unknown and must be set and checked at
   W4-9; with 0 there, every visitor shares one limit. Players behind one
   address share one per-visitor limit.
2. **Live AI quality remains limited.** W4-7 ran on 2026-10-07; both checkers
   scored 16/16 on the fixed cases. Groq's hints still contained factual
   errors and some bot answers were doubtful (`AI_EVALS.md`).
3. **Leave game has not been clicked through in a browser**; only automated
   tests and the render tests cover it.
4. **Committed, not deployed.** Week 4 is on main (`6232482`, `4dea3b5`);
   W4-9 and its physical two-computer checks are still open.
5. **Instructor approval** (`GAME_SPEC.md` §9) is still empty, and Week 4 is a
   larger scope change than the one it was requested for.
6. **The resume token is still minted and unused** (`EVIDENCE_003.md` §5).
   Unchanged by Week 4.

---

## 7. Contributions

| Person | Implementation | Review / evidence |
| --- | --- | --- |
| _to fill_ | | |
| _to fill_ | | |
