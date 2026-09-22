---
description: "Exact dependency versions, config file contents, npm scripts, and the one-time scaffold procedure. No stack choices are left to the implementer."
applyTo: "**/*"
---

# Stack and Scaffold Instructions

## How to use this file

Every decision here is already made. Copy the file contents verbatim. Do not
substitute a framework, a package manager, a bundler, a test runner, a folder
layout, or a version. If a listed version cannot be installed, install the
newest version **with the same major number**, and record the actual version in
`docs/AI_USAGE_LOG.md`. Never upgrade a major version to make an error go away.

Run the scaffold exactly once, at the start of Block 1. Do not re-scaffold.

## Non-negotiable stack

| Concern | Choice | Not allowed |
| --- | --- | --- |
| Runtime | Node.js 20 or 22 | Deno, Bun, Edge runtimes |
| Package manager | npm, one root `package.json`, one lockfile | pnpm, yarn, workspaces, monorepo tooling |
| Language | TypeScript, strict, ESM (`"type": "module"`) | CommonJS, JavaScript source files |
| Client | React 18 + Vite | Next.js, CRA, Remix, Angular, Vue, plain DOM |
| Server | Node `http` + Socket.IO | Express-only, Fastify, tRPC, WebSocket raw, gRPC |
| Validation | Zod v3 | io-ts, yup, joi, ajv, hand-written guards |
| Tests | Vitest | Jest, Mocha, Playwright, Cypress |
| Server bundle | tsup | webpack, rollup config, ts-node, plain `tsc` emit |
| Styling | One plain CSS file per screen, or a single `app.css` | Tailwind, MUI, styled-components, CSS-in-JS |
| State | React `useState`/`useReducer` + one socket context | Redux, Zustand, MobX, React Query, Jotai |
| IDs | `node:crypto` (`randomUUID`, `randomInt`) | `uuid`, `nanoid`, `Math.random` |

Adding **any** dependency not listed below is a scope change. Stop and ask.

## Exact dependencies

```bash
npm install react@^18.3.1 react-dom@^18.3.1 socket.io@^4.8.1 socket.io-client@^4.8.1 zod@^3.23.8
npm install -D typescript@^5.6.3 vite@^5.4.10 @vitejs/plugin-react@^4.3.3 vitest@^2.1.4 @vitest/coverage-v8@^2.1.4 tsx@^4.19.2 tsup@^8.3.5 concurrently@^9.1.0 @types/node@^22.9.0 @types/react@^18.3.12 @types/react-dom@^18.3.1 eslint@^9.14.0 @eslint/js@^9.14.0 typescript-eslint@^8.13.0 eslint-plugin-react-hooks@^5.0.0 prettier@^3.3.3
```

## `package.json` scripts (exact)

```json
{
  "name": "zanimljiva-geografija-live",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "concurrently -n server,client -c blue,green \"npm:dev:server\" \"npm:dev:client\"",
    "dev:server": "tsx watch src/server/index.ts",
    "dev:client": "vite",
    "test": "vitest run",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --max-warnings=0",
    "format": "prettier --write .",
    "build": "npm run build:client && npm run build:server",
    "build:client": "vite build",
    "build:server": "tsup src/server/index.ts --format esm --target node20 --out-dir dist/server --clean",
    "start": "node dist/server/index.js",
    "verify": "npm run typecheck && npm run lint && npm test && npm run build"
  }
}
```

`npm run verify` is the single command that must pass before any handoff,
commit request, baseline capture, or deployment.

## `tsconfig.json` (exact, one config for the whole repo)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "types": ["node", "vitest/globals"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": false,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@domain/*": ["src/domain/*"],
      "@contracts/*": ["src/contracts/*"],
      "@server/*": ["src/server/*"],
      "@client/*": ["src/client/*"]
    }
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.config.ts", "eslint.config.js"]
}
```

Because `moduleResolution` is `Bundler`, relative imports are written **without**
a `.js` extension. tsup bundles the server, so this stays valid in production.

## `vite.config.ts` (exact)

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@domain": fileURLToPath(new URL("./src/domain", import.meta.url)),
      "@contracts": fileURLToPath(new URL("./src/contracts", import.meta.url)),
      "@client": fileURLToPath(new URL("./src/client", import.meta.url)),
    },
  },
  build: { outDir: "dist/client", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      "/socket.io": { target: "http://localhost:3000", ws: true },
      "/healthz": { target: "http://localhost:3000" },
    },
  },
});
```

`index.html` lives at the repository root and loads `/src/client/main.tsx`.

## `vitest.config.ts` (exact)

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@domain": fileURLToPath(new URL("./src/domain", import.meta.url)),
      "@contracts": fileURLToPath(new URL("./src/contracts", import.meta.url)),
      "@server": fileURLToPath(new URL("./src/server", import.meta.url)),
      "@client": fileURLToPath(new URL("./src/client", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 5000,
    hookTimeout: 5000,
    coverage: {
      provider: "v8",
      include: ["src/domain/**", "src/contracts/**", "src/server/**"],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
```

## `eslint.config.js` (exact)

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": ["error", { allow: ["error", "warn", "info"] }],
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["src/domain/**/*.ts", "src/contracts/**/*.ts"],
    rules: { "no-restricted-globals": ["error", "Date", "Math"] },
  },
);
```

The last block is a real guardrail, not decoration: the domain and contracts
layers must never read ambient time or ambient randomness.

## `.env.example` (exact, committed) 

```text
PORT=3000
NODE_ENV=development
ROUND_DURATION_MS=90000
COUNTDOWN_MS=3000
COMPLETED_ROOM_TTL_MS=300000
WAITING_ROOM_TTL_MS=1800000
```

`.gitignore` must contain at least `node_modules`, `dist`, `coverage`, `.env`,
`.env.local`, `*.log`, `.DS_Store`. Parse the environment once at startup with
the Zod schema in module 12 and fail loudly on invalid values.

## Scaffold exit criteria

The scaffold step is done, and only done, when all of these actually ran and
passed, with output pasted into `docs/AI_USAGE_LOG.md`:

- [ ] `npm run typecheck` passes on an empty-but-valid source tree.
- [ ] `npm run lint` passes with zero warnings.
- [ ] `npm test` runs and reports at least one passing domain test.
- [ ] `npm run build` produces `dist/client/index.html` and `dist/server/index.js`.
- [ ] `npm start` serves `/healthz` returning HTTP 200.

Do not begin gameplay features before every box above is ticked.
