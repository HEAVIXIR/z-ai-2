import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("R45 canonical authentication contract", () => {
  it("uses only USER_COOKIE -> Session -> User", () => {
    const s = read("src/lib/auth.ts");
    expect(s).toContain('USER_COOKIE = "heavix-user"');
    expect(s).toContain("db.session.findUnique");
    expect(s).toContain("include: { user: true }");
    expect(s).not.toContain("ADMIN_COOKIE");
    expect(s).not.toContain("AdminSession");
    expect(s).not.toContain('id: "ADMIN"');
  });

  it("removes admin credential authentication from login route", () => {
    const s = read("src/app/api/auth/login/route.ts");
    expect(s).toContain("createUserSession");
    expect(s).not.toContain("validateLogin");
    expect(s).not.toContain("createSession");
    expect(s).not.toContain("ADMIN_USERNAME");
    expect(s).not.toMatch(/\busername\b/);
  });

  it("removes the ADMIN sentinel bypass", () => {
    const s = read("src/lib/authorization/index.ts");
    expect(s).not.toMatch(/userId\s*===\s*["']ADMIN["']/);
  });

  it("uses USER_COOKIE at the edge", () => {
    const s = read("src/middleware.ts");
    expect(s).toContain('USER_COOKIE_NAME = "heavix-user"');
    expect(s).not.toContain("heavix-admin");
  });

  it("does not authorize AI through User.role fallback", () => {
    const s = read("src/lib/ai-policy.ts");
    expect(s).not.toMatch(/user\.role/);
    expect(s).not.toContain("select: { role: true }");
  });

  it("admin user PATCH and DELETE commit audit with their mutations", () => {
    const s = read("src/app/api/admin/users/[id]/route.ts");
    const patchStart = s.indexOf("export async function PATCH");
    const deleteStart = s.indexOf("export async function DELETE");
    expect(patchStart).toBeGreaterThanOrEqual(0);
    expect(deleteStart).toBeGreaterThan(patchStart);
    const patch = s.slice(patchStart, deleteStart);
    const remove = s.slice(deleteStart);
    expect(patch).toContain("db.$transaction");
    expect(patch).toContain("tx.auditLog.create");
    expect(patch).toContain("tx.userRole.upsert");
    expect(patch).not.toContain("logAudit");
    expect(remove).toContain("db.$transaction");
    expect(remove).toContain("tx.user.delete");
    expect(remove).toContain("tx.auditLog.create");
    expect(remove).not.toContain("logAudit");
  });

  it("admin user creation commits user, role and audit together", () => {
    const s = read("src/app/api/admin/users/route.ts");
    const postStart = s.indexOf("export async function POST");
    expect(postStart).toBeGreaterThanOrEqual(0);
    const post = s.slice(postStart);
    expect(post).toContain("db.$transaction");
    expect(post).toContain("tx.user.create");
    expect(post).toContain("tx.userRole.upsert");
    expect(post).toContain("tx.auditLog.create");
    expect(post).not.toContain("logAudit");
  });

  it("registerSeller assigns canonical SELLER UserRole", () => {
    const s = read("src/lib/seller-service.ts");
    expect(s).toContain('where: { key: "SELLER" }');
    expect(s).toContain("db.userRole.upsert");
    expect(s).not.toContain('role: "SELLER"');
  });
});
