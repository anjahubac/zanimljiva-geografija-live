# AI_USAGE_LOG

One row per meaningful AI call. Phase, reason, expected result, actual result,
next decision. No private chain-of-thought, no secrets, no tokens, no private
URLs, no in-round answer payloads.

Budget: 10–15 meaningful coding-agent iterations across Weeks 3–4.
Used so far: **9 logged**. The Week 3 sessions for Steps 9–10 have no entries
here; their results are recorded in `EVIDENCE_003.md` §2–§3 and the `EVALS.md`
run log. Entry 007 was written afterwards, from the owner's summary of that
session, not during it.

---

## 001 — Planning (ChatGPT / Codex, 2026-09-22)

- **Phase:** planning, before any code.
- **Reason:** turn the team's verbal requirements and the Week 3 brief into a
  written plan and a reusable instruction set.
- **Expected:** a plan covering gameplay flow, state machine, Socket.IO protocol,
  scoring, schedule, testing, deployment and Week 3 criteria.
- **Actual:** `Plan.md` (796 lines) plus `.github/copilot-instructions.md`, an
  instruction index and nine engineering modules. No application code.
- **Next decision:** review the plan for internal consistency before handing it
  to an implementation model.

## 002 — Plan and instruction audit (Claude Code, 2026-09-22)

- **Phase:** planning review.
- **Reason:** check whether the plan was specific enough for a weaker model to
  implement without inventing decisions.
- **Expected:** a list of gaps and contradictions.
- **Actual:** six contradictions found and fixed (phase enum; out-of-scope
  `answer:review` / `round:play-again`; NFKC vs NFC; a lifecycle that looped back
  to countdown; dictionary language vs letter-only validity; `requestId` vs
  strict schemas). Four new instruction modules written: 10 build order,
  11 exact stack, 12 schemas and error registry, 13 test recipes. `AGENTS.md`
  and `CLAUDE.md` added, because `.github/instructions/` is a Copilot-only
  convention and was not being loaded by the agent actually in use.
- **Next decision:** implement from module 10, one step at a time.

## 003 — Steps 0 and 1 (Claude Code, 2026-09-22)

- **Phase:** scaffold and required documents.
- **Reason:** establish a verifiable skeleton and write the Week 3 documents
  before gameplay code, as `Plan.md` §2A requires.
- **Expected:** install, typecheck, lint, test and build all pass; `/healthz`
  returns 200 from the built server; five documents exist with E1–E4 written as
  expectations only.
- **Actual:** verified in-session — `tsc --noEmit` clean; `eslint . --max-warnings=0`
  clean; `vitest run` 1 passed (scaffold placeholder); `vite build` + `tsup`
  produced `dist/client/index.html` and `dist/server/index.js`; `GET /healthz`
  → 200, `GET /` → 200, `GET /deep/spa/route` → 200 (SPA fallback).
  Documents written: `GAME_SPEC.md` (frozen), `BUILD_PROMPT_V1.md`,
  `CONTEXT_MANIFEST.md`, `EVALS.md` (E1–E3 pre-registered, E4 intentionally
  empty), this log.
- **Deviation recorded:** local Node is v26.8.1, above the v20/v22 named in
  module 11. All five scaffold checks pass on it. The deployment target must be
  pinned to Node 20 or 22 regardless.
- **Next decision:** Step 2 — contracts, with schema tests before any server code.

---

## Template for the next entry

```text
## NNN — <step> (<tool>, <date>)
- Phase:
- Reason:
- Expected:
- Actual (with the command output that proves it):
- Next decision:
```

---

## 004 — Step 2, contracts (Claude Code, 2026-09-22)

- **Phase:** implementation, boundary layer. No server or gameplay code yet.
- **Reason:** every later step parses its input with these schemas, so they come
  before any behavior that could be written against a guessed shape.
- **Expected:** `src/contracts` compiles, and every schema has a valid case, a
  malformed case, and an extra-key rejection case.
- **Actual:** three files written — `game.schemas.ts` (constants, primitives,
  `serverConfigSchema`), `errors.ts` (12-code closed registry, `Ack` envelope,
  `ok`/`fail`/`ackSchema`), `socket.schemas.ts` (requests, acks, server events,
  event-name constants). 65 tests pass; `npm run verify` green (typecheck, lint,
  vitest 65/65, client + server build).
- **Notable:** one test asserted that no client-facing error message looks like a
  stack trace. The first version of that regex was wrong — `at \w+` matched
  inside the word "That". The assertion was fixed; no product code changed.
