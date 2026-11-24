import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const source = fs.readFileSync(
  path.join(ROOT, "src/app/api/auth/login/route.ts"),
  "utf8",
);

describe("Login Worker query-fanout contract", () => {
  it("loads canonical RBAC role keys with the initial user lookup", () => {
    expect(source).toContain("userRoles: { select: { role: { select: { key: true } } } }");
    expect(source).not.toContain('import { isAdmin } from "@/lib/authorization"');
    expect(source).not.toContain("db.userRole.findMany");
    expect(source).not.toContain("isAdmin(user.id)");
  });

  it("preserves password verification, CSRF, and canonical session creation", () => {
    expect(source).toContain("checkCsrf(req)");
    expect(source).toContain("verifyPassword(String(password), user.passwordHash, { allowLegacyBcrypt })");
    expect(source).toContain('process.env.HEAVIX_AUTH_ALLOW_LEGACY_BCRYPT !== "false"');
    expect(source).toContain("isLegacyBcryptHash(user.passwordHash)");
    expect(source).toContain("await createUserSession(user.id)");
  });

  it("keeps owner role bootstrap Preview-only and allowlist-bound", () => {
    expect(source).toContain('process.env.HEAVIX_ENV === "preview"');
    expect(source).toContain("process.env.HEAVIX_OWNER_EMAIL");
    expect(source).toContain('roles.includes("ADMIN")');
    expect(source).toContain("tx.userRole.upsert");
    expect(source).toContain("await logAudit");
  });
});
