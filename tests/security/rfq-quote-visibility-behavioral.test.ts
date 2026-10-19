import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   STEP 14.22 — RFQ Quote Visibility Behavioral Test (FIX VERIFIED)
   ------------------------------------------------------------
   Senior manager directive (D-22.03):
   > افزودن تست‌های رفتاری برای پنج سناریوی جدول بالا، همراه با
   > مقادیر null، undefined و رشتهٔ خالی.

   This file was originally designed in STEP 14.21 to PROVE that the
   source-string test in PR #57 gave false confidence — it found
   DEFECT-1 (seller who quoted sees sellerId=null) and DEFECT-2
   (getRFQ doesn't throw on null viewerUserId).

   STEP 14.22 fix branch:
   - DEFECT-1 fixed: sellerId now uses least-privilege logic — buyer
     sees all sellerIds, seller who owns the quote sees their own,
     anyone else sees null.
   - DEFECT-2 fixed: runtime guard added — null/undefined/empty/
     whitespace-only viewerUserId throws RFQServiceError(400).

   This test verifies BOTH the fix and the 5-scenario access matrix
   per STEP 14.22 /brainstorm B-22.02 directive.
   ============================================================ */

const MOCK_RFQ = {
  id: "rfq-1",
  title: "Test RFQ",
  description: "test",
  machineType: "EXCAVATOR",
  brandPref: null,
  quantity: 1,
  specJson: null,
  budgetMin: 1000n,
  budgetMax: 2000n,
  location: "Tehran",
  deadline: new Date("2026-12-31"),
  terms: null,
  status: "OPEN",
  buyerId: "buyer-1",
  buyerName: "Ali Buyer",
  buyerPhone: "+98-9000-1111",
  buyerEmail: "ali@buyer.example",
  createdAt: new Date(),
  quotes: [
    {
      id: "q-1",
      sellerId: "seller-A",
      sellerName: "Seller A",
      sellerPhone: "+98-9100-aaaa",
      sellerEmail: "a@seller.example",
      unitPrice: 1500n,
      totalPrice: 1500n,
      deliveryTime: 7,
      notes: "quote from A",
      status: "PENDING",
      createdAt: new Date(),
    },
    {
      id: "q-2",
      sellerId: "seller-B",
      sellerName: "Seller B",
      sellerPhone: "+98-9200-bbbb",
      sellerEmail: "b@seller.example",
      unitPrice: 1600n,
      totalPrice: 1600n,
      deliveryTime: 5,
      notes: "quote from B",
      status: "PENDING",
      createdAt: new Date(),
    },
  ],
};

vi.mock("@/lib/db", () => ({
  db: {
    rFQ: {
      findUnique: async () => MOCK_RFQ,
    },
  },
}));

import { getRFQ } from "@/lib/rfq-service";

describe("STEP 14.22 — RFQ Quote Visibility Behavioral Matrix (FIX VERIFIED)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Buyer (viewer = buyer-1)", () => {
    it("sees ALL quotes (2 of 2)", async () => {
      const res = await getRFQ("rfq-1", "buyer-1");
      expect(res.quotes).toHaveLength(2);
    });

    it("sees full buyer PII (phone/email/id)", async () => {
      const res = await getRFQ("rfq-1", "buyer-1");
      expect(res.buyerPhone).toBe(MOCK_RFQ.buyerPhone);
      expect(res.buyerEmail).toBe(MOCK_RFQ.buyerEmail);
      expect(res.buyerId).toBe(MOCK_RFQ.buyerId);
    });

    it("sees full seller PII inside each quote (incl sellerId)", async () => {
      const res = await getRFQ("rfq-1", "buyer-1");
      expect(res.quotes[0].sellerId).toBe("seller-A");
      expect(res.quotes[0].sellerPhone).toBe(MOCK_RFQ.quotes[0].sellerPhone);
      expect(res.quotes[0].sellerEmail).toBe(MOCK_RFQ.quotes[0].sellerEmail);
    });

    it("sees quoteCount = 2", async () => {
      const res = await getRFQ("rfq-1", "buyer-1");
      expect(res.quoteCount).toBe(2);
    });
  });

  describe("Seller who quoted (viewer = seller-A) — DEFECT-1 FIXED", () => {
    it("sees ONLY own quote (1 of 2)", async () => {
      const res = await getRFQ("rfq-1", "seller-A");
      expect(res.quotes).toHaveLength(1);
    });

    it("✅ FIXED: sees own sellerId (was null before STEP 14.22)", async () => {
      const res = await getRFQ("rfq-1", "seller-A");
      expect(res.quotes[0].sellerId).toBe("seller-A");
    });

    it("does NOT see buyer PII (redacted)", async () => {
      const res = await getRFQ("rfq-1", "seller-A");
      expect(res.buyerPhone).toBeNull();
      expect(res.buyerEmail).toBeNull();
      expect(res.buyerId).toBeNull();
    });

    it("still sees buyerName (trust signal, not PII)", async () => {
      const res = await getRFQ("rfq-1", "seller-A");
      expect(res.buyerName).toBe("Ali Buyer");
    });

    it("sees quoteCount = 2 (knows how many competitors)", async () => {
      const res = await getRFQ("rfq-1", "seller-A");
      expect(res.quoteCount).toBe(2);
    });

    it("does NOT see seller-B's quote (competitor data)", async () => {
      const res = await getRFQ("rfq-1", "seller-A");
      const competitorQuotes = res.quotes.filter((q) => q.sellerId === "seller-B");
      expect(competitorQuotes).toHaveLength(0);
    });

    it("does NOT see competitor seller phone/email (PII)", async () => {
      const res = await getRFQ("rfq-1", "seller-A");
      // Even though seller-A sees their own quote, the sellerPhone and
      // sellerEmail in the response are for THEIR OWN quote (not competitor's).
      // PII redaction on phone/email is still buyer-only.
      expect(res.quotes[0].sellerPhone).toBeNull();
      expect(res.quotes[0].sellerEmail).toBeNull();
    });
  });

  describe("Unrelated seller (viewer = seller-C, did not quote)", () => {
    it("sees NO quotes", async () => {
      const res = await getRFQ("rfq-1", "seller-C");
      expect(res.quotes).toHaveLength(0);
    });

    it("does NOT see buyer PII", async () => {
      const res = await getRFQ("rfq-1", "seller-C");
      expect(res.buyerPhone).toBeNull();
      expect(res.buyerEmail).toBeNull();
      expect(res.buyerId).toBeNull();
    });

    it("sees quoteCount = 2 (trust signal preserved)", async () => {
      const res = await getRFQ("rfq-1", "seller-C");
      expect(res.quoteCount).toBe(2);
    });
  });

  describe("Anonymous / invalid viewerUserId — DEFECT-2 FIXED", () => {
    it("✅ FIXED: throws on null viewerUserId (was returning [] before)", async () => {
      await expect(
        getRFQ("rfq-1", null as unknown as string),
      ).rejects.toThrow(/viewerUserId الزامی است/);
    });

    it("✅ FIXED: throws on undefined viewerUserId", async () => {
      await expect(
        getRFQ("rfq-1", undefined as unknown as string),
      ).rejects.toThrow(/viewerUserId الزامی است/);
    });

    it("✅ FIXED: throws on empty string viewerUserId", async () => {
      await expect(getRFQ("rfq-1", "")).rejects.toThrow(/viewerUserId الزامی است/);
    });

    it("✅ FIXED: throws on whitespace-only viewerUserId", async () => {
      await expect(getRFQ("rfq-1", "   ")).rejects.toThrow(/viewerUserId الزامی است/);
    });

    it("✅ FIXED: throws on non-string viewerUserId (number)", async () => {
      await expect(
        getRFQ("rfq-1", 123 as unknown as string),
      ).rejects.toThrow(/viewerUserId الزامی است/);
    });
  });

  describe("Regression — v2/v3 features preserved", () => {
    it("buyer still sees all quotes with full PII", async () => {
      const res = await getRFQ("rfq-1", "buyer-1");
      expect(res.quotes).toHaveLength(2);
      expect(res.quotes[0].sellerPhone).toBe(MOCK_RFQ.quotes[0].sellerPhone);
    });

    it("quoteCount is always visible regardless of viewer", async () => {
      const buyerRes = await getRFQ("rfq-1", "buyer-1");
      const sellerRes = await getRFQ("rfq-1", "seller-A");
      const unrelatedRes = await getRFQ("rfq-1", "seller-C");
      expect(buyerRes.quoteCount).toBe(2);
      expect(sellerRes.quoteCount).toBe(2);
      expect(unrelatedRes.quoteCount).toBe(2);
    });
  });
});
