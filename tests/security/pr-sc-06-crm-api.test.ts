import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   STEP 11.39 PR-SC-06 — CRM API security tests
   ------------------------------------------------------------
   Test matrix (per owner's acceptance matrix):
   - Anonymous → 401
   - Authenticated without store.crm.read → 403
   - Seller owner → 200 + data
   - Seller non-owner → 404 (no data leak)
   - PATCH with forbidden field → rejected
   - Illegal status transition → 409 + no data change
   - Lead not found → 404
   - Forged sellerId in request → no scope change
   - Regression: existing GET behavior preserved
   ============================================================ */

let mockCurrentUser: { id: string } | null = null;
let mockCanResult: Record<string, boolean> = {};

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => mockCurrentUser,
}));
vi.mock("@/lib/authorization", () => ({
  can: async (_userId: string, perm: string) => mockCanResult[perm] ?? false,
}));

const mockListingFindMany = vi.fn(async () => []);
const mockLeadFindMany = vi.fn(async () => []);
const mockLeadFindUnique = vi.fn(async () => null);
const mockLeadUpdate = vi.fn(async (args: any) => ({ id: args.where.id, ...args.data, createdAt: new Date() }));

vi.mock("@/lib/db", () => ({
  db: {
    listing: { findMany: mockListingFindMany },
    lead: {
      findMany: mockLeadFindMany,
      findUnique: mockLeadFindUnique,
      update: mockLeadUpdate,
    },
  },
}));

const { GET, PATCH } = await import("@/app/api/seller/leads/route");

beforeEach(() => {
  mockCurrentUser = null;
  mockCanResult = {};
  mockListingFindMany.mockReset();
  mockLeadFindMany.mockReset();
  mockLeadFindUnique.mockReset();
  mockLeadUpdate.mockReset();
});

function makeReq(url: string, init?: RequestInit): NextRequest {
  return new Request(url, init) as any;
}

const sellerA = { id: "seller-A" };
const sellerB = { id: "seller-B" };

// Helper: set up seller-A with store.crm.read + store.crm.manage
function setupSellerA() {
  mockCurrentUser = sellerA;
  mockCanResult = { "store.crm.read": true, "store.crm.manage": true };
}

// Helper: mock a lead owned by seller-A
function mockLeadOwnedByA(overrides: Record<string, any> = {}) {
  return {
    id: "lead-1",
    listingId: "listing-1",
    leadType: "CALL",
    status: "NEW",
    note: null,
    createdAt: new Date(),
    listing: { id: "listing-1", sellerId: "seller-A", title: "Test", slug: "test" },
    ...overrides,
  };
}

// ── GET tests ──────────────────────────────────────────────

describe("PR-SC-06 GET /api/seller/leads — auth + authorization", () => {
  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const res = await GET(makeReq("http://localhost/api/seller/leads"));
    expect(res.status).toBe(401);
  });

  it("NEGATIVE: authenticated without store.crm.read → 403", async () => {
    mockCurrentUser = { id: "buyer-1" };
    mockCanResult = {};
    const res = await GET(makeReq("http://localhost/api/seller/leads"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/store\.crm\.read/);
  });

  it("POSITIVE: seller with store.crm.read → 200", async () => {
    setupSellerA();
    mockListingFindMany.mockResolvedValue([{ id: "listing-1", title: "T", slug: "s" }]);
    mockLeadFindMany.mockResolvedValue([]);
    const res = await GET(makeReq("http://localhost/api/seller/leads"));
    expect(res.status).toBe(200);
  });

  it("VERIFY: listing query includes sellerId === user.id", async () => {
    setupSellerA();
    mockListingFindMany.mockResolvedValue([]);
    mockLeadFindMany.mockResolvedValue([]);
    await GET(makeReq("http://localhost/api/seller/leads"));
    expect(mockListingFindMany).toHaveBeenCalled();
    const call = mockListingFindMany.mock.calls[0][0];
    expect(call.where.sellerId).toBe("seller-A");
  });

  it("VERIFY: status filter works (Lead.status exists)", async () => {
    setupSellerA();
    mockListingFindMany.mockResolvedValue([{ id: "l1", title: "T", slug: "s" }]);
    mockLeadFindMany.mockResolvedValue([]);
    await GET(makeReq("http://localhost/api/seller/leads?status=NEW"));
    const leadCall = mockLeadFindMany.mock.calls[0][0];
    expect(leadCall.where.status).toBe("NEW");
  });

  it("VERIFY: response includes byStatus stats", async () => {
    setupSellerA();
    mockListingFindMany.mockResolvedValue([{ id: "l1", title: "T", slug: "s" }]);
    mockLeadFindMany.mockResolvedValue([
      { id: "1", listingId: "l1", leadType: "CALL", status: "NEW", note: null, createdAt: new Date() },
      { id: "2", listingId: "l1", leadType: "OFFER", status: "CLOSED", note: null, createdAt: new Date() },
    ]);
    const res = await GET(makeReq("http://localhost/api/seller/leads"));
    const body = await res.json();
    expect(body.stats.byStatus).toBeDefined();
    expect(body.stats.byStatus.NEW).toBe(1);
    expect(body.stats.byStatus.CLOSED).toBe(1);
  });
});

