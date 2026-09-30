# Chat handoff — Zanimljiva Geografija Live, Week 4 AI work (2026-09-30)

Summary of one Claude Code session in `/Users/anjahubac/Projects/zanimljiva-geografija-live`,
for continuing in another window. Everything below is **local and uncommitted**.

## 1. What Anja asked for, in order

1. **Context:** a colleague forked the game (`Cevizara1/zanimljiva-geografija-live`,
   commit `28ee792`) and rewrote it as single-player vs AI on Vercel. That removed the
   friend and random-person modes. Anja needs AI in the project, but wants it as an
   **answer validator** plus a **third option: play against AI**.
2. **Update the Plan** for her version: keep the local gameplay as-is, **remove
   login/signup**, all three modes playable without an account, add the AI answer
   checker and "play vs AI", reuse the colleague's code where possible, and show how to
   **host everything for free**.
3. **Add hints.** Use **Gemini** (for its free API calls). **Two languages**
   (Serbian and English), with the AI checking answers in both. "Make it work."
4. **Use both Gemini and Groq**, each a substitute when the other fails.
5. **This file**, to forward to another window.

## 2. Key decisions and facts

- **The local checkout is Anja's version** (friend + random matchmaking + accounts),
  based on `main` at `8306d97`. The colleague's work exists only on his fork.
- **Git is blocked** on this Mac until the Xcode license is accepted:
  `sudo xcodebuild -license accept`. Nothing was committed. A snapshot of the original
  code is in the session scratchpad (`.../scratchpad/baseline-8306d97`), and the last
  commit is on GitHub.
- **Gemini's free tier** may use prompts to improve Google's products, with human
  review. Serbia is **not** in the EEA/UK/Switzerland exception. Anja chose Gemini
  anyway for the free calls; the lobby tells players that answers go to Gemini/Groq.
- **Groq's free plan:** no card; ~30 req/min, 1,000 req/day, 8,000 tokens/min per
  model. Strict JSON output on `openai/gpt-oss-120b` / `gpt-oss-20b`. It doesn't keep
  inference data by default; Zero Data Retention also turns off the 30-day abuse log.
- **Hosting:** Render free web service (supports WebSockets; 750 h/month; sleeps
  after 15 min idle, ~1 min wake-up; no persistent disk, which is fine now that
  accounts/SQLite are gone). Not Vercel (no long-lived WebSockets — why the fork had
  to drop multiplayer). Not Fly.io (no free tier for new users). Koyeb/Oracle only as
  alternatives. Total cost $0.

## 3. What was built (all tests pass)

`npm run verify` → typecheck, lint, **27 test files / 431 tests**, production build: all
pass. Baseline before the work was 20 files / 275 tests.

### Removed
- Login/signup, profiles, saved history, SQLite (`src/server/accounts/*`,
  `src/contracts/account.schemas.ts`, `src/client/accounts/*`, `AccountScreen`,
  `ProfileScreen`, `data/`, their tests and CSS). The socket same-origin check was
  kept and moved into `src/server/index.ts`.

### AI answer checker (`src/server/features/check-round.ts`, prompt `check-round.v3`)
- Step 1: the old local rule (≥ 2 chars, right starting letter). Failing answers are
  never sent to the AI.
- Step 2: **one AI request per round** judges both players' answers (de-duplicated).
- An answer counts only if the AI accepts it, the recognised name resembles what was
  written, and that name starts with the letter (checked by code, not the model).
- "Same answer" (5/5) compares recognised Serbian names, so `Serbia` = `Srbija`.
- New room phase **`judging`**: `closeRound` stays the single idempotent entry;
  `completeRound` runs exactly once, whichever of checker result or the **20 s** room
  timeout comes first. Any AI failure → local-rule scoring, marked `verified: false`.
- The results show each rejection reason (doesn't exist / wrong category / wrong
  letter / …).

### Play against AI (`room:play-ai`)
- A server-side bot in seat 2 (`bot: true`, reserved name `AI`, always ready), so the
  round starts from the human's normal `room:client-ready`.
