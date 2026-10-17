import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   STEP 13.31 — P2-A: PATCH /api/deals/[id] order creation
   transactional + idempotent
   ------------------------------------------------------------
   Verifies:
   1. deal.update + order.create are wrapped in a single
      $transaction (atomicity — if order.create fails, deal
      update is rolled back).
   2. Idempotency: if an order already exists (re-checked
      inside the txn), no duplicate order is created.
   3. Concurrent CONFIRMED: P2002 unique-constraint violation
      on Order.dealId is handled gracefully (not a 500 error).
   4. Non-CONFIRMED transition: no order created at all.
   ============================================================ */

const mockDealFindUnique = vi.fn();
const mockDealUpdate = vi.fn();
const mockOrderFindUnique = vi.fn();
const mockOrderCreate = vi.fn();
const mockListingFindUnique = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: mockTransaction,
    deal: {
      findUnique: mockDealFindUnique,
      update: mockDealUpdate,
    },
    order: {
      findUnique: mockOrderFindUnique,
      create: mockOrderCreate,
    },
    listing: {
      findUnique: mockListingFindUnique,
    },
  },
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/request-context", () => ({ getClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/auth", () => ({ getCurrentUserId: vi.fn() }));

const { getCurrentUserId } = await import("@/lib/auth");
const { PATCH } = await import("@/app/api/deals/[id]/route");

function makeReq(id: string, status: string): Request {
  return new Request(`http://localhost/api/deals/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}
function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

const VALID_DEAL = {
  id: "deal-1",
  dealNumber: "DEAL-1",
  status: "PENDING_CONFIRMATION",
  buyerId: "user-1",
  sellerId: "seller-1",
  listingId: "listing-1",
  agreedAmount: 500000000n,
  currency: "IRR",
  order: null,
};

describe("STEP 13.31 — P2-A: PATCH deal + order creation transactional + idempotent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserId).mockResolvedValue("user-1" as any);
    mockDealFindUnique.mockResolvedValue(VALID_DEAL);
    mockDealUpdate.mockResolvedValue({ id: "deal-1", status: "CONFIRMED" });
  });

  // ── 1. deal.update + order.create in single $transaction ──
  it("CONFIRMED transition: update + order.create wrapped in $transaction", async () => {
    mockTransaction.mockImplementation(async (cb: any) => {
      mockOrderFindUnique.mockResolvedValue(null); // no existing order
      return cb({
        deal: { update: mockDealUpdate },
        order: { findUnique: mockOrderFindUnique, create: mockOrderCreate },
        listing: { findUnique: mockListingFindUnique.mockResolvedValue({ title: "Excavator" }) },
      });
    });

    const res = await PATCH(makeReq("deal-1", "CONFIRMED"), makeParams("deal-1"));
    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // order.create was called inside the txn
    expect(mockOrderCreate).toHaveBeenCalledTimes(1);
    const orderData = mockOrderCreate.mock.calls[0][0].data;
    expect(orderData.dealId).toBe("deal-1");
    expect(orderData.status).toBe("CONFIRMED");
  });

  // ── 2. Idempotency: existing order → no duplicate create ──
  it("CONFIRMED with existing order: does NOT create duplicate (idempotent)", async () => {
    mockTransaction.mockImplementation(async (cb: any) => {
      mockOrderFindUnique.mockResolvedValue({ id: "existing-order" }); // order EXISTS
      return cb({
        deal: { update: mockDealUpdate },
        order: { findUnique: mockOrderFindUnique, create: mockOrderCreate },
        listing: { findUnique: mockListingFindUnique },
      });
    });

    const res = await PATCH(makeReq("deal-1", "CONFIRMED"), makeParams("deal-1"));
    expect(res.status).toBe(200);
    // order.create MUST NOT be called (order already exists)
    expect(mockOrderCreate).not.toHaveBeenCalled();
    // but deal.update IS called (status transition still happens)
    expect(mockDealUpdate).toHaveBeenCalledTimes(1);
  });

  // ── 3. Atomicity: order.create fails → deal update rolled back ──
  it("order.create fails inside txn → error propagates (deal update rolled back)", async () => {
    mockTransaction.mockImplementation(async (cb: any) => {
      mockOrderFindUnique.mockResolvedValue(null);
      mockOrderCreate.mockRejectedValue(new Error("order create failed"));
      return cb({
        deal: { update: mockDealUpdate },
        order: { findUnique: mockOrderFindUnique, create: mockOrderCreate },
        listing: { findUnique: mockListingFindUnique },
      });
    });

    const res = await PATCH(makeReq("deal-1", "CONFIRMED"), makeParams("deal-1"));
    // The transaction error propagates → 500 (generic, per P2-C fix)
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Internal server error");
  });

  // ── 4. P2002 (concurrent CONFIRMED) handled gracefully ──
  it("P2002 unique-constraint on Order.dealId → graceful success (not 500)", async () => {
    // Simulate concurrent CONFIRMED: the other request created the order first.
    // Our $transaction hits P2002 on order.create.
    const p2002Error = new Error("Unique constraint failed on the fields: (`dealId`) (P2002)");
    mockTransaction.mockRejectedValue(p2002Error);

    const res = await PATCH(makeReq("deal-1", "CONFIRMED"), makeParams("deal-1"));
    // P2002 is handled → 200 (idempotent success, order already exists)
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.status).toBe("CONFIRMED");
  });

  // ── 5. Non-CONFIRMED transition: no order created ──
  it("COMPLETED transition (from IN_PROGRESS): no order created", async () => {
    // IN_PROGRESS → COMPLETED is valid per TRANSITIONS map
    mockDealFindUnique.mockResolvedValue({ ...VALID_DEAL, status: "IN_PROGRESS" });
    mockTransaction.mockImplementation(async (cb: any) => {
      return cb({
        deal: { update: mockDealUpdate },
        order: { findUnique: mockOrderFindUnique, create: mockOrderCreate },
        listing: { findUnique: mockListingFindUnique },
      });
    });

    const res = await PATCH(makeReq("deal-1", "COMPLETED"), makeParams("deal-1"));
    expect(res.status).toBe(200);
    expect(mockOrderCreate).not.toHaveBeenCalled();
    expect(mockOrderFindUnique).not.toHaveBeenCalled();
  });

  // ── 6. CANCELLED transition: no order created ──
  it("CANCELLED transition: no order created", async () => {
    mockTransaction.mockImplementation(async (cb: any) => {
      return cb({
        deal: { update: mockDealUpdate },
        order: { findUnique: mockOrderFindUnique, create: mockOrderCreate },
        listing: { findUnique: mockListingFindUnique },
      });
    });

    const res = await PATCH(makeReq("deal-1", "CANCELLED"), makeParams("deal-1"));
    expect(res.status).toBe(200);
    expect(mockOrderCreate).not.toHaveBeenCalled();
  });

  // ── 7. Auth: non-party → 403, no txn ──
  it("non-party user → 403, no transaction", async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue("intruder" as any);
    const res = await PATCH(makeReq("deal-1", "CONFIRMED"), makeParams("deal-1"));
    expect(res.status).toBe(403);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  // ── 8. Invalid transition → 409, no txn ──
  it("invalid transition (COMPLETED → CONFIRMED) → 409, no txn", async () => {
    mockDealFindUnique.mockResolvedValue({ ...VALID_DEAL, status: "COMPLETED" });
    const res = await PATCH(makeReq("deal-1", "CONFIRMED"), makeParams("deal-1"));
    expect(res.status).toBe(409);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
