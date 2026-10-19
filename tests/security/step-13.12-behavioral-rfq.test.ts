import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   STEP 13.12 — BEHAVIORAL TESTS (RUNTIME, NOT STATIC)
   ------------------------------------------------------------
   These tests IMPORT the actual service functions and call them
   with real arguments. They use a mock db to verify behavior
   without needing a live PostgreSQL connection.

   KEY DIFFERENCE from static tests:
   - Static tests: read source code, grep for patterns
   - THESE tests: call createRFQ() / getRFQ() directly,
     verify the function actually throws/succeeds

   Senior manager directive: 'تست‌های regex به‌عنوان تست
   رفتاری پذیرفته نیستند.'
   ============================================================ */

// ── Mock db ──────────────────────────────────────────────
const mockUserFindUnique = vi.fn();
const mockRFQCreate = vi.fn();
const mockRFQFindUnique = vi.fn();
const mockCategoryFindFirst = vi.fn();
const mockBrandFindFirst = vi.fn();
const mockAuditLog = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: mockUserFindUnique },
    rFQ: { create: mockRFQCreate, findUnique: mockRFQFindUnique },
    category: { findFirst: mockCategoryFindFirst },
    brand: { findFirst: mockBrandFindFirst },
  },
}));

vi.mock("@/lib/audit", () => ({ logAudit: mockAuditLog }));

const { createRFQ, getRFQ, RFQServiceError } = await import("@/lib/rfq-service");

// ═══════════════════════════════════════════════════════════
// RFQ AUTHORIZATION — createRFQ
// ═══════════════════════════════════════════════════════════

