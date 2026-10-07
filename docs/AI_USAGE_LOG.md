# AI_USAGE_LOG

One row per meaningful AI call. Phase, reason, expected result, actual result,
next decision. No private chain-of-thought, no secrets, no tokens, no private
URLs, no in-round answer payloads.

Budget: 10–15 meaningful coding-agent iterations across Weeks 3–4.
Used so far: **18 logged** (001–018; corrected 2026-10-07, the line said 9). The Week 3 sessions for Steps 9–10 have no entries
here; their results are recorded in `EVIDENCE_003.md` §2–§3 and the `EVALS.md`
run log. Entry 007 was written afterwards, from the owner's summary of that
session, not during it.

Week 5 (W05 §44): at most **15 live agent runs** in development and **3** in
the demo. From W5-11 on, each entry keeps agent runs, model calls, retries and
tool calls apart; the run logs themselves go in `docs/EVIDENCE_005.md` §4.
Live agent runs used: **6** (entry 015).

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

## 012 — Week 5 planning: a bounded agentic feature (Claude Code, 2026-10-07)

- **Phase:** before Week 5; planning only, no application code.
- **Reason:** the owner shared the W05 assignment ("Bounded Agentic Feature")
  and asked for an implementation plan that fits the current state of the
  repository, appended to `Plan.md` without rewriting anything in it.
- **Expected:** a status check of Week 4, one recommended agentic scenario
  that the game's data can support, tool contracts, limits, stop rules, evals
  and a step order, with every scope change left as an open decision.
