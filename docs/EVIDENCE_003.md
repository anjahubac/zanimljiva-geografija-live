# EVIDENCE_003 — Zanimljiva Geografija Live

Evidence for the Week 3 submission: recorded scope changes, the captured
baseline, and the one controlled change.

Rule for this file: nothing is written here that was not actually observed. A
placeholder stays a placeholder until the run that fills it has happened.

---

## 1. Scope changes recorded after the specification was frozen

`docs/GAME_SPEC.md` was frozen on 2026-09-22 and states that any later change
is a scope change that must be recorded here with a reason.

### SC-1 — Paper game-sheet interface (2026-09-22)

- **Requested by:** the product owner, in their own words, with a photograph of
  the traditional paper sheet as the reference.
- **Change:** the interface became the paper sheet the game is played on —
  ruled grid, ink, and the answer form laid out as the scoring table.
- **Against the spec:** `GAME_SPEC.md` §6 asks for "light styling only" and
  `Plan.md` §4 lists "Animations and extra visual polish" under Stretch. The
  request was explicit, and a user request outranks the specification in the
  priority order of `.github/00-index.instructions.md`.
- **Behavior changed:** none. No server file, schema, event, or scoring rule
  was touched. All 216 tests passed before and after, unchanged.
- **Accessibility:** the floor was held and measured, not assumed — 15 colour
  pairs computed across both themes, worst text pair 6.89:1, control
  boundaries 3.11:1 and 3.82:1.

### SC-2 — Category set grew from six to nine (2026-09-22)

- **Requested by:** the product owner, naming the set: Država, Grad, Reka,
  Planina, Jezero, More, Životinja, Biljka, Predmet.
- **Change:** `lake` (Jezero), `sea` (More) and `thing` (Predmet) were added to
  `CATEGORIES`, and the order now follows the list above.
- **Against the spec:** categories were a locked constant in `Plan.md` §4 and
  named in the frozen `GAME_SPEC.md` §5. Both were amended; `GAME_SPEC.md`
  carries the amendment as a dated note rather than a silent rewrite, so the
  original wording stays auditable.
- **Why it was cheap:** every layer already derived from `CATEGORIES`. The four
  array bounds in `socket.schemas.ts` were the only literals, and they now read
  `CATEGORY_COUNT` so the bound cannot drift from the set again. All 216 tests
  passed with no test rewritten to accommodate the change.
- **Not changed:** scoring, timing, privacy, the letter allowlist, the phase
  machine, and the pre-registered evaluations. No evaluation in `EVALS.md`
  names a category count, so E1–E3 stand exactly as written.

### SC-3 — A single character no longer scores (2026-09-22)

- **Requested by:** the product owner: "if someone puts only one letter in the
  field it should be marked as invalid".
- **Change:** validity now requires at least `MIN_ANSWER_LENGTH` (2) characters
  after normalization. Before this, typing the round letter alone into all nine
  fields scored full marks, which is the cheapest way to farm points.
- **Against the spec:** `GAME_SPEC.md` §5 rule 4 and `Plan.md` §7 both defined
  validity as "non-empty after normalization". Both are amended, and `Plan.md`
  §7's verbatim function body was updated with it so the plan and the code do
  not disagree.
- **Deliberately not an input bound:** `answerValueSchema` still accepts a
  one-character value, so a draft saves while someone types "Srbija" one key at
  a time. Validity stays a scoring decision, made once, on the server.
- **Tests:** nine new cases — the lone letter in either player's cell, a single
  non-matching character, the two-character floor, and length counted after
  normalization so padding buys nothing.

### SC-4 — Round length 90 s to 150 s (2026-09-22)

- **Requested by:** the product owner, asking for "120 or 150".
- **Change:** `roundDurationMs` now defaults to 150,000 ms.
- **Reason for 150 over 120:** the old round gave 15 seconds per category across
  six; nine categories at that pace is 135 seconds. 150 leaves slack for the
  harder new categories, and costs nothing when players are fast, because both
  pressing **Finished** closes the round early. Running out of time is a worse
  failure than finishing with time to spare.
- **Against the spec:** answer time was a locked constant in `Plan.md` §4 and
  "90 seconds" appeared in `GAME_SPEC.md` §4. Both amended.
