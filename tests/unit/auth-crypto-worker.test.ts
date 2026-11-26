import { describe, expect, it } from "vitest";
import {
  BCRYPT_COST,
  hashPasswordWithBcrypt,
  verifyPasswordWithBcrypt,
} from "../../workers/auth-crypto/crypto";

describe("isolated HEAVIX auth crypto worker", () => {
  it("preserves bcrypt cost 10 and emits a standard 60-character hash", async () => {
    const hash = await hashPasswordWithBcrypt("HEAVIX-test-password");
    expect(hash).toMatch(/^\$2[aby]\$10\$/);
    expect(hash).toHaveLength(60);
    expect(BCRYPT_COST).toBe(10);
  });

  it("verifies a correct password and rejects a wrong password", async () => {
    const hash = await hashPasswordWithBcrypt("correct-password");
    await expect(verifyPasswordWithBcrypt("correct-password", hash)).resolves.toBe(true);
    await expect(verifyPasswordWithBcrypt("incorrect-password", hash)).resolves.toBe(false);
  });

  it("uses a fresh salt for every generated hash", async () => {
    const first = await hashPasswordWithBcrypt("same-password");
    const second = await hashPasswordWithBcrypt("same-password");
    expect(first).not.toBe(second);
    await expect(verifyPasswordWithBcrypt("same-password", first)).resolves.toBe(true);
    await expect(verifyPasswordWithBcrypt("same-password", second)).resolves.toBe(true);
  });

  it("rejects new hashes that bcrypt would silently truncate after 72 UTF-8 bytes", async () => {
    await expect(hashPasswordWithBcrypt("x".repeat(73))).rejects.toThrow(RangeError);
    await expect(hashPasswordWithBcrypt("😀".repeat(19))).rejects.toThrow(RangeError);
    await expect(hashPasswordWithBcrypt("😀".repeat(18))).resolves.toMatch(/^\$2[aby]\$10\$/);
  });

  it("preserves legacy verification semantics for passwords longer than 72 bytes", async () => {
    const legacyPrefix = "x".repeat(72);
    const legacyHash = await hashPasswordWithBcrypt(legacyPrefix);
    await expect(verifyPasswordWithBcrypt(legacyPrefix + "-legacy-suffix", legacyHash)).resolves.toBe(true);
  });

  it("fails closed for malformed, wrong-cost, and unsupported hashes", async () => {
    await expect(verifyPasswordWithBcrypt("anything", "not-a-bcrypt-hash")).resolves.toBe(false);
    await expect(
      verifyPasswordWithBcrypt("anything", "$2b$12$....................................................."),
    ).resolves.toBe(false);
  });

  it("rejects empty or oversized transport inputs", async () => {
    await expect(hashPasswordWithBcrypt("")).rejects.toThrow(TypeError);
    await expect(hashPasswordWithBcrypt("x".repeat(1025))).rejects.toThrow(TypeError);
    await expect(verifyPasswordWithBcrypt("", "$2b$10$.....................................................")).resolves.toBe(false);
  });
});
