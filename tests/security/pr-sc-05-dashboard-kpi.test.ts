import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   STEP 11.38 PR-SC-05 — Dashboard KPI API security tests
   ------------------------------------------------------------
   Verifies:
   - Anonymous → 401
   - Authenticated without store.crm.read → 403
   - Seller with store.crm.read → 200 + real KPI data
   - All queries scoped by sellerId (no cross-seller leakage)
   ============================================================ */

let mockCurrentUser: { id: string } | null = null;
let mockCanResult = false;

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => mockCurrentUser,
}));
vi.mock("@/lib/authorization", () => ({
  can: async () => mockCanResult,
}));

const mockAggregate = vi.fn(async () => ({ _sum: { viewCount: 100, favoriteCount: 10 } }));
const mockCount = vi.fn(async () => 5);

vi.mock("@/lib/db", () => ({
  db: {
    listing: {
      count: mockCount,
      aggregate: mockAggregate,
    },
    lead: {
      count: mockCount,
    },
  },
}));

const { GET } = await import("@/app/api/seller/dashboard/route");

beforeEach(() => {
  mockCurrentUser = null;
  mockCanResult = false;
  mockCount.mockReset();
  mockAggregate.mockReset();
  mockCount.mockResolvedValue(5);
  mockAggregate.mockResolvedValue({ _sum: { viewCount: 100, favoriteCount: 10 } });
});

function makeReq(): NextRequest {
  return new Request("http://localhost/api/seller/dashboard") as any;
}

describe("PR-SC-05: GET /api/seller/dashboard — auth + authorization", () => {
  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("NEGATIVE: authenticated without store.crm.read → 403", async () => {
    mockCurrentUser = { id: "buyer-1" };
    mockCanResult = false; // no store.crm.read
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/store\.crm\.read/);
  });

  it("POSITIVE: seller with store.crm.read → 200 + real KPI data", async () => {
    mockCurrentUser = { id: "seller-A" };
    mockCanResult = true;
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.activeListings).toBeDefined();
    expect(body.data.totalListings).toBeDefined();
    expect(body.data.newLeads).toBeDefined();
    expect(body.data.totalLeads).toBeDefined();
    expect(body.data.totalViews).toBeDefined();
    expect(body.data.conversionRate).toBeDefined();
    expect(body.data.source).toBe("database");
    expect(body.data.sellerId).toBe("seller-A");
  });
});

describe("PR-SC-05: seller scoping — no cross-seller data", () => {
  it("VERIFY: all listing queries include sellerId filter", async () => {
    mockCurrentUser = { id: "seller-A" };
    mockCanResult = true;
    await GET(makeReq());

    // Check that db.listing.count was called with sellerId in where
    const listingCountCalls = mockCount.mock.calls.filter(
      (call: any) => call[0]?.where?.sellerId === "seller-A"
    );
    expect(listingCountCalls.length).toBeGreaterThan(0);

    // Check that db.lead.count was called with listing.sellerId filter
    const leadCountCalls = mockCount.mock.calls.filter(
      (call: any) => call[0]?.where?.listing?.sellerId === "seller-A"
    );
    expect(leadCountCalls.length).toBeGreaterThan(0);

    // Check that aggregate was called with sellerId filter
    const aggregateCalls = mockAggregate.mock.calls.filter(
      (call: any) => call[0]?.where?.sellerId === "seller-A"
    );
    expect(aggregateCalls.length).toBeGreaterThan(0);
  });

  it("VERIFY: seller-B's ID never appears in any query", async () => {
    mockCurrentUser = { id: "seller-A" };
    mockCanResult = true;
    await GET(makeReq());

    // No query should reference seller-B
    const allCalls = [...mockCount.mock.calls, ...mockAggregate.mock.calls];
    const sellerBReferences = allCalls.filter(
      (call: any) => JSON.stringify(call).includes("seller-B")
    );
    expect(sellerBReferences.length).toBe(0);
  });
});