- **Deviation recorded:** module 12 described two contract files; the error
  registry became a third, `errors.ts`. Module 12 was updated to match, and the
  create/join ack was corrected there to include the caller-private
  `resumeToken` it already promised in prose.
- **Next decision:** Step 3 — pure domain functions (normalize, validate, score)
  with the full scoring table from `GAME_SPEC.md` §5.

## 005 — Steps 3–7, the whole server (Claude Code, 2026-09-22)

- **Phase:** implementation, domain through socket layer. No client screens yet.
- **Reason:** finish every layer the browser cannot be trusted with, and prove
  it with tests that do not need a browser.
- **Expected:** pure domain functions matching the `Plan.md` §6 table; injected
  clock, scheduler and letter selection; a room store whose full phase machine
  and idempotent `closeRound` are testable without Socket.IO; handlers that only
  translate events into store calls; E1, E2 and E3 passing over real sockets.
- **Actual (verified in-session):** `npm run verify` green — `tsc --noEmit`
  clean, `eslint . --max-warnings=0` clean, **203 tests passed across 12 files**,
  `vite build` + `tsup` both succeeded. `npm run test:coverage` reported 100% on
  `src/domain` and `src/contracts` and 99.65% statements on `room-store.ts`,
  against thresholds of 80/70. The built server was started for real:
  `GET /healthz` → 200 `{"status":"ok"}`, an unknown client route → 200 via the
  SPA fallback.
- **Three decisions worth recording:**
  1. `Plan.md` §7 lists "at most 40 characters" as validity condition 1 but the
     verbatim `isValidAnswer` body it supplies does not check length.
     `GAME_SPEC.md` §5 (higher priority) treats the cap as an input bound and
     validity as non-empty + starts with the letter. The cap therefore stays
     owned by `answerValueSchema` at the boundary, and the domain function is
     used exactly as written. One rule, one owner.
  2. The store emits addressed *deliveries* (`socketId` + event + payload)
     through an injected sink rather than touching Socket.IO. A deadline close
     has no request in flight, so it needs a push path, and this keeps the whole
     state machine testable without a transport.
  3. Outbound payloads are parsed through the strict contract schemas before
     delivery, so an internal field added by accident throws at the projection
     instead of leaking to a browser.
- **Two test failures that were real, and what they taught:**
  - `loadConfig` echoed the rejected value in its error message, because Zod's
    enum text quotes it. A mis-assigned environment variable could hold a
    credential, so the message now names the variable only. Product code was
    fixed; the assertion was not weakened.
  - The deadline race could not be reproduced with `advance`, which fires the
    timer first and honestly yields `ROUND_STALE`. Moving the clock with
    `setNow` — wall time past `endsAt`, callback not yet run — is the only way
    to reach the `TOO_LATE` branch, and that is now how both the unit and the
    E3 test express it.
- **Known limitation:** no client screens yet, so no end-to-end human round has
  been played. E1–E3 pass headlessly; the two-browser evidence is Step 9 work.
- **Next decision:** Step 8 — the seven screens, rendering only parsed server
  projections, with the accessibility floor from module 10 treated as
  acceptance criteria.

## 006 — Step 8, the client (Claude Code, 2026-09-22)

- **Phase:** implementation, browser layer.
- **Reason:** make the verified server playable, with screens that render only
  parsed server projections.
- **Expected:** seven screens driven by one reducer; debounced drafts; a locked
  form on an accepted finish; no opponent answer in client state before reveal;
  the module 10 accessibility floor met as acceptance criteria.
- **Actual (verified in-session):** `npm run verify` green — typecheck clean,
  `eslint . --max-warnings=0` clean, **216 tests passed across 13 files**, both
  builds succeeded. The built server was run for real on a spare port: `GET /`
  returned the built `index.html` referencing the hashed bundle, and the
  Socket.IO handshake at `/socket.io/?EIO=4&transport=polling` returned 200 from
  the same process.
- **Thirteen new reducer tests** cover the client rules that are easy to get
  wrong: a late acknowledgement for an older revision must not mark a newer edit
  as saved; the form locks on the accepted finish ack, not the click; and no
  opponent answer exists anywhere in state before the reveal payload arrives.
- **Deviation recorded:** the results screen shows the honor-system notice in
  Serbian, with the exact English sentence from `Plan.md` §7 beneath it, because
  the rest of the interface is Serbian and the plan fixes that wording.
