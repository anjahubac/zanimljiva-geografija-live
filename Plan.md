# Zanimljiva Geografija Live - Detailed Implementation Plan

## 1. Status and deadline

- Product name: **Zanimljiva Geografija Live**
- Delivery target: **23 September 2026**
- Players: exactly two people on two separate computers
- Deployment: one public browser URL backed by one real-time Node.js service
- Plan status: Core gameplay implemented; baseline/evidence and deployed two-computer acceptance remain incomplete. See the 2026-09-22 review in `docs/PRODUCT_REVIEW.md`.
- Primary objective: deliver the smallest reliable synchronized round and the evidence required for Week 3
- **Week 4 revision (2026-09-30): see §2B.** Accounts are removed; a Gemini
  answer checker, a third way to play (against an AI opponent), hints, and a
  Serbian/English interface are added. Where §2B contradicts an older section,
  §2B wins, and the older text is marked. A **Leave game** button on the
  waiting screen followed the same day (§2B.10). Week 4 evidence is in
  `docs/EVIDENCE_004.md`. An AI usage limit per visitor and per day was
  accepted and built the same day (§2B.11). Spec Kit was added afterwards,
  with specs reconstructed for the features already built (§2B.12).

## 2. How the source documents are used

### Product-owner expansion — 2026-09-22

> **Superseded in part by §2B (2026-09-30):** email accounts, profiles, saved
> history and the SQLite store are removed. Friend rooms and random matchmaking
> stay exactly as described under "Two ways into a room".

The owner explicitly requested real cross-device accounts, player profiles,
persistent answer/points history, and a wider game sheet. These supersede the
Core exclusions below for this extension. Random matchmaking was a proposal
when this section was written; it was approved on 2026-09-22 and is now
implemented — see "Two ways into a room" below.

Implementation sequence for the extension:
1. Shared account/history schemas and acceptance cases.
2. SQLite account/session/history store; **email**/password authentication with
   asynchronous scrypt, expiring HttpOnly cookies, bounded requests and login
   attempts. Use built-in `node:sqlite` (Node >=22.13), no new package/service.
   The email address *is* the identity: it is trimmed and lowercased before it
   is stored or compared, so one address is one account whatever its casing.
3. Bind authenticated identity on the server when entering a room; persist
   each player's own answers and server points once on canonical round close.
   Guest room-code play remains available, without persistent guest history.
4. Login/register/profile/history UI, paginated history, and wider tables.
5. Authentication, privacy, persistence, scoring and browser verification.

SQLite must live on a persistent disk in production. Active rooms remain in
memory. Password recovery, reconnect, rematches and matchmaking remain future
work. The baseline commit before this extension is
`481535a9065852ad9001719f96de2a73ebe399b3`; this is not a claim that the full
Week 3 baseline/evidence exercise has been completed.

#### Google sign-in — proposed, not implemented (2026-09-22)

The owner asked whether players could also sign in with Google. It is **not**
implemented, and it is not a small addition to the above: it needs an OAuth
client library, a Google Cloud project, registered redirect URIs, a client
secret held outside the repository, and a decision about what happens when a
Google address matches an existing password account. That is a new dependency
and a new external service, which §4 and rule 5 of the agent instructions
forbid without an explicit scope change.

Email and password ship first and stand on their own. If Google sign-in is
approved later, the account table already keys on the email address, so a
Google identity joins an existing row rather than forcing a migration.

#### Two ways into a room (2026-09-22)

A player chooses between **playing a friend** — create a room, share the code,
the existing path — and **playing a stranger**, a first-come queue held in the
same process as the rooms. The second player to queue causes the server to
create a room for the waiting player and immediately join the arriving one, so
a matched pair travels exactly the path a room code travels: there is no second
way to start a round, and every existing timing, privacy and scoring guarantee
applies unchanged.

Rules the queue must keep:

- One entry per socket. Asking twice returns the same queued answer rather than
  creating a second entry that a later player could match against.
- A socket that disconnects while queued is removed, so nobody is matched with
  a player who has gone.
- A signed-in account is never matched with itself on a second device; it waits
  for a different account instead.
- A player already in a room cannot queue.
- The queue lives in memory beside the rooms. A restart loses it, exactly as it
  loses rooms, and this is the same accepted limitation §13 already records.

A signed-in player is not asked for a name on either path: the account supplies
the display name, and the server takes it from the session rather than from the
payload, so a client cannot claim another name by editing the request.

#### Disputed answers — approved 2026-09-22, not yet built

The owner asked for a way to challenge an answer the opponent believes is
invalid, with the server consulting an outside source. The approved design is a
**flag plus an advisory lookup**: at reveal either player may mark a cell as
suspicious, both players see it marked, and the server reports what an external
lookup found as *evidence*, never as a verdict that changes the score.

This is sequenced after the deployed two-computer round, because:

- It touches the reveal-and-scoring path, the most invariant-protected code in
  the repository, and §8 states that reveal and scoring happen exactly once.
- `answer:review` is listed in §11 as a Stretch event that Core schemas must not
  declare, and live web lookup is excluded three times in §4. Building it is a
  recorded scope change, not a refactor.
- It needs a provider choice, an API key held in deploy configuration, rate
  limiting, caching, and a defined answer for when the lookup fails, times out
  or is ambiguous — none of which can be deterministic in tests, so the lookup
  must sit behind an injected interface with a fake in tests, the way `Clock`
  and `LetterSelector` already do.

The scoring rule does not change: points stay as §6 defines them, and a flagged
cell is presented as disputed rather than rescored. Deciding otherwise would
make the score depend on a network call.

#### Game-sheet shape (2026-09-23)

The answer sheet is the paper sheet, not a two-player grid. The categories head
the columns and the body is ruled for five lines: Core plays one round, so the
player writes on the first line and the remaining four stay blank. The blank
lines are the look of the page and carry no data, so they are `aria-hidden`.

The **playing** sheet carries the categories and nothing else — no letter column
and no total column. The letter is stated in the header above the sheet, and a
total has nothing to show before the reveal, because points do not exist until
the server closes the round.

The **scoring** sheet keeps a player column and a total column, one scored line
per player above the blank remainder, because that is where totals belong.

Neither sheet stacks into a list at any width. Both keep their columns and, if
the window is too narrow, scroll inside their own container — the sheet screens
are allowed a wider page than the forms so that ordinary laptop widths do not
need to scroll at all.

The supplied documents have different roles:

1. The team's explicit request controls the product behavior.
2. `docs/GAME_SPEC.md`, after team approval, becomes the authoritative game specification.
3. The Week 3 challenge PDF supplies submission criteria, evidence requirements, and AI-engineering guardrails.
4. This file supplies architecture, work sequence, ownership, tests, deployment, and risk management.
5. The `.github` instruction set supplies reusable engineering guidance to coding agents.
6. The generic instruction-files README is a structural example only. Its sample architecture, commands, credentials, remotes, bot runner, and deployment environment do not apply here.

If two higher-priority sources conflict, pause and resolve the conflict in `GAME_SPEC.md` before implementing it.

## 2B. Week 4 revision — no accounts, Gemini checker, AI opponent, hints, two languages (2026-09-30)

**Status: implemented locally on 2026-09-30. Not yet committed, pushed or deployed.**
`npm run verify` passes (437 tests, 27 files, after §2B.10). Not yet run against the real Gemini or Groq APIs,
because no key was available in the session; see §2B.6 step 7.

The owner's decisions, recorded before any code changes:

1. **Gameplay stays as it is on `main` at `8306d97`.** Same sheet, categories,
   letters, 150-second round, synchronized start, private drafts, Finish,
   deadline, one idempotent close, traditional 10/5/0 scoring.
2. **Login and signup are removed.** Every mode is guest play with a display
   name typed on the start screen.
3. **Three ways to play**, none needing an account:
   - **Play a friend** — create a room, share the code (unchanged).
   - **Play a random person** — the first-come queue (unchanged).
   - **Play against AI** — new; a server-side AI opponent takes the second seat.
4. **An AI answer checker** decides whether an answer really is a country,
   city, river... Answers that only pass the letter rule no longer score.
5. **Hints** — a stuck player can ask the AI for a clue (§2B.8).
6. **Two languages** — Serbian and English interface; answers are accepted in
   either language and the checker judges both (§2B.9).
7. **The AI providers are Google Gemini and Groq, free tiers, each the other's
   fallback** (§2B.5). Gemini was chosen for its free API calls; Groq was
   added so that either can stand in when the other fails.

A colleague's fork (`Cevizara1/zanimljiva-geografija-live`, commit `28ee792`)
rebuilt the game as single-player on Vercel with a Gemini checker. The
single-player/Vercel direction is **not** adopted, because it removes the two
multiplayer modes. Its AI layer is well built and provider-neutral, and is
reused as listed in §2B.4.

### 2B.1 Remove accounts — done

