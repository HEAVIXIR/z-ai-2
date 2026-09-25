import { defineConfig } from "vitest/config";
import path from "path";

/* ============================================================
   Vitest — Security test config (Track E)
   ------------------------------------------------------------
   Used by `bun run test:security` (see package.json).
   Runs only the security suite, which lives under
   `tests/security/**`. If that directory doesn't exist yet,
   vitest simply reports "No test files found" instead of
   failing to load a config.
   ============================================================ */

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/security/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
