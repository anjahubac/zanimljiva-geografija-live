---
description: "TypeScript, React, schema, event, time, answer-normalization, and error conventions."
applyTo: "**/*"
---

# Conventions Instructions

## TypeScript and modules

- Use strict TypeScript and ESM on Node.js 20+.
- Use explicit types at external boundaries and narrow `unknown` with shared runtime schemas.
- Prefer named exports and small modules with one clear responsibility.
- Match the established formatter and linter once configured.
- Do not use `any` to bypass a socket, environment, or answer boundary.
- Do not add a dependency when a short, tested local function safely solves the scoped problem.

## Naming and placement

- Types, schemas, React components, and screens: `PascalCase`.
- Functions, variables, hooks, and event handlers: `camelCase`.
- Immutable policy constants: `SCREAMING_SNAKE_CASE`.
- Test files: `*.test.ts` or `*.test.tsx` next to the agreed test area.
- Pure gameplay logic belongs in `src/domain`.
- Request/event/public schemas belong in `src/contracts`.
- Room orchestration and transport belong in `src/server`.
- Screens and browser socket adapters belong in `src/client`.

## Runtime contracts

- Runtime schemas are the source for boundary types; infer types from them.
- Reject unknown or extra fields when they could imply unsupported authority, such as `score`, `letter`, `playerId`, `endsAt`, `valid`, or `phase` in a client mutation.
- Bound room codes, names, answer lengths, category enums, revisions, and arrays.
- Return structured errors with a stable code and safe user-facing message.
- Schema failure must not partially mutate room state.

## Socket event conventions

- Use namespaced lower-case event names such as `room:create`, `room:client-ready`, `round:draft`, and `round:finish`.
- Every round mutation includes `roundId`.
- Use acknowledgements for client mutations so the UI can distinguish accepted, rejected, and pending data.
- Do not rely on event arrival order alone; use a monotonically increasing per-category or per-draft revision.
- Do not broadcast an internal room object. Build a recipient-specific validated projection.

## Time conventions

- Send `serverNow`, `startsAt`, and `endsAt` as epoch milliseconds.
- Name duration values with their unit, such as `roundDurationMs`.
- The browser countdown is presentational. The server decides whether an event is early, current, or late.
- Inject clock access where timing affects behavior; avoid wall-clock sleeps in tests.

## Answer conventions

- Preserve the raw answer for post-round display only after reveal.
- Derive a normalized answer for comparison. Validity has two steps (`Plan.md` §2B.2): (1) the local rule — at least `MIN_ANSWER_LENGTH` (2) characters after normalization and starts with the round letter; (2) the AI checker's verdict, which must accept the term for its category, and whose recognised name must resemble what was written and start with the round letter (checked in code, never by the model). When the AI is unavailable, step 1 alone decides and the result carries `verified: false`. There is no dictionary.
- The baseline normalization pipeline is exactly: Unicode **NFKC**, trim, collapse internal whitespace, lowercase with `toLocaleLowerCase("sr-Latn")`. The single implementation lives in `src/domain/normalize-answer.ts`; never re-implement it inline. (`Plan.md` §7 holds the authoritative function body.)
- Blankness, format validity, AI validity, and equality are distinct concepts. Two AI-accepted answers are the same answer when the `compactFold` of their recognised Serbian names match, so `Serbia` equals `Srbija`; answers the AI did not judge compare by normalized text.
- Answers are accepted in Serbian or English in every game, whatever the interface language (`Plan.md` §2B.9).
- Never score raw strings before normalization and validity checks.
- The letter sets are fixed in `src/contracts/game.schemas.ts`: `SERBIAN_LETTERS` (30, with Lj, Nj, Dž) and `ENGLISH_LETTERS` (26). A room draws from the one its opener's language picks (`Plan.md` §2B.13). Every letter check goes through `startsWithLetter(text, letter, alphabet)`, which applies the Serbian digraph rule; never compare prefixes inline.

## React conventions

- Screens reflect server phase and public projections.
- Keep socket lifecycle and event parsing outside presentational components.
- Do not put canonical scoring or phase-transition logic in React components.
- Disable or mark locked fields immediately after an accepted finish acknowledgement.
- Display pending/saved/error state for draft synchronization without exposing protocol internals.
- Provide clear keyboard focus, labels, countdown status, and error messages.

## Errors and logging

- Client-visible errors contain a stable code and concise safe message.
- Server logs may include request ID, room code in a redacted form, phase, event name, and outcome.
- Never log answer values before reveal, resume tokens, credentials, environment contents, or full socket payloads.
- Unexpected server errors return a generic message and keep stack traces server-side.

## Documentation

Comments explain invariants, authority, privacy, or non-obvious race handling rather than restating code. Update `GAME_SPEC.md`, `Plan.md`, event documentation, tests, and evidence when behavior changes.
