import { defineConfig } from "vitest/config";
import path from "path";

/* ============================================================
   Vitest — Integration test config (for .ts files that use
   vitest's describe/it but don't have .test.ts extension)
   ============================================================ */

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Include ALL .ts files in tests/integration/ (not just .test.ts)
    // so audit-transaction-real.ts (which uses vitest describe/it but
    // has a .ts extension) is picked up.
    include: ["tests/integration/**/*.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
