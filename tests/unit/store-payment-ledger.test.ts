import { describe, expect, it } from "vitest";
import { computeStoreOrderPaymentStatus } from "@/lib/store-payment-ledger";

describe("computeStoreOrderPaymentStatus", () => {
  it("returns UNPAID when there are no approved payments and no refund", () => {
    expect(computeStoreOrderPaymentStatus(1000, 0, false)).toBe("UNPAID");
  });

  it("returns PARTIAL when approved payments do not cover the order", () => {
    expect(computeStoreOrderPaymentStatus(1000, 500, false)).toBe("PARTIAL");
  });

  it("returns PAID when approved payments cover the order without refunds", () => {
    expect(computeStoreOrderPaymentStatus(1000, 1000, false)).toBe("PAID");
  });

  it("returns PARTIAL after one payment is refunded while another remains approved", () => {
    // The refunded row has already left the APPROVED sum; subtracting it
    // again would incorrectly turn this 500/1000 balance into REFUNDED.
    expect(computeStoreOrderPaymentStatus(1000, 500, true)).toBe("PARTIAL");
  });

  it("returns REFUNDED when all approved value has been removed by refunding", () => {
    expect(computeStoreOrderPaymentStatus(1000, 0, true)).toBe("REFUNDED");
  });

  it("preserves the existing domain rule when a refund exists but approved value still covers the order", () => {
    expect(computeStoreOrderPaymentStatus(1000, 1000, true)).toBe("REFUNDED");
  });

  it("rejects invalid ledger totals", () => {
    expect(() => computeStoreOrderPaymentStatus(1000, Number.NaN, false)).toThrow(TypeError);
    expect(() => computeStoreOrderPaymentStatus(-1, 1000, false)).toThrow(TypeError);
  });
});
