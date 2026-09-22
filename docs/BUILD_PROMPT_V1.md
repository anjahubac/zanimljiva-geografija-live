# BUILD_PROMPT_V1

The first major implementation prompt for the coding agent. Written before any
gameplay code existed. Later revisions live in `BUILD_PROMPT_FINAL.md`; this
file is not edited retroactively.

---

## Prompt

**Before you write any code, do these four things and stop for confirmation:**

1. Summarize, in your own words, what you understand the task to be.
2. Give a short numbered plan of the files you will create or change.
3. List every ambiguity you found and the assumption you intend to make for it.
4. State explicitly that you will not expand scope beyond what is listed below.

### Role

You are implementing one step of a two-player real-time browser game. You are
not designing the product: every product decision is already locked in
`docs/GAME_SPEC.md` and `Plan.md`.

### Goal

Implement **Step N** of
`.github/instructions/10-implementation-order.instructions.md`, and nothing else.

### Context you must read first

- `docs/GAME_SPEC.md` — authoritative behavior
- `Plan.md` §§ 2A, 4, 5, 6, 7, 8, 12, 21 — locked scope, rules, state machine
- `.github/copilot-instructions.md` — always-on guardrails
- `.github/instructions/10-implementation-order.instructions.md` — your driver
- `.github/instructions/12-contracts-and-errors.instructions.md` — schemas, error codes
- `.github/instructions/13-test-recipes.instructions.md` — test patterns

Do not read or copy from any other project, sample repository, or previous chat.

### Expected output

- The files listed for that step, and their tests.
- The real output of the step's exit command.
- A short report: what changed, what you verified, what you assumed, what is
  still missing.

### Forbidden scope

Do not add: a dependency not listed in module 11, a database, authentication,
a second service, chat, matchmaking, spectators, a third player, replay,
reconnect/resume, a geography dictionary, semantic answer checking, AI features,
a styling framework, or a state-management library. Do not implement anything
marked **Stretch** in `Plan.md`. Do not refactor code outside the step.

### Gameplay rules you must preserve

1. The server alone decides identity, phase, letter, timestamps, validity, points.
2. A round is scheduled only after both clients send `room:client-ready`, and
   both receive identical round metadata.
3. Opponent answers are absent from every payload before the canonical reveal.
4. Reveal and scoring happen exactly once, via one idempotent `closeRound`.
5. A rejected event leaves canonical state unchanged.

### Allowed edit areas

Only the files named in the step. `Plan.md`, `docs/GAME_SPEC.md` and the
`.github/` instruction files are read-only for you; if one of them is wrong,
stop and report it instead of editing it.

### Definition of Done for the step

- Behavior matches `GAME_SPEC.md`; nothing extra was added.
- Boundary data was parsed with a schema from `src/contracts`, never cast.
- A success test **and** a rejection/edge test were added.
- `npm run verify` passed, and you pasted the actual output.
- No secret, token, `.env` or pre-reveal answer appears in source, logs or docs.

### Checks and honesty rules

- Never state a command passed unless you ran it and saw the output.
- Never make a suite green by skipping, deleting or weakening a test, or by
  lowering a coverage threshold.
- If the same failure survives three attempts, stop and report: goal, expected,
  actual, what you checked, and one precise question.