- **Reversible without a deploy:** the value is read from `ROUND_DURATION_MS`,
  so 120,000 is an environment change, not a code change.

### SC-5 — The answer sheet became a ruled template (2026-09-22)

- **Requested by:** the product owner, comparing the screen with the reference
  photograph of the paper sheet: the first row should be the column names, and
  the rows under it should be the blank ruled page.
- **Observed problem:** the sheet was a two-player grid — a `Igrač` column with
  a `Ti` line and a `Protivnik` line. On paper the left column is the round
  letter and each line is a round, so the screen did not read as the sheet.
- **Change:** the left column is now the letter, the playable line is the first
  body row, and four blank ruled lines follow it. The opponent's progress moved
  off the table to a line beside it. The results sheet keeps the same frame,
  with one scored line per player above three blank ones.
- **Why the blank lines exist:** they are the look of the page, not data. Core
  plays one round, so they stay empty; they are `aria-hidden` so assistive
  technology is not walked through empty cells, and they are dropped when the
  sheet stacks below 74rem.
- **Behavior changed:** none. No server file, schema, event, scoring rule or
  timing was touched, and the 223 tests that passed before passed after.
- **Newly verifiable:** the layout was previously only inspectable by eye.
  `tests/unit/answer-sheet.test.ts` renders the screen with
  `react-dom/server` — already a dependency, no new package — and asserts the
  five body lines, the letter at the head of the first, that only the first
  carries inputs, and that the player's own text never appears in a blank line.

**SC-5a — the sheet stops stacking (2026-09-23).** The owner reported that when
a round starts the categories appear one beneath another instead of as columns.
The cause was a `max-width: 74rem` breakpoint that turned the playing sheet into
a stacked list, added when the concern was typing while scrolling sideways. The
breakpoint was wrong for this product: the game is played by two people on two
computers, and a laptop window narrower than 1184px is ordinary, so the rule
fired on the main case. It is removed. The playing sheet now behaves exactly
like the scoring sheet at every width — categories stay columns, the sheet
scrolls inside its own container, and the letter column stays pinned while it
does. The per-cell `<label>` remains in the DOM, visually hidden, so the
accessibility floor ("every input has a real label") still holds. The trade is
deliberate and worth stating: on a phone-width screen the sheet must now be
scrolled sideways to reach the last categories.

**SC-5b — the playing sheet is nine columns, and fits (2026-09-23).** Two
further corrections from the owner. First, the sheet still needed a sideways
scrollbar: `.app` capped every screen at 74rem while the eleven-column sheet
required about 1096px, so it overflowed at almost every window size. The cap is
now 96rem for the sheet screens only — forms keep their own 44rem limit — and
the table lays out `fixed`, so the letter and total columns take set widths and
the categories share what is left instead of each cell demanding a minimum.
Second, the playing sheet dropped its `SLOVO` and `UKUPNO` columns: Država is
now the first column. The letter was already stated in the header above the
sheet, and a total column has nothing to show before the reveal — points do not
exist until the server closes the round. The scoring sheet keeps both columns,
because that is where totals belong. Two tests replaced the one that asserted a
letter cell: the sheet now starts at the first category with no total column,
and no points markup appears anywhere while a round is running.

### SC-12 — A real site header (2026-09-23)

- **Requested by:** the product owner — make the nav bar presentable, to best
  practice.
- **Three defects it had, none cosmetic.** The bar was capped at 72rem while
  `.app` had grown to 96rem, so the header and the content beneath it never
  lined up. `button.link` carries `min-height: auto`, giving the nav's controls
  a target about 24px tall, well under the 44px guideline. And its two children
  set opposing `auto` margins, which fought each other instead of laying out.
- **Structure:** `<header>` → `<nav aria-label>` → `<main>`, so the page has
  real landmarks to navigate by. The product name sits left, the global actions
  right, both in the same 96rem column as the content. The current page is
  marked with `aria-current="page"`, which assistive technology reads, and is
  seconded — never carried — by weight and colour.
- **Targets and copy:** nav controls are now 2.75rem tall. The guest state said
  "Kao gost igraš normalno, ali partija se ne pamti." in the bar; that sentence
  belongs on the sign-in screen, where it already is, so the bar says "Gost".
  On the sign-in screen the account links are hidden entirely, since they would
  only repeat what that screen offers.
