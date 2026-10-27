# Implementation Plan: Secure the Arcade

**Spec**: [spec.md](spec.md) · **Evidence**: [EVIDENCE_W08](../../docs/EVIDENCE_W08.md) · **Scope record**: `Plan.md` §2D

## Approach

Map the existing coach path first, keep every control that already holds and prove it with a regression test, then add only the controls that were missing. No refactor and no new service. The before/after probe (`scripts/w08-before-after.ts`) was run on the untouched checkpoint before any production change.

## What already held (prove only)

Strict runtime schemas on every socket event; seat bound from the socket; foreign/stale round refused; exact-name tool allowlist; strict tool arguments; tool result recomputed and compared; final choices restricted to server-computed eligible tuples; attempt guard with a shared budget; per-call timeout and run deadline; key sent in a header; closed telemetry; React text rendering of names and answers; same-origin socket handshake.

## Gaps found and changes

| Gap (observed on `67aa13e`) | Change | Consumers checked |
| --- | --- | --- |
| Transport accepted Socket.IO messages up to 1 MB (default) and decoded them fully before the schema ran | `maxHttpBufferSize: 16 KiB` on the Socket.IO server | Every client event; largest legitimate one is < 1 KiB. Server→client payloads are unaffected (the limit applies to received messages). |
| No global cap on concurrent coach runs (3 ran at once in the probe) | `COACH_MAX_CONCURRENT_RUNS = 2`, checked synchronously in `reviewRound` before the visitor allowance; released when the run settles | Existing duplicate-attach path runs first, so a duplicate never takes a second slot. User-facing code stays `RATE_LIMITED` (closed registry unchanged); the security event says `CONCURRENCY_LIMIT`. |
| No HTTP security headers | CSP (`script-src 'self'`, `style-src 'self'`, `img-src 'self' data:`, `connect-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, `form-action 'self'`), `nosniff`, `Referrer-Policy: no-referrer` on every response | Production build only loads hashed same-origin JS/CSS, SVG and `data:` images, same-origin Socket.IO. Dev server (Vite) is not affected. |
| Inline theme script in `index.html` would need `'unsafe-inline'` | Moved verbatim to `public/theme-init.js` (classic, synchronous, still before first paint) | Vite copies `public/` to `dist/client`; theme behavior unchanged. |
| Refused requests and finished runs were not logged as security events | `src/server/security-events.ts`: closed schema, one JSON line; emitted from the socket layer (coach event only) and from `reviewRound` | Existing `ai.coach` diagnostic trace unchanged. Test helper defaults the sink to silent. |

## Test infrastructure

- `tests/security/*.test.ts` run in the normal `npm test` (real server, transport, schemas, store, engine; fake adapter/clock only).
- `tests/browser/*.test.ts` run real Chromium through `playwright-core` (exact pin `1.63.0`, dev only) against `dist/client` served by the real server. Separate config so `npm test` needs no browser.
- `npm run security:check` = security suite + browser suite. No provider key needed.

## Risks of the change

- A legitimate message over 16 KiB would now disconnect the client. None exists (largest is a 40-char answer or 24-char name).
- With 2 concurrent runs, a third player at the same moment sees "too many requests" and can retry. Acceptable for the free quota; documented.
- CSP could break a future inline style/script. The browser smoke test fails on any violation during normal play.
