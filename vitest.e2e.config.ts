import { defineConfig } from "vitest/config";
import path from "path";

/* ============================================================
   Vitest — E2E test config (Track E)
   ------------------------------------------------------------
   Used by `bun run test:e2e` (see package.json).
   Runs only the E2E suite, which lives under `tests/e2e/**`.
   If that directory doesn't exist yet, vitest simply reports
   "No test files found" instead of failing to load a config.
   ============================================================ */

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/e2e/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
