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
      "/api": { target: "http://localhost:3000" },
      "/socket.io": { target: "http://localhost:3000", ws: true },
      "/healthz": { target: "http://localhost:3000" },
    },
  },
});
