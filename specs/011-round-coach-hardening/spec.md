# Feature Specification: Round coach hardening (W08)

**Feature Branch**: `feature/w08-hardening` (from `main` at `9b12bc1`)

**Created**: 2026-10-28

**Status**: Built 2026-10-28; verified by automated tests (see [tasks](tasks.md)).

**Design of record**: `Plan.md` §2D. The round coach itself (steps, tools, report) stays owned by [spec 010](../010-round-coach-agent/spec.md) and is not changed.

**Input**: the owner asked to bring the W08 "Secure the Arcade" work to `main`. That work was built on `011-secure-the-arcade` against a different coach; this feature ports the controls `main` lacked onto the round coach.

## User Scenarios & Testing

### User Story 1 — A legitimate player still gets coached (P1)

1. **Given** a finished round, **When** the player asks the coach, **Then** it completes exactly as in spec 010.
2. **Given** the production build served with the real headers, **When** the player plays and asks the coach, **Then** the game and coach work with zero CSP violations.

### User Story 2 — A hostile client cannot overload or widen the coach (P1)

1. **Given** a Socket.IO message over 16 KiB, **Then** the transport closes the connection before decoding it and no AI work starts; a message just under the cap gets the normal schema answer.
2. **Given** a coach request carrying `role`, `maxSteps`, `ownerId`, `provider` or `model`, **Then** each is refused on its own and the next legitimate request runs under unchanged server policy.
3. **Given** two coach runs already active in the process, **When** a third starts, **Then** it is refused as `RATE_LIMITED` before any AI call and before the visitor allowance is charged; completion or cancellation frees the slot.
4. **Given** a socket from another browser origin, **Then** the handshake is refused.

### User Story 3 — Hostile text stays inert in the browser (P1)

1. **Given** an opponent name and the player's own answers carrying markup or a `javascript:` URL, **When** they are shown in the waiting room, the results and the coach panel, **Then** they render as text, with no handler attributes or injected elements in the DOM.
2. **Given** an injected inline script and a script from another local origin, **Then** the CSP blocks both by `script-src`; without the headers the same build would run them.

### User Story 4 — Refusals are recorded without content (P2)

1. **Given** any refused coach request or finished run, **Then** exactly one JSON line is written, from a closed field set.
2. **Given** a forged newline in a request field, **Then** no extra or fake event line is produced, and no name, answer or request text appears in the log.

## Requirements

- **FR-001** The Socket.IO server MUST refuse client messages over `MAX_SOCKET_MESSAGE_BYTES` (16 KiB) before decoding.
- **FR-002** At most `RUN_LIMITS.maxConcurrentRuns` (2) coach runs MAY be active per process; the check MUST run before the visitor is charged, and the slot MUST be freed when the run settles, including on cancel.
- **FR-003** Every HTTP response MUST carry the CSP in `Plan.md` §2D, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. The CSP MUST NOT allow inline script, `eval`, wildcards, plugins or framing.
- **FR-004** The theme script MUST be a same-origin file, not inline.
- **FR-005** Each refused `round:coach` request and each finished run MUST produce one event line whose every field is an enum, a bounded count, a server timestamp or a server UUID; a line that fails the schema MUST be dropped.
- **FR-006** No new socket event, error code, runtime dependency or service. The concurrency refusal uses the existing `RATE_LIMITED`.

## Out of scope

Everything in spec 010; the `011-secure-the-arcade` branch and its post-round coach; multi-process limits; accounts; dependency upgrades.