- It gets its answers from the AI when the letter is chosen, keeps a random **5–7 of
  8**, and finishes at **55–85%** of the round. Its answers are absent from every
  payload until reveal and are judged by the same checker. If its AI call fails, it
  plays blank (`botFailed`).

### Hints (`round:hint`)
- **2 per player per round**, one per category, one pending at a time; available in
  all modes; the bot doesn't use them.
- The term never leaves the server; a clue that leaks it (4+ letters, SR or EN) is
  discarded. A credit is spent only when a clue is shown. Hinted cells are marked for
  **both** players at reveal, even if left blank.
- New error codes: `AI_UNAVAILABLE`, `AI_LIMIT`, `HINT_LIMIT`.

### Two languages
- A **Srpski / English** switch in the header (remembered per browser). All strings,
  category labels and error messages exist in both (`src/client/strings.ts`,
  `src/client/i18n.tsx`).
- Answers count in Serbian **or** English in every game; hints come in the player's
  language.

### Gemini ⇄ Groq fallback (`src/server/ai/providers.ts`, `groq-adapter.ts`)
- The models are **interleaved** in one chain: `gemini-3.5-flash-lite → gpt-oss-120b →
  gemini-3.1-flash-lite → gpt-oss-20b → gemini-3.6-flash`. The next try after any
  failure goes to the other provider.
- Model-health memory skips down or out-of-quota models on later rounds.
- Either key alone works. `AI_PROVIDER_ORDER=groq,gemini` flips the order; a single
  name uses only that provider.

### Reused from the colleague's fork
- **Unchanged:** the AI gateway (retries, model chain, quota handling, model health,
  telemetry, debug log, config, Gemini adapter), `fold-letters`, `resemblance`,
  `hint-leak`, fakes, and ~100 of his tests.
- **Adapted:** the checker and hint features and prompts.
- **Not used:** his Vercel setup, single-player screens, and Spec Kit files.

### Verified in the browser
Driven against a scripted AI stand-in (no real key available): an AI round
(bot, hint, EN switch mid-round, results with reasons) and a friend round in two
tabs (one SR, one EN). No server or console errors.

## 4. Where things are

| What | Where |
| --- | --- |
| Full design + status | `Plan.md` §2B (2B.1–2B.9) |
| Env vars | `.env.example` (`GEMINI_API_KEY`, `GROQ_API_KEY`, `GEMINI_MODEL_CHAIN`, `GROQ_MODEL_CHAIN`, `AI_PROVIDER_ORDER`, `AI_DEBUG_LOG`) |
| AI service used by the game | `src/server/ai/service.ts` |
| Room store (judging, bot, hints) | `src/server/rooms/room-store.ts` |
| AI evals A1–A6 | `tests/integration/ai-round.test.ts` |
| Groq + fallback tests | `tests/unit/groq-and-fallback.test.ts` |
| Live check (opt-in, real API) | `scripts/ai-smoke.ts` → `npm run smoke:ai` |
| Updated rules | `.github/copilot-instructions.md`, `.github/instructions/09-*`, `12-*` |

## 5. Not done / next steps

1. **Add the keys:** copy `.env.example` → `.env`; set `GEMINI_API_KEY` (Google AI
   Studio, project **without billing**) and `GROQ_API_KEY` (console.groq.com/keys).
2. **Live test each provider** (4 real requests each; the expected results were written
   first):
   ```bash
   AI_PROVIDER_ORDER=gemini npm run smoke:ai
   ```
   ```bash
   AI_PROVIDER_ORDER=groq npm run smoke:ai
   ```
   Then record the agreement scores in `docs/AI_EVALS.md` and tune the prompt if needed.
   **Groq's accuracy on Serbian answers is untested.** The Gemini model ids come from
   the colleague's live testing, not re-checked here.
3. **Commit** after `sudo xcodebuild -license accept` (branch first; don't push
   without asking).
4. **Deploy to Render** (Frankfurt, build `npm ci && npm run build`, start
   `npm start`, health check `/healthz`, both keys as secrets, one instance).
5. `docs/GAME_SPEC.md` was **not** updated (it's marked frozen); decide whether to
   amend it.
