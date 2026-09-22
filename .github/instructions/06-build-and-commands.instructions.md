---
description: "Canonical install, development, test, lint, build, start, environment, and smoke-test commands."
applyTo: "**/*"
---

# Build and Commands Instructions

## Status

The repository is initially unscaffolded. The commands below are the required target interface after `package.json` is created. Do not claim a command works until its script exists and the command has actually run.

## Runtime baseline

- Node.js 20+
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
```

The scripts should mean:

- `dev`: run the Vite client and Node/Socket.IO server with local proxying or a same-origin development setup.
- `test`: run deterministic Vitest unit and integration tests once.
- `test:watch`: optional local watch mode.
- `typecheck`: check client, server, shared contracts, and tests without emitting.
- `lint`: run the configured linter over source and tests.
- `build`: create production client assets and compiled server output.
- `start`: run the built Node server, serve the SPA, expose `/healthz`, and host Socket.IO.

Add targeted scripts only when they improve real iteration, such as `test:unit` and `test:integration`. Keep README and this file synchronized with actual script names.

## Local ports and URLs

Until implementation proves otherwise:

- Vite development UI: `http://localhost:5173`
- Local server: `http://localhost:3000`
- Health endpoint: `http://localhost:3000/healthz`
- Production: one origin for UI, health route, and Socket.IO

Avoid hard-coded production origins or ports in source.

## Environment configuration

Commit `.env.example` with placeholder values and parse actual environment values at startup with runtime validation. Expected settings may include:

```text
PORT=3000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173
ROUND_DURATION_MS=90000
COUNTDOWN_MS=3000
ROOM_TTL_MS=1800000
```

Bound numeric configuration. Fail clearly on unsafe/invalid production settings rather than propagating `NaN` or an unbounded value. Do not commit `.env` or deployment credentials.

## Verification sequence

During implementation, run the smallest targeted test first. Before handoff run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Then run the built service and verify `/healthz`, the SPA fallback, and a two-client Socket.IO round. Record actual output for Week 3 evidence.

## Command discipline

- Confirm the working directory before install, build, or deployment commands.
- Do not delete lockfiles, build artifacts, rooms, or deployment data as a workaround without identifying the root cause.
- Do not upgrade dependencies opportunistically.
- Report failed or skipped commands exactly; do not describe them as passed.
- Installation changes the lockfile and must be reviewed.
- Deployment, remote pushes, and hosting changes require explicit user authorization.

