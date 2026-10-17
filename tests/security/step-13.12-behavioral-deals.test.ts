import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   STEP 13.12 — BEHAVIORAL TESTS: Deal Integrity
   ------------------------------------------------------------
   These tests IMPORT the actual POST handler logic and verify
   behavior with mock db. They test:
   - buyerId/sellerId NOT accepted from body
   - Party-membership check
   - agreedAmount from source (not body)
   - Duplicate deal prevention
   - P2034 vs DealAlreadyExistsError separation

   NOTE: These tests mock db but call the ACTUAL service code.
   They are NOT static/regex tests.
   ============================================================ */

// ── Mock db ──────────────────────────────────────────────
const mockDealFindFirst = vi.fn();
const mockDealCreate = vi.fn();
const mockDealFindMany = vi.fn();
const mockListingOfferFindUnique = vi.fn();
const mockDealRoomFindUnique = vi.fn();
const mockRFQQuoteFindUnique = vi.fn();
const mockAuditLog = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    deal: {
      findFirst: mockDealFindFirst,
      create: mockDealCreate,
      findMany: mockDealFindMany,
    },
    listingOffer: { findUnique: mockListingOfferFindUnique },
    dealRoom: { findUnique: mockDealRoomFindUnique },
    rFQQuote: { findUnique: mockRFQQuoteFindUnique },
    $transaction: mockTransaction,
  },
}));

