import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import path from "path";

// jSquash ships WASM codecs as assets. Inline them as data URLs for Node/Vitest
// so the test runner never attempts to import a .wasm file as JavaScript.
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

export default defineConfig({
  plugins: [wasmDataUrlPlugin],
  assetsInlineLimit: 50_000_000,
  ssr: { noExternal: [/@jsquash\//] },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
