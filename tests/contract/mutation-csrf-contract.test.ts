import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), "utf8");

describe("Mutation CSRF and payload-boundary contracts", () => {
  it("admin user creation is same-origin and bounded", () => {
    const source = read("src/app/api/admin/users/route.ts");
    expect(source).toContain("checkCsrf(req)");
    expect(source).toContain("MAX_ADMIN_USER_BODY_BYTES");
    expect(source).toContain("Unknown request field");
  });

  it("seller lifecycle mutations require CSRF validation", () => {
    const source = read("src/app/api/admin/sellers/[id]/route.ts");
    expect(source).toContain("checkCsrf(req)");
  });

  it("inspection create and update mutations require CSRF validation", () => {
    const create = read("src/app/api/inspections/route.ts");
    const update = read("src/app/api/inspections/[id]/route.ts");
    expect(create).toContain("checkCsrf(req)");
    expect(update).toContain("checkCsrf(req)");
  });

  it("inspection listing image projection exposes only the public URL", () => {
    const source = read("src/app/api/inspections/route.ts");
    expect(source).toContain('images: { select: { url: true }');
    expect(source).not.toContain('images: { orderBy:');
  });
});
