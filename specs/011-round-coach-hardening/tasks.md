# Tasks: Round coach hardening (W08)

**Input**: [spec.md](spec.md), [plan.md](plan.md).

- [X] H001 Check which W08 controls `main` lacks (2026-10-28): no transport cap, no run cap, no headers, inline theme script, no security events.
- [X] H002 Record the owner's request and the scope in `Plan.md` §2D.
- [X] H003 Transport cap and security headers in `src/server/index.ts`; theme script to `public/theme-init.js`.
- [X] H004 `RUN_LIMITS.maxConcurrentRuns` and the check/release in `requestCoach`.
- [X] H005 `src/server/security-events.ts`, wired in `index.ts`, `register-handlers.ts` and `room-store.ts`.
- [X] H006 `tests/security/w08-hardening.test.ts`; each control was disabled once to confirm its test fails.
- [X] H007 `tests/browser/w08-browser.test.ts`, `vitest.browser.config.ts`, `playwright-core` 1.63.0 (dev, exact).
- [X] H008 `npm run verify` and `npm run security:check` pass.
