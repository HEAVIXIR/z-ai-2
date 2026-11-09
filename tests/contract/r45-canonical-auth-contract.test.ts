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

  it("registerSeller assigns canonical SELLER UserRole", () => {
    const s = read("src/lib/seller-service.ts");
    expect(s).toContain('where: { key: "SELLER" }');
    expect(s).toContain("db.userRole.upsert");
    expect(s).not.toContain('role: "SELLER"');
  });

  it("admin payment PATCH and DELETE commit mutations with their audit rows", () => {
    const s = read("src/app/api/admin/payments/[id]/route.ts");
    expect(s).toContain("db.$transaction");
    expect(s).toContain("tx.payment.update");
    expect(s).toContain("tx.payment.delete");
    expect(s.match(/tx\.auditLog\.create/g)?.length).toBeGreaterThanOrEqual(2);
    expect(s).not.toContain("logAudit");
    expect(s).toContain("16 * 1024");
    expect(s).toContain("No editable fields supplied");
    expect(s).toContain("paidAt must be a valid date");
  });

  it("manual payment creation, subscription activation and audit are atomic", () => {
    const s = read("src/app/api/admin/payments/route.ts");
    const postStart = s.indexOf("export async function POST");
    expect(postStart).toBeGreaterThanOrEqual(0);
    const post = s.slice(postStart);
    expect(post).toContain("db.$transaction");
    expect(post).toContain("tx.payment.create");
    expect(post).toContain("tx.premiumSubscription.update");
    expect(post).toContain("tx.auditLog.create");
    expect(post).toContain("actorId: sessionUser.id");
    expect(post).not.toContain("logAudit");
    expect(post).not.toContain("sub activation failed");
    expect(post).toContain("16 * 1024");
    expect(post).toContain("9223372036854775807n");
    expect(post).toContain("markPaid must be a boolean");
  });
});
