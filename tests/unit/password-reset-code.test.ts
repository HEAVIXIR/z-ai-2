import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashPassword, isPbkdf2Hash } from "@/lib/password";
import { verifyPasswordResetCode } from "@/lib/password-reset-code";

describe("password reset code verification", () => {
  it("verifies PBKDF2 reset codes created by the forgot-password route", async () => {
    const code = "483921";
    const stored = await hashPassword(code);

    expect(isPbkdf2Hash(stored)).toBe(true);
    expect(await verifyPasswordResetCode(code, stored)).toBe(true);
    expect(await verifyPasswordResetCode("000000", stored)).toBe(false);
  });

  it("preserves legacy raw and SHA-256 reset-code compatibility", async () => {
    const code = "123456";
    const sha256 = createHash("sha256").update(code).digest("hex");

    expect(await verifyPasswordResetCode(code, code)).toBe(true);
    expect(await verifyPasswordResetCode(code, sha256)).toBe(true);
    expect(await verifyPasswordResetCode("654321", sha256)).toBe(false);
  });
});