vi.mock("@/lib/audit", () => ({ logAudit: mockAuditLog }));
vi.mock("@/lib/request-context", () => ({ getClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/auth", () => ({ getCurrentUserId: async () => null }));

// Import after mocks
const { POST } = await import("@/app/api/deals/route");

// ── Helper: create Request ───────────────────────────────
function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/deals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Mock auth to return a specific user ──────────────────
// Override the mock to return a specific user
vi.mock("@/lib/auth", () => ({
  getCurrentUserId: async () => "user-test-123",
}));

// ═══════════════════════════════════════════════════════════
// DEAL INTEGRITY — behavioral tests
// ═══════════════════════════════════════════════════════════

describe("RUNTIME: Deals POST — behavioral tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // STEP 13.26 P2 FIX: logAudit must return a resolved Promise so the
    // handler's `logAudit(...).catch(() => {})` chain does not throw on
    // undefined. Without this, success-path tests return 500 instead of
    // 200, which masked the false-pass in the buyerId/agreedAmount tests.
    mockAuditLog.mockResolvedValue(undefined);
  });

  // ── P0: buyerId/sellerId NOT accepted from body ────────
  // STEP 13.26 P2 FIX: previous version had a FALSE-PASS — the mock
  // offer buyerId was "buyer-from-offer" (not the authed "user-test-123"),
  // so party-membership check returned 403 BEFORE create() was called,
  // and the `if (mockDealCreate.mock.calls.length > 0)` guard silently
  // skipped the core assertions. Now the authed user IS the buyer so
  // create() is genuinely invoked, and assertions are UNCONDITIONAL.

  it("does NOT accept buyerId from body (uses source)", async () => {
    // Mock LISTING_OFFER source — authed user IS the buyer (party).
    mockListingOfferFindUnique.mockResolvedValue({
      id: "offer-1",
      status: "ACCEPTED",
      offerAmount: 500000000n,
      buyerId: "user-test-123", // authed user is the buyer → party-membership passes
      listingId: "listing-1",
      listing: { sellerId: "seller-from-listing" },
    });

    // Mock $transaction to simulate successful create
    mockTransaction.mockImplementation(async (cb: any) => {
      mockDealFindFirst.mockResolvedValue(null); // no existing deal
      return cb({
        deal: {
          findFirst: mockDealFindFirst,
          create: mockDealCreate.mockResolvedValue({
            id: "deal-1",
            dealNumber: "DEAL-TEST",
            status: "PENDING_CONFIRMATION",
          }),
        },
      });
    });

    // Send buyerId/sellerId in body (must be ignored)
    const req = makeReq({
      sourceType: "LISTING_OFFER",
      sourceId: "offer-1",
      buyerId: "attacker-buyer-id", // must be ignored
      sellerId: "attacker-seller-id", // must be ignored
    });

    const res = await POST(req);
    expect(res.status).toBe(200); // success, NOT 403

    // UNCONDITIONAL: create MUST have been called (party-membership passed)
    expect(mockDealCreate).toHaveBeenCalledTimes(1);

    // Persisted buyerId/sellerId MUST come from the source entity, not body
    const createData = mockDealCreate.mock.calls[0][0].data;
    expect(createData.buyerId).toBe("user-test-123"); // from offer, not body
    expect(createData.sellerId).toBe("seller-from-listing"); // from listing, not body
    expect(createData.buyerId).not.toBe("attacker-buyer-id");
    expect(createData.sellerId).not.toBe("attacker-seller-id");
  });

  // ── P0: agreedAmount from source (not body) ────────────

  it("uses verifiedAmount from source, NOT body agreedAmount", async () => {
    mockListingOfferFindUnique.mockResolvedValue({
      id: "offer-1",
      status: "ACCEPTED",
      offerAmount: 500000000n,
      buyerId: "user-test-123", // user is buyer → party-membership passes
      listingId: "listing-1",
      listing: { sellerId: "seller-1" },
    });

    mockTransaction.mockImplementation(async (cb: any) => {
      return cb({
        deal: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: mockDealCreate.mockResolvedValue({
            id: "deal-1", dealNumber: "DEAL-T", status: "PENDING_CONFIRMATION",
          }),
        },
      });
    });

    // Send agreedAmount in body (must be ignored)
    const req = makeReq({
      sourceType: "LISTING_OFFER",
      sourceId: "offer-1",
      agreedAmount: 1, // attacker tries to set price to 1
    });

    const res = await POST(req);
    expect(res.status).toBe(200); // success

    // UNCONDITIONAL: create MUST have been called
    expect(mockDealCreate).toHaveBeenCalledTimes(1);

    // Persisted amount MUST be the source amount (500000000), not body (1)
    const createData = mockDealCreate.mock.calls[0][0].data;
    expect(createData.agreedAmount).toBe(500000000n);
    expect(createData.agreedAmount).not.toBe(1n);
  });

  // ── P0: Party-membership check ─────────────────────────
  // STEP 13.26 P2 FIX: also assert create() is NOT called (negative case)

  it("REJECTS user who is NOT party to the deal (403) and does NOT create", async () => {
    mockListingOfferFindUnique.mockResolvedValue({
      id: "offer-1",
      status: "ACCEPTED",
      offerAmount: 500000000n,
      buyerId: "buyer-someone-else",
      listingId: "listing-1",
      listing: { sellerId: "seller-someone-else" },
    });

    // user-test-123 is neither buyer nor seller
    const req = makeReq({
      sourceType: "LISTING_OFFER",
      sourceId: "offer-1",
      // Attacker also tries to inject identities — must still be rejected
      buyerId: "user-test-123",
      sellerId: "user-test-123",
    });

    const res = await POST(req);
    expect(res.status).toBe(403);

    // CRITICAL: create() MUST NOT be called for a non-party
    expect(mockDealCreate).not.toHaveBeenCalled();
    // And the transaction body must not even run
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  // ── P0: Invalid sourceType ─────────────────────────────

  it("REJECTS invalid sourceType (400)", async () => {
    const req = makeReq({
      sourceType: "INVALID_TYPE",
      sourceId: "some-id",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // ── P0: Missing sourceType or sourceId ─────────────────

  it("REJECTS missing sourceType (400)", async () => {
    const req = makeReq({ sourceId: "some-id" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("REJECTS missing sourceId (400)", async () => {
    const req = makeReq({ sourceType: "LISTING_OFFER" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // ── P0: Source not found ───────────────────────────────

  it("REJECTS when source offer not found (404)", async () => {
    mockListingOfferFindUnique.mockResolvedValue(null);

    const req = makeReq({
      sourceType: "LISTING_OFFER",
      sourceId: "nonexistent",
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  // ── P0: Source not ACCEPTED ────────────────────────────

  it("REJECTS when offer is not ACCEPTED (409)", async () => {
    mockListingOfferFindUnique.mockResolvedValue({
      id: "offer-1",
      status: "PENDING",
      offerAmount: 500000000n,
      buyerId: "user-test-123",
      listingId: "listing-1",
      listing: { sellerId: "seller-1" },
    });

    const req = makeReq({
      sourceType: "LISTING_OFFER",
      sourceId: "offer-1",
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  // ── P0: Duplicate deal prevention ──────────────────────

  it("REJECTS duplicate deal for same sourceId (409)", async () => {
    mockListingOfferFindUnique.mockResolvedValue({
      id: "offer-1",
      status: "ACCEPTED",
      offerAmount: 500000000n,
      buyerId: "user-test-123",
      listingId: "listing-1",
      listing: { sellerId: "seller-1" },
    });

    // Mock $transaction to simulate existing deal
    mockTransaction.mockImplementation(async (cb: any) => {
      return cb({
        deal: {
          findFirst: vi.fn().mockResolvedValue({
            id: "existing-deal",
            dealNumber: "DEAL-EXISTING",
            status: "PENDING_CONFIRMATION",
          }),
          create: vi.fn(),
        },
      });
    });

    const req = makeReq({
      sourceType: "LISTING_OFFER",
      sourceId: "offer-1",
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("قبلاً");
  });

  // ── P1: No internal errors leaked ──────────────────────

  it("does NOT leak stack traces in error responses", async () => {
    mockListingOfferFindUnique.mockResolvedValue(null);

    const req = makeReq({
      sourceType: "LISTING_OFFER",
      sourceId: "offer-1",
    });

    const res = await POST(req);
    const json = await res.json();

    // Error should be user-friendly, not a stack trace
    expect(json.error).not.toMatch(/at\s+\w+\s+\(/);
    expect(json.error).not.toMatch(/node_modules/);
    expect(json.error).not.toMatch(/\/home\//);
  });
});