// ── PATCH tests ────────────────────────────────────────────

describe("PR-SC-06 PATCH /api/seller/leads — auth + authorization", () => {
  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const res = await PATCH(makeReq("http://localhost/api/seller/leads", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "lead-1", status: "CONTACTED" }),
    }));
    expect(res.status).toBe(401);
  });

  it("NEGATIVE: authenticated without store.crm.manage → 403", async () => {
    mockCurrentUser = { id: "buyer-1" };
    mockCanResult = { "store.crm.read": true }; // has read but NOT manage
    const res = await PATCH(makeReq("http://localhost/api/seller/leads", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "lead-1", status: "CONTACTED" }),
    }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/store\.crm\.manage/);
  });
});

describe("PR-SC-06 PATCH /api/seller/leads — ownership + cross-seller", () => {
  it("NEGATIVE: non-owner seller → 404 (no data leak)", async () => {
    setupSellerA();
    // Lead owned by seller-B
    mockLeadFindUnique.mockResolvedValue(mockLeadOwnedByA({
      listing: { id: "listing-1", sellerId: "seller-B", title: "Other", slug: "other" },
    }));
    const res = await PATCH(makeReq("http://localhost/api/seller/leads", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "lead-1", status: "CONTACTED" }),
    }));
    expect(res.status).toBe(404); // NOT 403 — don't leak existence
    expect(mockLeadUpdate).not.toHaveBeenCalled();
  });

  it("POSITIVE: owner seller → 200 + lead updated", async () => {
    setupSellerA();
    mockLeadFindUnique.mockResolvedValue(mockLeadOwnedByA({ status: "NEW" }));
    mockLeadUpdate.mockResolvedValue({ id: "lead-1", status: "CONTACTED", note: null, createdAt: new Date() });
    const res = await PATCH(makeReq("http://localhost/api/seller/leads", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "lead-1", status: "CONTACTED" }),
    }));
    expect(res.status).toBe(200);
    expect(mockLeadUpdate).toHaveBeenCalled();
    const updateCall = mockLeadUpdate.mock.calls[0][0];
    expect(updateCall.data.status).toBe("CONTACTED");
  });

  it("NEGATIVE: lead not found → 404", async () => {
    setupSellerA();
    mockLeadFindUnique.mockResolvedValue(null);
    const res = await PATCH(makeReq("http://localhost/api/seller/leads", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "nonexistent", status: "CONTACTED" }),
    }));
    expect(res.status).toBe(404);
    expect(mockLeadUpdate).not.toHaveBeenCalled();
  });
});