- **The brand is deliberately not a link home.** A stray click during a live
  round would abandon it without warning; leaving a partija stays an explicit
  action on the results sheet.
- **A duplicate heading went away:** the product name now lives in the header,
  so the lobby's `h1` became "Nova partija" — the site is named once, and the
  page heading says what the page is for.

### SC-11 — "Soba" becomes "partija" (2026-09-23)

- **Requested by:** the product owner — rename Soba to Partija across the app,
  so it reads "Pridruži se postojećoj partiji".
- **Change:** seven strings in `src/client/strings.ts`. All player-facing copy
  lives there, so nothing was scattered through components to hunt down. Both
  nouns are feminine, so every adjective and participle agreed already and no
  surrounding wording changed.
- **It also exposed something the rename would otherwise have half-fixed.** The
  `game:error` messages were English while the account errors were already
  Serbian, and three of them said "Room" — including `ROOM_NOT_FOUND`, which is
  what a player sees after mistyping a partija code, the likeliest error in the
  whole friends flow. All twelve are now Serbian.
- **The error _codes_ did not change.** `Plan.md` §11 requires `game:error` to
  carry a stable code and a safe message; the codes remain `ROOM_NOT_FOUND`,
  `ROOM_FULL`, `NOT_IN_ROOM` and so on, and only the human sentence was
  translated. Two tests asserting the old English sentence were updated; no
  test was weakened or removed.
- **Internal naming is untouched by design.** `roomCode`, `RoomStore`,
  `room:create` and the rest stay as they are: those event names are fixed in
  `Plan.md` §11, and renaming a protocol to match a UI noun would be a large
  change with no user-visible benefit.

### SC-10 — Theme switch, and a school-paper background (2026-09-23)

- **Requested by:** the product owner — a light/dark switch, or following the
  system; and a background that is not "too plain", with doodles of the
  categories on squared school paper. Two reference images were supplied.
- **Theme.** The stylesheet already had a full dark palette behind
  `prefers-color-scheme`, so the system was already honoured; what was missing
  was an override. The choice now lives on `<html data-theme>`: absent means
  follow the system, `light` or `dark` overrides it. The night palette is
  defined once as `--night-*` tokens and applied by two selectors —
  `:root:not([data-theme="light"])` inside the media query, and
  `:root[data-theme="dark"]` outside it — so a colour is never written twice
  and the two cannot drift apart. `color-scheme` is set per theme so the
  browser's own controls and scrollbars follow.
- **No flash of the wrong theme:** a short inline script in `index.html` applies
  a stored choice before first paint. React owns the attribute from the moment
  the toggle mounts. Storage is wrapped in `try`/`catch` — a private window or
  blocked site data must not stop the page rendering — and anything
  unrecognized in storage parses back to `system`.
- **Background.** Squared exercise-book paper: the hand-drawn horizontal rule
  and a new vertical one tile together, so the grid wobbles the way a printed
  one does not. Over it sits a doodle frame of school elements, following the
  reference image.
- **How the frame is drawn.** Four SVG strips — top, bottom, left, right — in
  `src/client/assets/`, one pair per theme, composed on `body::after` and
  offset below the header. They carry a turbulence filter so the linework
  wobbles like pen on paper. The layer is a background, so it is absent from
  the accessibility tree and never intercepts a click, and it drops to the top
  and bottom strips alone on a phone, where the sheet covers the side columns.
- **An earlier attempt was superseded.** The frame was first built as CSS masks
  with the shapes inlined as data URIs — one set of shapes tinted by
  `background-color` so a single set served both themes. It was replaced by the
  asset-file version above, which draws a real frame rather than scattered
  glyphs. The notes below are kept because the mistakes are worth remembering,
  not because that code still exists.
- **Paper is now white** rather than warm cream, per the reference. Every
  colour pair was re-measured against the new surface rather than assumed:
  ink 14.19:1, soft ink 7.37:1, pen red 7.63:1, pen green 8.00:1, focus
  10.46:1, and the control boundary 3.79:1 on the sheet and 3.43:1 on the page.
  `--rule-strong` was darkened from `#7d8db0` to `#74849f` to hold the 3:1
  floor on white.
- **The frame steps back when there is no margin left:** below 70rem the
  content column fills the page, so the drawings would sit under text. Their
  opacity drops rather than letting them compete with it.
