import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   STEP 13.40 — P3-A: acceptQuote/rejectQuote buyer-ownership
   ------------------------------------------------------------
   Owner decision: option 2 (preemptive fix).
   Tests:
   1. Buyer can accept their own RFQ's quote (positive)
   2. Non-buyer cannot accept (negative → 403)
   3. Buyer can reject their own RFQ's quote (positive)
   4. Non-buyer cannot reject (negative → 403)
   5. Non-existent quote → 404
   6. Null userId (admin bypass) → allowed
   ============================================================ */

const mockRFQQuoteFindUnique = vi.fn();
const mockRFQFindUnique = vi.fn();
const mockRFQQuoteUpdate = vi.fn();
const mockRFQUpdate = vi.fn();
const mockAuditLog = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    rFQQuote: {
      findUnique: mockRFQQuoteFindUnique,
      update: mockRFQQuoteUpdate,
    },
    rFQ: {
      findUnique: mockRFQFindUnique,
      update: mockRFQUpdate,
    },
  },
}));

vi.mock("@/lib/audit", () => ({ logAudit: mockAuditLog }));

const { acceptQuote, rejectQuote, RFQServiceError } = await import("@/lib/rfq-service");

const MOCK_QUOTE = {
  id: "quote-1",
  status: "PENDING",
  rfqId: "rfq-1",
  sellerId: "seller-A",
};

const MOCK_RFQ = {
  buyerId: "buyer-001",
};

describe("STEP 13.40 — P3-A: acceptQuote/rejectQuote buyer-ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRFQQuoteFindUnique.mockResolvedValue(MOCK_QUOTE);
    mockRFQFindUnique.mockResolvedValue(MOCK_RFQ);
    mockRFQQuoteUpdate.mockResolvedValue({
      id: "quote-1",
      status: "ACCEPTED",
      rfqId: "rfq-1",
    });
    mockRFQUpdate.mockResolvedValue({});
    mockAuditLog.mockResolvedValue(undefined);
  });

  // ── 1. Buyer can accept (positive) ──
  it("buyer can accept quote on their own RFQ", async () => {
    const result = await acceptQuote("quote-1", "buyer-001");
    expect(result.status).toBe("ACCEPTED");
    expect(mockRFQQuoteUpdate).toHaveBeenCalledTimes(1);
  });

  // ── 2. Non-buyer cannot accept (negative → 403) ──
  it("non-buyer cannot accept quote → 403", async () => {
    await expect(acceptQuote("quote-1", "intruder-id")).rejects.toThrow();
    try {
      await acceptQuote("quote-1", "intruder-id");
    } catch (e) {
      expect((e as InstanceType<typeof RFQServiceError>).status).toBe(403);
    }
    // quote.update must NOT be called (authorization failed)
    expect(mockRFQQuoteUpdate).not.toHaveBeenCalled();
  });

  // ── 3. Buyer can reject (positive) ──
  it("buyer can reject quote on their own RFQ", async () => {
    mockRFQQuoteUpdate.mockResolvedValue({
      id: "quote-1",
      status: "REJECTED",
      rfqId: "rfq-1",
    });
    const result = await rejectQuote("quote-1", "not needed", "buyer-001");
    expect(result.status).toBe("REJECTED");
    expect(mockRFQQuoteUpdate).toHaveBeenCalledTimes(1);
  });

  // ── 4. Non-buyer cannot reject (negative → 403) ──
  it("non-buyer cannot reject quote → 403", async () => {
    await expect(rejectQuote("quote-1", "reason", "intruder-id")).rejects.toThrow();
    try {
      await rejectQuote("quote-1", "reason", "intruder-id");
    } catch (e) {
      expect((e as InstanceType<typeof RFQServiceError>).status).toBe(403);
    }
    expect(mockRFQQuoteUpdate).not.toHaveBeenCalled();
  });

  // ── 5. Non-existent quote → 404 ──
  it("non-existent quote → 404", async () => {
    mockRFQQuoteFindUnique.mockResolvedValue(null);
    await expect(acceptQuote("nonexistent", "buyer-001")).rejects.toThrow();
    try {
      await acceptQuote("nonexistent", "buyer-001");
    } catch (e) {
      expect((e as InstanceType<typeof RFQServiceError>).status).toBe(404);
    }
  });

  // ── 6. Null userId (admin/context bypass) → allowed ──
  it("null userId does not block (admin/context bypass)", async () => {
    const result = await acceptQuote("quote-1", null);
    expect(result.status).toBe("ACCEPTED");
    expect(mockRFQQuoteUpdate).toHaveBeenCalledTimes(1);
  });

  // ── 7. RFQ not found → 404 ──
  it("RFQ not found for quote → 404", async () => {
    mockRFQFindUnique.mockResolvedValue(null);
    await expect(acceptQuote("quote-1", "buyer-001")).rejects.toThrow();
    try {
      await acceptQuote("quote-1", "buyer-001");
    } catch (e) {
      expect((e as InstanceType<typeof RFQServiceError>).status).toBe(404);
    }
  });
});
