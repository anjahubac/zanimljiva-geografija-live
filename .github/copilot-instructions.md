# Zanimljiva Geografija Live - AI Coding Instructions

## Purpose

This is the concise always-on baseline for coding agents. Use `.github/00-index.instructions.md` to load only the relevant detailed modules. Do not use this summary as a substitute for `docs/GAME_SPEC.md` or `Plan.md`.

## Always-on guardrails

- The server exclusively owns player identity, room membership, phase, letter, `startsAt`, `endsAt`, locked submissions, answer validity, and scores.
- Start only after two players are present and both game screens automatically acknowledge that they are loaded. Schedule one future start for both and send the same `roundId`, letter, categories, `startsAt`, and `endsAt` to each.
- Never expose or log an opponent's draft before canonical reveal.
- Store draft updates privately so timeout does not rely on a last-millisecond client message.
- A player's finish action is idempotent and permanently locks that player's round answers.
- Reveal and score exactly once, after both players finish or the server deadline expires.
- Traditional category scoring is: different valid answers 10/10; the same normalized valid answer 5/5; only one valid answer 10/0; neither valid 0/0.
- Keep normalization, validity decisions, and scoring pure and deterministic. Inject clock and letter selection into orchestration tests.
- Treat Socket.IO payloads and environment configuration as `unknown` until a shared runtime schema validates them.
- Every mutation carries the active `roundId`; reject stale, early, late, cross-room, malformed, or post-lock changes without mutating canonical state.
- Infer boundary types from shared schemas instead of maintaining parallel handwritten event types.
- Add or update a meaningful success case and rejection/edge case whenever behavior changes.
- Preserve the Week 3 baseline and use the same pre-written evals before and after one controlled change.
- Do not add accounts, a database, matchmaking, chat, spectators, a leaderboard, AI functionality, or another service unless the user explicitly expands scope.
- Never commit secrets, `.env` files, private resume tokens, hidden answers, or raw sensitive payloads.
- Do not push, deploy, open a pull request, or mutate an external service unless the user explicitly requests that operation.
- Follow the build sequence in module 10 one step at a time. Finish a step, run its exit command, and report the real output before starting the next.
- Use only the dependencies and versions in module 11. Adding a package, a framework, or a styling library is a scope change; stop and ask.
- Define a boundary shape once, in `src/contracts`, and infer its type. Never hand-write a second interface for the same payload and never cast an unparsed payload.
- Return only the error codes in module 12's registry; every rejection leaves canonical state unchanged.
- Never call `vi.useFakeTimers()` in a test that uses real Socket.IO clients. Inject `Clock` and `Scheduler` instead (module 13).
- Never make a suite green by deleting, skipping, or weakening a test, or by lowering a coverage threshold.
- Never state that a command passed unless it ran in this session and you saw the output.

## Minimum done criteria

Touched code typechecks and builds, relevant tests pass, runtime contracts and documentation match behavior, hidden-answer privacy is preserved, and the handoff reports actual verification plus known limitations. Local completion never implies a remote push or deployment.

## Detailed modules

- Index: `.github/00-index.instructions.md`
- Architecture: `.github/instructions/01-architecture.instructions.md`
- Conventions: `.github/instructions/02-conventions.instructions.md`
- Testing: `.github/instructions/03-testing.instructions.md`
- Workflow: `.github/instructions/04-workflow.instructions.md`
- Security: `.github/instructions/05-security.instructions.md`
- Build and commands: `.github/instructions/06-build-and-commands.instructions.md`
- Common tasks: `.github/instructions/07-common-tasks.instructions.md`
- Code review: `.github/instructions/08-code-review.instructions.md`
- External services: `.github/instructions/09-external-services.instructions.md`
- Implementation order: `.github/instructions/10-implementation-order.instructions.md`
- Stack and scaffold: `.github/instructions/11-stack-and-scaffold.instructions.md`
- Contracts and errors: `.github/instructions/12-contracts-and-errors.instructions.md`
- Test recipes: `.github/instructions/13-test-recipes.instructions.md`
