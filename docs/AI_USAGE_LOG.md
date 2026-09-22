# AI_USAGE_LOG

One row per meaningful AI call. Phase, reason, expected result, actual result,
next decision. No private chain-of-thought, no secrets, no tokens, no private
URLs, no in-round answer payloads.

Budget: 10–15 meaningful coding-agent iterations across Weeks 3–4.
Used so far: **3**.

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
