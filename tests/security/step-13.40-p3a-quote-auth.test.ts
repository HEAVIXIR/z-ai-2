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

  // ── 6. Null userId → REJECTED (fail-closed, STEP 13.41) ──
  it("null userId → 403 (fail-closed, no bypass)", async () => {
    await expect(acceptQuote("quote-1", null)).rejects.toThrow();
    try {
      await acceptQuote("quote-1", null);
    } catch (e) {
      expect((e as InstanceType<typeof RFQServiceError>).status).toBe(403);
    }
    // quote.update must NOT be called (authorization failed)
    expect(mockRFQQuoteUpdate).not.toHaveBeenCalled();
  });

  // ── 6b. Empty string userId → REJECTED ──
  it("empty string userId → 403 (fail-closed)", async () => {
    await expect(acceptQuote("quote-1", "")).rejects.toThrow();
    try {
      await acceptQuote("quote-1", "");
    } catch (e) {
      expect((e as InstanceType<typeof RFQServiceError>).status).toBe(403);
    }
    expect(mockRFQQuoteUpdate).not.toHaveBeenCalled();
  });

  // ── 6c. Null buyerId on RFQ → REJECTED (fail-closed) ──
  it("RFQ with null buyerId → 403 (fail-closed)", async () => {
    mockRFQFindUnique.mockResolvedValue({ buyerId: null });
    await expect(acceptQuote("quote-1", "user-1")).rejects.toThrow();
    try {
      await acceptQuote("quote-1", "user-1");
    } catch (e) {
      expect((e as InstanceType<typeof RFQServiceError>).status).toBe(403);
    }
    expect(mockRFQQuoteUpdate).not.toHaveBeenCalled();
  });

  // ── 6d. Quote with null rfqId → REJECTED ──
  it("quote with null rfqId → 404 (fail-closed)", async () => {
    mockRFQQuoteFindUnique.mockResolvedValue({
      id: "quote-1", status: "PENDING", rfqId: null, sellerId: "seller-A",
    });
    await expect(acceptQuote("quote-1", "buyer-001")).rejects.toThrow();
    try {
      await acceptQuote("quote-1", "buyer-001");
    } catch (e) {
      expect((e as InstanceType<typeof RFQServiceError>).status).toBe(404);
    }
    expect(mockRFQQuoteUpdate).not.toHaveBeenCalled();
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

  // ── 8. acceptQuote on already-REJECTED quote → 409 (no mutation) ──
  it("acceptQuote on REJECTED quote → 409 (no mutation)", async () => {
    mockRFQQuoteFindUnique.mockResolvedValue({
      id: "quote-1", status: "REJECTED", rfqId: "rfq-1", sellerId: "seller-A",
    });
    await expect(acceptQuote("quote-1", "buyer-001")).rejects.toThrow();
    try {
      await acceptQuote("quote-1", "buyer-001");
    } catch (e) {
      expect((e as InstanceType<typeof RFQServiceError>).status).toBe(409);
    }
    expect(mockRFQQuoteUpdate).not.toHaveBeenCalled();
  });

  // ── 9. rejectQuote on already-ACCEPTED quote → 409 (no mutation) ──
  it("rejectQuote on ACCEPTED quote → 409 (no mutation)", async () => {
    mockRFQQuoteFindUnique.mockResolvedValue({
      id: "quote-1", status: "ACCEPTED", rfqId: "rfq-1", sellerId: "seller-A",
    });
    await expect(rejectQuote("quote-1", "reason", "buyer-001")).rejects.toThrow();
    try {
      await rejectQuote("quote-1", "reason", "buyer-001");
    } catch (e) {
      expect((e as InstanceType<typeof RFQServiceError>).status).toBe(409);
    }
    expect(mockRFQQuoteUpdate).not.toHaveBeenCalled();
  });

  // ── 10. null userId on rejectQuote → 403 (fail-closed, both functions) ──
  it("rejectQuote null userId → 403 (fail-closed)", async () => {
    await expect(rejectQuote("quote-1", "reason", null)).rejects.toThrow();
    try {
      await rejectQuote("quote-1", "reason", null);
    } catch (e) {
      expect((e as InstanceType<typeof RFQServiceError>).status).toBe(403);
    }
    expect(mockRFQQuoteUpdate).not.toHaveBeenCalled();
  });

  // ── 11. RFQ with null buyerId on rejectQuote → 403 (fail-closed) ──
  it("rejectQuote RFQ null buyerId → 403 (fail-closed)", async () => {
    mockRFQFindUnique.mockResolvedValue({ buyerId: null });
    await expect(rejectQuote("quote-1", "reason", "user-1")).rejects.toThrow();
    try {
      await rejectQuote("quote-1", "reason", "user-1");
    } catch (e) {
      expect((e as InstanceType<typeof RFQServiceError>).status).toBe(403);
    }
    expect(mockRFQQuoteUpdate).not.toHaveBeenCalled();
  });

  // ── 12. HTTP attack-surface proof: acceptQuote/rejectQuote have NO HTTP entry point ──
  // STEP 13.53 P3-A: the rfq-service acceptQuote/rejectQuote are internal service
  // functions. The only HTTP route under /api/rfq/[id]/quotes is GET (list) + POST
  // (submit) — there is NO PATCH/PUT route exposing accept/reject. This is a
  // defense-in-depth verification: the functions cannot be reached by an HTTP
  // caller bypassing the service-layer authz.
  it("HTTP attack-surface: no /api/rfq/[id]/quotes/[quoteId] route exposes accept/reject", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    // The [quoteId] sub-route does NOT exist.
    const quoteIdRoute = path.join("src", "app", "api", "rfq", "[id]", "quotes", "[quoteId]");
    expect(fs.existsSync(quoteIdRoute), "[quoteId] route must not exist").toBe(false);
    // The quotes route only exposes GET (list) + POST (submit) — not accept/reject.
    const quotesRouteSrc = fs.readFileSync(
      path.join("src", "app", "api", "rfq", "[id]", "quotes", "route.ts"),
      "utf-8",
    );
    expect(quotesRouteSrc).not.toContain("acceptQuote");
    expect(quotesRouteSrc).not.toContain("rejectQuote");
    expect(quotesRouteSrc).toContain("submitQuote");
  });
});
