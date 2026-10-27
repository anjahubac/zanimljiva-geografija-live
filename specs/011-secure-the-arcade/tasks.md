# Tasks: Secure the Arcade

**Input**: [spec.md](spec.md), [plan.md](plan.md). Order: spec → plan → tasks → tests → implementation → evidence.

## Phase 1 — Checkpoint and threat model

- [X] W001 Record checkpoint `67aa13e` on `010-post-round-coach`; baseline `npm run verify`: typecheck/lint clean, 555 tests / 40 files, both builds.
- [X] W002 Map the coach path, its data and every consumer; write the threat model and data inventory in `docs/EVIDENCE_W08.md`.
- [X] W003 Write `scripts/w08-before-after.ts` and run it on the untouched checkpoint (`docs/runs/w08/before-after-before.json`).

## Phase 2 — Tests for existing and missing boundaries

- [X] W004 `tests/security/w08-boundary.test.ts`: T00, T01, T02, T03/T08 scope, T13, T15, cross-origin, T16 headers.
- [X] W005 `tests/security/w08-agent.test.ts`: T06, T07, T08, T09, T10, T11, T12, T17.
- [X] W006 `tests/security/w08-secrets.test.ts`: T14 (real provider wiring, synthetic key, adapter errors, log injection), T16 bundle sentinel.
- [X] W007 `tests/browser/w08-browser.test.ts` + `vitest.browser.config.ts`: T04, T05, T15 storage, T16 CSP control/blocked/smoke.

## Phase 3 — Implementation

- [X] W008 Transport cap `MAX_SOCKET_MESSAGE_BYTES` (16 KiB) in `src/server/index.ts`.
- [X] W009 Global run cap `COACH_MAX_CONCURRENT_RUNS` (2) in `src/server/rooms/room-store.ts`.
- [X] W010 CSP and companion headers in `src/server/index.ts`; inline theme script to `public/theme-init.js`.
- [X] W011 Security events `src/server/security-events.ts`, wired in `index.ts`, `register-handlers.ts`, `room-store.ts`.
- [X] W012 Dependency audit; decisions recorded in the evidence.

## Phase 4 — Evidence

- [X] W013 Rerun the probe on the W08 branch (`before-after-after.json`); full `npm run verify`; `npm run test:browser`.
- [X] W014 Fill `docs/EVIDENCE_W08.md` from observed output only.
- [ ] W015 Pair contribution, role swap and individual defence — to be recorded by the team (not something the assistant can provide).
- [ ] W016 Optional live-provider demo with a real key (not required for W08 grading).
