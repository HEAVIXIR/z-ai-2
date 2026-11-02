import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@/lib/store-db": path.resolve(__dirname, "src/lib/store-db.node.ts"),
      "@/lib/db": path.resolve(__dirname, "src/lib/db.node.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
});
