import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: [
      "tests/unit/**/*.test.ts",
      "tests/contract/**/*.test.ts",
      "tests/admin-backup-readiness.test.ts",
    ],
    // These contract suites query seeded PostgreSQL and run in the dedicated DB integration lane.
    exclude: [
      "tests/contract/crud-pipeline.test.ts",
      "tests/contract/page-builder.test.ts",
      "tests/contract/rbac-matrix.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
