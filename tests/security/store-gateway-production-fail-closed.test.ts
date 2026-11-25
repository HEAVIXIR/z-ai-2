import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Store payment gateway production fail-closed contract", () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/store-zarinpal.ts"),
    "utf8",
  );

  it("does not enable mock mode in production when merchant configuration is absent", () => {
    expect(source).toContain('process.env.NODE_ENV !== "production"');
    expect(source).toContain('!MERCHANT_ID && process.env.NODE_ENV === "production"');
    expect(source).toContain("MISSING_PRODUCTION_CONFIG");
    expect(source).toContain("ZARINPAL_MERCHANT_ID is required in production");
  });

  it("fails verification closed when production gateway configuration is absent", () => {
    expect(source).toMatch(/if \(MISSING_PRODUCTION_CONFIG\)\s*\{\s*return \{ refId: null, success: false \};/);
  });

  it("uses cryptographically secure mock authorities outside production", () => {
    expect(source).toContain('import { randomBytes } from "node:crypto"');
    expect(source).toContain("randomBytes(16).toString(\"hex\")");
    expect(source).not.toContain("Math.random()");
  });
});
