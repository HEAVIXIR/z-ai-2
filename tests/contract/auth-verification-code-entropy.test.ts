import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

describe("authentication verification code entropy contract", () => {
  it("uses Node's cryptographic randomInt for mobile and email registration codes", () => {
    const source = read("src/app/api/auth/register/route.ts");
    expect(source).toContain('import { randomInt } from "node:crypto"');
    expect(source).toContain("randomInt(10000, 100000)");
    expect(source).toContain("randomInt(100000, 1000000)");
    expect(source).not.toContain("Math.random");
  });

  it("uses Node's cryptographic randomInt for resend verification codes", () => {
    const source = read("src/app/api/auth/resend-verification/route.ts");
    expect(source).toContain('import { randomInt } from "node:crypto"');
    expect(source).toContain("randomInt(100000, 1000000)");
    expect(source).not.toContain("Math.random");
  });
});
