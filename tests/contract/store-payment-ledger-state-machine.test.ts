import { describe, expect, it } from "vitest";
import fs from "node:fs";

const source = fs.readFileSync("src/app/api/admin/store/payments/[id]/route.ts", "utf8");

describe("Store admin payment ledger state machine contract", () => {
  it("serializes all payment mutations on the parent order", () => {
    expect(source).toContain("pg_advisory_xact_lock(hashtextextended");
    expect(source).toContain("tx.payment.updateMany");
    expect(source).toContain("where: { id, status: existing.status }");
  });

  it("allows only pending approval/rejection and approved refund transitions", () => {
    expect(source).toContain('PENDING: ["APPROVED", "REJECTED"]');
    expect(source).toContain('APPROVED: ["REFUNDED"]');
    expect(source).toContain('REJECTED: []');
    expect(source).toContain('REFUNDED: []');
    expect(source).toContain("INVALID_TRANSITION");
  });

  it("recalculates order payment state from approved and refunded ledger totals", () => {
    expect(source).toContain('status: "APPROVED"');
    expect(source).toContain('status: "REFUNDED"');
    expect(source).toContain("const netApproved = approvedTotal - refundedTotal");
    expect(source).toContain('hasRefund && netApproved <= 0 ? "REFUNDED"');
  });

  it("commits payment and order audit events in the same transaction", () => {
    expect(source).toContain("storeDb.$transaction");
    expect(source).toContain("await enqueueAuditOutbox(tx");
    expect(source).toContain("action: \"store.payment.update\"");
    expect(source).toContain("action: \"store.order.update\"");
  });
});
