import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   STEP 13.26 — BEHAVIORAL TESTS: GET /api/deals/[id]
   ------------------------------------------------------------
   These tests IMPORT the actual GET handler and call it with a
   mocked Request + params. They verify the REAL response object:

   1. Authorized buyer receives only allowlisted fields
   2. Authorized seller receives only allowlisted fields
   3. Unauthenticated request → 401
   4. Authenticated non-party → 403
   5. Sensitive Deal fields (cancelReason, notes, updatedAt) absent
   6. Nested listing/order/disputes bounded to permitted fields
   7. A newly-added mock property does NOT leak into the response
   8. Decimal (BigInt) serialization + null handling correct

   These are NOT regex/source-text tests. They call the handler
   and inspect the actual JSON body.
   ============================================================ */

// ── Mock db ──────────────────────────────────────────────
const mockDealFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    deal: {
      findUnique: mockDealFindUnique,
    },
  },
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/request-context", () => ({ getClientIp: () => "127.0.0.1" }));

// auth is overridden per-test via vi.mocked(getCurrentUserId).mockResolvedValue
vi.mock("@/lib/auth", () => ({
  getCurrentUserId: vi.fn(),
}));

// Import after mocks
const { GET } = await import("@/app/api/deals/[id]/route");
const { getCurrentUserId } = await import("@/lib/auth");

// ── Helper: build a Request + params ─────────────────────
function makeReq(id: string): Request {
  return new Request(`http://localhost/api/deals/${id}`, {
    method: "GET",
  });
}
function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// ── Mock Deal fixture ────────────────────────────────────
// Includes ALL scalar fields from the Deal model + a fake
// `secretInternalField` to prove new properties don't leak.
function makeMockDeal(overrides: Record<string, unknown> = {}) {
  return {
    id: "deal-1",
    dealNumber: "DEAL-TEST-001",
    sourceType: "LISTING_OFFER",
    sourceId: "offer-1",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    listingId: "listing-1",
    agreedAmount: 500000000n,
    currency: "IRR",
    transactionType: "SALE",
    status: "CONFIRMED",
    agreedAt: new Date("2026-10-01"),
    confirmedAt: new Date("2026-10-02"),
    completedAt: null,
    cancelledAt: null,
    // Sensitive/internal fields that MUST NOT appear in response:
    cancelReason: "internal cancellation reason",
    notes: "internal staff notes",
    createdAt: new Date("2026-10-01"),
    updatedAt: new Date("2026-10-05"),
    // Bounded relations:
    listing: { id: "listing-1", title: "Excavator CAT 320", slug: "cat-320" },
    order: { id: "order-1", orderNumber: "ORD-ABC", status: "CONFIRMED" },
    disputes: [
      { id: "dispute-1", status: "OPEN", reason: "Item not as described" },
    ],
    // Fake future field — must NOT leak:
    secretInternalField: "SHOULD_NOT_LEAK",
    // Unbounded relation probes (would leak if spread were reintroduced):
    review: { id: "review-1", rating: 5, body: "private review body" },
    ...overrides,
  };
}

// The full set of keys that ARE allowed in the deal response.
const ALLOWED_DEAL_KEYS = [
  "id",
  "dealNumber",
  "sourceType",
  "sourceId",
  "buyerId",
  "sellerId",
  "listingId",
  "agreedAmount",
  "currency",
  "transactionType",
  "status",
  "agreedAt",
  "confirmedAt",
  "completedAt",
  "cancelledAt",
  "createdAt",
  "listing",
  "order",
  "disputes",
] as const;

const FORBIDDEN_KEYS = [
  "cancelReason",
  "notes",
  "updatedAt",
  "review",
  "secretInternalField",
] as const;