- **Two mistakes worth recording.** The doodles shipped broken the first time:
  the SVG bodies were generated but never wrapped in `url("data:…")`, so twenty
  mask layers referenced variables that resolved to nothing and no drawing
  appeared. Inspecting the built CSS caught it; the lesson is that a grep for
  "is the property present" is not the same as "does its value resolve".
  Separately, the first animal doodle was two arcs that read as hills rather
  than a bird — it was rendered, looked at, and replaced with a paw print.

### SC-9 — `lake` removed; the set is eight categories (2026-09-23)

- **Requested by:** the product owner — "let's remove Jezero column, it's not
  needed".
- **Change:** `lake` (Jezero) is gone from `CATEGORIES` and
  `CATEGORY_LABELS_SR`. Those were the only two places it appeared in source:
  `CATEGORY_COUNT` is derived, and the array bounds in `socket.schemas.ts` and
  `account.schemas.ts` read that constant, so every schema bound, the sheet,
  the scoring loop and the history shape followed automatically. The claim
  SC-2 made about the set being cheap to change held.
- **Two test fixtures had to move, and neither was production code.**
  `contracts.test.ts` pinned the count at nine, which is the point of that
  test, so it now pins eight and additionally asserts that `"lake"` no longer
  parses. `account-store.test.ts` hard-coded a perfect score of 90; it now
  derives `CATEGORIES.length * 10`, so the same drift cannot happen again.
- **Known consequence, not yet a problem:** `historyEntrySchema` requires
  exactly `CATEGORY_COUNT` answers, so any history row saved with nine answers
  would now fail to parse and would break that player's profile page. Nothing
  is deployed and no real history exists, so there is nothing to migrate. If
  rows are ever saved before a category change, this needs a migration or a
  version field on the stored entry — recorded here rather than discovered
  later.
- **Round length unchanged** at 150 seconds. SC-4 justified 150 for nine
  categories; eight is served at least as well, and shortening it would be a
  separate decision the owner has not asked for.

### SC-8 — A way off the results screen (2026-09-23)

- **Requested by:** the product owner — after the result is shown there should
  be "some segue to the home".
- **Change:** the results sheet ends with _Nazad na početak_, bottom right.
- **Not a rematch.** `Plan.md` §4 lists "Play Again or multiple rounds in one
  room" under **Stretch**, and §8 states there is exactly one round per room.
  This button leaves the finished room for the lobby, where the player makes a
  new room or queues; it does not start a second round in the old one, and no
  `round:play-again` event was added.
- **Why it remounts rather than resets:** a client-side reset alone would leave
  the socket still bound to the finished room, so `room:create` would hand back
  that same dead room and `room:join` and `room:quick-play` would both fail with
  `WRONG_PHASE`. Leaving instead remounts the game, which drops the socket — and
  the server's existing disconnect path already releases the room binding, so
  the next socket is unbound. No new event, no new schema, and the reconnect
  limitation in §13 is unchanged.

### SC-6 — Accounts are keyed by email, not username (2026-09-22)

- **Requested by:** the product owner: "let's do email as a login form field
  instead of username", together with a question about Google sign-in.
- **Change:** `usernameSchema` became `emailSchema` (trimmed, lowercased,
  RFC-5321 length bound), the `accounts.username` column became
  `accounts.email`, and the error code `USERNAME_UNAVAILABLE` became
  `EMAIL_UNAVAILABLE`. The session, hashing, rate-limiting and history layers
  were untouched: they never referenced the username.
- **Against the spec:** `GAME_SPEC.md` Amendment 3 said "a unique username".
  It is amended rather than rewritten, and `Plan.md` §2 now states that the
  address is the identity.
- **Google sign-in was refused for now,** and the reason is recorded in
  `Plan.md` §2: it needs an OAuth library, a Google Cloud project, registered
  redirect URIs and a secret outside the repository — a new dependency and a
  new external service. Keying accounts on the email address leaves the door
  open, because a Google identity would join an existing row.
- **Tests:** 24 across the three account files — address normalization and
  rejection, the extra-key refusal, duplicate registration, wrong password,
  unknown address answering identically to a wrong password, session issue /
  revoke / expiry, history deduplication and owner isolation, pagination,
  persistence across reopen, the same-origin guard and the unauthenticated
  profile.

