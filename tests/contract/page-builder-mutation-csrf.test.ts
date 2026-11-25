import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("Page Builder mutation CSRF and audit contracts", () => {
  const cases = [
    ["src/app/api/admin/pages/route.ts", "POST", "req"],
    ["src/app/api/admin/pages/[id]/route.ts", "PATCH", "req"],
    ["src/app/api/admin/pages/[id]/route.ts", "DELETE", "req"],
    ["src/app/api/admin/pages/[id]/versions/route.ts", "POST", "req"],
    ["src/app/api/admin/pages/[id]/publish/route.ts", "POST", "req"],
    ["src/app/api/admin/pages/[id]/rollback/route.ts", "POST", "req"],
  ] as const;

  it.each(cases)("%s %s rejects cross-origin mutation before body parsing or writes", (file, method, requestName) => {
    const source = read(file);
    expect(source).toContain("checkCsrf");
    const signature = `export async function ${method}(${requestName}:`;
    const start = source.indexOf(signature);
    expect(start).toBeGreaterThanOrEqual(0);
    const handler = source.slice(start);
    expect(handler).toContain(`if (!checkCsrf(${requestName}))`);
    const guard = handler.indexOf(`if (!checkCsrf(${requestName}))`);
    const body = handler.search(/readBoundedJson\(req|req\.json\(\)|db\.\$transaction|db\.[A-Za-z]+\.(?:create|update|delete|upsert)\(/);
    expect(body).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(body);
  });

  it("bounds the request body for page creation, metadata updates, and version creation", () => {
    for (const file of [
      "src/app/api/admin/pages/route.ts",
      "src/app/api/admin/pages/[id]/route.ts",
      "src/app/api/admin/pages/[id]/versions/route.ts",
      "src/app/api/admin/pages/[id]/publish/route.ts",
      "src/app/api/admin/pages/[id]/rollback/route.ts",
    ]) {
      expect(read(file)).toContain("readBoundedJson");
    }
  });

  it("makes every Page Builder mutation atomic with its audit record", () => {
    const routes = [
      "src/app/api/admin/pages/route.ts",
      "src/app/api/admin/pages/[id]/route.ts",
      "src/app/api/admin/pages/[id]/versions/route.ts",
      "src/app/api/admin/pages/[id]/publish/route.ts",
      "src/app/api/admin/pages/[id]/rollback/route.ts",
    ];
    for (const file of routes) {
      const source = read(file);
      expect(source).toContain("db.$transaction(async (tx)");
      expect(source).toContain("tx.auditLog.create");
      expect(source).not.toContain("logAudit(");
    }
  });
});
