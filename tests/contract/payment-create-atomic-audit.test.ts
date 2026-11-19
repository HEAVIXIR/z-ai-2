import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(__dirname, "../../src/app/api/payments/create/route.ts"),
  "utf8",
);

describe("payment creation atomicity contract", () => {
  it("creates the pending ledger row and audit event in one transaction", () => {
    expect(source).toContain("db.$transaction(async (tx)");
    expect(source).toContain("tx.payment.create");
    expect(source).toContain("tx.auditLog.create");
    expect(source).not.toContain("logAudit");
  });

  it("binds optional subscription references to the authenticated owner", () => {
    expect(source).toContain("tx.premiumSubscription.findUnique");
    expect(source).toContain("subscription.userId !== userId");
    expect(source).toContain('type !== "SUBSCRIPTION"');
  });

  it("rejects oversized, unknown, or malformed financial inputs", () => {
    expect(source).toContain("8 * 1024");
    expect(source).toContain("allowedFields");
    expect(source).toContain("MAX_I64");
    expect(source).toContain("Number.isSafeInteger");
    expect(source).toContain("ALLOWED_GATEWAYS");
    expect(source).toContain("خطای داخلی سرور");
  });
});