### SC-7 — Two ways into a room, and no name step when signed in (2026-09-22)

- **Requested by:** the product owner: play with friends _or_ with random
  people, two paths; and "if you're logged in, you already gave your name so you
  don't need that step".
- **Change:** the lobby offers _Igraj sa prijateljem_ (create a room, share the
  code) and _Igraj sa nepoznatim_ (a first-come queue). The queue lives beside
  the rooms in memory; the second player to queue makes the server create a room
  for the waiting player and join the arriving one, so a matched pair uses the
  existing `createRoom` / `joinRoom` path and inherits every timing, privacy and
  scoring guarantee. A new `SearchingScreen` covers the waiting state.
- **Name step:** a signed-in player is no longer asked for a name on either
  path. The server already preferred the session's display name over the
  payload, so this removed a field the server was ignoring — a client still
  cannot claim another name by editing the request.
- **Against the spec:** `Plan.md` §2 called matchmaking "a proposal, not yet an
  implementation requirement", and §4 lists "public matchmaking" under
  exclusions. §2 now records the approval and the rules the queue must keep.
  The §4 line still stands for _public room lists_, which were not added.
- **Invariants held, and tested:** one entry per socket (a repeated request
  returns the same queued answer rather than a matchable ghost); a socket that
  drops while queued is removed; an account is never matched with itself on a
  second device; a player already in a room cannot queue; a malformed request
  changes nothing. Nine tests across `tests/integration/quick-play.test.ts` and
  `tests/unit/room-store.test.ts`.
- **Not changed:** the round, the letter, the timing, the reveal, the scoring
  and the schemas for all of those. The suite went from 247 to 256 tests with
  no existing test rewritten.

### Still refused, and why

"Play Again or multiple rounds in one room" was requested and is listed under
**Stretch — do not implement for Core** in `Plan.md` §4. The product owner chose
to defer it until the baseline is captured. It is not implemented.

Accounts, profiles and saved answer history were refused at first for the
reasons recorded here — they needed a database and a privacy decision about
storing what people wrote. The product owner then asked for them explicitly, so
`Plan.md` §2 carries the expansion and SC-6 above records what shipped: one
SQLite file, no new package, and history readable only by its owner.

Sign-in with Google is still refused, and is the one item above that cannot be
delivered without a new dependency and an external service. See `Plan.md` §2.

---

## 2. Baseline capture (Step 9)

The automated half was run on 2026-09-22 against the untouched baseline commit.
The manual browser round was played on 2026-09-23 (§2.1). The **two-computer**
half is still outstanding, and E4 is still open.

| Item                               | Value                                                                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Commit hash                        | `481535a9065852ad9001719f96de2a73ebe399b3`                                                                                               |
| Command                            | `npm run verify` (typecheck, lint, `vitest run`, production build)                                                                       |
| Result                             | 13 files, **223 tests passed**, client and server builds succeeded                                                                       |
| E1 synchronized start              | passed — `tests/integration/synchronized-start.test.ts`, 3 tests, including "never reveals a letter to player 1 while player 1 is alone" |
| E2 close and score once            | passed — `tests/integration/close-and-score.test.ts`, 7 tests                                                                            |
| E3 rejections                      | passed — `tests/integration/rejections.test.ts`, 16 tests                                                                                |
| Two-browser round                  | performed 2026-09-23 by the product owner, two browser profiles on one machine — see §2.1                                                |
| First genuine defect observed (E4) | **still open**                                                                                                                           |

A correction worth recording: an earlier run in the same session reported 239
tests. That run included account files that were later removed from the working
tree, so it was not the baseline commit. 223 is the figure for `481535a`, and
it was re-run to confirm it rather than inferred by subtraction.

### 2.1 Manual browser round — 2026-09-23

Played by the product owner against commit `c1b3192`, in **two browser profiles
on one machine**. More than one round was played, covering both close paths.

| Checked                                         | Observed                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| Create → join → both ready → countdown → round  | worked end to end                                                |
| Countdown behaviour                             | no lag; both screens changed phase at the same time              |
| Letter, categories and deadline on both screens | identical, and neither screen showed the letter before countdown |
| Close by both pressing **Finished**             | round closed, reveal and scores shown                            |
| Close by the 150 s deadline expiring            | round closed, reveal and scores shown                            |
| Defect observed                                 | **none**                                                         |

