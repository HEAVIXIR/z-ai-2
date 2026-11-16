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
