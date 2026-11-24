import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const migration = readFileSync(
  path.join(process.cwd(), "prisma/migrate-passwords.ts"),
  "utf8",
);

describe("Preview password migration inventory safety", () => {
  it("reports PBKDF2 and bcrypt counts separately without exposing user identifiers", () => {
    expect(migration).toContain("PBKDF2 hashes:");
    expect(migration).toContain("supported bcrypt:");
    expect(migration).toContain("unsupported/legacy:");
    expect(migration).not.toContain("user.email");
    expect(migration).not.toContain("user.mobile");
  });

  it("does not imply this script can migrate one-way bcrypt hashes", () => {
    expect(migration).toContain("supported bcrypt hashes are not migrated by this script");
    expect(migration).toContain("accounts with bcrypt require a password reset");
    expect(migration).toContain("isLegacyBcryptHash(user.passwordHash)");
  });

  it("remains dry-run by default and only writes when --apply is explicitly passed", () => {
    expect(migration).toContain('process.argv.includes("--apply")');
    expect(migration).toContain('if (!applyRequested)');
    expect(migration).toContain("dry run only; no credentials were changed.");
    expect(migration).toContain("compare-and-swap");
  });
});
