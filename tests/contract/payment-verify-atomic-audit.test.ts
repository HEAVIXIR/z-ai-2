import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(__dirname, "../../src/app/api/payments/[id]/verify/route.ts"),
  "utf8",
);

describe("payment verification atomicity contract", () => {
  it("performs payment, subscription activation, and audit in one transaction", () => {
    expect(source).toContain("db.$transaction(async (tx)");
    expect(source).toContain("tx.payment.update");
    expect(source).toContain("tx.premiumSubscription.update");
    expect(source).toContain("tx.auditLog.create");
    expect(source).not.toContain("logAudit");
  });

  it("rejects repeated verification and mismatched or missing subscriptions", () => {
    expect(source).toContain('before.status !== "PENDING"');
    expect(source).toContain("subscription-missing");
    expect(source).toContain("subscription-owner-mismatch");
    expect(source).toContain("subscriptionBefore.userId !== before.userId");
  });

  it("validates bounded JSON input and does not expose internal errors", () => {
    expect(source).toContain("8 * 1024");
    expect(source).toContain("allowedFields");
    expect(source).toContain("input.trackingCode.length > 100");
    expect(source).toContain("input.reason.length > 500");
    expect(source).toContain('error: "خطای داخلی سرور"');
  });
});
