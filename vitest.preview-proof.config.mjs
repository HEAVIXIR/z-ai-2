import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import path from "node:path";

// Match the production bundler's inline-WASM behavior for the Node test runner.
const wasmDataUrlPlugin = {
  name: "heavix-vitest-wasm-data-url",
  enforce: "pre",
  load(id) {
    const filePath = id.split("?")[0] ?? id;
    if (!filePath.endsWith(".wasm")) return null;
    const base64 = readFileSync(filePath).toString("base64");
    return `export default ${JSON.stringify(`data:application/wasm;base64,${base64}`)};`;
  },
};

export default defineConfig({
  plugins: [wasmDataUrlPlugin],
  ssr: {
    noExternal: [/^@jsquash\//],
  },
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
      "**/node_modules/**",
      "**/dist/**",
      "**/cypress/**",
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build,eslint,prettier}.config.*",
      "tests/contract/crud-pipeline.test.ts",
      "tests/contract/page-builder.test.ts",
      "tests/contract/rbac-matrix.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
});
