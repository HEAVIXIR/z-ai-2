import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), "utf8");

describe("account security center contracts", () => {
  it("protects password changes with session auth, CSRF, current-password verification and session rotation", () => {
    const route = read("src/app/api/account/password/route.ts");
    expect(route).toMatch(/checkCsrf\(req\)/);
    expect(route).toMatch(/getCurrentUser\(\)/);
    expect(route).toMatch(/verifyPassword\(currentPassword, user\.passwordHash\)/);
    expect(route).toMatch(/tx\.session\.deleteMany/);
    expect(route).toMatch(/type: \{ in: \["PASSWORD_RESET", "EMAIL_CHANGE", "MOBILE_CHANGE"\] \}/);
    expect(route).toMatch(/createUserSession\(user\.id\)/);
  });

  it("requires current password and a single-use expiring email OTP before changing the email", () => {
    const request = read("src/app/api/account/email-change/request/route.ts");
    const verify = read("src/app/api/account/email-change/verify/route.ts");
    expect(request).toMatch(/verifyPassword/);
    expect(request).toMatch(/type: "EMAIL_CHANGE"/);
    expect(request).toMatch(/10 \* 60 \* 1000/);
    expect(verify).toMatch(/type: "EMAIL_CHANGE"/);
    expect(verify).toMatch(/consumed\.count !== 1/);
    expect(verify).toMatch(/emailVerified: true/);
    expect(verify).toMatch(/tx\.session\.deleteMany/);
  });

  it("never changes a mobile number unless an SMS verification provider is available", () => {
    const route = read("src/app/api/account/mobile-change/route.ts");
    expect(route).toMatch(/SMS_VERIFICATION_NOT_CONFIGURED/);
    expect(route).not.toMatch(/db\.user\.update/);
    expect(route).toMatch(/checkCsrf\(req\)/);
  });

  it("exposes only the current user's contact values and verification states", () => {
    const route = read("src/app/api/account/identity/route.ts");
    expect(route).toMatch(/email: user\.email/);
    expect(route).toMatch(/mobile: user\.mobile/);
    expect(route).toMatch(/getCurrentUser\(\)/);
  });
});
