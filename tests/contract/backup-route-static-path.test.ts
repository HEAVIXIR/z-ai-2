import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("backup route filesystem trace scope", () => {
  it("uses a statically scoped backup script path instead of tracing the whole project", () => {
    const source = readFileSync("src/app/api/admin/backup/route.ts", "utf8");

    expect(source).not.toContain("path.resolve(process.cwd())");
    expect(source).toContain('path.join(process.cwd(), "scripts", "backup.sh")');
  });
});
