import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("monetization seed financial-integrity contract", () => {
  it("never fabricates paid payments or active subscriptions for arbitrary users", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "prisma/seed-phase6-7-automation-monetization.ts"),
      "utf8",
    );
    expect(source).not.toContain("db.payment.create");
    expect(source).not.toContain("db.premiumSubscription.create");
    expect(source).not.toContain("const adminUser = users[0]");
    expect(source).toContain("does NOT fabricate Payment or PremiumSubscription");
  });
});
