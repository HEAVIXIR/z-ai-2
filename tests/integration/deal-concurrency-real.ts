/**
 * STEP 13.36 — Real Concurrency Test: PATCH /api/deals/[id]
 * ------------------------------------------------------------
 * This test hits a REAL PostgreSQL database to verify:
 *  1. Two concurrent CONFIRMED transitions on the same deal →
 *     exactly one succeeds (200), one gets 409 (compare-and-set conflict)
 *  2. Final DB state: deal.status = CONFIRMED, exactly 1 order exists
 *  3. The order's status is CONFIRMED (not just "exists")
 *
 * This is NOT a mock test. It requires DATABASE_URL pointing to a
 * real PostgreSQL instance with the schema pushed.
 *
 * Run: bunx vitest run --config vitest.integration.config.ts tests/integration/deal-concurrency-real.ts
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { db } from "@/lib/db";

// Mock auth so the route handler can use getCurrentUserId without a session
const mockGetCurrentUserId = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUserId: mockGetCurrentUserId,
  getCurrentUser: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/request-context", () => ({ getClientIp: () => "127.0.0.1" }));

const RUN =
  process.env.DATABASE_URL?.startsWith("postgresql://") ||
  process.env.DATABASE_URL?.startsWith("postgres://");

describe.skipIf(!RUN)("STEP 13.36 — Real PATCH concurrency (PostgreSQL)", () => {
  let dealId: string;
  let buyerId: string;
  let sellerId: string;
  let listingId: string;

  beforeAll(async () => {
    // Create test users
    const buyer = await db.user.create({
      data: {
        mobile: "09129990001",
        email: "concurrency-buyer@test.com",
        firstName: "Conc",
        lastName: "Buyer",
        passwordHash: "hash",
      },
    });
    buyerId = buyer.id;

    const seller = await db.user.create({
      data: {
        mobile: "09129990002",
        email: "concurrency-seller@test.com",
        firstName: "Conc",
        lastName: "Seller",
        passwordHash: "hash",
      },
    });
    sellerId = seller.id;

    // Create a listing
    const listing = await db.listing.create({
      data: {
        slug: "concurrency-test-listing-" + Date.now(),
        title: "Concurrency Test Listing",
        sellerId,
        sellerName: "Conc Seller",
        status: "PUBLISHED",
        price: 500000000n,
      },
    });
    listingId = listing.id;

    // Create a deal in PENDING_CONFIRMATION state
    const deal = await db.deal.create({
      data: {
        dealNumber: "CONC-" + Date.now().toString(36),
        sourceType: "LISTING_OFFER",
        sourceId: "concurrency-test",
        buyerId,
        sellerId,
        listingId,
        agreedAmount: 500000000n,
        currency: "IRR",
        transactionType: "SALE",
        status: "PENDING_CONFIRMATION",
        agreedAt: new Date(),
      },
    });
    dealId = deal.id;
  });

  afterAll(async () => {
    // Cleanup
    if (dealId) {
      await db.order.deleteMany({ where: { dealId } });
      await db.deal.delete({ where: { id: dealId } }).catch((e) => { throw new Error(`Cleanup failed: ${e}`); });
    }
    if (listingId) await db.listing.delete({ where: { id: listingId } }).catch((e) => { throw new Error(`Cleanup failed: ${e}`); });
    if (buyerId) await db.user.delete({ where: { id: buyerId } }).catch((e) => { throw new Error(`Cleanup failed: ${e}`); });
    if (sellerId) await db.user.delete({ where: { id: sellerId } }).catch((e) => { throw new Error(`Cleanup failed: ${e}`); });
  });

  it("two concurrent CONFIRMED → exactly one 200, one 409", async () => {
    // We need to call the PATCH handler directly with mocked auth
    // but real db. Since the route uses db.$transaction, we import
    // the route and mock only auth.
    const { PATCH } = await import("@/app/api/deals/[id]/route");

    // Mock auth to return the buyer
    
    mockGetCurrentUserId.mockResolvedValue(buyerId);

    const makeReq = () =>
      new Request(`http://localhost/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CONFIRMED" }),
      });
    const makeParams = () => ({
      params: Promise.resolve({ id: dealId }),
    });

    // Fire two concurrent requests
    const [res1, res2] = await Promise.all([
      PATCH(makeReq(), makeParams()),
      PATCH(makeReq(), makeParams()),
    ]);

    const status1 = res1.status;
    const status2 = res2.status;
    const statuses = [status1, status2].sort();

    // Exactly one should succeed (200), one should get 409 (conflict)
    expect(statuses).toEqual([200, 409]);
  });

  it("final DB state: deal.status = CONFIRMED, exactly 1 order, order.status = CONFIRMED", async () => {
    const deal = await db.deal.findUnique({
      where: { id: dealId },
      include: { order: true },
    });

    expect(deal).toBeTruthy();
    expect(deal!.status).toBe("CONFIRMED");

    // Exactly 1 order (not 0, not 2)
    const orderCount = await db.order.count({ where: { dealId } });
    expect(orderCount).toBe(1);

    // Order exists AND its status is CONFIRMED (not just "exists")
    expect(deal!.order).toBeTruthy();
    expect(deal!.order!.status).toBe("CONFIRMED");
    expect(deal!.order!.dealId).toBe(dealId);
  });

  it("third CONFIRMED request (after already confirmed) → 409 (invalid transition)", async () => {
    const { PATCH } = await import("@/app/api/deals/[id]/route");

    mockGetCurrentUserId.mockResolvedValue(buyerId);

    const res = await PATCH(
      new Request(`http://localhost/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CONFIRMED" }),
      }),
      { params: Promise.resolve({ id: dealId }) },
    );

    // CONFIRMED → CONFIRMED is not a valid transition → 409
    expect(res.status).toBe(409);
  });

  // ── STEP 13.37 P2-A: rollback test — order.create fails → deal rolled back ──
  it("order.create fails inside txn → deal status NOT changed (rollback)", async () => {
    // Create a NEW deal in PENDING_CONFIRMATION for this test
    const rollbackDeal = await db.deal.create({
      data: {
        dealNumber: "ROLLBACK-" + Date.now().toString(36),
        sourceType: "LISTING_OFFER",
        sourceId: "rollback-test",
        buyerId,
        sellerId,
        listingId,
        agreedAmount: 300000000n,
        currency: "IRR",
        transactionType: "SALE",
        status: "PENDING_CONFIRMATION",
        agreedAt: new Date(),
      },
    });

    // Mock order.create to fail inside the transaction by intercepting
    // db.$transaction. We use a custom implementation that calls the callback
    // but makes order.create throw.
    const { PATCH } = await import("@/app/api/deals/[id]/route");
    const { db: realDb } = await import("@/lib/db");

    mockGetCurrentUserId.mockResolvedValue(buyerId);

    // Temporarily override db.$transaction to make order.create fail
    const originalTransaction = realDb.$transaction.bind(realDb);
    (realDb as any).$transaction = async (cb: any, opts?: any) => {
      return originalTransaction(async (tx: any) => {
        // Override tx.order.create to throw
        const originalOrderCreate = tx.order.create.bind(tx.order);
        tx.order.create = async () => {
          throw new Error("SIMULATED order.create failure");
        };
        try {
          return await cb(tx);
        } finally {
          tx.order.create = originalOrderCreate;
        }
      }, opts);
    };

    try {
      const res = await PATCH(
        new Request(`http://localhost/api/deals/${rollbackDeal.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "CONFIRMED" }),
        }),
        { params: Promise.resolve({ id: rollbackDeal.id }) },
      );

      // The transaction should fail → 500 (error propagates)
      expect(res.status).toBe(500);

      // Verify DB state: deal status should STILL be PENDING_CONFIRMATION (rolled back)
      const dealAfter = await db.deal.findUnique({
        where: { id: rollbackDeal.id },
        select: { status: true },
      });
      expect(dealAfter?.status).toBe("PENDING_CONFIRMATION");

      // Verify NO order was created (rolled back)
      const orderCount = await db.order.count({
        where: { dealId: rollbackDeal.id },
      });
      expect(orderCount).toBe(0);
    } finally {
      // Restore original $transaction
      (realDb as any).$transaction = originalTransaction;
      // Cleanup
      await db.deal.delete({ where: { id: rollbackDeal.id } }).catch((e) => { throw new Error(`Cleanup failed: ${e}`); });
    }
  });

  // ── STEP 13.41 P2-A: CANCELLED order → 409 + rollback (creation inside try, visible cleanup)
  it("CANCELLED order → 409 error, deal AND order both unchanged (explicit before/after comparison)", async () => {
    // STEP 13.41: all creation inside try so cleanup covers all records
    let testDealId: string | undefined;
    let cancelledOrderId: string | undefined;
    try {
      const testDeal = await db.deal.create({
        data: {
          dealNumber: "CANCEL-" + Date.now().toString(36),
          sourceType: "LISTING_OFFER", sourceId: "cancel-test",
          buyerId, sellerId, listingId,
          agreedAmount: 200000000n, currency: "IRR",
          transactionType: "SALE", status: "PENDING_CONFIRMATION",
          agreedAt: new Date(),
        },
      });
      testDealId = testDeal.id;

      const cancelledOrder = await db.order.create({
        data: {
          orderNumber: "ORD-CANCEL-" + Date.now().toString(36),
          dealId: testDeal.id, titleSnapshot: "Cancel Test",
          priceSnapshot: 200000000n, currencySnapshot: "IRR",
          sellerSnapshot: sellerId, buyerSnapshot: buyerId,
          quantity: 1, status: "CANCELLED", cancelledAt: new Date(),
        },
      });
      cancelledOrderId = cancelledOrder.id;

      const dealBefore = await db.deal.findUnique({
        where: { id: testDeal.id },
        select: { id: true, status: true, confirmedAt: true },
      });
      const orderBefore = await db.order.findUnique({
        where: { id: cancelledOrder.id },
        select: { id: true, status: true, confirmedAt: true },
      });
      expect(dealBefore).toBeTruthy();
      expect(orderBefore).toBeTruthy();

      const { PATCH } = await import("@/app/api/deals/[id]/route");
      mockGetCurrentUserId.mockResolvedValue(buyerId);
      const res = await PATCH(
        new Request(`http://localhost/api/deals/${testDeal.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "CONFIRMED" }),
        }),
        { params: Promise.resolve({ id: testDeal.id }) },
      );

      expect(res.status).toBe(409);

      const dealAfter = await db.deal.findUnique({
        where: { id: testDeal.id },
        select: { id: true, status: true, confirmedAt: true },
      });
      const orderAfter = await db.order.findUnique({
        where: { id: cancelledOrder.id },
        select: { id: true, status: true, confirmedAt: true },
      });

      expect(dealAfter).toMatchObject({
        id: dealBefore!.id, status: dealBefore!.status,
        confirmedAt: dealBefore!.confirmedAt,
      });
      expect(orderAfter).toMatchObject({
        id: orderBefore!.id, status: orderBefore!.status,
        confirmedAt: orderBefore!.confirmedAt,
      });
    } finally {
      // STEP 13.41: visible cleanup — cleanup failure throws
      if (cancelledOrderId) {
        try { await db.order.delete({ where: { id: cancelledOrderId } }); }
        catch (e) { throw new Error(`Cleanup failed (order): ${e}`); }
      }
      if (testDealId) {
        try { await db.deal.delete({ where: { id: testDealId } }); }
        catch (e) { throw new Error(`Cleanup failed (deal): ${e}`); }
      }
    }
  });

  // ── STEP 13.41 P2-A: COMPLETED order → 409 + rollback (creation inside try, visible cleanup)
  it("COMPLETED order → 409 error, deal AND order both unchanged (explicit before/after comparison)", async () => {
    let testDealId: string | undefined;
    let completedOrderId: string | undefined;
    try {
      const testDeal = await db.deal.create({
        data: {
          dealNumber: "COMP-" + Date.now().toString(36),
          sourceType: "LISTING_OFFER", sourceId: "completed-test",
          buyerId, sellerId, listingId,
          agreedAmount: 150000000n, currency: "IRR",
          transactionType: "SALE", status: "PENDING_CONFIRMATION",
          agreedAt: new Date(),
        },
      });
      testDealId = testDeal.id;

      const completedOrder = await db.order.create({
        data: {
          orderNumber: "ORD-COMP-" + Date.now().toString(36),
          dealId: testDeal.id, titleSnapshot: "Completed Test",
          priceSnapshot: 150000000n, currencySnapshot: "IRR",
          sellerSnapshot: sellerId, buyerSnapshot: buyerId,
          quantity: 1, status: "COMPLETED", completedAt: new Date(),
        },
      });
      completedOrderId = completedOrder.id;

      const dealBefore = await db.deal.findUnique({
        where: { id: testDeal.id },
        select: { id: true, status: true, confirmedAt: true },
      });
      const orderBefore = await db.order.findUnique({
        where: { id: completedOrder.id },
        select: { id: true, status: true, confirmedAt: true },
      });
      expect(dealBefore).toBeTruthy();
      expect(orderBefore).toBeTruthy();

      const { PATCH } = await import("@/app/api/deals/[id]/route");
      mockGetCurrentUserId.mockResolvedValue(buyerId);
      const res = await PATCH(
        new Request(`http://localhost/api/deals/${testDeal.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "CONFIRMED" }),
        }),
        { params: Promise.resolve({ id: testDeal.id }) },
      );

      expect(res.status).toBe(409);

      const dealAfter = await db.deal.findUnique({
        where: { id: testDeal.id },
        select: { id: true, status: true, confirmedAt: true },
      });
      const orderAfter = await db.order.findUnique({
        where: { id: completedOrder.id },
        select: { id: true, status: true, confirmedAt: true },
      });

      expect(dealAfter).toMatchObject({
        id: dealBefore!.id, status: dealBefore!.status,
        confirmedAt: dealBefore!.confirmedAt,
      });
      expect(orderAfter).toMatchObject({
        id: orderBefore!.id, status: orderBefore!.status,
        confirmedAt: orderBefore!.confirmedAt,
      });
    } finally {
      if (completedOrderId) {
        try { await db.order.delete({ where: { id: completedOrderId } }); }
        catch (e) { throw new Error(`Cleanup failed (order): ${e}`); }
      }
      if (testDealId) {
        try { await db.deal.delete({ where: { id: testDealId } }); }
        catch (e) { throw new Error(`Cleanup failed (deal): ${e}`); }
      }
    }
  });

  // ── STEP 13.41 P2-A: order-create fails → deal cleaned up (no orphan) ──
  // ── STEP 13.43 P2-A: order.create fails INSIDE PATCH transaction → deal rolled back ──
  // dellk00k finding: "ثابت نمی‌کند که شکست ایجاد Order در مسیر واقعی PATCH
  // باعث rollback اتمیک می‌شود و رکورد یتیم باقی نمی‌ماند"
  // This test intercepts db.$transaction to make order.create fail INSIDE
  // the real PATCH handler's transaction, then verifies:
  // 1. HTTP 500 (error propagates)
  // 2. Deal status UNCHANGED (rolled back — not CONFIRMED)
  // 3. 0 orders exist (rolled back)
  // 4. After cleanup, deal ABSENT from DB
  it("PATCH: order.create fails inside transaction → deal rolled back + 0 orders (real DB proof)", async () => {
    // STEP 13.44: deal creation INSIDE try/finally so cleanup covers ALL paths
    let testDealId: string | undefined;
    const { db: realDb } = await import("@/lib/db");
    const originalTransaction = realDb.$transaction.bind(realDb);

    try {
      const testDeal = await db.deal.create({
        data: {
          dealNumber: "PATCHROLL-" + Date.now().toString(36),
          sourceType: "LISTING_OFFER", sourceId: "patch-rollback-test",
          buyerId, sellerId, listingId,
          agreedAmount: 250000000n, currency: "IRR",
          transactionType: "SALE", status: "PENDING_CONFIRMATION",
          agreedAt: new Date(),
        },
      });
      testDealId = testDeal.id;

      const dealBefore = await db.deal.findUnique({
        where: { id: testDeal.id },
        select: { id: true, status: true, confirmedAt: true },
      });
      expect(dealBefore?.status).toBe("PENDING_CONFIRMATION");

      // Intercept db.$transaction: make tx.order.create throw inside PATCH
      (realDb as any).$transaction = async (cb: any, opts?: any) => {
        return originalTransaction(async (tx: any) => {
          tx.order.create = async () => {
            throw new Error("SIMULATED order.create failure inside PATCH transaction");
          };
          return cb(tx);
        }, opts);
      };

      const { PATCH } = await import("@/app/api/deals/[id]/route");
      mockGetCurrentUserId.mockResolvedValue(buyerId);
      const patchResponse = await PATCH(
        new Request(`http://localhost/api/deals/${testDeal.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "CONFIRMED" }),
        }),
        { params: Promise.resolve({ id: testDeal.id }) },
      );

      // 1. Verify HTTP 500
      expect(patchResponse.status).toBe(500);

      // 2. Read deal AFTER — status UNCHANGED (rolled back)
      const dealAfter = await db.deal.findUnique({
        where: { id: testDeal.id },
        select: { id: true, status: true, confirmedAt: true },
      });
      expect(dealAfter).toMatchObject({
        id: dealBefore!.id,
        status: dealBefore!.status,
        confirmedAt: dealBefore!.confirmedAt,
      });

      // 3. Verify 0 orders
      const orderCount = await db.order.count({ where: { dealId: testDeal.id } });
      expect(orderCount).toBe(0);
    } finally {
      // STEP 13.44: restore $transaction AND cleanup — both in finally
      (realDb as any).$transaction = originalTransaction;
      if (testDealId) {
        // Cleanup failure → throw (test FAILS, not just log)
        await db.order.deleteMany({ where: { dealId: testDealId } }).catch((e) => { throw new Error(`Cleanup failed: ${e}`); });
        await db.deal.delete({ where: { id: testDealId } }).catch((e) => { throw new Error(`Cleanup failed: ${e}`); });
      }
    }

    // 4. Verify deal ABSENT from DB after cleanup
    if (testDealId) {
      const dealAfterCleanup = await db.deal.findUnique({
        where: { id: testDealId },
        select: { id: true },
      });
      expect(dealAfterCleanup).toBeNull();
    }
  });
});