describe("PR-SC-06 PATCH /api/seller/leads — status transition validation", () => {
  it("NEGATIVE: illegal transition QUALIFIED → NEW → 409 + no data change", async () => {
    setupSellerA();
    mockLeadFindUnique.mockResolvedValue(mockLeadOwnedByA({ status: "QUALIFIED" }));
    const res = await PATCH(makeReq("http://localhost/api/seller/leads", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "lead-1", status: "NEW" }),
    }));
    expect(res.status).toBe(409);
    expect(mockLeadUpdate).not.toHaveBeenCalled(); // NO data change
  });

  it("NEGATIVE: invalid status string → 400 + no data change", async () => {
    setupSellerA();
    mockLeadFindUnique.mockResolvedValue(mockLeadOwnedByA({ status: "NEW" }));
    const res = await PATCH(makeReq("http://localhost/api/seller/leads", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "lead-1", status: "ARCHIVED" }),
    }));
    expect(res.status).toBe(400);
    expect(mockLeadUpdate).not.toHaveBeenCalled();
  });

  it("POSITIVE: legal transition NEW → CONTACTED → 200", async () => {
    setupSellerA();
    mockLeadFindUnique.mockResolvedValue(mockLeadOwnedByA({ status: "NEW" }));
    mockLeadUpdate.mockResolvedValue({ id: "lead-1", status: "CONTACTED", note: null, createdAt: new Date() });
    const res = await PATCH(makeReq("http://localhost/api/seller/leads", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "lead-1", status: "CONTACTED" }),
    }));
    expect(res.status).toBe(200);
  });

  it("POSITIVE: reopen CLOSED → CONTACTED → 200", async () => {
    setupSellerA();
    mockLeadFindUnique.mockResolvedValue(mockLeadOwnedByA({ status: "CLOSED" }));
    mockLeadUpdate.mockResolvedValue({ id: "lead-1", status: "CONTACTED", note: null, createdAt: new Date() });
    const res = await PATCH(makeReq("http://localhost/api/seller/leads", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "lead-1", status: "CONTACTED" }),
    }));
    expect(res.status).toBe(200);
  });
});

describe("PR-SC-06 PATCH /api/seller/leads — mass-assignment prevention", () => {
  it("NEGATIVE: forged sellerId in body → ignored, no scope change", async () => {
    setupSellerA();
    mockLeadFindUnique.mockResolvedValue(mockLeadOwnedByA({ status: "NEW" }));
    mockLeadUpdate.mockResolvedValue({ id: "lead-1", status: "CONTACTED", note: null, createdAt: new Date() });
    const res = await PATCH(makeReq("http://localhost/api/seller/leads", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "lead-1", status: "CONTACTED", sellerId: "seller-B", listingId: "other-listing" }),
    }));
    // The PATCH should succeed (status is valid) but sellerId/listingId must NOT be in the update
    expect(res.status).toBe(200);
    const updateCall = mockLeadUpdate.mock.calls[0][0];
    expect(updateCall.data.sellerId).toBeUndefined();
    expect(updateCall.data.listingId).toBeUndefined();
    expect(updateCall.data.status).toBe("CONTACTED");
  });

  it("NEGATIVE: no patchable fields → 400", async () => {
    setupSellerA();
    mockLeadFindUnique.mockResolvedValue(mockLeadOwnedByA());
    const res = await PATCH(makeReq("http://localhost/api/seller/leads", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "lead-1", someOtherField: "value" }),
    }));
    expect(res.status).toBe(400);
    expect(mockLeadUpdate).not.toHaveBeenCalled();
  });

  it("POSITIVE: note update only → 200", async () => {
    setupSellerA();
    mockLeadFindUnique.mockResolvedValue(mockLeadOwnedByA());
    mockLeadUpdate.mockResolvedValue({ id: "lead-1", status: "NEW", note: "updated note", createdAt: new Date() });
    const res = await PATCH(makeReq("http://localhost/api/seller/leads", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "lead-1", note: "Follow up tomorrow" }),
    }));
    expect(res.status).toBe(200);
    const updateCall = mockLeadUpdate.mock.calls[0][0];
    expect(updateCall.data.note).toBe("Follow up tomorrow");
    expect(updateCall.data.status).toBeUndefined(); // status NOT changed
  });
});
