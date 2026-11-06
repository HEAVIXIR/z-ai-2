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

  it("seller lifecycle mutations and audit writes share a transaction", () => {
    const s = read("src/lib/seller-service.ts");
    expect(s).toContain("async function writeSellerAudit");
    expect(s).toContain("await tx.auditLog.create");
    expect(s).not.toContain("logAudit");
    expect(s).not.toContain('before.user.status === "PENDING" || before.user.status === "BLOCKED"');
    for (const method of ["registerSeller", "verifySeller", "suspendSeller"]) {
      const start = s.indexOf(`export async function ${method}`);
      expect(start).toBeGreaterThanOrEqual(0);
      const next = s.indexOf("\nexport async function ", start + 1);
      const body = s.slice(start, next === -1 ? s.length : next);
      expect(body).toContain("db.$transaction");
      expect(body).toContain("writeSellerAudit(tx");
    }
  });

  it("seller lifecycle API validates bounded JSON and hides internal errors", () => {
    const s = read("src/app/api/admin/sellers/[id]/route.ts");
    expect(s).toContain('contentType !== "application/json"');
    expect(s).toContain("16 * 1024");
    expect(s).toContain("req.body?.getReader()");
    expect(s).toContain('new TextDecoder("utf-8", { fatal: true })');
    expect(s).toContain("Unknown request field");
    expect(s).toContain('typeof payload.action !== "string"');
    expect(s).toContain('{ error: "Unable to update seller" }');
    expect(s).not.toContain('{ error: err?.message ?? "Server error" }');
  });

  it("registerSeller assigns canonical SELLER UserRole", () => {
    const s = read("src/lib/seller-service.ts");
    expect(s).toContain('where: { key: "SELLER" }');
    expect(s).toContain("db.userRole.upsert");
    expect(s).not.toContain('role: "SELLER"');
  });
});
