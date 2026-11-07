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

  it("accepts only the MANUAL gateway on the offline-entry endpoint", () => {
    expect(source).toContain('if (gateway !== "MANUAL")');
    expect(source).toContain("online gateways require verified provider callbacks");
  });

  it("fails closed for malformed/non-object request bodies", () => {
    expect(source).toContain("if (!body || typeof body !== \"object\" || Array.isArray(body))");
  });
});


describe("dedicated payment API ledger immutability", () => {
  it("never hard-deletes payment ledger rows", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/api/admin/payments/[id]/route.ts"),
      "utf8",
    );
    expect(source).toContain("PAYMENT_LEDGER_IMMUTABLE");
    expect(source).toContain("Payment ledger entries are immutable");
    expect(source).not.toMatch(/db\.payment\.delete\s*\(/);
  });
});


describe("manual payment input validation", () => {
  it("rejects lossy numeric parsing and non-IRR currency", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/api/admin/payments/route.ts"),
      "utf8",
    );
    expect(source).toContain("amount must be a positive whole number of IRR");
    expect(source).toContain("Manual payments currently support IRR only");
    expect(source).toContain("A reason of 5–500 characters is required");
    expect(source).not.toContain("parseBig(body.amount)");
  });

  it("requires an offline/manual gateway and records an explicit reason", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/api/admin/payments/route.ts"),
      "utf8",
    );
    expect(source).toContain('if (gateway !== "MANUAL")');
    expect(source).toContain("reason,");
    expect(source).toContain("tx.auditLog.create");
  });
});
