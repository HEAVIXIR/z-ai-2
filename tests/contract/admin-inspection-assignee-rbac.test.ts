import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

describe("admin inspection assignee eligibility", () => {
  it("uses active users with canonical ADMIN or SELLER roles", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/admin/inspections/page.tsx"),
      "utf8",
    );
    expect(source).toContain('status: "ACTIVE"');
    expect(source).toContain('userRoles: { some: { role: { key: { in: ["ADMIN", "SELLER"] } } } }');
    expect(source).not.toContain('OR: [{ role: "ADMIN" }, { role: "SELLER" }]');
  });
});
