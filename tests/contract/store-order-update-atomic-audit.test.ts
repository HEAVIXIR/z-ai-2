import { describe, expect, it } from "vitest";
import fs from "node:fs";

const source = fs.readFileSync("src/app/api/admin/store/orders/[id]/route.ts", "utf8");
const patch = source.slice(source.indexOf("export async function PATCH("));

describe("Store order update transactional audit contract", () => {
  it("updates the order and writes its audit outbox event in one transaction", () => {
    expect(patch).toContain("storeDb.$transaction");
    expect(patch).toContain("tx.order.updateMany");
    expect(patch).toContain("enqueueAuditOutbox(tx");
    expect(patch).toContain("isolationLevel: \"Serializable\"");
    expect(patch).not.toContain("logAudit(");
  });

  it("does not permit direct paymentStatus mutation outside the payment ledger", () => {
    expect(patch).toContain('new Set(["status", "notes", "shippingAddress", "couponCode", "mechanicId"])');
    expect(patch).toContain("paymentStatus is intentionally not writable here");
    expect(patch).not.toContain("data.paymentStatus");
  });

  it("bounds and validates all mutable order metadata", () => {
    expect(patch).toContain("16 * 1024");
    expect(patch).toContain("JSON.parse(raw)");
    expect(patch).toContain("input.notes.length > 5000");
    expect(patch).toContain("input.shippingAddress.length > 2000");
    expect(patch).toContain("input.couponCode.length > 100");
    expect(patch).toContain("tx.mechanic.findUnique");
    expect(patch).toContain("P2034");
  });
});
