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
const mockDealUpdateMany = vi.fn();
const mockOrderFindUnique = vi.fn();
const mockOrderCreate = vi.fn();
const mockListingFindUnique = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: mockTransaction,
    deal: {
      findUnique: mockDealFindUnique,
      updateMany: mockDealUpdateMany,
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
    // STEP 13.36: route uses updateMany (compare-and-set) + findUnique (re-read)
    mockDealUpdateMany.mockResolvedValue({ count: 1 });
  });

  // ── 1. deal.updateMany + order.create in single $transaction ──
  it("CONFIRMED transition: updateMany + order.create wrapped in $transaction", async () => {
    const mockTxDealFindUnique = vi.fn().mockResolvedValue({ id: "deal-1", status: "CONFIRMED" });
    mockTransaction.mockImplementation(async (cb: any) => {
      mockOrderFindUnique.mockResolvedValue(null); // no existing order
      return cb({
        deal: { updateMany: mockDealUpdateMany, findUnique: mockTxDealFindUnique },
        order: { findUnique: mockOrderFindUnique, create: mockOrderCreate },
        listing: { findUnique: mockListingFindUnique.mockResolvedValue({ title: "Excavator" }) },
      });
    });

    const res = await PATCH(makeReq("deal-1", "CONFIRMED"), makeParams("deal-1"));
    expect(res.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // updateMany was called (compare-and-set)
    expect(mockDealUpdateMany).toHaveBeenCalledTimes(1);
    // order.create was called inside the txn
    expect(mockOrderCreate).toHaveBeenCalledTimes(1);
    const orderData = mockOrderCreate.mock.calls[0][0].data;
    expect(orderData.dealId).toBe("deal-1");
    expect(orderData.status).toBe("CONFIRMED");
  });

  // ── 2. Idempotency: existing CONFIRMED order → no duplicate create ──
  it("CONFIRMED with existing CONFIRMED order: no duplicate (idempotent)", async () => {
    const mockTxDealFindUnique = vi.fn().mockResolvedValue({ id: "deal-1", status: "CONFIRMED" });
    const mockTxOrderUpdate = vi.fn().mockResolvedValue({ id: "existing-order", status: "CONFIRMED" });
    mockTransaction.mockImplementation(async (cb: any) => {
      // STEP 13.37: order exists AND is CONFIRMED → skip (idempotent)
      mockOrderFindUnique.mockResolvedValue({ id: "existing-order", status: "CONFIRMED" });
      return cb({
        deal: { updateMany: mockDealUpdateMany, findUnique: mockTxDealFindUnique },
        order: { findUnique: mockOrderFindUnique, create: mockOrderCreate, update: mockTxOrderUpdate },
        listing: { findUnique: mockListingFindUnique },
      });
    });

    const res = await PATCH(makeReq("deal-1", "CONFIRMED"), makeParams("deal-1"));
    expect(res.status).toBe(200);
    // order.create MUST NOT be called (order already CONFIRMED)
    expect(mockOrderCreate).not.toHaveBeenCalled();
    // order.update MUST NOT be called (order already CONFIRMED)
    expect(mockTxOrderUpdate).not.toHaveBeenCalled();
    // but deal.updateMany IS called (status transition still happens)
    expect(mockDealUpdateMany).toHaveBeenCalledTimes(1);
  });

  // ── 2b. Existing PENDING order → update to CONFIRMED (valid transition) ──
  it("CONFIRMED with existing PENDING order: updates order to CONFIRMED (valid transition)", async () => {
    const mockTxDealFindUnique = vi.fn().mockResolvedValue({ id: "deal-1", status: "CONFIRMED" });
    const mockTxOrderUpdate = vi.fn().mockResolvedValue({ id: "existing-order", status: "CONFIRMED" });
    mockTransaction.mockImplementation(async (cb: any) => {
      mockOrderFindUnique.mockResolvedValue({ id: "existing-order", status: "PENDING" });
      return cb({
        deal: { updateMany: mockDealUpdateMany, findUnique: mockTxDealFindUnique },
        order: { findUnique: mockOrderFindUnique, create: mockOrderCreate, update: mockTxOrderUpdate },
        listing: { findUnique: mockListingFindUnique },
      });
    });

    const res = await PATCH(makeReq("deal-1", "CONFIRMED"), makeParams("deal-1"));
    expect(res.status).toBe(200);
    expect(mockOrderCreate).not.toHaveBeenCalled();
    expect(mockTxOrderUpdate).toHaveBeenCalledTimes(1);
    expect(mockTxOrderUpdate.mock.calls[0][0].data.status).toBe("CONFIRMED");
  });

  // ── 2c. Existing CANCELLED order → error + rollback (dellk00k STEP 13.38 finding) ──
  it("CONFIRMED with CANCELLED order: 409 error, deal NOT changed (rollback)", async () => {
    const mockTxDealFindUnique = vi.fn().mockResolvedValue({ id: "deal-1", status: "CONFIRMED" });
    const mockTxOrderUpdate = vi.fn();
    mockTransaction.mockImplementation(async (cb: any) => {
      mockOrderFindUnique.mockResolvedValue({ id: "existing-order", status: "CANCELLED" });
      return cb({
        deal: { updateMany: mockDealUpdateMany, findUnique: mockTxDealFindUnique },
        order: { findUnique: mockOrderFindUnique, create: mockOrderCreate, update: mockTxOrderUpdate },
        listing: { findUnique: mockListingFindUnique },
      });
    });

    const res = await PATCH(makeReq("deal-1", "CONFIRMED"), makeParams("deal-1"));
    // CANCELLED → CONFIRMED is NOT valid → 409 error (transaction rolled back)
    expect(res.status).toBe(409);
    // order.update MUST NOT be called (invalid transition, error thrown)
    expect(mockTxOrderUpdate).not.toHaveBeenCalled();
    // order.create MUST NOT be called
    expect(mockOrderCreate).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.error).toContain("CANCELLED");
  });

  // ── 2d. Existing COMPLETED order → error + rollback ──
  it("CONFIRMED with COMPLETED order: 409 error, deal NOT changed (rollback)", async () => {
    const mockTxDealFindUnique = vi.fn().mockResolvedValue({ id: "deal-1", status: "CONFIRMED" });
    mockTransaction.mockImplementation(async (cb: any) => {
      mockOrderFindUnique.mockResolvedValue({ id: "existing-order", status: "COMPLETED" });
      return cb({
        deal: { updateMany: mockDealUpdateMany, findUnique: mockTxDealFindUnique },
        order: { findUnique: mockOrderFindUnique, create: mockOrderCreate, update: vi.fn() },
        listing: { findUnique: mockListingFindUnique },
      });
    });

    const res = await PATCH(makeReq("deal-1", "CONFIRMED"), makeParams("deal-1"));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("COMPLETED");
  });

  // ── 3. Atomicity: order.create fails → deal update rolled back ──
  it("order.create fails inside txn → error propagates (deal update rolled back)", async () => {
    const mockTxDealFindUnique = vi.fn().mockResolvedValue({ id: "deal-1", status: "CONFIRMED" });
    mockTransaction.mockImplementation(async (cb: any) => {
      mockOrderFindUnique.mockResolvedValue(null);
      mockOrderCreate.mockRejectedValue(new Error("order create failed"));
      return cb({
        deal: { updateMany: mockDealUpdateMany, findUnique: mockTxDealFindUnique },
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

  // ── 4. P2002 on Order.dealId + order CONFIRMED → graceful success ──
  it("P2002 on dealId + order CONFIRMED → 200 (idempotent)", async () => {
    const { Prisma } = await import("@prisma/client");
    const p2002Error = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the fields: (`dealId`)",
      { code: "P2002", meta: { target: ["dealId"] } },
    );
    mockTransaction.mockRejectedValue(p2002Error);
    // STEP 13.36: order must exist AND be CONFIRMED (not just exist)
    mockOrderFindUnique.mockResolvedValue({ id: "existing-order", status: "CONFIRMED" });

    const res = await PATCH(makeReq("deal-1", "CONFIRMED"), makeParams("deal-1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.status).toBe("CONFIRMED");
  });

  // ── 4a. P2002 on dealId + order NOT CONFIRMED → must error ──
  it("P2002 on dealId + order status != CONFIRMED → 500 (not idempotent)", async () => {
    const { Prisma } = await import("@prisma/client");
    const p2002Error = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the fields: (`dealId`)",
      { code: "P2002", meta: { target: ["dealId"] } },
    );
    mockTransaction.mockRejectedValue(p2002Error);
    // Order exists but status is PENDING (not CONFIRMED) → must NOT be idempotent
    mockOrderFindUnique.mockResolvedValue({ id: "existing-order", status: "PENDING" });

    const res = await PATCH(makeReq("deal-1", "CONFIRMED"), makeParams("deal-1"));
    expect(res.status).toBe(500);
  });

  // ── 4b. P2002 on orderNumber (NOT dealId) → must error, not idempotent ──
  it("P2002 on orderNumber → 500 error (NOT idempotent)", async () => {
    const { Prisma } = await import("@prisma/client");
    const p2002Error = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the fields: (`orderNumber`)",
      { code: "P2002", meta: { target: ["orderNumber"] } },
    );
    mockTransaction.mockRejectedValue(p2002Error);

    const res = await PATCH(makeReq("deal-1", "CONFIRMED"), makeParams("deal-1"));
    // P2002 on orderNumber → NOT idempotent → error propagates → 500
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Internal server error");
  });

  // ── 4c. P2002 on dealId but order does NOT exist → must error ──
  it("P2002 on dealId but order missing → 500 error (not silent success)", async () => {
    const { Prisma } = await import("@prisma/client");
    const p2002Error = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the fields: (`dealId`)",
      { code: "P2002", meta: { target: ["dealId"] } },
    );
    mockTransaction.mockRejectedValue(p2002Error);
    // Re-read returns null (order doesn't exist despite P2002 — inconsistent state)
    mockOrderFindUnique.mockResolvedValue(null);

    const res = await PATCH(makeReq("deal-1", "CONFIRMED"), makeParams("deal-1"));
    // Order doesn't exist despite P2002 on dealId → propagate error → 500
    expect(res.status).toBe(500);
  });

  // ── 4d. P2034 (serialization failure) → 409 retryable (NOT 500) ──
  it("P2034 serialization failure → 409 retryable (NOT 500 generic)", async () => {
    const { Prisma } = await import("@prisma/client");
    const p2034Error = new Prisma.PrismaClientKnownRequestError(
      "Transaction could not be serialized",
      { code: "P2034", meta: {} },
    );
    mockTransaction.mockRejectedValue(p2034Error);

    const res = await PATCH(makeReq("deal-1", "CONFIRMED"), makeParams("deal-1"));
    // STEP 13.36: P2034 → 409 retryable (NOT 500 generic)
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("هم‌زمان");
  });

  // ── 4e. Compare-and-set conflict: updateMany count=0 → 409 ──
  it("compare-and-set conflict (count=0) → 409 concurrent transition", async () => {
    const mockTxDealFindUnique = vi.fn().mockResolvedValue({ id: "deal-1", status: "CONFIRMED" });
    // updateMany returns count=0 (another request changed status first)
    mockDealUpdateMany.mockResolvedValue({ count: 0 });
    mockTransaction.mockImplementation(async (cb: any) => {
      return cb({
        deal: { updateMany: mockDealUpdateMany, findUnique: mockTxDealFindUnique },
        order: { findUnique: mockOrderFindUnique, create: mockOrderCreate },
        listing: { findUnique: mockListingFindUnique },
      });
    });

    const res = await PATCH(makeReq("deal-1", "CONFIRMED"), makeParams("deal-1"));
    // Compare-and-set detected concurrent transition → 409
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("تغییر کرد");
    // order.create MUST NOT be called (transition failed)
    expect(mockOrderCreate).not.toHaveBeenCalled();
  });

  // ── 5. Non-CONFIRMED transition: no order created ──
  it("COMPLETED transition (from IN_PROGRESS): no order created", async () => {
    // IN_PROGRESS → COMPLETED is valid per TRANSITIONS map
    mockDealFindUnique.mockResolvedValue({ ...VALID_DEAL, status: "IN_PROGRESS" });
    const mockTxDealFindUnique = vi.fn().mockResolvedValue({ id: "deal-1", status: "COMPLETED" });
    mockTransaction.mockImplementation(async (cb: any) => {
      return cb({
        deal: { updateMany: mockDealUpdateMany, findUnique: mockTxDealFindUnique },
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
    const mockTxDealFindUnique = vi.fn().mockResolvedValue({ id: "deal-1", status: "CANCELLED" });
    mockTransaction.mockImplementation(async (cb: any) => {
      return cb({
        deal: { updateMany: mockDealUpdateMany, findUnique: mockTxDealFindUnique },
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
