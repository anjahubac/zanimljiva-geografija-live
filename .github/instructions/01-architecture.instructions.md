---
description: "Project layers, dependency direction, real-time room lifecycle, projections, and server authority."
applyTo: "**/*"
---

# Architecture Instructions

## Target system shape

Use one TypeScript repository and one production Node.js process:

```text
src/domain       pure normalization, validation decisions, scoring, totals
src/contracts    shared Zod schemas and inferred event/public types
src/server       authoritative rooms, Socket.IO transport, clock, letter picker
src/client       React/Vite screens, local form state, socket adapter
tests            unit, integration, helpers, and fixtures
docs             game spec, prompt, context, eval, evidence, and AI log
```

The production Node process serves the built SPA and owns the Socket.IO endpoint on the same origin. Rooms are temporary and in memory. One instance is supported for Week 3.

## Dependency direction

```text
client --------> contracts
server --------> contracts
server orchestration --------> domain
Socket.IO handlers ----------> server orchestration
```

- `domain` must not import React, Socket.IO, HTTP, filesystem, process, ambient time, or ambient randomness.
- `contracts` must not depend on React components or Socket.IO socket objects.
- `client` must not import server implementation files.
- Transport handlers validate and delegate; they do not contain scoring rules.
- React components render server projections; they do not create canonical room state or scores.

## Layer ownership

### `src/domain`

Own answer normalization, answer content checks against explicit inputs, per-category scoring, and total calculation. Functions must be deterministic and return values rather than mutating shared room objects.

### `src/contracts`

Own runtime schemas for configuration, room codes, display names, categories, round identifiers, draft updates, finish actions, public projections, reveal data, results, and safe errors. Infer TypeScript types from these schemas and reuse them on both sides of the socket boundary.

### `src/server`

Own room creation/joining, exactly-two-player membership, socket identity, private resume tokens, automatic client-ready acknowledgements, authoritative timestamps, supported-letter selection, private drafts, revision checks, finish locks, deadline scheduling, validation orchestration, reveal, scoring, cleanup, health checks, and static asset serving.

### `src/client`

Own lobby/join forms, synchronization/countdown/answering/waiting/reveal/results screens, accessible form interaction, local draft display, debounced updates, acknowledgement status, server-time countdown display, safe errors, and connection status. The client may predict presentation but never canonical outcomes.

## Internal state and public projections

Internal server room state may contain both players' drafts and private resume tokens. Never serialize that object directly to a client.

Create an explicit projection per recipient:

- Lobby projection: room code, public player names, loaded/connected status.
- Active projection: public round metadata, caller's accepted draft state when needed, opponent finished/connected status only.
- Reveal projection: both locked answers after the server closes the round.
- Result projection: validation reasons, category points, and totals.

A new field is private by default until a schema and test explicitly prove it is safe to reveal.

## Required lifecycle

```text
waiting_for_player -> synchronizing -> countdown -> answering -> results -> closed
```

There is exactly one round per room in Core. `results` never returns to
`countdown`; replaying is Stretch. `connected`, `clientReady` and `finished`
are per-player flags, not phases.

- Enter `COUNTDOWN` only when exactly two players are present and both loaded game clients have acknowledged the current room screen.
- Choose the letter and timestamps in the same server transition.
- Set `startsAt` slightly in the future so both clients can render before play begins.
- Accept draft updates only during the active round window and before that player is locked.
- Both-finished and deadline callbacks invoke the same idempotent close operation.
- Mark the round closed before emitting, validating, or scoring so re-entrant paths cannot close it twice.

## Time and randomness

The server is authoritative for time. Use epoch milliseconds at contracts and inject a clock into room orchestration tests. The client displays `endsAt - estimatedServerNow`, but a local zero does not close the round.

Choose letters through an injected selector from the configured supported-letter allowlist. Tests use a fixed selector. Do not use uncontrolled `Math.random()` in domain or integration tests.

## Architectural change rules

- Update `docs/GAME_SPEC.md`, `Plan.md`, shared schemas, all consumers, and tests together when public behavior changes.
- Record a significant deviation or new service in `DECISIONS.md` if that file exists; otherwise add a decision section to `Plan.md` before implementation.
- A database, second service, queue, Redis, authentication provider, or horizontal scaling is an explicit scope change, not an incidental refactor.
- Preserve the single-service topology for the deadline unless evidence proves it cannot meet the accepted game flow.
