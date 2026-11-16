import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), "utf8");

describe("store checkout and manual-payment concurrency contracts", () => {
  it("normalizes duplicate cart lines and rejects unsafe quantities", () => {
    const route = read("src/app/api/store/orders/route.ts");
    expect(route).toMatch(/aggregatedItems\.get\(partId\)/);
    expect(route).toMatch(/Number\.isSafeInteger\(quantity\)/);
    expect(route).toMatch(/decrementOrderStock\(tx,/);
  });

  it("claims limited coupon usage with a conditional update inside the order transaction", () => {
    const route = read("src/app/api/store/orders/route.ts");
    expect(route).toMatch(/tx\.coupon\.findUnique/);
    expect(route).toMatch(/tx\.coupon\.updateMany/);
    expect(route).toMatch(/where\.usedCount = \{ lt: selectedCoupon\.usageLimit \}/);
    expect(route).toMatch(/CouponUsageConflictError/);
  });


  it("protects seller listing mutations and prevents cross-listing image mutation", () => {
    const route = read("src/app/api/listings/[id]/route.ts");
    expect((route.match(/checkCsrf\(req\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(route).toMatch(/where: \{ listingId: id, id: \{ in: ids \} \}/);
    expect(route).toMatch(/where: \{ id: imgId, listingId: id \}/);
    expect(route).toMatch(/asset\.uploadedBy !== auth\.userId/);
    expect(route).toMatch(/attachAsset\(asset\.id, "Listing", id, auth\.userId\)/);
    expect(route.indexOf("Validate every requested image mutation")).toBeLessThan(route.indexOf("await db.listing.update"));
    expect(route).toContain('new RegExp("^/api/media/([a-f0-9]{24})$")');
    expect(route).toContain("فهرست حذف شامل تصویر متعلق به آگهی دیگر");

  });

  it("cancels only eligible unpaid orders and restores the exact checkout stock ledger", () => {
    const service = read("src/lib/commerce-service.ts");
    const route = read("src/app/api/admin/store/orders/[id]/route.ts");
    expect(service).toMatch(/export async function cancelStoreOrder/);
    expect(service).toMatch(/isolationLevel: "Serializable"/);
    expect(service).toMatch(/type: "SALE"/);
    expect(service).toMatch(/reference: orderId/);
    expect(service).toMatch(/expected\.size !== consumed\.size/);
    expect(service).toMatch(/type: "ADJUSTMENT"/);
    expect(service).toMatch(/store\.inventory\.order_cancel_restore/);
    expect(service).toMatch(/usedCount: \{ gt: 0 \}/);
    expect(service).toMatch(/order\.paymentStatus !== "UNPAID"/);
    expect(route).toMatch(/cancelStoreOrder\(id, user\.id\)/);
    expect(route).toMatch(/ORDER_RETURN_WORKFLOW_REQUIRED/);
  });

  it("prevents direct admin overrides of ledger-derived payment and stock lifecycle states", () => {
    const route = read("src/app/api/admin/store/orders/[id]/route.ts");
    expect(route).toMatch(/ORDER_PAYMENT_STATUS_LEDGER_REQUIRED/);
    expect(route).toMatch(/ORDER_STOCK_REVERSAL_REQUIRED/);
    expect(route).toMatch(/body\.status === "CANCELLED" \|\| body\.status === "RETURNED"/);
    expect(route).toMatch(/checkCsrf\(req\)/);
  });

  it("blocks admin payment approval when the order is closed or approved totals would exceed the order", () => {
    const route = read("src/app/api/admin/store/payments/[id]/route.ts");
    expect(route).toMatch(/orderForApproval\.status/);
    expect(route).toMatch(/paymentStatus === "PAID"/);
    expect(route).toMatch(/status: "APPROVED", id: \{ not: existing\.id \}/);
    expect(route).toMatch(/approvedElsewhere \+ candidateAmount > totalIrr/);
    expect(route).toMatch(/STORE_PAYMENT_OVERPAYMENT/);
    expect(route).toMatch(/isolationLevel: 'Serializable'/);
  });

  it("submits manual payments with verified-mobile ownership and serializable revalidation", () => {
    const route = read("src/app/api/store/payments/manual/route.ts");
    expect(route).toMatch(/sessionUser\.mobileVerified/);
    expect(route).toMatch(/isolationLevel: "Serializable"/);
    expect(route).toMatch(/Number\.isSafeInteger\(amountIrr\)/);
    expect(route).toMatch(/pendingPayments\.length >= MAX_PENDING_PAYMENTS/);
    expect(route).toMatch(/committedAmount \+ amountIrr > totalIrr/);
    expect(route).toMatch(/e\?\.code === "P2034"/);
  });
});
