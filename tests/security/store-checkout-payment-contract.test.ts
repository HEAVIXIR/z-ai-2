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
    expect(route).toMatch(/cancelStoreOrder\(id, user\.id\)/);
    expect(route).toMatch(/ORDER_RETURN_WORKFLOW_REQUIRED/);
    expect(route).toMatch(/ORDER_SHIPMENT_WORKFLOW_REQUIRED/);
    expect(route).toMatch(/checkCsrf\(req\)/);
  });

  it("serializes procurement receipt against the global Part-to-warehouse inventory lock order", () => {
    const service = read("src/lib/store-procurement-service.ts");
    const partLock = service.indexOf('SELECT id FROM "Part" WHERE id = ${poItem.partId} FOR UPDATE');
    const partRead = service.indexOf("const part = await tx.part.findUnique", partLock);
    const balanceRead = service.indexOf("tx.inventoryBalance.findMany", partRead);
    expect(partLock).toBeGreaterThan(-1);
    expect(partRead).toBeGreaterThan(partLock);
    expect(balanceRead).toBeGreaterThan(partRead);
    expect(service).toMatch(/isolationLevel: 'Serializable'/);
  });

  it("serializes reservation release and reports transaction conflicts", () => {
    const service = read("src/lib/store-inventory-service.ts");
    const release = service.slice(service.indexOf("export async function releaseStock"), service.indexOf("// ── getLowStockItems"));
    expect(release).toMatch(/reserved: \{ decrement: qty \}/);
    expect(release).toMatch(/isolationLevel: 'Serializable'/);
    expect(release).toMatch(/err\?\.code === 'P2034'/);
  });

  it("creates shipments only for paid confirmed orders and records audit atomically", () => {
    const service = read("src/lib/store-shipments-service.ts");
    expect(service).toMatch(/order\.paymentStatus !== 'PAID'/);
    expect(service).toMatch(/isolationLevel: 'Serializable'/);
    expect(service).toMatch(/enqueueAuditOutbox\(tx/);
    expect(service).toMatch(/order\.shipment/);
  });

  it("synchronizes order SHIPPED/DELIVERED states through shipment tracking only", () => {
    const service = read("src/lib/store-shipments-service.ts");
    const route = read("src/app/api/admin/store/orders/[id]/route.ts");
    expect(service).toMatch(/store\.order\.fulfillment\.transition/);
    expect(service).toMatch(/status === 'DISPATCHED' \|\| status === 'DELIVERED'/);
    expect(service).toMatch(/nextOrderStatus = status === 'DISPATCHED' \? 'SHIPPED' : 'DELIVERED'/);
    expect(service).toMatch(/expectedOrderStatuses\.includes\(orderBefore\.status\)/);
    expect(service).toMatch(/status: orderBefore\.status/);
    expect(service).toMatch(/updatedAt: orderBefore\.updatedAt/);
    expect(service).toMatch(/orderChanged\.count !== 1/);
    expect(route).toMatch(/ORDER_SHIPMENT_WORKFLOW_REQUIRED/);
    expect(route).toMatch(/body\.status === "SHIPPED" \|\| body\.status === "DELIVERED"/);
  });

  it("enforces ordered shipment transitions and atomically appends tracking plus audit", () => {
    const service = read("src/lib/store-shipments-service.ts");
    expect(service).toMatch(/const transitions: Record<string, string\[\]>/);
    expect(service).toMatch(/transitions\[existing\.status\]/);
    expect(service).toMatch(/where: \{ id: shipmentId, status: existing\.status, updatedAt: existing\.updatedAt \}/);
    expect(service).toMatch(/tx\.shipmentTracking\.create/);
    expect(service).toMatch(/enqueueAuditOutbox\(tx/);
    expect(service).toMatch(/isolationLevel: 'Serializable'/);
    expect(service).toMatch(/تغییر وضعیت محموله فقط از طریق ثبت رویداد رهگیری مجاز است/);
  });

  it("serializes cumulative manual refunds and refuses unimplemented gateway refunds", () => {
    const service = read("src/lib/commerce-service.ts");
    expect(service).toMatch(/export async function refundPayment/);
    expect(service).toMatch(/Number\.isSafeInteger\(amtIrr\)/);
    expect(service).toMatch(/original\.method === 'GATEWAY' \|\| original\.gateway/);
    expect(service).toMatch(/refund-of-payment:/);
    expect(service).toMatch(/alreadyRefunded \+ amtIrr > Number\(original\.amountIrr\)/);
    expect(service).toMatch(/updatedAt: original\.updatedAt/);
    expect(service).toMatch(/isolationLevel: 'Serializable'/);
    expect(service).toMatch(/enqueueAuditOutbox\(tx/);
  });

  it("keeps the main payment ledger append-only and blocks direct PAID/REFUNDED overrides", () => {
    const route = read("src/app/api/admin/payments/[id]/route.ts");
    expect(route).toMatch(/PAYMENT_STATE_ACTION_REQUIRED/);
    expect(route).toMatch(/PAYMENT_LEDGER_IMMUTABLE/);
    expect(route).toContain('const forbiddenFields = ["status", "type", "gateway", "paidAt"];');
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
