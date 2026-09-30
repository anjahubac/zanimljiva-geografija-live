---
description: "WebSocket deployment topology, single-instance operations, remote safety, credentials, and production verification."
applyTo: "**/*"
---

# External Services and Operations Instructions

## Default posture

Normal implementation and automated tests run locally without a database, authentication provider, third-party geography API, queue, cache, analytics service, or AI provider. Do not invent credentials or call external systems to complete local code or documentation work.

**Week 4 exception (`Plan.md` §2B):** the server may call **Google Gemini** and **Groq** (each the other's fallback) for the answer checker, the AI opponent and hints — only from the server, only through `src/server/ai/service.ts`, with the keys in `GEMINI_API_KEY` / `GROQ_API_KEY` (never in the browser, source, logs or tests). Every test uses a fake (`tests/fakes/fake-ai.ts`, `tests/fakes/fake-adapter.ts`); only the opt-in `npm run smoke:ai` reaches the real API. With no key the game still runs on the local letter rule.

The only required Week 3 external operation is the explicitly requested deployment of the game to a WebSocket-capable host.

## Approved production topology

Use one long-running Node.js process that:

- Serves the built React/Vite SPA
- Exposes `/healthz`
- Hosts the Socket.IO endpoint on the same origin
- Stores temporary rooms in memory
- Runs as one instance/replica

Do not deploy the room server to a request-only runtime that cannot maintain WebSocket connections. Do not enable multiple replicas while room state is process-local. A restart losing active rooms is an accepted documented Week 3 limitation.

## Deployment prerequisites

Before any deploy:

1. `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` pass or failures are explicitly accepted.
2. The built service works locally through `/healthz`, SPA routes, and a two-client round.
3. Environment variables are documented in `.env.example` and configured privately in the host.
4. No `.env`, resume token, answer payload, credential, or private URL is staged.
5. The target supports HTTPS/WSS and persistent WebSocket upgrades.

## Production verification

After deployment, verify:

- `/healthz` returns success.
- The SPA loads directly and after refreshing a client route.
- Two physical computers can create and join one room.
- Both receive the same letter and timestamps.
- Draft answers remain hidden before reveal.
- Both-finish and deadline flows work.
- Reveal occurs once and traditional scoring is correct.
- Disconnect/restart behavior matches the documented limitation.
- Week 4: one round per mode (friend, random person, AI opponent); at least one round comes back `verified: true`; a hint works; and with the keys removed from the host, a round is still scored and marked unverified. Record the results in `docs/EVIDENCE_004.md`.

Capture screenshots and command/status output without exposing private tokens, credentials, or hidden in-round answers.

## Remote and credential policy

- A request to edit or commit locally does not authorize push, PR creation, deployment, DNS changes, environment changes, or external comments.
- Use hosting dashboards/CLIs only for the named deployment task.
- Keep tokens in the platform secret store or ignored local environment, never source, URLs, shell output, prompts, evidence, or logs.
- Do not change unrelated projects, services, domains, branches, or environments.
- Fetch/review before an explicitly requested push; never force-push or rewrite shared history without a separate explicit request.

## Future services

Redis/shared rooms, a database, user accounts, persistent leaderboards, content APIs, analytics, and AI providers other than Gemini and Groq are out of scope. Adding any of them requires a product decision, architecture update, security review, new failure tests, and explicit user authorization.
