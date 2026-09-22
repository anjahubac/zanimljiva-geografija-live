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

### Still refused, and why

"Play Again or multiple rounds in one room" was requested and is listed under
**Stretch — do not implement for Core** in `Plan.md` §4. The product owner chose
to defer it until the baseline is captured. It is not implemented.

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
