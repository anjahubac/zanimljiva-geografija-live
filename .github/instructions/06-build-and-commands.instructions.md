---
description: "Canonical install, development, test, lint, build, start, environment, and smoke-test commands."
applyTo: "**/*"
---

# Build and Commands Instructions

## Status

The repository is scaffolded and every command below exists in `package.json`. Do not claim a command works until it has actually run in the current session.

## Runtime baseline

- Node.js 22.13+ (`engines` in `package.json`; `dev`, `start` and `smoke:ai` load `.env` with `--env-file-if-exists`)
- npm as the package manager
- Strict TypeScript with ESM
- One root dependency graph and lockfile unless a reviewed architecture change says otherwise

## Required root commands

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
npm start
npm run verify     # typecheck + lint + test + build — the gate before any handoff
npm run smoke:ai   # opt-in, Week 4: 5 real AI requests; never part of npm test
```

The scripts should mean:

- `dev`: run the Vite client and Node/Socket.IO server with local proxying or a same-origin development setup.
- `test`: run deterministic Vitest unit and integration tests once.
- `test:watch`: optional local watch mode.
- `typecheck`: check client, server, shared contracts, and tests without emitting.
- `lint`: run the configured linter over source and tests.
- `build`: create production client assets and compiled server output.
- `start`: run the built Node server, serve the SPA, expose `/healthz`, and host Socket.IO.
- `verify`: the single gate that must pass before any handoff, commit request, baseline capture, or deployment.
- `smoke:ai`: call the real Gemini/Groq APIs with pre-written expectations (`docs/AI_EVALS.md`). Spends free quota; run only when asked. `AI_PROVIDER_ORDER=gemini` or `=groq` tests one provider.

Add targeted scripts only when they improve real iteration, such as `test:unit` and `test:integration`. Keep README and this file synchronized with actual script names.

## Local ports and URLs

Until implementation proves otherwise:

- Vite development UI: `http://localhost:5173`
- Local server: `http://localhost:3000`
- Health endpoint: `http://localhost:3000/healthz`
- Production: one origin for UI, health route, and Socket.IO

Avoid hard-coded production origins or ports in source.

## Environment configuration

Commit `.env.example` with placeholder values and parse actual environment values at startup with runtime validation. The committed `.env.example` is authoritative and documents every variable; the game settings are:

```text
PORT=3000
NODE_ENV=development
ROUND_DURATION_MS=150000
COUNTDOWN_MS=3000
COMPLETED_ROOM_TTL_MS=300000
WAITING_ROOM_TTL_MS=1800000
```

The Week 4 AI settings (`GEMINI_API_KEY`, `GROQ_API_KEY`, and the optional model-chain, provider-order and debug settings) are optional: without a key the game runs on the letter rule. The AI usage limits (`AI_ROOMS_PER_VISITOR_HOUR`, `HINTS_PER_VISITOR_HOUR`, `AI_DAILY_CALL_BUDGET`, `TRUST_PROXY_HOPS`, `Plan.md` §2B.11) have safe defaults; `TRUST_PROXY_HOPS` must be set on the host. Keys live only in `.env` locally and in the host's secret store in production.

Bound numeric configuration. Fail clearly on unsafe/invalid production settings rather than propagating `NaN` or an unbounded value. Do not commit `.env` or deployment credentials.

## Verification sequence

During implementation, run the smallest targeted test first. Before handoff run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Then run the built service and verify `/healthz`, the SPA fallback, and a two-client Socket.IO round. Record actual output in the evidence file for the current week (`docs/EVIDENCE_003.md` or `docs/EVIDENCE_004.md`).

## Command discipline

- Confirm the working directory before install, build, or deployment commands.
- Do not delete lockfiles, build artifacts, rooms, or deployment data as a workaround without identifying the root cause.
- Do not upgrade dependencies opportunistically.
- Report failed or skipped commands exactly; do not describe them as passed.
- Installation changes the lockfile and must be reviewed.
- Deployment, remote pushes, and hosting changes require explicit user authorization.

