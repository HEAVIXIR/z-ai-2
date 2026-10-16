import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   STEP 13.26 — BEHAVIORAL TESTS: GET /api/deals (LIST)
   ------------------------------------------------------------
   The existing step-13.22-dto-regression.test.ts uses source-text
   regex checks. Those are useful regression guards but do NOT
   prove runtime response safety. This file calls the actual
   GET /api/deals handler and inspects the real JSON response:

   1. Response contains only allowlisted Deal fields
   2. Sensitive fields (cancelReason, notes, updatedAt) absent
   3. Nested listing/order bounded to permitted fields
   4. A newly-added mock property does NOT leak
   5. BigInt agreedAmount serialized as string
   6. Unauthenticated → 401
   7. SQL where-clause scopes to current user (buyer OR seller)
   8. Regression: reintroducing `...d` spread fails the tests

   These are NOT regex tests.
   ============================================================ */

// ── Mock db ──────────────────────────────────────────────
const mockDealFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    deal: {
      findMany: mockDealFindMany,
    },
  },
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/request-context", () => ({ getClientIp: () => "127.0.0.1" }));

vi.mock("@/lib/auth", () => ({
  getCurrentUserId: vi.fn(),
}));

const { GET } = await import("@/app/api/deals/route");
const { getCurrentUserId } = await import("@/lib/auth");

// Allowlist for the LIST endpoint (must match step-13.22 + route.ts)
const ALLOWED_LIST_DEAL_KEYS = [
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
] as const;

function makeMockDealRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "deal-1",
    dealNumber: "DEAL-001",
    sourceType: "LISTING_OFFER",
    sourceId: "offer-1",
    buyerId: "user-1",
    sellerId: "user-2",
    listingId: "listing-1",
    agreedAmount: 500000000n,
    currency: "IRR",
    transactionType: "SALE",
    status: "CONFIRMED",
    agreedAt: new Date("2026-10-01"),
    confirmedAt: new Date("2026-10-02"),
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date("2026-10-01"),
    // Sensitive / internal — must NOT leak:
    cancelReason: "internal reason",
    notes: "internal notes",
    updatedAt: new Date("2026-10-05"),
    // Bounded relations:
    listing: { id: "listing-1", title: "Excavator", slug: "cat-320" },
    order: { id: "order-1", orderNumber: "ORD-1", status: "CONFIRMED" },
    // Fake future field — must NOT leak:
    secretInternalField: "SHOULD_NOT_LEAK",
    ...overrides,
  };
}

describe("STEP 13.26 — GET /api/deals (LIST) behavioral DTO tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserId).mockResolvedValue("user-1");
    mockDealFindMany.mockResolvedValue([makeMockDealRow()]);
  });

  it("returns 200 with deals array containing only allowlisted fields", async () => {
    const req = new Request("http://localhost/api/deals");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deals).toHaveLength(1);
    const keys = Object.keys(json.deals[0]).sort();
    expect(keys).toEqual([...ALLOWED_LIST_DEAL_KEYS].sort());
  });

  it("does NOT expose cancelReason, notes, updatedAt, or new fields", async () => {
    const req = new Request("http://localhost/api/deals");
    const res = await GET(req);
    const json = await res.json();
    const bodyStr = JSON.stringify(json);
    expect(bodyStr).not.toContain("cancelReason");
    expect(bodyStr).not.toContain('"notes"');
    expect(bodyStr).not.toContain("updatedAt");
    expect(bodyStr).not.toContain("secretInternalField");
    expect(bodyStr).not.toContain("SHOULD_NOT_LEAK");
  });

  it("nested listing contains ONLY {id, title, slug}", async () => {
    const req = new Request("http://localhost/api/deals");
    const res = await GET(req);
    const json = await res.json();
    expect(Object.keys(json.deals[0].listing).sort()).toEqual(
      ["id", "slug", "title"].sort(),
    );
  });

  it("nested order contains ONLY {id, orderNumber, status}", async () => {
    const req = new Request("http://localhost/api/deals");
    const res = await GET(req);
    const json = await res.json();
    expect(Object.keys(json.deals[0].order).sort()).toEqual(
      ["id", "orderNumber", "status"].sort(),
    );
  });

  it("serializes BigInt agreedAmount as string", async () => {
    const req = new Request("http://localhost/api/deals");
    const res = await GET(req);
    const json = await res.json();
    expect(json.deals[0].agreedAmount).toBe("500000000");
    expect(typeof json.deals[0].agreedAmount).toBe("string");
  });

  it("unauthenticated request → 401 and no db query", async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue(null);
    const req = new Request("http://localhost/api/deals");
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(mockDealFindMany).not.toHaveBeenCalled();
  });

  it("query scopes to current user as buyer OR seller", async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue("user-42");
    const req = new Request("http://localhost/api/deals?status=CONFIRMED");
    await GET(req);
    expect(mockDealFindMany).toHaveBeenCalledTimes(1);
    const args = mockDealFindMany.mock.calls[0][0];
    // where clause must restrict to the authed user
    expect(args.where.OR).toEqual([
      { buyerId: "user-42" },
      { sellerId: "user-42" },
    ]);
    // status filter passed through
    expect(args.where.status).toBe("CONFIRMED");
  });

  it("a newly-added Deal property does NOT leak into list response", async () => {
    // Simulate a future schema addition
    mockDealFindMany.mockResolvedValue([
      makeMockDealRow({
        adminFraudScore: 0.92,
        internalAuditNote: "top secret",
      }),
    ]);
    const req = new Request("http://localhost/api/deals");
    const res = await GET(req);
    const json = await res.json();
    const bodyStr = JSON.stringify(json);
    expect(bodyStr).not.toContain("adminFraudScore");
    expect(bodyStr).not.toContain("internalAuditNote");
    expect(bodyStr).not.toContain("top secret");
    // Allowlist still exact
    expect(Object.keys(json.deals[0]).sort()).toEqual(
      [...ALLOWED_LIST_DEAL_KEYS].sort(),
    );
  });

  it("handles empty result set gracefully", async () => {
    mockDealFindMany.mockResolvedValue([]);
    const req = new Request("http://localhost/api/deals");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deals).toEqual([]);
  });

  it("respects limit query param (capped at 50)", async () => {
    const req = new Request("http://localhost/api/deals?limit=9999");
    await GET(req);
    const args = mockDealFindMany.mock.calls[0][0];
    expect(args.take).toBe(50); // capped
  });
});