Deleted with their tests: `src/server/accounts/*`, `src/contracts/account.schemas.ts`,
`src/client/accounts/*`, `AccountScreen.tsx`, `ProfileScreen.tsx`, the SQLite
file under `data/`, and their CSS. The socket layer no longer reads a session
cookie; the display name always comes from the validated payload. The
same-origin check on the socket handshake, which lived in the account module,
was kept and moved to `src/server/index.ts`. Matchmaking is "oldest waiting
socket first". No persistent disk is needed any more, which is what makes free
hosting possible (§2B.7).

### 2B.2 AI answer checker

**Where it runs.** Only on the server, only inside the close path. The browser
never calls the AI and never sees the key.

**Two steps, in order:**

1. **Local rule (unchanged, free, deterministic).** Length ≥ 2 after
   normalization and the right starting letter (§7). Blank or failing answers
   are invalid and are never sent to the AI.
2. **AI verdict.** Every answer that passed step 1 — from both players — goes
   into **one request per round**. Identical answers in the same category
   (after `compactFold`) are sent once. The model returns, per item:
   `verdict` (`accepted` | `rejected`), `reason` (`not_real`, `wrong_category`,
   `historical`, `unrecognized`, or empty), and the recognised name in Serbian
   and in English.

An answer is **valid** only if step 1 passes **and** the AI accepts it **and**
the recognised name resembles what the player wrote (the model may not "correct"
`Kxqwe` into `Kenija`) **and** that name starts with the round letter. The
letter is decided by code, never by the model, so `Sabac` recognised as
`Šabac` is rejected for S.

**Scoring does not change.** §6's table is applied to the new validity. For
"same answer" (5/5), two accepted answers are compared by the `compactFold` of
the recognised **Serbian** name. So `Cacak` and `Čačak` are the same city, and
`Serbia` and `Srbija` are the same country.

**Close path.** `closeRound` stays the single, idempotent entry point:

```text
closeRound(roundId, reason)
  1. Return unless this is the current open round.
  2. Mark closed.
  3. Cancel timers (start, deadline, bot finish).
  4. Lock both sheets.
  -- no AI configured: completeRound(local rule) immediately, as in Week 3 --
  5. phase = "judging"; ask the checker; start a JUDGE_TIMEOUT_MS (20 s) timer.
completeRound (runs exactly once: whichever of checker / timeout comes first)
  6. Validity = local rule + AI verdicts (or local rule only, verified = false).
  7. phase = "results"; emit one round:revealed and one round:results.
```

The gateway gives the checker at most 18 s across all retries and fallback
models. The room's own 20 s timer uses the injected scheduler, so it cannot be
defeated by a misbehaving AI service, and tests drive it deterministically.

**Failure is never a stuck game.** Timeout, quota, bad JSON, schema mismatch,
refusal or a missing key all fall back to the local rule. The results screen
then says the round was scored on the starting letter only. When the AI did
check, each rejected cell shows its reason (e.g. "ne postoji", "pogrešna
kategorija").

**Safety.**

- Answers are untrusted data: control characters stripped, JSON-encoded in the
  user message, and the system prompt says never to follow instructions inside
  them. The 40-character cap already limits payloads.
- The reply is validated three times: JSON parse → zod schema → semantic rules
  (exactly the item ids sent, each once). Anything else counts as a failure.
- The key lives only in the server environment; telemetry logs counts and
  outcomes, never answers or the key.
- An opponent's answers reach the AI only after both sheets are locked, and
  reach the other player only in `round:revealed`.

### 2B.3 Play against AI

**Entry.** A third button in the lobby, event `room:play-ai`
(payload `{ displayName, language }` since §2B.13, same ack as `room:create`). Without an AI key the
server answers `AI_UNAVAILABLE` and the lobby shows that message.

**The bot is a server-side player, not a client.** It has `bot: true`, the
reserved name `AI` (a human cannot pick it), no socket, `connected: true`, and
`clientReady: true` from the moment it is seated. So rule 2 holds unchanged:
the round is scheduled when the human's loaded screen sends
`room:client-ready`, through the same `scheduleRound` as every other room.

- When the letter is chosen, the server asks the AI for the bot's sheet (one
  call, prompt `bot-answers.v1`, now `bot-answers.v2`, which is told the room's alphabet (§2B.13)). The answers are held in the round's private
  bot state. They are **never** in a projection or any payload before
  `round:revealed`.
- **One fixed difficulty:** the bot keeps a random 5–7 of its 8 answers and
  presses Finish at a random moment between 55% and 85% of the round. If its
  answers arrive after that moment, it finishes on arrival. If the human
  finishes first, the bot finishes at once (or on arrival of its answers), so
  results do not wait for the clock. Randomness is injected, so tests are
  deterministic.
- The bot's answers go through the **same** checker, in the same request as the
  human's. The bot is not trusted to be right.
- If the bot's AI call fails, it plays a blank sheet and the results say so
  (`botFailed`). The human's round is unaffected.
- The bot never enters the random-person queue and never uses hints.

### 2B.4 What was reused from the colleague's fork

| Fork file | Use |
| --- | --- |
| `src/server/ai/types.ts`, `gateway.ts`, `classify.ts`, `retry-policy.ts`, `model-health.ts`, `telemetry.ts`, `debug-log.ts`, `config.ts`, `gemini-adapter.ts` | Copied as-is. Only the operation list and a `bot-answers` budget were added |
| `src/domain/fold-letters.ts`, `resemblance.ts`, `hint-leak.ts` | Copied as-is |
| `src/server/features/check-round.ts`, `prompts/check-round.v2.ts` | Adapted into `check-round.ts` + `check-round.v3`: both players, items keyed by id, de-duplicated, Serbian or English, no "example" field |
| `src/server/features/hint.ts`, `prompts/hint.v1.ts` | Adapted into `hint.ts` + `hint.v2`: the clue is written in the player's language. Now `hint.v3` (§2B.13) |
| `src/server/prompts/category-rules.ts` | Adapted (letter rule for our seven letters; per alphabet since §2B.13) |
| `tests/fakes/fake-adapter.ts`, `fake-gemini.ts`; tests for gateway, classify/retry, model rotation, Gemini adapter, config, debug log | Copied; 101 tests. The parts that tested his Vercel handlers and single-player reducer were left out |

**Not reused:** Vercel functions and `vercel.json`, public HTTP AI endpoints and
their rate limiter. _Correction 2026-09-30:_ this originally said our AI "is
called only from inside a round, so there is no endpoint to abuse". That is not
quite true: every `room:play-ai` round costs AI calls, and the per-socket rate
limit resets on reconnect, so a script can spend the shared free quota. See
§2B.11. the single-player reducer and screens, the Spec Kit
scaffolding, and the Cyrillic → Latin normalization (Cyrillic input stays out
of scope, §4). _Correction 2026-09-30:_ Spec Kit was added later the same day,
installed fresh rather than copied from the fork; see §2B.12.

**New here:** `src/server/ai/service.ts` (the one interface the room store
uses), `features/bot-answers.ts` + `prompts/bot-answers.v1.ts`, the judging
stage, the bot seat, hints in a two-player round, and both languages.

### 2B.5 AI providers — Google Gemini and Groq, each the other's fallback

Owner's decisions (2026-09-30): Gemini, for its free API calls, and then Groq
as well, so that either can stand in when the other fails. Both adapters are
plain `fetch`, so there is no SDK and no new dependency.

**How the fallback works.** Both providers' models go into the gateway's one
model chain, **interleaved**, first-choice provider first:

```text
gemini-3.5-flash-lite -> openai/gpt-oss-120b -> gemini-3.1-flash-lite -> openai/gpt-oss-20b -> gemini-3.6-flash
```

So the attempt after any failure — a timeout, a 5xx, a spent daily quota — goes
to the other provider, within the same request's time budget. The gateway's
model-health memory then skips failing or exhausted models on later requests,
so a provider that is down or out of quota costs at most one failed attempt,
not one per round. A routing adapter (`src/server/ai/providers.ts`) sends each
model to its provider: ids starting `gemini-` go to Gemini, everything else to
Groq.

- **Either key alone works.** With both, `AI_PROVIDER_ORDER=gemini,groq`
  (default) or `groq,gemini` picks the first choice. Listing one name uses
  only that provider, which is how each is tested alone.
- **Groq specifics.** Strict JSON-schema output (`strict: true`) on
  `openai/gpt-oss-120b` / `gpt-oss-20b`, with low reasoning effort and
  reasoning left out of the reply. Array length bounds are removed from the
  schema sent to Groq (strict mode does not document them); zod still checks
  them. A 429 is a daily limit when `x-ratelimit-remaining-requests` is `0` or
  the message names RPD/TPD; the model is then skipped until Groq's own
  `x-ratelimit-reset-requests`. Otherwise it is the per-minute window and
  `retry-after` is honoured. A 498 (flex capacity) counts as temporary.
- **Privacy.** On Gemini's free tier, Google may use prompts and replies to
  improve its products, with human review; Serbia is not in the
  EEA/UK/Switzerland exception. Groq does not keep inference data by default,
  and its Zero Data Retention setting also disables its 30-day abuse log.
  Players are told in the lobby that answers and hint requests go to Google
  Gemini and Groq, and not to enter personal data. Only answers, the letter and
  category names are ever sent.
- **Cost safety.** Gemini key in a Google project **without billing**; Groq's
  free plan needs no card. An exhausted quota can never cost money.
- **Quota.** Gemini: a free daily quota per model. Groq free plan: about 30
  requests/min, 1,000 requests/day and 8,000 tokens/min per model. A round uses
  1 check request, plus 1 bot request in AI mode, plus 1 per hint asked.
- **Env:** `GEMINI_API_KEY`, `GROQ_API_KEY` (either enables AI), optional
  `GEMINI_MODEL_CHAIN`, `GROQ_MODEL_CHAIN`, `AI_PROVIDER_ORDER`,
  `GEMINI_THINKING_LEVEL`, `AI_DEBUG_LOG` (local only).
- **No key** is a supported mode: the local rule scores every round, and
  "Play against AI" and hints answer `AI_UNAVAILABLE`.

### 2B.6 Implementation order and results

| Step | Work | Result (2026-09-30, local) |
| --- | --- | --- |
| 1 | Remove accounts (§2B.1) | Done. `verify` green, 256 tests |
| 2 | Port the fork's AI layer + its tests | Done. 101 ported tests pass unchanged |
| 3 | Checker, bot and hint features, prompts, output schemas | Done. `tests/unit/ai-features.test.ts` |
| 4 | Judging stage, bot seat, hints in the room store; `room:play-ai`, `round:hint` | Done. Evals A1–A6 below |
| 5 | Client: three-mode lobby, hints on the sheet, judging screen, reasons and hint marks on results, SR/EN | Done. `tests/unit/client-ai.test.ts`; played in a browser against a scripted AI |
| 6 | Docs: this section, `.env.example`, `.github` modules 09/12 and the always-on guardrails | Done |
| 6b | Groq adapter and Gemini ⇄ Groq fallback (§2B.5) | Done. `tests/unit/groq-and-fallback.test.ts`: Gemini quota spent → Groq answers, and Gemini is skipped next round; Groq down → Gemini answers; both down → letter rule |
| 7 | **Live eval against real Gemini and Groq:** `npm run smoke:ai` (once per provider, with `AI_PROVIDER_ORDER=gemini` / `=groq`) — 16 fixed answers (Serbian, English, invented, wrong category, injection) with expected verdicts written first, plus bot answers and hints in both languages | **Not run yet** — needs the owner's key in `.env`. Record the agreement score in `docs/AI_EVALS.md` |
| 8 | Deploy (§2B.7) and run the production checks | Not started |
| 9 | Leave game on the waiting screen (§2B.10) | Done. `verify` green, 437 tests, 27 files |
| 10 | AI usage limit per visitor and per day (§2B.11) | Done. `verify` green, 456 tests, 29 files |
| 11 | Letters from the whole alphabet (§2B.13, `specs/009-full-alphabet-letters`) | Done. `verify` green, 490 tests, 30 files (baseline before the step: 458, 29). Live smoke not run |

**Evals, written before running** (`tests/integration/ai-round.test.ts`, fake AI):

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| A1 | Both players answer; the AI rejects an invented answer | That cell invalid with its reason; wrong-letter answers never sent; same term → 5/5; exactly one AI call | Pass |
| A2 | Finish races the deadline while the checker is pending | Phase `judging`; one AI call, one reveal, one result | Pass |
| A3 | Checker returns nothing / never answers | Local-rule result, `verified: false`; the 20 s room timeout fires | Pass |
| A4 | Hint asked, then round closes while another is pending | Clue only to the caller; no-known-term costs nothing; hinted cell marked at reveal; a hint racing the close is `ROUND_STALE` and not charged | Pass |
| A5 | Play vs AI | Scheduled from the human's ready alone; bot answers absent from every payload until reveal; bot keeps 5 with `random = 0`; judged in the same request | Pass |
| A6 | Bot's AI call fails | Bot plays blank, `botFailed: true`; the human's round scores normally | Pass |

A mutation check confirmed the evals can fail: making the bot keep all 8
answers failed A5, and charging an extra hint failed A4.

### 2B.7 Hosting for free

**Recommended: Render free web service**, one Node process, region Frankfurt.

- Supports WebSockets, so Socket.IO works with no change.
- 750 free instance hours per month, enough to run one service all month.
- After 15 minutes with no HTTP or WebSocket traffic it sleeps. The next visitor
  waits about a minute while it wakes. An active game is traffic, so a game in
  progress never sleeps it; sleeping only loses rooms nobody is using.
- No persistent disk on the free plan. That's fine now, because accounts and
  SQLite are removed (§2B.1) and rooms were always in memory.
- Settings: build `npm ci && npm run build`, start `npm start`, health check
  path `/healthz`, env `NODE_ENV=production`, `GEMINI_API_KEY` and
  `GROQ_API_KEY` (as secrets), plus the timing variables from `.env.example`.
  One instance.

**AI cost:** $0 — Gemini free tier from a Google project with no billing
account, and Groq's free plan, which needs no card.

**Not suitable:** Vercel and other request-only/serverless hosts (no
long-lived WebSockets — the reason the fork had to drop multiplayer); Fly.io
(no free tier for new accounts). Alternatives worth checking only if Render
doesn't work out: Koyeb (free tier terms have changed recently — confirm at
signup) and Oracle Cloud Always Free VM (always on, but needs a card and you
manage the server yourself).