- **Known limitations, stated plainly:**
  1. There are **no DOM or component tests**. Adding a test renderer would mean
     new dependencies, which module 11 forbids without asking. The reducer and
     the socket adapter are tested; the rendered markup is not.
  2. Step 8's exit criterion — two browser profiles completing a full local
     round — has **not** been performed. It needs a human at two browsers, and
     the evidence belongs in Step 9.
  3. Contrast ratios in `app.css` were chosen from documented token values, not
     measured with a tool in this session.
- **Next decision:** Step 9 — run the pre-written evals unchanged against this
  commit, play a two-browser round, and record the real output, screenshots and
  commit hash in `docs/EVIDENCE_003.md`. Do not fix anything before the baseline
  is captured.

## 007 — Week 4 revision: no accounts, AI checker, AI opponent, hints, SR/EN (Claude Code, 2026-09-30)

- **Phase:** Week 4, product revision. One session, five requests in order:
  plan the owner's version against a colleague's single-player fork; remove
  accounts and add the AI checker and a play-against-AI mode, with free
  hosting; add hints, Gemini and two languages; add Groq as Gemini's
  fallback; summarise the session.
- **Reason:** keep both multiplayer modes, which the fork had dropped, while
  adding AI as a checker and as a third mode.
- **Expected:** `Plan.md` §2B written before the code; A1–A6 written before the
  code and passing with a fake AI; every AI failure ending in a scored round.
- **Actual (from the session summary):** `npm run verify` green — typecheck,
  lint, **431 tests across 27 files** (baseline 275 across 20), build. A1–A6
  pass; a mutation check made A5 and A4 fail. Played in a browser against a
  scripted AI stand-in: an AI round and a two-tab friend round, no errors.
- **Not verified:** no API key was available, so neither Gemini nor Groq was
  called for real; `GAME_SPEC.md` was left unamended (done in 008).
- **Next decision:** add keys, run `npm run smoke:ai` per provider, commit,
  deploy to Render.

## 008 — Leave game on the waiting screen, and a docs pass (Claude Code, 2026-09-30)

- **Phase:** Week 4, small product change plus documentation alignment.
- **Reason:** the owner asked for a way out of the screen where you wait for a
  friend — a back button or a leave button — and for every doc to be brought
  up to date.
- **Expected:** a labelled Leave game button on the waiting screen, with no new
  event; a lobby whose host leaves stops accepting its code at once; tests
  that fail without the server rule; docs matching the code.
- **Actual (verified in-session):** `npm run verify` green — typecheck, lint,
  **437 tests passed across 27 files**, both builds. The four new server tests
  fail with the new `markDisconnected` rule disabled and pass with it restored.
  Docs: `GAME_SPEC.md` Amendments 5 (Week 4, which it lacked) and 6;
  scope changes for Week 4 (since moved to `EVIDENCE_004.md` W4-1, W4-2);
  `Plan.md` §2B.10, §8, §13; README;
  `EVALS.md` S8; new `docs/AI_EVALS.md`; architecture, implementation-order
  and test-recipe modules.
- **Not verified:** the button has not been clicked through in a browser.
- **Next decision:** a manual check of Leave game in two browser profiles,
  then the live AI run recorded in `docs/AI_EVALS.md`.

## 009 — Week 4 audit of instructions and specs, and the fixes (Claude Code, 2026-09-30)

- **Phase:** Week 4, documentation alignment. No application code changed.
- **Reason:** the owner asked for an audit of the instructions and specs against
  the Week 4 code, then for every suggestion to be applied, with Week 4
  evidence in its own file and module 12 pointing to the code.
- **Expected:** no document tells an agent to build something the code no
  longer does; one Week 4 evidence file; the AI usage-limit gap written down
  as a decision for the owner, not built.
- **Actual (verified in-session):**
  - Module 12 no longer copies the schemas: it maps `src/contracts`, and keeps
    the event map (now with quick-play, play-ai, hint) and the error registry.
    `AI_LIMIT` was checked in the gateway: it means every model on both
    providers is out of quota; the doc said "every Gemini model".
  - New `docs/EVIDENCE_004.md`; Week 4 scope changes moved there from
    `EVIDENCE_003.md`. Entry 007 above added from the Week 4 session summary.
  - `Plan.md`: §2B.4 claim corrected; §2B.11 AI usage limit proposed with
    per-game costs and figures; §4 matchmaking; §9 structure; §14; §21 Week 4
    done criteria. `GAME_SPEC.md` §3, §6, §8, §10 annotated for Week 4.
  - Rule 2 in `CLAUDE.md`, `AGENTS.md` and the guardrails now covers the AI
    seat; the reading order includes §2B; module 10 has a Week 4 section.
  - Modules 02, 03, 04, 05 (new AI boundary section), 06, 07 (prompt
    playbook), 08, 09, 11, 13 updated.
  - `npm run verify` after the docs pass: **437 tests passed across 27 files**,
    typecheck, lint and build clean.
