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
