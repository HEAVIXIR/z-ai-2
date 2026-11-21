import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import path from "path";

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
   Used by `bun run test:security` (see package.json).
   Runs only the security suite, which lives under
   `tests/security/**`. If that directory doesn't exist yet,
   vitest simply reports "No test files found" instead of
   failing to load a config.
   ============================================================ */

export default defineConfig({
  plugins: [wasmDataUrlPlugin],
  assetsInlineLimit: 50_000_000,
  ssr: { noExternal: [/@jsquash\//] },
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
