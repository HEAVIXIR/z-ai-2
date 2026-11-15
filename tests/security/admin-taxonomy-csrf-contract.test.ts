import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROUTES = [
  "src/app/api/attributes/route.ts",
  "src/app/api/attributes/[id]/route.ts",
  "src/app/api/attributes/[id]/categories/route.ts",
  "src/app/api/service-types/route.ts",
  "src/app/api/service-types/[id]/route.ts",
  "src/app/api/transaction-types/route.ts",
  "src/app/api/transaction-types/[id]/route.ts",
  "src/app/api/taxonomy/brands/[id]/categories/route.ts",
  "src/app/api/taxonomy/brands/[id]/models/route.ts",
  "src/app/api/taxonomy/brands/[id]/route.ts",
  "src/app/api/taxonomy/categories/[id]/route.ts",
  "src/app/api/admin/services/route.ts",
  "src/app/api/admin/services/[id]/route.ts",
] as const;

describe("Admin taxonomy/service mutation CSRF contract", () => {
  it.each(ROUTES)("%s imports and enforces CSRF on every mutation handler", (relativePath) => {
    const absolutePath = path.resolve(process.cwd(), relativePath);
    const source = fs.readFileSync(absolutePath, "utf8");

    expect(source).toMatch(/from\s+["']@\/lib\/csrf["']/);

    const handlers = [...source.matchAll(/export async function (POST|PUT|PATCH|DELETE)\s*\(/g)];
    expect(handlers.length, `expected mutation handlers in ${relativePath}`).toBeGreaterThan(0);

    for (let index = 0; index < handlers.length; index += 1) {
      const start = handlers[index].index ?? 0;
      const end = index + 1 < handlers.length
        ? (handlers[index + 1].index ?? source.length)
        : source.length;
      const handler = source.slice(start, end);
      const csrfIndex = handler.indexOf("checkCsrf(");
      expect(csrfIndex, `${relativePath}: ${handlers[index][1]} must enforce CSRF`).toBeGreaterThan(-1);
      expect(handler).toMatch(/status:\s*403/);

      const tryIndex = handler.indexOf("try {");
      if (tryIndex >= 0) {
        expect(csrfIndex, `${relativePath}: CSRF must run before try/IO`).toBeLessThan(tryIndex);
      }
    }
  });
});