describe("STEP 13.26 — GET /api/deals/[id] behavioral DTO tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserId).mockResolvedValue("buyer-1");
    mockDealFindUnique.mockResolvedValue(makeMockDeal());
  });

  // ── Case 1: Authorized buyer ──────────────────────────
  it("buyer (party) receives 200 with only allowlisted fields", async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue("buyer-1");
    const res = await GET(makeReq("deal-1"), makeParams("deal-1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    const deal = json.deal;
    expect(deal).toBeTruthy();
    const keys = Object.keys(deal).sort();
    // Exactly the allowlist, no more, no less.
    expect(keys).toEqual([...ALLOWED_DEAL_KEYS].sort());
  });

  // ── Case 2: Authorized seller ─────────────────────────
  it("seller (party) receives 200 with only allowlisted fields", async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue("seller-1");
    const res = await GET(makeReq("deal-1"), makeParams("deal-1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    const keys = Object.keys(json.deal).sort();
    expect(keys).toEqual([...ALLOWED_DEAL_KEYS].sort());
  });

  // ── Case 3: Unauthenticated ───────────────────────────
  it("unauthenticated request → 401", async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue(null);
    const res = await GET(makeReq("deal-1"), makeParams("deal-1"));
    expect(res.status).toBe(401);
    // findUnique should not even be called when unauthenticated
    expect(mockDealFindUnique).not.toHaveBeenCalled();
  });

  // ── Case 4: Authenticated non-party ───────────────────
  it("authenticated non-party → 403 and no deal body", async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue("intruder-id");
    mockDealFindUnique.mockResolvedValue(makeMockDeal());
    const res = await GET(makeReq("deal-1"), makeParams("deal-1"));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.deal).toBeUndefined();
  });

  // ── Case 5: Sensitive fields absent ───────────────────
  it("does NOT expose cancelReason, notes, updatedAt, review", async () => {
    const res = await GET(makeReq("deal-1"), makeParams("deal-1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    const dealStr = JSON.stringify(json);
    for (const key of FORBIDDEN_KEYS) {
      expect(dealStr).not.toContain(`"${key}"`);
    }
  });

  // ── Case 6: Nested relations bounded ──────────────────
  it("listing/order/disputes contain ONLY permitted fields", async () => {
    const res = await GET(makeReq("deal-1"), makeParams("deal-1"));
    const json = await res.json();
    const deal = json.deal;

    // listing: only {id, title, slug}
    expect(Object.keys(deal.listing).sort()).toEqual(
      ["id", "slug", "title"].sort(),
    );

    // order: only {id, orderNumber, status}
    expect(Object.keys(deal.order).sort()).toEqual(
      ["id", "orderNumber", "status"].sort(),
    );

    // disputes: each entry only {id, status, reason}
    expect(deal.disputes).toHaveLength(1);
    expect(Object.keys(deal.disputes[0]).sort()).toEqual(
      ["id", "reason", "status"].sort(),
    );
  });

  // ── Case 7: New mock property does not leak ───────────
  it("a newly-added Deal property does NOT leak into the response", async () => {
    // Simulate a future schema addition: an admin-only internal field.
    mockDealFindUnique.mockResolvedValue(
      makeMockDeal({
        adminInternalNotes: "top secret admin note",
        fraudScore: 0.87,
      }),
    );
    const res = await GET(makeReq("deal-1"), makeParams("deal-1"));
    const json = await res.json();
    const dealStr = JSON.stringify(json);
    expect(dealStr).not.toContain("adminInternalNotes");
    expect(dealStr).not.toContain("fraudScore");
    expect(dealStr).not.toContain("top secret admin note");
    // And the allowlist is still exactly the documented set.
    expect(Object.keys(json.deal).sort()).toEqual(
      [...ALLOWED_DEAL_KEYS].sort(),
    );
  });

  // ── Case 8: Decimal serialization + null handling ─────
  it("serializes BigInt agreedAmount as string and null dates correctly", async () => {
    // Non-null amount + null completed/cancelled
    const res = await GET(makeReq("deal-1"), makeParams("deal-1"));
    const json = await res.json();
    expect(json.deal.agreedAmount).toBe("500000000");
    expect(json.deal.completedAt).toBeNull();
    expect(json.deal.cancelledAt).toBeNull();

    // Null amount case
    mockDealFindUnique.mockResolvedValue(
      makeMockDeal({ agreedAmount: null, status: "DRAFT" }),
    );
    const res2 = await GET(makeReq("deal-1"), makeParams("deal-1"));
    const json2 = await res2.json();
    expect(json2.deal.agreedAmount).toBeNull();
  });

  // ── Extra: 404 when deal not found ────────────────────
  it("returns 404 when deal does not exist", async () => {
    mockDealFindUnique.mockResolvedValue(null);
    const res = await GET(makeReq("nope"), makeParams("nope"));
    expect(res.status).toBe(404);
  });

  // ── Extra: regression — if `...deal` spread is reintroduced,
  //    these tests fail because FORBIDDEN_KEYS would appear. ──
  it("regression guard: response is NOT the full deal object", async () => {
    const res = await GET(makeReq("deal-1"), makeParams("deal-1"));
    const json = await res.json();
    // The raw mock has ~25 keys; the allowlist has 19. If spread
    // were reintroduced, cancelReason/notes/updatedAt/review/
    // secretInternalField would all be present.
    expect(Object.keys(json.deal).length).toBeLessThanOrEqual(
      ALLOWED_DEAL_KEYS.length,
    );
  });
});