describe("RUNTIME: createRFQ — authorization behavioral tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCategoryFindFirst.mockResolvedValue(null);
    mockBrandFindFirst.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({
      firstName: "Test",
      lastName: "User",
      mobile: "09120000000",
      email: "test@test.com",
    });
    mockRFQCreate.mockResolvedValue({
      id: "rfq-1", title: "Test", status: "OPEN",
      specJson: null, machineType: null, brandPref: null, deadline: null,
    });
    mockAuditLog.mockResolvedValue(undefined);
  });

  // ── P0: Missing/invalid userId ──────────────────────────

  it("THROWS 403 when userId is empty string (before PII lookup)", async () => {
    await expect(
      createRFQ({ title: "Valid Title", buyerId: "user-1", userId: "" }),
    ).rejects.toThrow(RFQServiceError);

    try {
      await createRFQ({ title: "Valid Title", buyerId: "user-1", userId: "" });
    } catch (e) {
      expect((e as InstanceType<typeof RFQServiceError>).status).toBe(403);
    }

    // CRITICAL: PII lookup must NOT be called
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it("THROWS 403 when userId is whitespace-only (before PII lookup)", async () => {
    await expect(
      createRFQ({ title: "Valid Title", buyerId: "user-1", userId: "   " }),
    ).rejects.toThrow();

    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  // ── P0: buyerId impersonation ───────────────────────────

  it("THROWS 403 when buyerId !== userId (impersonation attempt)", async () => {
    await expect(
      createRFQ({
        title: "Valid Title",
        buyerId: "victim-id",
        userId: "attacker-id",
      }),
    ).rejects.toThrow();

    try {
      await createRFQ({
        title: "Valid Title",
        buyerId: "victim-id",
        userId: "attacker-id",
      });
    } catch (e) {
      expect((e as InstanceType<typeof RFQServiceError>).status).toBe(403);
    }

    // CRITICAL: victim's PII must NOT be looked up
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  // ── P0: Valid request succeeds ──────────────────────────

  it("SUCCEEDS when userId === buyerId (legitimate request)", async () => {
    const result = await createRFQ({
      title: "Valid Title",
      buyerId: "user-valid",
      userId: "user-valid",
    });

    expect(result).toMatchObject({ id: "rfq-1", status: "OPEN" });

    // PII lookup SHOULD happen for the valid buyer
    expect(mockUserFindUnique).toHaveBeenCalledTimes(1);
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: "user-valid" },
      select: { firstName: true, lastName: true, mobile: true, email: true },
    });

    // RFQ should be created with buyerId = userId (not from body)
    expect(mockRFQCreate).toHaveBeenCalledTimes(1);
    const createCall = mockRFQCreate.mock.calls[0][0];
    expect(createCall.data.buyerId).toBe("user-valid");
  });

  // ── P1: Title validation ───────────────────────────────

  it("THROWS 400 when title is too short (< 3 chars)", async () => {
    await expect(
      createRFQ({ title: "ab", buyerId: "user-1", userId: "user-1" }),
    ).rejects.toThrow();

    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it("THROWS 400 when title is missing", async () => {
    await expect(
      createRFQ({ title: "", buyerId: "user-1", userId: "user-1" }),
    ).rejects.toThrow();

    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  // ── P1: Audit logging ──────────────────────────────────

  it("LOGS audit with actorId = userId on success", async () => {
    await createRFQ({
      title: "Valid Title",
      buyerId: "user-audit",
      userId: "user-audit",
    });

    expect(mockAuditLog).toHaveBeenCalledTimes(1);
    const auditCall = mockAuditLog.mock.calls[0][0];
    expect(auditCall.actorId).toBe("user-audit");
    expect(auditCall.action).toBe("marketplace.rfq.create");
  });
});

// ═══════════════════════════════════════════════════════════
// QUOTE PRIVACY — getRFQ
// ═══════════════════════════════════════════════════════════

// Mock RFQ with 3 quotes from 3 different sellers
const MOCK_RFQ = {
  id: "rfq-1",
  title: "Test RFQ",
  description: null,
  machineType: "Excavator",
  brandPref: "Caterpillar",
  quantity: 1,
  specJson: null,
  budgetMin: 100000000n,
  budgetMax: 200000000n,
  location: "Tehran",
  deadline: new Date("2026-12-01"),
  terms: null,
  status: "OPEN",
  buyerName: "Ali Buyer",
  buyerPhone: "09121111111",
  buyerEmail: "ali@buyer.com",
  buyerId: "buyer-001",
  createdAt: new Date("2026-10-01"),
  updatedAt: new Date("2026-10-01"),
  quotes: [
    {
      id: "quote-1", sellerId: "seller-A", sellerName: "Seller A",
      sellerPhone: "09120000001", sellerEmail: "a@seller.com",
      unitPrice: 150000000n, totalPrice: 150000000n,
      deliveryTime: "7 days", notes: "Best price",
      status: "PENDING", createdAt: new Date("2026-10-02"),
    },
    {
      id: "quote-2", sellerId: "seller-B", sellerName: "Seller B",
      sellerPhone: "09120000002", sellerEmail: "b@seller.com",
      unitPrice: 160000000n, totalPrice: 160000000n,
      deliveryTime: "5 days", notes: "Faster",
      status: "PENDING", createdAt: new Date("2026-10-03"),
    },
    {
      id: "quote-3", sellerId: "seller-C", sellerName: "Seller C",
      sellerPhone: "09120000003", sellerEmail: "c@seller.com",
      unitPrice: 140000000n, totalPrice: 140000000n,
      deliveryTime: "10 days", notes: "Cheapest",
      status: "PENDING", createdAt: new Date("2026-10-04"),
    },
  ],
};

describe("RUNTIME: getRFQ — quote privacy behavioral tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRFQFindUnique.mockResolvedValue(MOCK_RFQ);
  });

  // ── P0: Buyer sees all quotes with full PII ─────────────

  it("BUYER sees ALL 3 quotes with full PII", async () => {
    const result = await getRFQ("rfq-1", "buyer-001");

    expect(result.quotes).toHaveLength(3);
    expect(result.quoteCount).toBe(3);

    // Buyer PII visible
    expect(result.buyerPhone).toBe("09121111111");
    expect(result.buyerEmail).toBe("ali@buyer.com");
    expect(result.buyerId).toBe("buyer-001");

    // Seller PII visible in quotes
    expect(result.quotes[0].sellerPhone).toBe("09120000001");
    expect(result.quotes[0].sellerEmail).toBe("a@seller.com");
    expect(result.quotes[0].sellerId).toBe("seller-A");
  });

  // ── P0: Seller sees ONLY own quote ─────────────────────

  it("SELLER-B sees ONLY their own quote (1 of 3)", async () => {
    const result = await getRFQ("rfq-1", "seller-B");

    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0].id).toBe("quote-2");
    expect(result.quotes[0].sellerName).toBe("Seller B");

    // Does NOT see competitor quotes
    const quoteIds = result.quotes.map((q) => q.id);
    expect(quoteIds).not.toContain("quote-1");
    expect(quoteIds).not.toContain("quote-3");
  });

  it("SELLER-B does NOT see buyer PII", async () => {
    const result = await getRFQ("rfq-1", "seller-B");

    expect(result.buyerPhone).toBeNull();
    expect(result.buyerEmail).toBeNull();
    expect(result.buyerId).toBeNull();
  });

  it("SELLER-B does NOT see seller CONTACT PII in their own quote (but sees own sellerId)", async () => {
    const result = await getRFQ("rfq-1", "seller-B");

    // STEP 14.22 FIX: seller PII (phone/email) is still buyer-only,
    // but sellerId is now visible to the seller who owns the quote
    // (least-privilege — they already know their own id).
    expect(result.quotes[0].sellerPhone).toBeNull();
    expect(result.quotes[0].sellerEmail).toBeNull();
    expect(result.quotes[0].sellerId).toBe("seller-B");
  });

  it("SELLER-B sees quoteCount = 3 (trust signal)", async () => {
    const result = await getRFQ("rfq-1", "seller-B");
    expect(result.quoteCount).toBe(3);
  });

  // ── P0: Other seller sees NO quotes ────────────────────

  it("SELLER-X (not quoted) sees NO quotes", async () => {
    const result = await getRFQ("rfq-1", "seller-X");

    expect(result.quotes).toHaveLength(0);
    expect(result.quoteCount).toBe(3); // trust signal
  });

  it("SELLER-X does NOT see buyer PII", async () => {
    const result = await getRFQ("rfq-1", "seller-X");

    expect(result.buyerPhone).toBeNull();
    expect(result.buyerEmail).toBeNull();
    expect(result.buyerId).toBeNull();
  });

  // ── P0: buyerName always visible (trust signal) ────────

  it("buyerName is ALWAYS visible (all roles)", async () => {
    const buyerView = await getRFQ("rfq-1", "buyer-001");
    const sellerView = await getRFQ("rfq-1", "seller-B");
    const otherView = await getRFQ("rfq-1", "seller-X");

    expect(buyerView.buyerName).toBe("Ali Buyer");
    expect(sellerView.buyerName).toBe("Ali Buyer");
    expect(otherView.buyerName).toBe("Ali Buyer");
  });

  // ── P1: Not found ──────────────────────────────────────

  it("THROWS 404 when RFQ does not exist", async () => {
    mockRFQFindUnique.mockResolvedValue(null);

    await expect(getRFQ("nonexistent", "buyer-001")).rejects.toThrow();
  });
});
