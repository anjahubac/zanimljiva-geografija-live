import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

/**
 * W08 real-browser suite: Chromium against the production client build. Kept
 * out of the default `npm test` because it needs `dist/client` and a browser;
 * run it with `npm run test:browser`.
 */
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
    include: ["tests/browser/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