This is E1 and E2 confirmed in real browsers rather than only headlessly, and it
is the first time a human has played the game end to end.

**Three limitations, stated rather than glossed over:**

1. **One machine means one system clock.** `Plan.md` §20 lists "device clocks
   differ" as the first risk in the register, and two profiles on the same
   computer cannot exercise it. The `serverNow` offset is therefore still
   unproven against real drift.
2. **Happy path only.** No refresh mid-round, no disconnect, no mistyped partija
   code. The §13 failure matrix is covered by automated tests but has not been
   driven by hand.
3. **Not the two-computer round** that `Plan.md` §21 requires for the Definition
   of Done. That remains outstanding, together with the deployed smoke test.

### 2.2 Failure-matrix probe by hand — 2026-09-23

Four probes, listed before they were run, driven in two browser profiles at
commit `c1b3192` by the product owner.

| Probe                          | Observed                                                                               | Verdict                  |
| ------------------------------ | -------------------------------------------------------------------------------------- | ------------------------ |
| Mistyped partija code          | "Partija nije pronađena. Proveri kod." on the join screen; no navigation away          | correct, matches §13     |
| Refresh a tab mid-round        | The refreshing player returns to _Nova partija_; **the opponent is never told**        | defect — see below       |
| Close a tab mid-round          | Same symptom: the remaining player is unaware the opponent has gone                    | defect — same cause      |
| Leave a round idle past reveal | Not run; the scenario was not clearly enough specified to produce a usable observation | still open, low priority |

The mistyped-code probe confirms the §13 row "Invalid or expired room code —
stay on join screen; show safe message" in a real browser, and the Serbian
message from SC-11 is the one a player actually sees.

**The refreshing player landing back on _Nova partija_ is not itself the
defect.** `Plan.md` §13 says "Full reconnect recovery is optional", so a client
that does not rejoin its room is within spec. The defect is on the _other_
side, and it is the same in both probes: the remaining player is never shown
that they are now alone.

### E4 — the first genuine defect, recorded before any fix

`Plan.md` §13's "One player disconnects" row requires the timer to continue,
accepted drafts to be retained, and the remaining player to **show connection
status**. The first two hold. The third does not.

The reproduction, the wrong behaviour and the signal that will prove it fixed
are pre-registered in `docs/EVALS.md` under E4. The mechanism, traced but not
yet touched:

| Layer    | State                                                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------------------- |
| Server   | **correct** — `markDisconnected` sets `player.connected = false` and broadcasts the room state                              |
| Contract | **correct** — `connected: z.boolean()` rides in the room-state projection                                                   |
| Test     | **passes, and is not wrong** — it asserts `connected === false` on the socket payload, which is true                        |
| Client   | **drops it** — the reducer derives `opponentFinished` from that payload but never `connected`, and no round screen reads it |

Worth stating plainly, because it is the lesson of this baseline: a green test
and a broken behaviour are not a contradiction here. The test asserts the
server's payload and the server's payload is right. Nothing asserted what the
player is shown, so the gap sat between two correct layers for the whole build.

### Why SC-5 is still not E4

The sheet-layout problem the owner reported (SC-5) was a real observation
against this baseline, but it is filed as a scope change and not as E4, for two
reasons. It is a mismatch with a reference the owner supplied rather than a
fault in the game's behavior, and the pre-registered E1–E3 are all behavioral.
Recording a layout fix as "the first genuine defect" would make the controlled
change exercise easier than it is meant to be. E4 above is behavioural, was
observed rather than reasoned about, and contradicts a named row of the §13
failure matrix.

## 3. Controlled change (Step 10)

**Written on 2026-09-23 before the change was made.** The result and the
limitation are appended afterwards; nothing above the result line is edited
once the change has been seen.

- **Claim.** A player whose opponent disconnects mid-round is never told, and
  goes on playing against nobody until the reveal.
- **Signal.** What P1's round screen renders after P2's socket drops. Today it
  renders "Protivnik još igra." — unchanged from before the drop.
- **Hypothesis.** The cause is not in the server or the schema, both of which
  carry `connected` correctly, but in the client reducer, which derives
  `opponentFinished` from the room-state payload and silently discards
  `connected`. Deriving it and rendering it on the round screens is therefore
  sufficient, and no server, schema, event or scoring change is required.
