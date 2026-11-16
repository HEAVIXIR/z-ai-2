import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("Page Builder mutation CSRF contracts", () => {
  const cases = [
    ["src/app/api/admin/pages/route.ts", "POST", "req"],
    ["src/app/api/admin/pages/[id]/route.ts", "PATCH", "req"],
    ["src/app/api/admin/pages/[id]/route.ts", "DELETE", "_req"],
    ["src/app/api/admin/pages/[id]/versions/route.ts", "POST", "req"],
    ["src/app/api/admin/pages/[id]/publish/route.ts", "POST", "req"],
    ["src/app/api/admin/pages/[id]/rollback/route.ts", "POST", "req"],
  ] as const;

  it.each(cases)("%s %s rejects cross-origin mutation before side effects", (file, method, requestName) => {
    const source = read(file);
    expect(source).toContain("checkCsrf");
    const signature = `export async function ${method}(${requestName}:`;
    const start = source.indexOf(signature);
    expect(start).toBeGreaterThanOrEqual(0);
    const handler = source.slice(start);
    expect(handler).toContain(`if (!checkCsrf(${requestName}))`);
    const guard = handler.indexOf(`if (!checkCsrf(${requestName}))`);
    const body = handler.search(/req\.json\(\)|db\.[A-Za-z]+\.(?:create|update|delete|upsert)\(/);
    expect(body).toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(body);
  });
  
  it("makes publish and rollback state changes atomic with audit", () => {
    for (const file of [
      "src/app/api/admin/pages/[id]/publish/route.ts",
      "src/app/api/admin/pages/[id]/rollback/route.ts",
    ]) {
      const source = read(file);
      expect(source).toContain("db.$transaction(async (tx)");
      expect(source).toContain("tx.adminPage.update");
      expect(source).toContain("tx.adminPageVersion.update");
      expect(source).toContain("tx.auditLog.create");
      expect(source).not.toContain("logAudit(");
    }
  });
});
