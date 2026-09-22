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

### Still refused, and why

"Play Again or multiple rounds in one room" was requested and is listed under
**Stretch — do not implement for Core** in `Plan.md` §4. The product owner chose
to defer it until the baseline is captured. It is not implemented.

Accounts, profiles and saved answer history were asked about. `Plan.md` §4 lists
"Accounts, passwords, profiles, or social login" and "Database, permanent
history, or persistent leaderboard" under **Explicitly out of scope**, and
`GAME_SPEC.md` §7 repeats both exclusions. They are not implemented, and unlike
the amendments above they cannot be a small change: they need an identity
provider, a database, and a privacy decision about storing what people wrote.

---

## 2. Baseline capture (Step 9)

_Not yet performed._ To be filled by an actual run against an untouched commit:
the `npm run verify` output, the E1–E3 results, screenshots of a real
two-browser round, and the commit hash. Nothing below is written in advance.

| Item | Value |
| --- | --- |
| Commit hash | _to fill_ |
| Command | `npm run verify` |
| E1 synchronized start | _to fill_ |
| E2 close and score once | _to fill_ |
| E3 rejections | _to fill_ |
| Two-browser round | _to fill_ |
| First genuine defect observed (E4) | _to fill_ |

---

## 3. Controlled change (Step 10)

_Not yet performed._ Claim, signal, hypothesis, smallest change and
verification are written here **before** the change is made, and the identical
evaluations are re-run afterwards.
