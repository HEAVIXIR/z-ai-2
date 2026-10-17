import { defineConfig } from "vitest/config";
import path from "path";

/* ============================================================
   Vitest — Mutation harness config (STEP 13.53 P2-C)
   ------------------------------------------------------------
   Includes ONLY the standalone .snapshot.ts files that are
   executed as SUBPROCESSES by the orchestrator
   (tests/security/mutation/orchestrator.test.ts).

   These snapshot files are NOT picked up by the normal security
   suite (vitest.security.config.ts includes .test.{ts,tsx} under
   tests/security/) because they use the .snapshot.ts extension.
   This prevents the mutant snapshot from failing the regular
   security run.

   The orchestrator spawns:
     bunx vitest run --config vitest.mutation.config.ts <snapshot>
   and inspects the REAL process exit code:
     - healthy.snapshot.ts -> exit 0 (route does not leak)
     - mutant.snapshot.ts  -> exit nonzero (route leaks -> assertion fails)
   ============================================================ */

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/security/mutation/*.snapshot.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