- **Not done:** the AI usage limit (§2B.11) awaits the owner's decision; the
  module 12 event map is not yet checked against `CLIENT_EVENTS` by a test.
- **Next decision:** the owner decides §2B.11; then the live AI run (W4-7).

## 010 — AI usage limit per visitor and per day (Claude Code, 2026-09-30)

- **Phase:** Week 4, W4-3.
- **Reason:** the owner accepted `Plan.md` §2B.11 as proposed.
- **Expected:** a script that loops play-AI → disconnect stops at the
  per-visitor limit; hints are charged only when the AI is asked; once the
  daily budget is spent, new AI games and hints answer `AI_LIMIT` but the
  checker still runs; no new error code, event or dependency.
- **Actual (verified in-session):**
  - New `src/server/usage-limits.ts`; the room store checks and charges it in
    `createAiRoom` and `requestHint`, and counts every AI call through a thin
    wrapper around the AI service. The socket layer passes the visitor's
    address, read from the transport. Four new settings in
    `serverConfigSchema`.
  - `x-forwarded-for` is trusted only for `TRUST_PROXY_HOPS` hops (default 0);
    the server warns at startup in production when it is 0.
  - `RATE_LIMITED` text changed from "slow down" to "try again later" in both
    languages, since it now also covers the hourly limit.
  - New tests: `tests/unit/usage-limits.test.ts`,
    `tests/integration/ai-limits.test.ts`; `tests/unit/config.test.ts`
    extended with the new fields (no assertion removed). With the limits
    disabled in the store, all 5 integration cases failed; restored.
  - `npm run verify`: **456 tests passed across 29 files**, typecheck, lint
    and build clean.
- **Not done:** the right `TRUST_PROXY_HOPS` for Render is unknown; it is part
  of W4-9.
- **Next decision:** the live AI run (W4-7).

## 011 — Letters from the whole alphabet (Claude Code, 2026-09-30)

- **Phase:** Week 4, after W4-3; the first feature through the full Spec Kit
  flow (`specs/009-full-alphabet-letters`).
- **Reason:** the owner asked for any letter of the Serbian alphabet in a
  Serbian game and any English letter in an English game, and decided the
  open questions the same day (`Plan.md` §2B.13): the opener's language
  decides; Serbian Latin with Lj, Nj, Dž; digraphs strict in Serbian rooms.
- **Expected:** letters drawn from 30 or 26; the digraph rule applied
  everywhere the letter is checked; the opener's language wins in all three
  modes; no new event, error code or dependency.
- **Actual (verified in-session):**
  - Baseline `npm run verify` before the change: 458 tests, 29 files (the
    tree included an uncommitted bot-finish change).
  - Contracts: two alphabets replace `SUPPORTED_LETTERS`; `language` required
    on the three room-opening requests. Domain: `startsWithLetter` takes the
    alphabet. Room store: `alphabet` on the room, round and queue entry. AI:
    service methods take the alphabet; `bot-answers.v2` and `hint.v3`
    replace v1/v2. Client sends its interface language; the letter keeps its
    case on screen.
  - New `tests/integration/alphabet.test.ts`; new cases in the validate,
    scoring, contracts, selector and AI-feature unit tests. Existing tests
    gained `language: "sr"` / the `"sr"` alphabet argument; no assertion was
    removed, and two fake-AI assertions now also check the alphabet.
  - Mutation checks: disabling the digraph rule failed 3 tests; disabling the
    English-name hint rule failed 2; opening a random match with the arriving
    player's language failed 2. All restored.
  - `npm run verify`: **490 tests passed across 30 files**, typecheck, lint
    and build clean.
- **Not done:** no live AI run (no key in the session), so whether the models
  honour the digraph rule and find terms for Q, X, Đ, Nj … is untested. Not
  clicked through in a browser.
- **Next decision:** the live AI run (W4-7), now including an English W sheet.

## 012 — W05 post-round coach specification (Codex, 2026-10-07)

- **Owner request:** start the specification for the accepted post-round coach
  using Spec Kit; cover the complete assignment and required artifacts; create
  a local branch from Anja's main, no push, final local commit later.
- **Method/context:** local `speckit-specify` instructions, spec/checklist
  templates, constitution, project guardrails, supplied W05 assignment and
  reliability addendum; read existing result/lifecycle/provider/usage/client
  consumers before writing the feature specification.
