import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import path from "node:path";

// Inline jSquash WASM assets so Node/Vitest does not treat .wasm as JS.
const wasmDataUrlPlugin = {
  name: "heavix-vitest-wasm-data-url",
  enforce: "pre" as const,
  load(id: string) {
    const filePath = id.split("?")[0] ?? id;
    if (!filePath.endsWith(".wasm")) return null;
    const base64 = readFileSync(filePath).toString("base64");
    return `export default ${JSON.stringify(`data:application/wasm;base64,${base64}`)};`;
  },
};

/* ============================================================
   Vitest — Security test config (Track E)
   ------------------------------------------------------------
   Used by `bun run test:security`.
   Runs the security suite plus the root-level CSRF contract tests.
   ============================================================ */

export default defineConfig({
  plugins: [wasmDataUrlPlugin],
  assetsInlineLimit: 50_000_000,
  ssr: { noExternal: [/@jsquash\//] },
  test: {
    environment: "node",
    globals: true,
    include: [
      "tests/security/**/*.test.{ts,tsx}",
      "tests/csrf.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