- **Actual (verified in-session):**
  - `npm ci && npm run verify` on `4dea3b5`: typecheck, lint and build clean,
    **490 tests passed across 30 files**, matching `Plan.md` §2B.6 step 11.
  - Read `CLAUDE.md`, `.github/` modules 00 and 10, `Plan.md` §1, §2, §2B, §4
    and §19–§22, `docs/EVIDENCE_004.md`, `docs/AI_EVALS.md`, `specs/README.md`,
    the constitution, and the AI layer (`src/server/ai/*`, `features/*`,
    `ai-output.schemas.ts`, the room store's hint and close paths, the fakes).
  - Added `Plan.md` §2C (proposed, not approved) and one status bullet in §1;
    `git diff --numstat` shows 389 lines added and 0 removed.
- **Not done:** no spec, contract or code for the feature; no live AI call.
  The out-of-date statements found (§2B's header, §1's date, this file's
  header count) are listed in §2C.1, not corrected.
- **Next decision:** the owner answers §2C.15; then W5-0 (W4-7 with keys) and
  W5-1 (`/speckit-specify` for `specs/010-round-coach-agent`).

## 013 — Week 5 decisions recorded; Spec Kit feature 010 through tasks (Claude Code, 2026-10-07)

- **Phase:** Week 5, W5-1 to W5-3 (documents only).
- **Reason:** the owner said "Go with suggested changes, add them to Plan and
  all the docs, don't start implementation yet", and asked to see the Spec Kit
  instructions.
- **Expected:** the decisions in `Plan.md`, added without rewriting anything
  there; `specs/010-round-coach-agent` through `/speckit-tasks` and a
  read-only `/speckit-analyze`; the W05 documents; agent instructions pointing
  at Week 5; no source change.
- **Actual (verified in-session):**
  - `Plan.md`: §2C.16 (decisions, O1/O6 placement, two spec refinements) and
    dated correction lines under §1's date, §1's Week 5 bullet, §2B's status
    and §2C's status. `git diff` shows lines added and none removed.
  - Spec Kit: `/speckit-specify` (spec and quality checklist; all items pass;
    `/speckit-clarify` skipped because the owner had decided every open
    question), `/speckit-plan` (plan, research R1–R17, data model, three
    contracts, quickstart; the optional agent-context hook replaced by a hand
    edit of `CLAUDE.md`, which keeps its wording), `/speckit-tasks` (62 tasks,
    10 phases, an exit command per phase), `/speckit-analyze` (read-only; 0
    critical, 2 high, 1 medium, 10 low; nothing fixed yet, awaiting the owner).
  - New: `docs/AGENT_FLOW.md`, `docs/AGENT_EVALS.md` (C1–C18 and L1–L3,
    expected results before code), `docs/EVIDENCE_005.md` (skeleton; only the
    baseline and the decisions observed). Changed: `docs/GAME_SPEC.md`
    Amendment 8 (approved, not built), `README.md`, `specs/README.md`,
    `CLAUDE.md` and `AGENTS.md` (identical), `.github/copilot-instructions.md`,
    the index, and a Week 5 section in module 10.
  - `npm run verify` after the change: **490 tests passed across 30 files**,
    typecheck, lint and build clean — unchanged, as expected for a
    documentation-only change. `git status` shows no file under `src/` or
    `tests/`.
- **Not done:** no source code, no test code, no live AI call. Pushing was
  refused by the session's permission check in the previous turn.
- **Next decision:** the owner approves the analyze remediation; then
  implementation from W5-4 when asked; W4-7 with keys before W5-11.

## 014 — `/speckit-analyze` findings applied to feature 010 (Claude Code, 2026-10-07)

- **Phase:** Week 5, still documents only (before W5-4).
- **Reason:** the owner answered "Apply" to the 13 findings of the read-only
  `/speckit-analyze` pass in entry 013.
- **Expected:** every finding fixed in the documents; `Plan.md` gains lines
  only; no expected result written earlier is changed; no source change.
- **Actual (verified in-session):**
  - I1: `round:coach` checks the round before the phase, so a request during
    `judging` is `WRONG_PHASE`, as C3 expects (`contracts/coach-socket.md`,
    `data-model.md`).
  - G1: eval C19, malformed model output (a W05 §32 row), added to
    `docs/AGENT_EVALS.md` as task T030; later tasks renumbered (63 tasks, all
    well-formed and sequential) and the references in `docs/AGENT_FLOW.md` and
    `docs/EVIDENCE_005.md` remapped. The Core gate is now C1–C16 and C19.
  - U1, L1–L5: C3, C5, C13, C14 and C17 (and their tasks) gained the cases for
    a final on step 1, a known tool the step does not offer, the exact step-input
    keys, a 281-character summary, refused requests costing nothing, the
    report's answer and reason, and the referee's daily-budget count.
  - L6, L10: FR-023 names 30 seconds; FR-017 points to FR-015's limits.
  - L7–L9: dated notes in `Plan.md` §2C.7, §2C.9 and §2C.16 (17 lines added, 0
    removed).
  - `npm run verify` after the fixes: **490 tests passed across 30 files**,
    typecheck, lint and build clean; no file under `src/` or `tests/` changed.
- **Not done:** no code; no push (the session's permission check refused it
  earlier, and it is not retried).
- **Next decision:** implementation from W5-4 when the owner asks; W4-7 with
  keys before W5-11.

## 015 — Week 5 round coach built, W5-0 → W5-11 (Claude Code, 2026-10-07)

- **Phase:** Week 5 implementation, at the owner's request ("Implement the
  Week 5 changes described in Plan.md §2C"), on `feature/round-coach`.
- **Reason:** build the approved round coach step by step (module 10's Week 5
  table), tests first, with each step's exit command run and committed.
- **Expected:** Core (W5-4 → W5-10) passing C1–C16 and C19 on fakes; then O1
  and O6 (C17, C18); the four mutation checks failing their evals; W4-7 and at
  most 3 live coaching runs per provider.
- **Actual (verified in-session):**
  - W5-0: `npm run verify` 490 tests / 30 files; W4-7 `smoke:ai` once per
    provider, 5 requests each, checker 16/16 on both (`docs/AI_EVALS.md`).
  - W5-4 → W5-10b: one commit per step; final `npm run verify` 629 tests / 34
    files, typecheck, lint and build clean. Exit outputs: `docs/EVIDENCE_005.md` §4.
  - Mutation checks 4/4 caught (`docs/EVIDENCE_005.md` §3).
  - One conflict stopped the work and went to the owner: with O1 built, C2's
    "step 2 offers only final" contradicted FR-016. The owner chose FR-016; a
    dated note sits under C2 and its expected text is unchanged.
  - W5-11 live: **6 agent runs** (3 Gemini, 3 Groq), **15 model steps**,
    **20 provider attempts** (1 rate-limited attempt then a fallback; no other
    retry), **9 tool calls** (5 `check_candidates`, 4 `verify_terms`; the
    referee's 5 provider attempts are part of the 20). Gemini 3/3
    completed; Groq 0/3 completed (2 refused arguments, 1 refused final).
  - The 10 W4-7 requests (2 × 5) are model calls outside the agent and are not
    counted above.
- **Findings:** the referee accepted an invented word ("Ljlama"); Groq's agent
  often sends arguments the tool refuses, and the content-free run log does
  not say which.
- **Not done:** W5-12's demo rehearsal (≤ 3 live runs) and the contributions
  table; W4-8 and W4-9; no push, deploy or pull request.
- **Next decision:** the owner reviews the diff on `feature/round-coach`.

## 016 — Round coach: suggestions in the player's language, `coach-step.v2` (Claude Code, 2026-10-07)

- **Phase:** Week 5, after W5-11.
- **Reason:** the owner saw the coach suggest "Euphrates" for river to a
  Serbian player; the Serbian name is "Eufrat".
- **Cause:** `coach-step.v1` set the summary's language but not the terms'.
  The game accepts answers in either language, so the letter rule and the
  referee both passed the English name.
- **Expected:** a new prompt version that asks for each term in the player's
  interface language, with the other language only when that name misses the
  round letter; no change to contracts, checks or limits.
- **Actual (verified in-session):** prompt test written first and seen failing;
  `coach-step.v2` replaces v1; prompt, loop and wire tests pass; `npm run
  verify` green (see `docs/EVIDENCE_005.md` §4).
- **Not done:** no live run of v2 (the earlier 6 runs used v1, at letter Lj,
  where the two languages mostly agree). Code cannot enforce the language.
- **Next decision:** whether to spend live runs on a letter where the names
  differ (for example E: Eufrat / Euphrates).

## 017 — Round coach: only valid and checked answers (Claude Code, 2026-10-07)

- **Phase:** Week 5, after W5-11, from the owner's own browser test.
- **Reason:** the report's model-written summary named "Rosno more" for sea,
  which the checks had not backed, and a suggestion read "Rtnj" (Rtanj),
  because the referee tolerates typos and the coach showed the model's
  spelling. The owner: "we need to give people only valid and checked
  answers"; decisions recorded in `Plan.md` §2C.16 before code.
- **Expected:** only referee-accepted words shown, in the referee's spelling;
  the game always asks the referee before a report; the summary written by the
  game; no new event, error code, stop reason or tool; Week 4 checker output
  unchanged.
- **Actual (verified in-session):** tests first (red), then `coach-step.v3`,
  the game's own referee check in `runCoach`, named verdicts on an opt-in path
  of `runCheck` (the seven Week 4 checker assertions unchanged), `summary`
  removed from the report, the panel's own summary sentence and "Nema
  proverenog predloga." While doing it a real bug surfaced: a provider failure
  was labelled `call_budget` whenever the run's attempts happened to be spent;
  now only when the run's budget actually narrowed the call. 637 tests pass;
  mutation checks re-run, 4/4 caught. Eval amendments are dated notes in
  `docs/AGENT_EVALS.md`; no expected text was rewritten.
- **Not done:** no live run of v3.
- **Next decision:** live runs on a letter where Serbian and English differ.

## 018 — Round coach: a suggestion for every category it can fill (Claude Code, 2026-10-07)

- **Phase:** Week 5, after entry 017, from the owner's browser test.
- **Reason:** the owner got suggestions for only 4 categories and asked for an
  answer in every category "if there is one". Four causes in the code: one
  word per category (8 per check), no second chance after a referee
  rejection, a final allowed to leave a category empty, and a failed final
  check dropping every unchecked word. Options put to the owner; chosen:
  backup word + repair (`Plan.md` §2C.16, last entry), before code.
- **Expected:** up to 16 candidates per check; a backup word in the same
  referee call; gaps the final left filled by the game; one repair step after
  a completed run, 1 model and 1 referee attempt; maxima 4 steps, 3 tool
  calls, 7 attempts, 35 s; client ack 45 s; no new event, error code, stop
  reason or tool; the failure evals unchanged.
- **Actual (verified in-session):** tests first (red), then `coach-step.v4`
  and the loop changes. C1, C17, C18 and the run-log test needed the repair
  scripted; amended with dated notes, expected text left as written. 654
  tests pass; 4 new mutation checks, 4/4 caught.
- **Judgement call:** the repair runs only after a completed run, because
  C4–C13, C16 and C19 pin tool calls and status after a refusal.
- **Not done:** no live run of v4.