- **Git:** fetched `origin/main`, confirmed no divergence and created local
  `010-post-round-coach` from
  `4dea3b59e35c5dc89a09776cea43bb5e8487ad5e`; removed upstream tracking.
  Initial sandbox fetch could not connect; the approved retry succeeded.
- **Decision:** one completed round, own structured evidence only, one
  deterministic `analyze_round` tool and two model steps. Controlled
  recommendations/fact rendering, exact captured final-result source, strict
  run-wide attempt/deadline guard, duplicate reuse and separate coach limits.
  Record shared W04 logical-call accounting as a limitation rather than
  silently rewriting its semantics.
- **Artifacts:** canonical `specs/010-post-round-coach/spec.md`, quality and
  assignment-coverage checklists, consumer/before-after impact review, all
  six assignment doc paths, feature pointer and Plan/agent-entry updates.
- **Actual runtime usage in this pass:** agent runs **0**, provider/model
  calls **0**, retries **0**, fallback calls **0**, tool executions **0**.
  Assistant-assisted document authoring is recorded here separately from
  application-provider usage; assistant token usage is unavailable.
- **Verification scope:** document consistency/link/coverage checks and git
  whitespace checks only. Runtime implementation/tests, W04 live readiness,
  W05 live demo and human pair contributions remain pending; see
  `docs/EVIDENCE_W05.md` for actual check results.
- **Next phase:** owner spec review, `/speckit-plan`, tasks and approval before
  runtime contract/permission/usage work. No commit, push, PR or deployment
  in this specification pass.

## 013 — W05 post-round coach implementation (Codex, 2026-10-07)

- **Authorization/scope:** User explicitly authorized implementation of the previously approved two-decision, one-read-only-tool design. Root consistency review passed. No added model step, tool, history, game write, or external deployment action.
- **Implementation:** Added strict shared schemas, exact canonical own-round snapshots, deterministic `analyze_round`, guarded real provider adapter calls, per-attempt quota charging, sanitized telemetry, private terminal ack, cancellation/cache lifecycle and Serbian/English evidence rendering. Existing W04 behavior remains under regression verification.
- **Actual provider usage:** Live provider calls **0**; retries **0**; live fallback calls **0**. No `.env`; credential-presence check found neither provider key variable. No secret values were read or logged. `npm.cmd run coach:smoke` was not opted into; it reported not run.
- **Fake evidence:** `npm.cmd run coach:fake-e2e` exercised the real engine/tool/validators with scripted model/transport. Observed success: 2 decisions/1 tool/2 adapter calls; unknown-tool: 1/0/1; provider-failure and deadline: 1/0/1. These are scripted fake-provider runs and fake usage values, not live provider billing evidence. Sanitized outputs are under `docs/runs/w05/`.
- **Verification:** `npm.cmd run typecheck` passed. Focused coach unit/integration run passed 147 tests across 13 files. Full current `npm.cmd run verify` is pending. Browser QA is unavailable in this environment (`apps:[]`, `browsers:[]`; documented IAB tab creation reports browser unavailable). Pair participation has not been recorded.
- **Token accounting:** Provider token usage for live calls is not applicable (no live calls); assistant token usage is unavailable.
- **Outstanding:** full regression suite, live opt-in run when credentials are supplied, interactive browser/accessibility review in an available browser, actual pair contribution/explanation, and the agreed final local commit. See `docs/EVIDENCE_W05.md` and `specs/010-post-round-coach/review-log.md`.

## 014 — W05 final automated verification (Codex, 2026-10-07)

- **Result:** Root ran final `npm.cmd run verify`; exit 0. Typecheck and lint passed; Vitest passed **555 tests across 40 files** (7.01 s); Vite client build succeeded (90 modules, 1.74 s); tsup server build succeeded (142.09 KB, 286 ms). `git diff --check` and the documentation/link/C-map check also passed.
- **Initial lint correction:** The first final-verification attempt found three unused imports and two explicit `any` values in test-only HTTP payload captures. Those imports were removed and payload schemas/types were added; no lint rule or test assertion was weakened. The complete rerun passed.
- **Provider usage:** No W05 live provider calls, retries or fallbacks. Both smoke readiness paths exited 0 with no configured credentials and made no calls. Fake-provider usage values remain scripted test data only; no real token or billing usage is claimed. Assistant token usage is unavailable.
- **Remaining evidence:** Interactive browser QA remains unavailable in this environment; live provider demo and pair contribution/explanation remain pending. No commit, push, PR or deployment has occurred in this phase.
