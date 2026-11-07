import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

describe("manual marketplace payment creation transaction contract", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "src/app/api/admin/payments/route.ts"),
    "utf8",
  );

  it("creates the payment, activates only the linked same-user subscription, and audits in one transaction", () => {
    expect(source).toContain("await db.$transaction(async (tx) =>");
    expect(source).toContain("tx.payment.create");
    expect(source).toContain("tx.premiumSubscription.updateMany");
    expect(source).toContain("where: { id: subscriptionId, userId }");
    expect(source).toContain("tx.auditLog.create");
    expect(source).not.toContain("await logAudit(");
  });

  it("requires a subscription reference only for subscription payment types", () => {
    expect(source).toContain("subscriptionId is required for subscription payments");
    expect(source).toContain("subscriptionId is only valid for subscription payments");
    expect(source).toContain("linkedSubscription.userId !== userId");
  });

  it("fails closed for malformed/non-object request bodies", () => {
    expect(source).toContain("if (!body || typeof body !== \"object\" || Array.isArray(body))");
  });
});
