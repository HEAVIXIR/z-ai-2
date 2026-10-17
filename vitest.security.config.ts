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
    // STEP 13.28: include .tsx so JSX-based security tests (e.g. the
    // /rfq/[id] page safeRfq wiring test) are picked up.
    include: ["tests/security/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