### 2B.8 Hints

- Each player has **`HINTS_PER_ROUND` = 2** hints per round, at most one per
  category, and one pending at a time. Available in all three modes; the bot
  never uses them.
- Event `round:hint` `{ roundId, category, language }`. The server checks it
  like a draft (right round, answering phase, before `endsAt`, not finished),
  then asks the AI, then checks again — the round may have closed meanwhile.
- The AI picks a well-known term for the letter and category and returns a
  one- or two-sentence clue in the player's language. **The term never leaves
  the server.** A clue that contains the term, or any 4 consecutive letters of
  it, in Serbian or English, is discarded (fork rule, `hint-leak.ts`).
- **A credit is spent only when a clue is shown.** A failed or discarded hint,
  "no known term", or a hint that finishes after the round closed costs
  nothing.
- Hints do not change points. For fairness, a hinted category is marked for
  **both** players at reveal (`hinted: true`), even if left blank.
- Errors: `AI_UNAVAILABLE`, `AI_LIMIT` (daily quota or budget spent),
  `HINT_LIMIT`, `RATE_LIMITED` (the visitor's hourly hints, §2B.11).

### 2B.9 Two languages

- Header switch **Srpski / English**, remembered per browser (`localStorage`,
  fail-safe). The default is Serbian for South Slavic browser languages and
  English otherwise.
- Every string, category label and error message exists in both
  (`src/client/strings.ts`). The server keeps stable error codes; the client
  shows the text in the player's language.
- **Answers are accepted in Serbian or English in every game, whatever the
  interface language.** The two players may use different languages. The
  letter rule applies to the answer as written.
- Hints are written in the requesting player's language.

### 2B.10 Leaving the waiting screen

**Asked by the owner (2026-09-30):** a way out of the screen where you wait
for a friend.

**Decision: a labelled "Leave game" button (_Napusti partiju_), not a back
arrow.** "Back" suggests an undoable step to the previous screen. This action
is not undoable: it releases the room, so the code already sent to a friend
stops working. A named button says what happens. On a friend room a one-line
note under it says so; an AI room has no code, so no note.

- **Where it shows:** the waiting screen, in `waiting_for_player` and
  `synchronizing`, for all three modes. The random-person queue already had
  _Odustani od traženja_. It is not offered mid-round: a round in progress
  plays to its deadline (§13), and leaving then is closing the tab.
- **No new event.** The button uses the same path as _Nazad na početak_ on
  the results sheet (SC-8): the client remounts, which drops the socket, and
  the server's disconnect handler runs.
- **One server rule added to `markDisconnected`:** before a round is scheduled
  (`waiting_for_player` or `synchronizing`), a room with **no connected human
  left** is closed and removed at once. Without it, a host who left kept the
  room alive for `WAITING_ROOM_TTL_MS` (30 min), a friend could still join it
  and would wait forever on the synchronizing screen. A bot does not keep a
  room alive. When one of two humans leaves during `synchronizing`, the room
  stays: the other sees them go offline and can leave too.
- **Tests:** `tests/unit/room-store.test.ts` (lobby released, code
  `ROOM_NOT_FOUND`; synchronizing room kept while one human stays, released
  when both leave), `tests/integration/room-lifecycle.test.ts` (over the wire),
  `tests/integration/ai-round.test.ts` (AI room released), and render tests in
  `tests/unit/client-ai.test.ts`. With the server rule disabled, the four
  server tests fail.

### 2B.11 AI usage limit — accepted and built (2026-09-30)

**The gap.** Nothing bounds how much AI one visitor can spend. The event rate
limit (60 events per second, per socket) resets when the socket reconnects. A
script that loops _play AI → ready → disconnect_ spends one bot-answers call
and one checker call per loop. Nothing breaks when the quota runs out: every
game falls back to the letter rule, and hints and AI rooms say
`AI_LIMIT`/`AI_UNAVAILABLE`. But it takes the AI away from everyone for the
rest of the day.

**What one game costs, at most:**

| Mode | Checker | Bot sheet | Hints | Total |
| --- | ---: | ---: | ---: | ---: |
| Friend or random person | 1 | 0 | up to 4 (2 per player) | **5** |
| Against AI | 1 | 1 | up to 2 | **4** |

Retries inside the gateway can add attempts to the same call.

**What the free quota allows.** Groq's free plan: about 1,000 requests a day
and 30 a minute **per model**; the default chain has two Groq models, so about
2,000 a day (figures from the Week 4 session, not re-checked). Gemini's free
limits vary by model and were not measured, so the plan does not count on
them. Designing against Groq alone, about **400 worst-case games a day** fit.

**Decision (owner accepted the proposal as written, 2026-09-30): limit per
visitor first, since that needs no exact quota figure.**

1. **Per visitor (IP address), per hour:** at most **10 AI rooms** and
   **20 hints**. A real player cannot reach that; a script stops there. The
   server must read the client IP from the host's proxy header
   (`x-forwarded-for` on Render) and trust only the host's proxy.
2. **A global daily budget as a safety net:** after **1,500 AI calls** in a UTC
   day (75% of Groq's ~2,000), stop offering new AI rooms and hints, but
   **keep checking rounds already played**, since the checker is what makes
   scoring fair. Priority: checker > bot sheet > hints.
3. Both limits in `serverConfigSchema` with the defaults above, so they can be
   changed on the host without a code change. Rejections reuse existing codes
   (`RATE_LIMITED` for per-visitor, `AI_LIMIT` for the daily budget), so no new
   error code is needed.

**As built** (`src/server/usage-limits.ts`, wired in the room store):

- The per-visitor window is one hour from the visitor's first counted action.
  An AI room is charged when it is created; a hint is charged just before the
  AI is asked, so a hint refused by the round's own rules (`HINT_LIMIT`,
  `TOO_LATE`, …) costs nothing.
- Every AI call — checker, bot sheet, hint — counts toward the daily budget,
  which resets at UTC midnight. When it is spent, `room:play-ai` and
  `round:hint` answer `AI_LIMIT`; the checker is never refused, and a bot
  already seated still gets its sheet.
- The visitor is the socket's peer address, or, with `TRUST_PROXY_HOPS` = N,
  the Nth `x-forwarded-for` entry from the right. Entries further left are
  whatever the browser sent and are ignored. The default is 0 (header
  ignored), which is safe but wrong behind a proxy: every visitor would share
  the proxy's address and one limit. The server warns at startup in production
  when it is 0. **W4-9 must set it for Render and confirm it** from two
  different networks.
- Settings: `AI_ROOMS_PER_VISITOR_HOUR` (10), `HINTS_PER_VISITOR_HOUR` (20),
  `AI_DAILY_CALL_BUDGET` (1500), `TRUST_PROXY_HOPS` (0).
- Counts live in memory: a restart resets them, the same accepted limitation
  as rooms. Players behind one address (a household, a school network) share
  one per-visitor limit.
- Tests: `tests/unit/usage-limits.test.ts`,
  `tests/integration/ai-limits.test.ts` (a play-AI-then-disconnect loop stops
  at the limit; a forged `x-forwarded-for` buys nothing; hints refused before
  the AI are not charged; the checker still runs after the budget is spent).
  With the limits disabled, all the integration cases fail.
- The figures can be tuned after the first live week from the telemetry
  counts already logged.

### 2B.12 Spec Kit — added retroactively (2026-09-30)

**Asked by the owner:** add GitHub Spec Kit to the repository after the Week 3
and Week 4 builds. §2B.4 had recorded the fork's Spec Kit scaffolding as not
reused; this reverses that, as a development-tool decision only.

**What was added:** `specify init --here --integration claude --script sh`
(the `specify` CLI already installed on the owner's machine). It added
`.specify/` (templates, scripts, constitution), eleven `/speckit-*` skills in
`.claude/skills/`, and a marked block in `CLAUDE.md`, copied to `AGENTS.md`.
No npm package, no runtime code, no service; `package.json` is unchanged.

**How it fits, so there is one source of truth, not two:**

- `.specify/memory/constitution.md` points to `CLAUDE.md`, `.github/` and this
  file instead of restating them.
- This file stays the plan of record. A feature's `specs/NNN/plan.md` links the
  section here that it implements.
- `specs/001`–`specs/008` were **reconstructed after the features were built**,
  from this file, `docs/GAME_SPEC.md`, the tests and the git history. Each says
  so in its header and links its sources. They are not evidence that a spec
  was written first. Accounts were built and removed, so they have no spec.
- New features start at `009` and use the full specify → plan → tasks flow.
  One that adds anything this file does not list still needs the owner's
  decision recorded here first (rule 5).

### 2B.13 Letters from the whole alphabet — accepted (2026-09-30)

**Asked by the owner:** the round letter is no longer limited to
`A, B, D, K, M, S, V`. A Serbian game draws from the whole Serbian alphabet and
an English game from the whole English alphabet. The owner decided the open
questions the same day:

1. **Whose language.** The room's alphabet is the language of the player who
   opened it: the creator of a friend room, the player facing the AI, or, in a
   random match, the player who was already waiting in the queue. The client
   sends its interface language with `room:create`, `room:quick-play` and
   `room:play-ai`; the server fixes it on the room and it does not change
   afterwards. Answers are still accepted in Serbian or English (§2B.9).
2. **Serbian set: Latin script, 30 letters**, digraphs included:
   A B C Č Ć D Dž Đ E F G H I J K L Lj M N Nj O P R S Š T U V Z Ž.
   **English set: 26 letters**, A–Z.
3. **Digraphs are strict in Serbian rounds**, as in the paper game: with the
   Serbian alphabet, L does not accept a word starting with Lj, N does not
   accept Nj, and D does not accept Dž. English rounds have no such rule.

Diacritics are still respected (§5 rule 4, "Šabac does not start with S").
Some letters (Q, X, Đ, Dž, Nj …) leave several categories with few or no
terms; the owner accepted that. Tracked as Spec Kit feature
`specs/009-full-alphabet-letters`.

**As built:**

- `ALL_LETTERS`, `SERBIAN_LETTERS`, `ENGLISH_LETTERS` and `ALPHABETS` in
  `src/contracts/game.schemas.ts` replace `SUPPORTED_LETTERS`; `letterSchema`
  accepts the 34 letters of both.
- `room:create`, `room:quick-play` and `room:play-ai` require
  `language: "sr" | "en"`; a missing or unknown value is `INVALID_PAYLOAD`.
  `room:join` takes none. The room keeps `alphabet`; the selector draws from it.
- The letter rule (`startsWithLetter`) takes the alphabet, and every caller
  passes the room's: the local rule, the checker's recognised name, the bot
  sheet and the hint term. A hint in an English room may fit on its English
  name. `check-round.v3` is unchanged; the bot and hint prompts are now
  `bot-answers.v2` and `hint.v3`, told the alphabet.
- The letter is shown with its own case (`Lj`, not `LJ`).
- Not yet checked against the live AI: whether the models find terms for the
  new letters, and follow the digraph rule. `scripts/ai-smoke.ts` now asks for
  an English-room bot sheet on W, for the first live run (W4-7).
- Known effect: answers typed without diacritics fail the local rule on the
  new letters with them (Č, Ć, Đ, Dž, Š, Ž), as "Sabac" already failed on S.

## 2C. Week 5 bounded post-round coach — specification and implementation (2026-10-07)

**Owner request:** specify the proposed Zanimljiva Geografija post-round coach
using Spec Kit, meet the complete W05 assignment/addendum and retain all
required artifacts. Work on a local branch from Anja's main, commit at the
agreed final milestone, and do not push. The initial specification pass was
documentation only; the user later explicitly authorized implementation of
the approved detailed design after root consistency review.

**Status (2026-10-07):** implementation and automated verification complete.
Final `npm.cmd run verify` passed 555 tests across 40 files, typecheck, lint,
and client/server builds. Live-provider demo, interactive browser review and
human pair gates remain open; see `docs/EVIDENCE_W05.md`.
**Feature:** `specs/010-post-round-coach/spec.md`.
**Branch/base:** `010-post-round-coach`, created after fetching `origin/main`
at `4dea3b59e35c5dc89a09776cea43bb5e8487ad5e`; no upstream, push or deployment.

The goal is **Review this completed round and recommend up to two things to
practice**. Only the requesting human's completed results are used. The
model proposes `analyze_round`, a checked read-only local operation; its
evidence returns to a second model decision. The backend checks evidence
references and eligible advice; approved SR/EN wording renders the review.
There are no generated replacement geography answers or agent game writes.

Proposed scope expansion is limited to the coach feature, one new
`round:coach` request/terminal ack, bounded own-result/run metadata and a
separate visitor allowance. No new dependency, database, service or deployment.
Existing W04 score/checker/hint/alphabet/reveal behavior remains the baseline.
`docs/GAME_SPEC.md` contains a clearly labeled W05 amendment describing the
read-only results review and its limits.

Limits: two model decisions, one tool, three actual provider attempts,
one recovery and one configured-model/provider fallback for the whole run;
30-second total deadline, eight-second attempt cap and 250 ms tool cap.
One admitted run per human/round, five admitted runs per visitor/hour,
terminal/in-flight duplicate reuse. Each coach attempt checks/consumes the
shared daily allowance. Existing W04 logical-call accounting and checker
priority remain unchanged; their mixed-unit limitation is documented.

The source inspection identified three integration decisions: capture exact
canonical completed results rather than rejudge locked answers; enforce
W05 shared guards before actual gateway attempts rather than around two
unbounded interactions; avoid unrestricted prose that cannot be validated
against evidence. Consumers, before/after cases and tradeoffs are in
`specs/010-post-round-coach/impact-analysis.md`.

Required artifact entry points: `docs/AGENT_FEATURE_SPEC.md`,
`docs/AGENT_FLOW.md`, `docs/TOOL_CONTRACTS.md`, `docs/AGENT_EVALS.md`,
`docs/EVIDENCE_W05.md` and the existing `docs/AI_USAGE_LOG.md`.
All assignment sections/Core items are mapped in
`specs/010-post-round-coach/checklists/assignment-coverage.md`.
Automated evidence is recorded in `docs/EVIDENCE_W05.md`; live-provider,
interactive browser and human pair contribution evidence remain pending.

Approval record: the user authorized the approved spec package and its exact
design for implementation; root consistency review passed before code. No
separate owner review of the generated plan is claimed. Any behavior outside
the approved spec/data model/contracts requires owner clarification. W04 live
evaluation in §2B.6 remains pending. No production deployment is needed for
W05. Only existing bounded fallback reuse and grounded quality eval are in
scope.

Implemented: strict contracts, source snapshot, deterministic tool,
two-step engine, physical-attempt guard, limits, telemetry, service/store/socket
wiring, reducer-backed client flow, bilingual evidence rendering, fake-e2e and
 opt-in live smoke scripts. See the actual test output and remaining gates in
`docs/EVIDENCE_W05.md`; do not treat this worktree as final until those gates
are honestly resolved.

## 2A. Execution contract for the implementation model

This plan intentionally locks the Core decisions. An implementation model must not invent alternatives, add optional features, or pause for product choices already resolved here.

Required execution order:

1. Read `Plan.md`, `.github/00-index.instructions.md`, `.github/copilot-instructions.md`, and instruction modules 10-13 (10 is the step-by-step driver; 11 fixes the stack; 12 holds the schemas and error codes; 13 holds the test patterns). Open modules 01-09 only when the routing matrix in the index sends you there.
2. Create the required Week 3 documents from the locked decisions in this plan.
3. Before application code, write `docs/BUILD_PROMPT_V1.md` and pre-register E1-E4 in `docs/EVALS.md`.
4. Scaffold exactly the stack and commands in Sections 9 and 19A.
5. Implement the phases in Section 17 in order. Do not start styling before the two-client synchronization slice works.
6. Preserve the first runnable integrated version as the baseline before hardening it.
7. Stop after the Definition of Done passes. Do not implement any item marked **Stretch - do not implement for Core**.

If a technical detail is not defined, choose the smallest solution consistent with server authority, privacy, deterministic tests, and the single-service architecture. Record the assumption in `docs/EVIDENCE_003.md`; do not add infrastructure.

## 3. Product goal

Create a browser game in which Player 1 creates a temporary room and Player 2 joins it from another computer. When Player 2 has joined and both game screens have automatically acknowledged that they are loaded, the server chooses one random supported letter and schedules one future start and deadline for both players. Each player privately fills the same categories. Answers are revealed only after both players click **Finished** or the authoritative server deadline expires, then the server applies traditional scoring.

The Week 3 version proves one stable online round. It is not a general gaming platform.

## 4. Locked MVP scope

### Included

- Exactly two players per room
- Player 1 enters a name, creates a room, and receives a short room code
- Player 2 enters a name and joins using that code
- Automatic two-client synchronization after both game screens load
- Server-selected random letter from exactly `A, B, D, K, M, S, V` _(superseded by §2B.13: the whole Serbian or English alphabet, by the opener's language)_
- Shared three-second countdown, `startsAt`, and `endsAt`
- Exactly 150 seconds of answer time
- Eight categories: Država, Grad, Reka, Planina, More, Životinja, Biljka, Predmet
- Same categories and duration for both players
- Private answer entry and private server draft saving
- **Finished** action that atomically saves and locks a player's answers
- Automatic finish when the server deadline expires
- Reveal only after both finish or time expires
- Traditional per-category scoring and total score
- Results and winner/draw shown to both players
- Runtime validation of configuration and every client-to-server event
- Deterministic domain and server integration tests
- One WebSocket-capable production deployment

### Explicitly out of scope

The first and third lines below were the Core position and are **superseded by
the product-owner expansion in §2**, which adds email accounts, profiles and
saved history. They are kept, struck through, so the original Core boundary
stays auditable rather than being quietly rewritten.

- Accounts, passwords, profiles, or social login — briefly in scope per §2
  (2026-09-22), **out again per §2B (2026-09-30)**.
- More than two players, spectators, ~~public matchmaking~~, or public room lists —
  a first-come random-person queue is in scope per §2 and §2B (no ratings, no
  public room list)
- Database, permanent history, or persistent leaderboard — the SQLite store is
  removed with accounts per §2B.
- Chat, voice, reactions, invitations beyond sharing the room code
- Multiple backend instances or horizontal scaling
- ~~Semantic verification that an entry is a real country, city, river, mountain, plant, or animal~~ — done by the AI checker per §2B.2
- Curated answer dictionary or live geography lookup
- Live web lookup or external geography API
- Perfect anti-cheat protection
- Tournament mode or category editor
- Native mobile application
- ~~AI hints~~ — in scope per §2B.8, as are AI answer judging and an AI opponent
- Cyrillic input and Cyrillic/Latin equivalence
- Custom music or copied branding/assets

### Stretch - do not implement for Core

- Play Again or multiple rounds in one room
- Refresh/reconnect/resume support
- Manual review of semantic correctness (AI review moved into scope, §2B.2)
- Curated answer dictionary
- Animations and extra visual polish

### Locked constants

| Setting | Core value |
| --- | --- |
| Categories | `country`, `city`, `river`, `mountain`, `sea`, `animal`, `plant`, `thing` |
| Serbian labels | Država, Grad, Reka, Planina, More, Životinja, Biljka, Predmet |
| Supported letters | `A`, `B`, `D`, `K`, `M`, `S`, `V` — _superseded by §2B.13: 30 Serbian Latin letters or 26 English letters_ |
| Countdown | 3,000 ms |
| Answer time | 150,000 ms |
| Display-name length | 1-24 characters after trimming |
| Answer length | 0-40 characters before normalization |
| Room code | 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` |
| Draft debounce | 300 ms, plus immediate send on blur and Finish |
| Room storage | In memory, one Node process |
| Completed-room retention | 5 minutes, then delete |
| Inactive waiting-room TTL | 30 minutes |

## 5. Fair synchronized start

The server must not choose or reveal the letter while Player 1 is alone. Otherwise Player 1 gets extra thinking time.

```text
Player 1 creates room
  -> Player 2 joins
  -> each loaded game screen automatically sends room:client-ready
  -> server receives acknowledgements from both current players
  -> server selects one letter from the room's alphabet (§2B.13: the opener's language)
  -> server creates one roundId
  -> startsAt = serverNow + 3 seconds
  -> endsAt = startsAt + configured duration
  -> server sends the same roundId, letter, categories, startsAt, and endsAt to both
  -> both clients unlock the form at startsAt
```

The browser displays a countdown, but only the server decides whether input is early, on time, or late.

## 6. Game rules

1. Both players receive the same letter, categories, start time, and deadline.
2. A player may enter at most one answer per category.
3. Answers remain hidden from the opponent while the round is active.
4. Clicking **Finished** permanently locks that player's round answers.
5. One finished player sees only a waiting state and the opponent's completion status.
6. The round closes when both players finish or the server deadline is reached.
7. Reveal and scoring happen exactly once.
8. Answer validity is decided before the two answers are compared.
9. The server calculates validity and points; the client only renders results.

### Traditional scoring

| Player 1 | Player 2 | P1 points | P2 points | Reason |
| --- | --- | ---: | ---: | --- |
| Valid answer A | Valid answer B, different after normalization | 10 | 10 | `both_different` |
| Valid answer A | Same valid normalized answer A | 5 | 5 | `same_answer` |
| Valid answer | Blank or invalid | 10 | 0 | `only_player_1` |
| Blank or invalid | Valid answer | 0 | 10 | `only_player_2` |
| Blank or invalid | Blank or invalid | 0 | 0 | `neither` |

Normalization precedes comparison. The baseline policy is Unicode normalization, trim, collapse repeated internal whitespace, and lowercase according to a documented Serbian Latin policy. The original answer is retained for post-reveal display.

## 7. Answer normalization and validity policy

The Core game uses an explicit honor-system rule. It does **not** decide whether an entry is geographically or semantically true.

An answer is valid when all of these are true:

1. The raw value is a string no longer than 40 characters.
2. After normalization it is at least two characters long. A single character
   is the round letter typed back, not an answer.
3. The normalized answer begins with the selected single-letter round letter, compared case-insensitively.
   _Since §2B.13 the letter may be a digraph (Lj, Nj, Dž), and in a Serbian room
   L, N and D do not take a word starting with Lj, Nj or Dž. The rule takes the
   room's alphabet; the body below is the Week 3 original, and the current one
   is `startsWithLetter` in `src/domain/validate-answer.ts`._

Use this exact normalization function:

```ts
function normalizeAnswer(raw: string): string {
  return raw
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("sr-Latn");
}
```

Use this exact validity rule:

```ts
function isValidAnswer(raw: string, letter: string): boolean {
  const normalized = normalizeAnswer(raw);
  const normalizedLetter = normalizeAnswer(letter);
  return normalized.length >= MIN_ANSWER_LENGTH && normalized.startsWith(normalizedLetter);
}
```

Then compare only valid normalized answers:

```text
normalize both answers
  -> calculate valid/invalid for each
  -> if both valid, compare normalized strings
  -> assign the traditional score
```

Examples for letter `S`:

- `" Srbija "` is valid and normalizes to `"srbija"`.
- `"SRBIJA"` is valid and compares equal to `" Srbija "`.
- `"Slovenija"` and `"Srbija"` are both valid and different, so they score 10/10.
- `"Beograd"` is invalid because it does not start with `S`.
- `"   "` is invalid.
- `"S"` is invalid: one character is the round letter typed back, not an answer.

The results screen must show: **Answers are checked only for the selected starting letter in this Week 3 version. Players are responsible for semantic correctness.** Semantic dictionaries and answer disputes are Stretch, not Core.

> **Week 4 (§2B.2):** the rule above becomes step 1 of validity. Step 2 is the
> AI verdict. The notice above is shown only when the AI check was unavailable
> for that round.

## 8. Room state machine

```text
WAITING_FOR_PLAYER
        |
        | Player 2 joins
        v
SYNCHRONIZING
        |
        | both clients acknowledge loaded game screen
        v
COUNTDOWN
        |
        | startsAt reached
        v
ANSWERING
   /                 \
both finish       server deadline
   \                 /
        v
JUDGING            (Week 4, §2B.2: AI check, max 20 s, then local-rule fallback)
        |
        v
RESULTS
        |
        | room cleanup after five minutes
        v
CLOSED
```

`connected`, `clientReady`, `finished`, and `draftRevision` are per-player properties, not room phases.

Before a round is scheduled, a room whose last connected human leaves goes
straight to `CLOSED` and is removed; its code stops working at once (§2B.10).

### Critical invariants

- A room has no more than two assigned player identities.
- Only the server chooses the letter, round ID, timestamps, phase, validity, and scores.
- Both clients receive identical public round metadata.
- A player never receives the opponent's draft before `RESULTS`.
- A locked player cannot update answers.
- A draft at or after `endsAt` is rejected even if the browser still shows time.
- `closeRound(roundId, reason)` is idempotent.
- Results derive only from locked server state.
- A failed validation leaves canonical state unchanged.
- There is exactly one round per room in Core.

## 9. Architecture

Use one TypeScript repository and one deployed Node.js process:

```text
Computer 1 ---- Socket.IO ----\
                              Node HTTP + Socket.IO service
Computer 2 ---- Socket.IO ----/              |
                                             +-- serves built React/Vite SPA
                                             +-- stores temporary rooms in memory
```

This same-origin topology removes unnecessary CORS and multi-service deployment complexity.

### Planned repository structure

```text
/
├── Plan.md
├── README.md
├── package.json
├── .env.example
├── .github/
│   ├── 00-index.instructions.md
│   ├── copilot-instructions.md
│   └── instructions/
├── docs/
│   ├── GAME_SPEC.md
│   ├── BUILD_PROMPT_V1.md
│   ├── CONTEXT_MANIFEST.md
│   ├── EVALS.md
│   ├── AI_EVALS.md          (Week 4: live AI checks)
│   ├── EVIDENCE_003.md
│   ├── EVIDENCE_004.md      (Week 4 evidence)
│   ├── PRODUCT_REVIEW.md
│   └── AI_USAGE_LOG.md
├── scripts/
│   └── ai-smoke.ts          (Week 4: opt-in live AI check)
├── src/
│   ├── client/
│   │   ├── components/
│   │   ├── screens/
│   │   ├── socket/
│   │   └── state/
│   ├── server/
│   │   ├── ai/              (Week 4: gateway, Gemini/Groq adapters, service.ts)
│   │   ├── features/        (Week 4: check-round, bot-answers, hint)
│   │   ├── prompts/         (Week 4: versioned prompts)
│   │   ├── rooms/
│   │   ├── socket/
│   │   ├── usage-limits.ts  (Week 4: AI usage limits, §2B.11)
│   │   └── index.ts
│   ├── domain/
│   │   ├── normalize-answer.ts
│   │   ├── validate-answer.ts
│   │   ├── score-category.ts
│   │   └── fold-letters.ts, resemblance.ts, hint-leak.ts   (Week 4)
│   └── contracts/
│       ├── game.schemas.ts
│       ├── errors.ts
│       ├── socket.schemas.ts
│       └── ai-output.schemas.ts   (Week 4)
└── tests/
    ├── unit/
    ├── integration/
    ├── helpers/
    └── fakes/               (Week 4: fake AI and adapters)
```

### Layer ownership

- `src/domain`: pure normalization, validation decisions, category scoring, and totals; no network, clock, filesystem, React, or Socket.IO.
- `src/contracts`: strict shared runtime schemas and inferred TypeScript types.
- `src/server`: room membership, identity, synchronization, timestamps, letter selection, private drafts, locks, reveal, scoring, cleanup, health, and static serving.
- `src/client`: screens, local form values, draft acknowledgements, countdown presentation, connection status, and results display.

## 10. Core runtime contracts

Final definitions must be runtime schemas, not TypeScript-only declarations.

```ts
type Category =
  | "country"
  | "city"
  | "river"
  | "mountain"
  | "plant"
  | "animal";

type RoomPhase =
  | "waiting_for_player"
  | "synchronizing"
  | "countdown"
  | "answering"
  | "judging" // Week 4, §2B.2
  | "results"
  | "closed";

// There is no "revealed" or "review" phase. Reveal is an event emitted during
// the transition into "results". Review is Stretch and has no Core phase.

type RoomConfig = {
  roundDurationMs: number;
  countdownMs: number;
  categories: Category[];
  supportedLetters: string[]; // superseded by §2B.13: `ALPHABETS[room.alphabet]`
  maxAnswerLength: number;
};

type PublicRound = {
  roundId: string;
  letter: string;
  categories: Category[];
  serverNow: number;
  startsAt: number;
  endsAt: number;
};

type DraftUpdate = {
  roundId: string;
  category: Category;
  value: string;
  revision: number;
};

type CategoryScore = {
  player1Points: 0 | 5 | 10;
  player2Points: 0 | 5 | 10;
  reason:
    | "both_different"
    | "same_answer"
    | "only_player_1"
    | "only_player_2"
    | "neither";
};
```

Validate at least `RoomConfig`, create/join requests, `room:client-ready`, drafts, finish events, public projections, reveals, and results. Unknown/extra authority fields are rejected.

## 11. Real-time event protocol

### Client to server

| Event | Payload | Server responsibility |
| --- | --- | --- |
| `room:create` | display name, language (§2B.13) | Create room; fix the room's alphabet from the language; bind Player 1; ack the room code and the caller-private resume token |
| `room:join` | room code, display name | Bind Player 2 only when one slot is available |
| `room:client-ready` | current room acknowledgement | Start scheduling only after both current clients acknowledge |
| `round:draft` | round ID, category, value, revision | Validate and privately save latest accepted revision |
| `round:finish` | round ID | Lock caller; close early only when both are locked |
| `room:quick-play` / `room:cancel-quick-play` | display name, language / empty | Random-person queue (§2); the waiting player's language becomes the room's alphabet (§2B.13) |
| `room:play-ai` | display name, language | Week 4 (§2B.3): create room, seat caller and the server bot in one step; the caller's language is the room's alphabet (§2B.13) |
| `round:hint` | round ID, category, language | Week 4 (§2B.8): caller-only clue; the term never leaves the server |

`answer:review` and `round:play-again` are Stretch. Do not implement, emit, or
declare them in Core schemas. Adding them is a scope change, not a refactor.

### Server to client

| Event | Visible content | Privacy rule |
| --- | --- | --- |
| `room:created` | room code, caller's private resume token | Never broadcast token |
| `room:state` | public names and connected/client-ready/finished status | No opponent drafts |
| `round:scheduled` | same letter, categories, server time, start, deadline | Identical public metadata for both |
| `round:draft-ack` | category and accepted revision | Only to submitting player |
| `round:player-finished` | public completion status | No answers |
| `round:revealed` | both locked answer sets and validity states | Only after canonical close |
| `round:results` | category scores, reasons, totals, winner/draw | Server-calculated only |
| `game:error` | stable code and safe message | No stack, token, or hidden data |

Core payloads carry no client-generated `requestId`: the Socket.IO acknowledgement already correlates a request with its response, and the client schemas are strict, so an extra key is rejected. A server-generated request id may still appear in server logs.

Use a typed acknowledgement envelope:

```ts
type Ack<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
```

## 12. Timer, drafts, and race handling

The round cannot depend on each browser submitting at the final millisecond. The client therefore sends debounced private drafts, and sends immediately on field blur and Finish. The server retains the latest accepted revision.

The server sends `serverNow`; each browser estimates an offset and displays:

```ts
remainingMs = Math.max(0, endsAt - estimatedServerNow);
```

This is presentation only. Before any draft or Finish mutation, the server calls an expiration check.

Both end conditions invoke one operation:

```text
closeRound(roundId, reason: "both_finished" | "deadline")
  1. Return without mutation unless this is the current open round.
  2. Mark it closed before other work.
  3. Cancel its deadline timer.
  4. Lock both latest accepted drafts.
  5. Normalize and validate answers.
  6. Emit one reveal.
  7. Resolve unknowns if enabled.
  8. Calculate and emit one result.
```

This finish/deadline race is a mandatory integration test.

## 13. Failure behavior

| Failure | Required behavior |
| --- | --- |
| Invalid or expired room code | Stay on join screen; show safe message |
| Third player attempts to join | Reject; do not change either existing player |
| Malformed payload | Reject with structured error; no partial mutation |
| Wrong room or stale round | Reject; retain current canonical state |
| Draft before start or at/after deadline | Reject with safe timing code |
| Draft after player finished | Reject; preserve locked version |
| Duplicate Finish | Return current lock state; never double-score |
| Finish races deadline | Close, reveal, and score exactly once |
| One player disconnects | Timer continues; retain accepted drafts; show connection status |
| Last human leaves before the round (Leave game, or tab closed) | Room closed and removed at once; its code answers `ROOM_NOT_FOUND` (§2B.10) |
| Server restarts | In-memory room is lost; show session-ended/rejoin message |

Full reconnect recovery is optional. Restart durability is explicitly out of scope.

## 14. Week 3 required artifacts

### `docs/GAME_SPEC.md`

Must contain:

- Project name
- Three-to-five-sentence description
- Player objective and controls
- Core loop and round-completion condition
- Five-to-eight key rules
- Minimum visual requirement
- Explicit exclusions
- Verifiable Definition of Done
- Recorded instructor approval for the unusual non-arcade game domain
- Justification that deployment and the minimal real-time backend are necessary for two-computer play, not decorative complexity

Freeze it before the first major implementation prompt.

### `docs/BUILD_PROMPT_V1.md`

Must define the coding-agent role, goal, expected output, forbidden scope, technical context, relevant files, gameplay rules, Definition of Done, allowed edit areas, and checks. It must begin by requiring the agent to:

1. Summarize its understanding.
2. Give a short plan.
3. State ambiguities and assumptions.
4. Avoid expanding scope without explicit reason/approval.

### `docs/CONTEXT_MANIFEST.md`

For each source record: included/excluded, why, priority, and risk. It must make these roles explicit:

- Agreed user requirements and `GAME_SPEC.md`: authoritative behavior
- Week 3 PDF: submission/evidence criteria
- Generic README/instruction pack: structural reference only
- Old chats/random web examples: excluded unless intentionally approved

### Preserved baseline

Before the selected controlled fix, preserve:

- First build prompt and exact context
- Recoverable code state or commit/tag
- Screenshot or recording
- Run/test command and actual output
- First genuine visible problem
- Initial test/eval results

Do not manufacture a defect or overwrite the baseline with the fixed code.

### Structured runtime contract

Show an expected shape, valid example, invalid example, runtime validation, and defined invalid-input behavior. `RoomConfig`, `JoinRoomRequest`, or `DraftUpdate` are good choices. A TypeScript type alone does not qualify.

### `docs/EVALS.md`

Write expectations before execution, then repeat identical cases after one controlled change:

| ID | Scenario | Expected result |
| --- | --- | --- |
| E1 | Player 2 joins and both screens synchronize | Both receive identical `roundId`, letter, `startsAt`, and `endsAt` |
| E2 | Both Finish events occur close to deadline | Close, reveal, and scoring happen exactly once |
| E3 | Third player or malformed/stale draft | Rejected; canonical room state is unchanged |
| E4 | First genuine baseline defect | The observed defect no longer reproduces after the focused fix |

Additionally test every traditional scoring row and the hidden-answer invariant.

### One hypothesis and one controlled change

Record: claim, signal, hypothesis, smallest change, verification, result, and limitation. Change one explanatory variable at a time; do not change the prompt, context, schema, implementation, and criteria simultaneously.

### `docs/EVIDENCE_003.md`

Include baseline claim, selected problem, hypothesis, controlled change, same evals before/after, actual commands/results, known limitation, and both developers' contributions.

### `docs/AI_USAGE_LOG.md`

For each meaningful AI call record phase, reason, expected result, actual result, and next decision. Do not record private chain-of-thought, secrets, tokens, private URLs, or sensitive payloads.

Session 004 artifacts such as `TOOL_CONTRACT.md`, AI hints, tool allowlists, fake providers, and `EVIDENCE_004.md` are intentionally deferred. _Update 2026-09-30:_ Week 4 brought AI hints, fake providers and `docs/EVIDENCE_004.md` into scope (§2B); `TOOL_CONTRACT.md` and tool allowlists are still not used, because the AI here calls no tools.

### Week 3 AI and pair-work guardrails

- Target no more than 10-15 meaningful coding-agent iterations across the full two-week project unless the instructor changes the limit.
- Do not use parallel AI coding agents for the Core implementation. Parallel human ownership is allowed, but contract design, integration, evals, and review follow the documented driver/observer rotation.
- Before a significant AI call, state what should change and which observable signal will prove it.
- Log the planning and implementation calls that materially affect decisions; do not log private chain-of-thought.
- If the same blocker lasts about 20 minutes, stop widening scope and record the goal, expected behavior, actual behavior, commands/files checked, evidence, and precise question.

## 15. Week 3 acceptance checklist

- [ ] Scope and Definition of Done are clear and small.
- [ ] Instructor approval for this game domain is recorded.
- [ ] Build prompt exists before the first major implementation call.
- [ ] Context Manifest lists included and intentionally excluded context.
- [ ] Baseline is preserved separately from the fixed version.
- [ ] At least one meaningful object has runtime validation.
- [ ] Four or more eval expectations are written before running them.
- [ ] The same evals are repeated after one controlled change.
- [ ] At least one eval captures a genuine baseline problem.
- [ ] The change has a hypothesis, measurable signal, result, and limitation.
- [ ] Both clients receive the same letter and authoritative timestamps.
- [ ] Opponent drafts remain absent before canonical reveal.
- [ ] Both-finish and deadline paths reveal exactly once.
- [ ] Traditional 10/10, 5/5, 10/0, and 0/0 scoring passes.
- [ ] Invalid input leaves canonical state unchanged.
- [ ] Evidence includes real commands, output, screenshots, and both contributions.
- [ ] AI Usage Log explains major calls and resulting decisions.
- [ ] AI usage stays within the documented budget and Core implementation did not use parallel coding agents.
- [ ] No credentials, tokens, private URLs, hidden answers, or sensitive environment data appear in source or evidence.

## 16. Equal two-developer split

Primary ownership enables speed, but contracts, integration, evals, deployment verification, and evidence remain shared. For every joint block, one developer drives while the other checks expectations, diff, and result; swap halfway through.

### Developer A - server and synchronization

- Room creation/join and two-player cap
- Socket-to-player identity and private resume token
- Automatic client-ready handshake
- Server clock, shared scheduling, and letter selection
- Private drafts, revisions, locks, and idempotent closing
- Server integration tests
- Production server, static serving, and health route

### Developer B - client and domain

- Lobby, join, synchronization, countdown, answer, waiting, reveal, and result screens
- Client socket adapter, draft debounce, save indicator, and clock offset
- Pure normalization, validity, scoring, and totals
- Small typed answer bank
- Domain/schema tests and client behavior tests
- Responsive, accessible presentation and safe errors

### Shared work

- Approve `GAME_SPEC.md` and event/runtime contracts
- Review each other's first implementation block
- Integrate locally on two isolated browser sessions
- Execute E1-E4 together and capture evidence
- Test on two physical computers using the deployed URL
- Complete documentation and rehearse the demo

Equal contribution is measured through code, tests, documentation, review, and evidence—not identical commit counts.

## 17. One-day implementation schedule

### Block 0 - 45 minutes: lock scope and evidence setup (paired)

- Obtain/record instructor approval.
- Agree on title, the category set, 6-8 letters, duration, and unknown-answer policy.
- Create/freeze `GAME_SPEC.md`.
- Create `BUILD_PROMPT_V1.md`, `CONTEXT_MANIFEST.md`, `EVALS.md`, and initial `AI_USAGE_LOG.md`.
- Agree on schemas, event names, and Definition of Done.
- Confirm the deployment target supports persistent WebSockets.

Exit: both developers can explain the same state machine and scope.

### Block 1 - 45 minutes: contracts first (paired)

- Scaffold TypeScript, React/Vite, Node/Socket.IO, Zod, and Vitest.
- Implement shared runtime schemas and acknowledgement envelope.
- Implement pure normalization/scoring tests before UI polish.
- Establish fake clock and fixed letter selector test helpers.

Exit: schemas parse valid examples and reject invalid ones at runtime.

### Block 2 - 2 hours: thin vertical slice (parallel ownership)

Developer A:

- Create/join and two-player limit
- Automatic synchronization
- Shared scheduled round
- Safe player-specific room projections

Developer B:

- Lobby/join/synchronization/countdown/form/result shell
- Socket adapter
- Pure normalization, validation, and scoring
- Unit tests and sample answer data

Exit: two local browser windows enter one room and receive one identical scheduled round.

### Block 3 - 1 hour: drafts, finish, timeout, reveal (paired)

- Connect private debounced drafts and acknowledgements.
- Lock on Finish.
- Implement one idempotent deadline/both-finished close path.
- Show waiting, reveal, and result screens.
- Prove opponent drafts do not appear early.

Exit: both-finish and timeout flows work locally.

### Block 4 - 30 minutes: preserve baseline

- Run pre-written evals unchanged.
- Save prompt, context, code state, commands, output, screenshots, and first genuine defect.
- Select one failure for the controlled-change exercise.

Exit: the baseline is recoverable rather than described from memory.

### Block 5 - 1 hour: one controlled change and cross-review

- Write claim, signal, hypothesis, smallest change, and verification first.
- Developer A reviews client/domain; Developer B reviews server/state.
- Swap driver/observer halfway.
- Make the smallest targeted change.
- Repeat the same evals and record actual results.

Exit: the target signal improves without changing the success criteria.

### Block 6 - 1 hour: hardening and full verification

- Complete safe invalid-room, full-room, malformed, stale, late, duplicate-finish, and disconnect behavior.
- Run unit/integration tests, typecheck, lint, and production build.
- Inspect diffs and scan for secrets or hidden-answer logging.

Exit: all required checks pass or a precise blocker is documented.

### Block 7 - 1 hour: deploy and test two computers

- Deploy the single Node service.
- Verify `/healthz`, static assets, and production WebSocket upgrade.
- Complete a full round from two physical computers.
- Verify one letter/timer, private drafts, both-finish, timeout, reveal, and scoring.

Exit: a fresh production room works end to end.

### Block 8 - 45 minutes: evidence and demo

- Finish `EVIDENCE_003.md` and `AI_USAGE_LOG.md`.
- Record both contributions and known limitations.
- Rehearse the game, scope, baseline, controlled change, runtime validation, evals, and deployment.
- Freeze features; accept only release-blocking fixes.

## 18. Test plan

### Domain tests

- Unicode/case/spacing normalization behaves as documented.
- Different valid answers score 10/10.
- Equal normalized valid answers score 5/5.
- Only one valid answer scores 10/0.
- Neither valid scores 0/0.
- Wrong-letter and over-length answers are invalid.

### Contract tests

- Valid room configuration, create, join, client-ready, draft, finish, reveal, and result payloads parse.
- Unknown category, invalid revision, over-length answer, malformed code, missing round ID, and extra authority fields are rejected.
- Invalid startup configuration fails clearly or uses a specifically documented safe fallback.

### Server integration tests

- Exactly two players can join; a third cannot.
- Both loaded clients receive identical scheduled metadata.
- One socket cannot act as the other player.
- Opponent draft data is absent from every pre-reveal event.
- Latest accepted draft revision wins; stale revision is ignored/rejected.
- Finished answers cannot be edited.
- Both finished closes early.
- Deadline closes when one/neither finished.
- Deadline/Finish race closes and scores once.
- Duplicate Finish does not duplicate reveal or points.
- Early, late, malformed, stale-round, and cross-room events do not mutate state.

### Manual checks

- Use two isolated browser profiles during local development.
- Use two physical computers for production acceptance.
- Verify the exact disconnect/reload limitation.
- Check standard desktop and narrow laptop widths.
- Ensure waiting and error states are understandable without developer tools.

## 19. Deployment plan

1. Build the React client into static assets.
2. Compile the TypeScript server.
3. Attach Socket.IO and `/healthz` to one HTTP server.
4. Serve the SPA and its route fallback from that server.
5. Bind to the host-provided `PORT` and public interface.
6. Run exactly one process/replica because rooms are in memory.
7. Configure secrets/settings only in the host or ignored local environment.
8. Verify HTTPS/WSS, health, page refresh, and a two-computer round.

Do not choose a request-only serverless runtime for the active room server. Server restarts losing rooms and lack of horizontal scaling are accepted, documented MVP limitations.

Week 4 target host and AI provider, both free: see §2B.7.

## 20. Risk register and cuts

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Letter reaches one player early | Unfair round | Future shared `startsAt` after both automatic acknowledgements |
| Device clocks differ | Countdown mismatch | `serverNow` offset plus server-only deadline enforcement |
| Finish races deadline | Duplicate result | One idempotent close operation and race integration test |
| Opponent answer leaks | Failed core requirement | Recipient-specific projections and absence assertions |
| Final typed characters are lost | Wrong results | Debounced private drafts plus immediate blur/Finish save |
| Legitimate answer missing | Dispute | Small declared dataset and optional host review |
| Deployment lacks WebSocket | No remote game | Deploy a minimal connection spike early |
| Server restart destroys room | Interrupted session | Document limitation; no database for Week 3 |
| Multiplayer conflicts with brief guidance | Scope concern | Record instructor approval and minimum-infrastructure justification |
| Evidence done from memory | Week 3 failure | Capture artifacts during each block |

If behind, cut in this order:

1. Animations and decorative polish
2. Play Again
3. Sophisticated reconnect
4. Manual unknown-answer review
5. Larger answer bank

Do not cut synchronized time, private answers, two-computer rooms, server scoring, runtime validation, baseline/evals, deployment verification, or evidence.

## 21. Definition of Done

The Week 3 build is done only when:

- Two players on two separate computers can create/join one room.
- Neither sees the letter before the common scheduled countdown.
- Both receive the same round ID, letter, categories, start, and deadline.
- Both can type privately for the same server-controlled duration.
- Finish locks that player's answers.
- Both-finished and timeout paths reveal exactly once.
- Traditional 10/10, 5/5, 10/0, and 0/0 cases pass.
- Server validation controls identity, time, phase, reveal, validity, and score.
- At least one meaningful contract shows valid/invalid runtime behavior.
- Required tests, typecheck, lint, and production build pass.
- The deployed game completes a two-computer smoke test.
- Week 3 documents, recoverable baseline, one controlled change, repeated evals, real outputs, contributions, and AI usage are recorded.
- Known limitations and excluded features are explicit.
- No secret, private token, or opponent draft is exposed in source, logs, client projections, prompts, screenshots, or evidence.

The Week 4 revision (§2B) is done only when, in addition:

- A1–A6 pass with the fake AI, and the live smoke check has been run against
  Gemini and Groq with the agreement recorded in `docs/AI_EVALS.md`.
- Every AI failure (no key, timeout, quota, bad reply) ends in a scored round,
  marked unverified, never a stuck one.
- An opponent's answers reach the AI only after both sheets lock, and reach
  the other player only in `round:revealed`; the AI key is never in the
  browser, a log or the repository.
- The deployed game plays one round in each mode, with `verified: true` on at
  least one.
- `docs/EVIDENCE_004.md` records the before/after runs and the open findings.

## 22. Immediate next steps

1. Obtain and record instructor approval for the game and its minimum real-time backend.
2. Confirm the title, the category set, 6-8 supported letters, round duration, and unknown-answer policy.
3. Create and approve `docs/GAME_SPEC.md` before application implementation.
4. Create `docs/BUILD_PROMPT_V1.md`, `docs/CONTEXT_MANIFEST.md`, `docs/EVALS.md`, and `docs/AI_USAGE_LOG.md`.
5. Choose a WebSocket-capable deployment target and prove a minimal deployed connection.
6. Implement shared runtime schemas and pure scoring tests.
7. Build create/join/automatic synchronization/shared countdown as the first vertical slice.
8. Add private drafts, Finish, deadline, reveal, and scoring.
9. Preserve the first integrated baseline and perform one evidence-backed controlled fix.
10. Run the full matrix, deploy, test two physical computers, finish evidence, and stop adding features.
