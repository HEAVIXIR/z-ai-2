import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("Worker-compatible password hash migration", () => {
  it("uses WebCrypto PBKDF2-HMAC-SHA256 for new hashes", () => {
    const password = read("src/lib/password.ts");
    expect(password).toContain("PBKDF2_ITERATIONS = 600_000");
    expect(password).toContain('name: "PBKDF2"');
    expect(password).toContain('hash: "SHA-256"');
    expect(password).toContain("crypto.subtle.deriveBits");
    expect(password).toContain("return `pbkdf2$sha256$");
  });

  it("keeps legacy bcrypt verification opt-in and disabled by the Cloudflare Preview config", () => {
    const password = read("src/lib/password.ts");
    const wrangler = read("wrangler.jsonc");
    expect(password).toContain('process.env.HEAVIX_AUTH_ALLOW_LEGACY_BCRYPT !== "false"');
    expect(wrangler).toContain('"HEAVIX_AUTH_ALLOW_LEGACY_BCRYPT": "false"');
    expect(wrangler).not.toContain('"limits"');
  });

  it("migrates a legacy bcrypt hash after successful Node/Vercel login", () => {
    const apiLogin = read("src/app/api/auth/login/route.ts");
    const serverAction = read("src/app/login/actions.ts");
    for (const source of [apiLogin, serverAction]) {
      expect(source).toContain("isLegacyBcryptHash(user.passwordHash)");
      expect(source).toContain("await hashPassword");
      expect(source).toContain("passwordHash: migratedPasswordHash");
    }
    expect(apiLogin).toContain("process.env.HEAVIX_AUTH_ALLOW_LEGACY_BCRYPT !== \"false\"");
  });

  it("does not run the old bcrypt-based one-time migration against PBKDF2 hashes", () => {
    const migration = read("prisma/migrate-passwords.ts");
    expect(migration).toContain("isLegacyBcryptHash(value) || isPbkdf2Hash(value)");
    expect(migration).toContain("await hashPassword(recovered.plaintext)");
    expect(migration).not.toContain("bcrypt.hash(");
  });
});
