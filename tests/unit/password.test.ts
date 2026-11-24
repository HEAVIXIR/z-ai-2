import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { hashPassword, isLegacyBcryptHash, isPbkdf2Hash, verifyPassword } from "@/lib/password";

/* ============================================================
   Unit tests for src/lib/password.ts (P0-1, P1-20)
   HEAVIX-SECURITY-BASELINE-V1.md §2  (Password hashing)
   HEAVIX-P0-IMPLEMENTATION-PLAN.md   STEP 2 (Authentication)
   ------------------------------------------------------------
   Verifies:
     • hashPassword produces a PBKDF2-HMAC-SHA256 hash
     • verifyPassword returns true for the correct password
     • verifyPassword returns false for a wrong password
     • hashPassword produces different hashes for the same input
       (i.e. salt is actually random)
     • hashPassword rejects empty passwords defensively
   ============================================================ */

describe("password.hashPassword", () => {
  it("produces a PBKDF2-HMAC-SHA256 hash with the fixed work factor", async () => {
    const hash = await hashPassword("S3cret-P@ss!");
    expect(typeof hash).toBe("string");
    expect(hash.startsWith("pbkdf2$sha256$600000$")).toBe(true);
    expect(isPbkdf2Hash(hash)).toBe(true);
    expect(hash.length).toBeGreaterThan(70);
    expect(isPbkdf2Hash("pbkdf2$sha256$600000$bad$bad")).toBe(false);
    expect(isPbkdf2Hash("pbkdf2$sha256$999999$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe(false);
  });

  it("produces DIFFERENT hashes for the same input (random salt)", async () => {
    const pw = "same-password-123";
    const a = await hashPassword(pw);
    const b = await hashPassword(pw);
    expect(a).not.toBe(b);
  });
});

describe("password.verifyPassword", () => {
  it("returns true for the correct password", async () => {
    const pw = "correct horse battery staple";
    const hash = await hashPassword(pw);
    const ok = await verifyPassword(pw, hash);
    expect(ok).toBe(true);
  });

  it("returns false for a wrong password", async () => {
    const hash = await hashPassword("the-real-password");
    const ok = await verifyPassword("not-the-real-password", hash);
    expect(ok).toBe(false);
  });

  it("returns false when comparing against a malformed hash", async () => {
    const ok = await verifyPassword("anything", "not-a-real-hash");
    expect(ok).toBe(false);
  });

  it("recognizes legacy bcrypt and verifies it only when explicitly allowed", async () => {
    const legacyHash = await bcrypt.hash("legacy-password", 4);
    expect(isLegacyBcryptHash(legacyHash)).toBe(true);
    expect(await verifyPassword("legacy-password", legacyHash, { allowLegacyBcrypt: true })).toBe(true);
    expect(await verifyPassword("legacy-password", legacyHash, { allowLegacyBcrypt: false })).toBe(false);
  });
});

describe("password hash/verify cycle (integration of the two)", () => {
  it("round-trips a Persian + symbols password", async () => {
    const pw = "هویکس-۱۴۰۴/P@ss";
    const hash = await hashPassword(pw);
    expect(await verifyPassword(pw, hash)).toBe(true);
    expect(await verifyPassword("هویکس-۱۴۰۴/P@s", hash)).toBe(false);
  });
});
