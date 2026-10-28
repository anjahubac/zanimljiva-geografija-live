# Implementation Plan: Round coach hardening (W08)

**Spec**: [spec.md](spec.md) · **Design of record**: `Plan.md` §2D

## Approach

Port, onto the round coach, the four W08 controls that `main` lacked; keep every existing control and change no coach behavior. The generic pieces (transport cap, headers, theme file) are the same code as on `011-secure-the-arcade`; the run cap and security events are rewritten for `requestCoach`, `RUN_LIMITS` and the round coach's report.

| Change | Where | Consumers checked |
| --- | --- | --- |
| `maxHttpBufferSize: 16 KiB` | `src/server/index.ts`, constant in `src/contracts/socket.schemas.ts` | Every client event; the largest (coach focus list, draft, name) is < 1 KiB |
| `RUN_LIMITS.maxConcurrentRuns = 2`, checked after the single-flight join and before `limits.check/charge`; decremented in `runCoach(...).finally` | `src/server/agent/limits.ts`, `src/server/rooms/room-store.ts` | A join to a running run takes no slot; a cancelled run ends through the gateway's abort, so its slot is freed |
| CSP, `nosniff`, `no-referrer` on every response; `securityHeaders: false` exists only as a test dependency | `src/server/index.ts` | The production build loads only hashed same-origin JS/CSS, SVG and `data:` images and same-origin Socket.IO |
| Inline theme script → `public/theme-init.js` | `index.html`, `public/` | Vite copies `public/` to `dist/client`; behavior unchanged |
| `security-events.ts`; `reject()` in `requestCoach`; `refuse()` for the coach event in `register-handlers.ts` | `src/server/` | The existing `agent.run` record is unchanged; test servers default the sink to silent |

## Tests

- `tests/security/w08-hardening.test.ts` (in `npm test`): transport cap, privileged fields, run cap with cancel and allowance, tool rejection and log-injection events, cross-origin handshake, headers. Real server, schemas, store and coach agent; fake AI service and clock.
- `tests/browser/w08-browser.test.ts` (`npm run test:browser`, own config): Chromium on the production build; control without headers; with headers, a full round and coach with zero CSP violations, hostile text inert, injected scripts blocked.

## Risks

- A legitimate message over 16 KiB would disconnect the client; none exists.
- A third simultaneous coach request sees "too many requests" and can retry.
- A future inline style or script would break under the CSP; the browser test fails on any violation during a normal round.