- **Smallest change.** One explanatory variable: the client's use of a field the
  server already sends. Derive `opponentConnected` in the `room-state` branch of
  the reducer, thread it to the screens shown during a live round, and announce
  it through the existing `aria-live` region so the accessibility floor in
  module 10 is met rather than bolted on. No new event, no new schema field, no
  new dependency, and no change to timing, privacy or scoring.
- **Verification.** A test that drops a socket mid-round and asserts the
  disconnect appears in what the remaining player's screen renders, plus the
  identical E1–E3 re-run at the new commit, plus `npm run verify`. The existing
  payload-level assertion in `room-lifecycle.test.ts` stays exactly as it is —
  it was never wrong, and weakening or rewriting it would hide the lesson.
- **Result.** The hypothesis held, exactly and without amendment. No server
  file, schema, event, scoring rule or timing was touched. Six files changed,
  all under `src/client/`, plus tests.

  The signal was confirmed in both directions rather than only the convenient
  one. With the source reverted to the baseline and the new tests left in
  place, **11 of the 14 new tests fail**, and the failure message is the defect
  itself: `expected '<p class="opponent-note">Protivnik jo…'` — the baseline
  still telling the remaining player "Protivnik još igra." after the opponent
  had gone. With the fix restored, all 14 pass.

  The three that pass in both directions are guards rather than signal: "says
  nothing about leaving while both players are connected" and "the round keeps
  running underneath the message" were true before and must stay true after.

  | Check                 | Before (`3048623`)  | After               |
  | --------------------- | ------------------- | ------------------- |
  | `npm run verify`      | pass                | pass                |
  | Tests                 | 261 across 19 files | 275 across 20 files |
  | E1 synchronized start | pass (3)            | pass (3)            |
  | E2 close and score    | pass (7)            | pass (7)            |
  | E3 rejections         | pass (16)           | pass (16)           |
  | E4                    | **fail (11)**       | **pass**            |

  E1–E3 are byte-identical in count and outcome, which is the point of changing
  one variable: nothing outside the client's use of an existing field moved.

- **Limitation.** Five, stated plainly:

  1. **This is notification, not reconnect.** A player who refreshes still
     cannot rejoin the round they left. They see _Nova partija_; their opponent
     now knows they are gone and can keep playing. `Plan.md` §13 makes full
     reconnect optional, and adding it here would have been a second variable.
  2. **The countdown screen was left alone.** An opponent who drops during the
     three-second countdown is not reported until the answer screen appears.
     The window is small and the pre-registered change named the screens shown
     during a live round; widening it mid-experiment would have confounded it.
  3. **The message cannot distinguish a refresh from a closed tab**, because
     the server cannot either — both are one dropped socket. "Napustio partiju"
     is therefore slightly stronger than what is known for a refresh, and is
     the honest reading given that no reconnect exists to contradict it.
  4. **Verified by test, not yet by hand.** The two-profile browser round that
     produced the observation has not been replayed against the fix. That
     belongs with the two-computer round still outstanding for Step 11.
  5. **The end-to-end test stops short of the real browser.** It drives a real
     socket drop through the real reducer into real markup, which is three of
     the four links, but it renders with `react-dom/server` rather than
     driving a DOM. Adding a browser test runner would mean a new dependency,
     which module 11 forbids without asking.

### What changed, file by file

| File                                              | Change                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| `src/client/state/useGameState.ts`                | derive `opponentConnected` from the payload the server already sends |
| `src/client/strings.ts`                           | one Serbian sentence, `opponentLeft`                                 |
| `src/client/screens/AnswerScreen.tsx`             | render it, `aria-live="polite"`, departure outranking finish         |
| `src/client/screens/WaitingForOpponentScreen.tsx` | the same, for a player who already finished                          |
| `src/client/App.tsx`                              | thread the flag to both screens                                      |
| `src/client/app.css`                              | `--pen-red` as a second channel behind the sentence                  |

**Why `polite` and not `assertive`.** This fires while someone is typing an
answer against a clock. An assertive region interrupts the screen reader
mid-word to deliver news that changes nothing they must do right now. The
sentence is worth reading, not worth cutting them off for.

