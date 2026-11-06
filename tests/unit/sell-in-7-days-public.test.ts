import { describe, expect, it } from "vitest";
import {
  createSellIn7DaysTrackingCode,
  toPublicSellIn7DaysTracking,
} from "@/lib/sell-in-7-days-public";

describe("Sell in 7 Days public tracking security", () => {
  it("creates high-entropy tracking codes in the documented alphabet", () => {
    const code = createSellIn7DaysTrackingCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{16}$/);
  });

  it("does not expose private seller, description, or financial fields", () => {
    const createdAt = new Date("2026-11-06T10:00:00.000Z");
    const updatedAt = new Date("2026-11-06T11:00:00.000Z");
    const result = toPublicSellIn7DaysTracking({
      trackingCode: "ABCDEFGHJKLMNPQR",
      deviceName: "Excavator",
      modelName: "320D",
      year: 2020,
      workingHours: 3500,
      condition: "USED",
      province: "Tehran",
      city: "Tehran",
      prepaymentPaid: false,
      status: "PENDING_PREPAYMENT",
      currentStep: 1,
      inspectionDate: null,
      soldAt: null,
      createdAt,
      updatedAt,
      category: { name: "Excavators", slug: "excavators" },
      brand: { name: "Caterpillar", slug: "caterpillar" },
      // Deliberately extra/private source properties: the projection must
      // ignore them even if a caller passes a wider database object.
      id: "internal-id",
      sellerName: "Private Seller",
      sellerMobile: "09120000000",
      sellerEmail: "private@example.com",
      expectedPrice: 123456789n,
      description: "Private seller notes",
      prepaymentAmount: 500000n,
      valuationPrice: 100000000n,
      salePrice: 110000000n,
      commissionAmount: 1100000n,
    } as never);

    expect(result).toEqual({
      trackingCode: "ABCDEFGHJKLMNPQR",
      deviceName: "Excavator",
      modelName: "320D",
      year: 2020,
      workingHours: 3500,
      condition: "USED",
      province: "Tehran",
      city: "Tehran",
      prepaymentPaid: false,
      status: "PENDING_PREPAYMENT",
      currentStep: 1,
      inspectionDate: null,
      soldAt: null,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      category: { name: "Excavators", slug: "excavators" },
      brand: { name: "Caterpillar", slug: "caterpillar" },
    });
    expect(result).not.toHaveProperty("sellerMobile");
    expect(result).not.toHaveProperty("sellerEmail");
    expect(result).not.toHaveProperty("expectedPrice");
    expect(result).not.toHaveProperty("description");
    expect(result).not.toHaveProperty("salePrice");
    expect(result).not.toHaveProperty("id");
  });
});
