import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Store Zarinpal mock gateway environment boundary", () => {
  it("fails closed in production when the merchant ID is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ZARINPAL_MERCHANT_ID", "");

    const gateway = await import("@/lib/store-zarinpal");

    expect(gateway.isSandbox()).toBe(false);
    await expect(gateway.requestPayment({
      amountIrr: 100_000,
      description: "test",
      callbackUrl: "https://heavix.ir/callback",
    })).rejects.toThrow(/mock payments are disabled/i);
    await expect(gateway.verifyPayment({
      authority: "MOCK-forged",
      status: "OK",
      amountIrr: 100_000,
    })).resolves.toEqual({ refId: null, success: false });
  });

  it("keeps mock mode available only outside production and uses an opaque random authority", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ZARINPAL_MERCHANT_ID", "");

    const gateway = await import("@/lib/store-zarinpal");
    const result = await gateway.requestPayment({
      amountIrr: 100_000,
      description: "test",
      callbackUrl: "http://localhost:3000/callback",
    });

    expect(gateway.isSandbox()).toBe(true);
    expect(result.authority).toMatch(/^MOCK-\d+-[a-f0-9]{32}$/);
    expect(result.method).toBe("MOCK");
  });

  it("does not use Math.random for payment authorities", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/store-zarinpal.ts"),
      "utf8",
    );
    expect(source).toContain('import { randomBytes } from "node:crypto"');
    expect(source).not.toContain("Math.random");
  });
});