**Why the existing test was not touched.** `room-lifecycle.test.ts:145`
asserts `connected === false` on the server payload. It passed before the fix
and passes after, because it was never wrong. Rewriting it to cover the client
would have destroyed the evidence of how the defect survived — two correct
layers with nothing asserting the join between them.

### What this change is deliberately not

It is **not** reconnect. A refreshed player still lands on _Nova partija_ and
cannot rejoin the round they left. `Plan.md` §13 makes full reconnect recovery
optional and Step 10 permits exactly one variable, so implementing resume here
would confound the experiment and expand scope in the same move. The unused
`resumeToken` — minted per player, sent to the client, stored by nobody, and
consumed by no handler — is recorded in §5 as a separate finding, not fixed as
part of this change.

---

## 4. Pre-deploy verification (Step 11, local half)

Run on 2026-09-23 at commit `c1b3192`, against the **production build**
(`npm run build`, then `npm start`) rather than the dev server — the point is
to exercise the artifacts that will actually be deployed. HTTPS and WSS are not
covered here; they need the real host and are the remaining half of Step 11.

### The failure matrix in `Plan.md` §13

Every row is covered by an automated test, all passing:

| §13 row                                 | Covering test                                                                                                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invalid or expired room code            | `rejects a join for an unknown room code`; `reaps an abandoned lobby, after which its code is no longer joinable`                                                           |
| Third player attempts to join           | `rejects a third player and leaves the two existing players untouched`                                                                                                      |
| Malformed payload                       | `rejects a malformed create payload without creating a room`; `rejects an unknown category`; `rejects a draft carrying an extra authority key`                              |
| Wrong room or stale round               | `rejects a draft carrying a stale roundId`                                                                                                                                  |
| Draft before start or at/after deadline | `rejects a draft before startsAt`; `rejects a draft at or after endsAt, before the deadline callback runs`                                                                  |
| Draft after player finished             | `rejects a draft after that player finished`                                                                                                                                |
| Duplicate Finish                        | `acknowledges a duplicate finish without a second reveal or a changed score`                                                                                                |
| Finish races deadline                   | `closes once when a finish one millisecond before the deadline races the timer`                                                                                             |
| One player disconnects                  | `reports a disconnected opponent without ending the room`; `still reveals to the player who stayed when the opponent disconnects`                                           |
| Server restarts                         | Not automated. The client shows the session-ended banner from `UI_SR.connectionLost` when the socket drops while a room is held; restart durability is out of scope by §13. |

### Production-build smoke test

| Check                                   | Result                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GET /healthz`                          | `200` `{"status":"ok"}`                                                                     |
| `GET /`                                 | `200 text/html`                                                                             |
| SPA fallback on `/some/deep/route`      | `200`, serves `index.html` — a refreshed client route loads                                 |
| `GET /api/session` with no cookie       | `200` `{"account":null}`                                                                    |
| Hashed CSS asset                        | `200 text/css`                                                                              |
| Socket.IO transport                     | **`websocket`** — a real upgrade, not the long-polling fallback                             |
| Two clients, create → join → both ready | Both received `round:scheduled` with identical `roundId`, `letter`, `startsAt` and `endsAt` |
| Round metadata                          | letter `V`, 8 categories, 150 s window, 3 s countdown                                       |

This is E1 re-run against the deployable artifacts. It does not replace the
two-computer acceptance round, which is still outstanding along with E4.

---

## 5. Open findings not fixed here

### The resume token is minted, sent, and used by nobody

`generateResumeToken()` produces 32 random bytes per player, and the value is
returned to that player in the `room:create` / `room:join` ack. Nothing in
`src/client/` stores it, and the server registers no handler that accepts it.
It is a secret generated and transmitted over the wire for no current purpose.

- **Not a gameplay defect**, which is why it is not E4: no player sees anything
  wrong because of it.
- **Why it is worth recording anyway.** The security guardrail in
  `.github/copilot-instructions.md` names resume tokens explicitly, and the
  privacy tests already assert the token never reaches the _opponent_
  (`drafts-privacy.test.ts:118`). Those assertions are worth keeping. But the
  cheapest way to not leak a secret is to not mint one until something consumes
  it.
- **Two honest options**, neither taken during Step 10 because each would be a
  second variable: remove the token until reconnect is actually implemented, or
  implement reconnect and give it a purpose. The first is smaller; the second
  is what the token was designed for.
