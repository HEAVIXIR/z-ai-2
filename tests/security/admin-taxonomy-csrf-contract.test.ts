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
  "src/app/api/admin/moderation/route.ts",
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

      const ioIndexes = [
        handler.indexOf("req.json("),
        handler.indexOf("db."),
        handler.indexOf("runModerationBatch("),
      ].filter((index) => index >= 0);
      if (ioIndexes.length > 0) {
        expect(
          csrfIndex,
          `${relativePath}: CSRF must run before request-body or database work`,
        ).toBeLessThan(Math.min(...ioIndexes));
      }
    }
  });
});

describe("Imported listing publication guard", () => {
  it("blocks generic approval while source-linked listings lack dedicated clearance evidence", () => {
    const absolutePath = path.resolve(process.cwd(), "src/app/api/admin/moderation/route.ts");
    const source = fs.readFileSync(absolutePath, "utf8");
    expect(source).toMatch(/select:\s*\{[^}]*sourceUrl:\s*true/s);
    expect(source).toMatch(/action\s*===\s*"approve"\s*&&\s*listing\.sourceUrl/);
    expect(source).toMatch(/IMPORTED_LISTING_CLEARANCE_REQUIRED/);
    expect(source).toMatch(/status:\s*409/);
  });
});

describe("Taxonomy Prisma contract guards", () => {
  it("uses the actual pure BrandCategory relation shape", () => {
    const absolutePath = path.resolve(process.cwd(), "src/app/api/taxonomy/brands/[id]/categories/route.ts");
    const source = fs.readFileSync(absolutePath, "utf8");
    expect(source).toMatch(/orderBy:\s*\{\s*category:\s*\{\s*name:\s*"asc"/);
    expect(source).not.toMatch(/\b(displayOrder|isActive|isFeatured)\b/);
    expect(source).toMatch(/update:\s*\{\s*\}/);
    expect(source).toMatch(/create:\s*\{\s*brandId:\s*id,\s*categoryId\s*\}/);
  });

  it("prevents deleting transaction types still referenced by listings", () => {
    const absolutePath = path.resolve(process.cwd(), "src/app/api/transaction-types/[id]/route.ts");
    const source = fs.readFileSync(absolutePath, "utf8");
    expect(source).toMatch(/db\.listing\.count\(\{\s*where:\s*\{\s*transactionTypeId:\s*id\s*\}\s*\}\)/);
    expect(source).toMatch(/if\s*\(listingCount\s*>\s*0\)/);
    expect(source).toMatch(/status:\s*409/);
  });
});
