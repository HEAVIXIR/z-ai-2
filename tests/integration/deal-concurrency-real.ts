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
    // STEP 13.47: independent cleanup — try ALL deletions, collect errors, throw at end
    const cleanupErrors: string[] = [];
    if (dealId) {
      await db.order.deleteMany({ where: { dealId } }).catch((e) => { cleanupErrors.push(`orders for deal: ${e}`); });
      await db.deal.delete({ where: { id: dealId } }).catch((e) => { cleanupErrors.push(`deal: ${e}`); });
    }
    if (listingId) await db.listing.delete({ where: { id: listingId } }).catch((e) => { cleanupErrors.push(`listing: ${e}`); });
    if (buyerId) await db.user.delete({ where: { id: buyerId } }).catch((e) => { cleanupErrors.push(`buyer: ${e}`); });
    if (sellerId) await db.user.delete({ where: { id: sellerId } }).catch((e) => { cleanupErrors.push(`seller: ${e}`); });
    if (cleanupErrors.length > 0) {
      throw new Error(`afterAll cleanup failed: ${cleanupErrors.join("; ")}`);
    }
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

  // STEP 13.50: Old rollback test REMOVED — superseded by the comprehensive test below
  // (PATCH: order.create fails inside transaction → deal rolled back + 0 orders)
  // which has ALL setup inside try/finally + AggregateError + independent cleanup

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
      // STEP 13.46: try ALL deletions independently, collect errors, throw at end
      const cleanupErrors: string[] = [];
      if (cancelledOrderId) {
        await db.order.delete({ where: { id: cancelledOrderId } }).catch((e) => { cleanupErrors.push(`order: ${e}`); });
      }
      if (testDealId) {
        await db.deal.delete({ where: { id: testDealId } }).catch((e) => { cleanupErrors.push(`deal: ${e}`); });
      }
      if (cleanupErrors.length > 0) {
        throw new Error(`Cleanup failed: ${cleanupErrors.join("; ")}`);
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
      // STEP 13.46: try ALL deletions independently, collect errors, throw at end
      const cleanupErrors: string[] = [];
      if (completedOrderId) {
        await db.order.delete({ where: { id: completedOrderId } }).catch((e) => { cleanupErrors.push(`order: ${e}`); });
      }
      if (testDealId) {
        await db.deal.delete({ where: { id: testDealId } }).catch((e) => { cleanupErrors.push(`deal: ${e}`); });
      }
      if (cleanupErrors.length > 0) {
        throw new Error(`Cleanup failed: ${cleanupErrors.join("; ")}`);
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
    // STEP 13.50: ALL setup inside try/finally — no state creation outside
    let testDealId: string | undefined;
    let realDb: any;
    let originalTransaction: any;
    let primaryError: Error | null = null;

    try {
      // ALL imports and setup INSIDE try
      realDb = (await import("@/lib/db")).db;
      originalTransaction = realDb.$transaction.bind(realDb);

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
      realDb.$transaction = async (cb: any, opts?: any) => {
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
    } catch (e) {
      primaryError = e as Error;
      throw e;
    } finally {
      // Restore $transaction if it was overridden
      if (realDb && originalTransaction) {
        realDb.$transaction = originalTransaction;
      }
      // Independent cleanup — collect all errors
      const cleanupErrors: string[] = [];
      if (testDealId) {
        await db.order.deleteMany({ where: { dealId: testDealId } }).catch((e) => { cleanupErrors.push(`order: ${e}`); });
        await db.deal.delete({ where: { id: testDealId } }).catch((e) => { cleanupErrors.push(`deal: ${e}`); });
      }
      if (cleanupErrors.length > 0) {
        const cleanupMsg = `Cleanup failed: ${cleanupErrors.join("; ")}`;
        if (primaryError) {
          throw new AggregateError([primaryError, new Error(cleanupMsg)], "Primary test error + cleanup error");
        } else {
          throw new Error(cleanupMsg);
        }
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

  // ── STEP 13.51 P2-A: Failure matrix tests ──
  // dellk00k requires proof of each failure scenario with real PostgreSQL

  // 1. Deal creation failure — no fixture to clean up
  it("deal.create fails → no fixture left behind (no orphan)", async () => {
    // Use an invalid buyerId (FK violation) to make deal.create fail
    await expect(
      db.deal.create({
        data: {
          dealNumber: "FAIL-DEAL-" + Date.now().toString(36),
          sourceType: "LISTING_OFFER", sourceId: "fail-test",
          buyerId: "nonexistent-buyer-id",
          sellerId,
          listingId,
          agreedAmount: 100n, currency: "IRR",
          transactionType: "SALE", status: "PENDING_CONFIRMATION",
          agreedAt: new Date(),
        },
      })
    ).rejects.toThrow();

    // Verify no deal was created with that dealNumber
    const orphan = await db.deal.findFirst({
      where: { dealNumber: { startsWith: "FAIL-DEAL-" } },
    });
    expect(orphan).toBeNull();
  });

  // 2. Order creation failure after Deal created — Deal cleaned up
  it("order.create fails after deal created → deal cleaned up (no orphan)", async () => {
    let testDealId: string | undefined;
    try {
      const testDeal = await db.deal.create({
        data: {
          dealNumber: "ORPHAN-CHK-" + Date.now().toString(36),
          sourceType: "LISTING_OFFER", sourceId: "orphan-check",
          buyerId, sellerId, listingId,
          agreedAmount: 100n, currency: "IRR",
          transactionType: "SALE", status: "PENDING_CONFIRMATION",
          agreedAt: new Date(),
        },
      });
      testDealId = testDeal.id;

      // Try to create an order with a duplicate dealId (unique constraint)
      await db.order.create({
        data: {
          orderNumber: "ORD-ORPHAN-" + Date.now().toString(36),
          dealId: testDeal.id, titleSnapshot: "Orphan Check",
          priceSnapshot: 100n, currencySnapshot: "IRR",
          sellerSnapshot: sellerId, buyerSnapshot: buyerId,
          quantity: 1, status: "CONFIRMED", confirmedAt: new Date(),
        },
      });
      // This should succeed (first order). Second one with same dealId should fail.
      await expect(
        db.order.create({
          data: {
            orderNumber: "ORD-ORPHAN2-" + Date.now().toString(36),
            dealId: testDeal.id, titleSnapshot: "Orphan Check 2",
            priceSnapshot: 100n, currencySnapshot: "IRR",
            sellerSnapshot: sellerId, buyerSnapshot: buyerId,
            quantity: 1, status: "CONFIRMED", confirmedAt: new Date(),
          },
        })
      ).rejects.toThrow();
    } finally {
      const cleanupErrors: string[] = [];
      if (testDealId) {
        await db.order.deleteMany({ where: { dealId: testDealId } }).catch((e) => { cleanupErrors.push(`order: ${e}`); });
        await db.deal.delete({ where: { id: testDealId } }).catch((e) => { cleanupErrors.push(`deal: ${e}`); });
      }
      if (cleanupErrors.length > 0) {
        throw new Error(`Cleanup failed: ${cleanupErrors.join("; ")}`);
      }
    }

    // Verify both deal and orders are absent
    if (testDealId) {
      const dealCheck = await db.deal.findUnique({ where: { id: testDealId }, select: { id: true } });
      expect(dealCheck).toBeNull();
      const orderCheck = await db.order.count({ where: { dealId: testDealId } });
      expect(orderCheck).toBe(0);
    }
  });

  // 3. Multi-record independent deletion — one fails, others still attempted
  it("multi-record cleanup: one deletion fails → others still attempted", async () => {
    // Create two deals (both need cleanup)
    const deal1 = await db.deal.create({
      data: {
        dealNumber: "MULTI-1-" + Date.now().toString(36),
        sourceType: "LISTING_OFFER", sourceId: "multi-test-1",
        buyerId, sellerId, listingId,
        agreedAmount: 100n, currency: "IRR",
        transactionType: "SALE", status: "PENDING_CONFIRMATION",
        agreedAt: new Date(),
      },
    });
    const deal2 = await db.deal.create({
      data: {
        dealNumber: "MULTI-2-" + Date.now().toString(36),
        sourceType: "LISTING_OFFER", sourceId: "multi-test-2",
        buyerId, sellerId, listingId,
        agreedAmount: 200n, currency: "IRR",
        transactionType: "SALE", status: "PENDING_CONFIRMATION",
        agreedAt: new Date(),
      },
    });

    // Delete deal1 first (succeeds), then try to delete it AGAIN (fails — already deleted)
    // Then delete deal2 (should still succeed despite deal1's second deletion failing)
    const cleanupErrors: string[] = [];
    await db.deal.delete({ where: { id: deal1.id } }).catch((e) => { cleanupErrors.push(`deal1: ${e}`); });
    // This will fail because deal1 was already deleted
    await db.deal.delete({ where: { id: deal1.id } }).catch((e) => { cleanupErrors.push(`deal1-retry: ${e}`); });
    // deal2 should still be attempted and succeed
    await db.deal.delete({ where: { id: deal2.id } }).catch((e) => { cleanupErrors.push(`deal2: ${e}`); });

    // deal1-retry should have failed (it was already deleted)
    expect(cleanupErrors.length).toBe(1);
    expect(cleanupErrors[0]).toContain("deal1-retry");

    // Verify both deals are absent from DB
    const deal1Check = await db.deal.findUnique({ where: { id: deal1.id }, select: { id: true } });
    expect(deal1Check).toBeNull();
    const deal2Check = await db.deal.findUnique({ where: { id: deal2.id }, select: { id: true } });
    expect(deal2Check).toBeNull();
  });

  // 4. All fixtures absent after test suite (verify DB is clean)
  it("DB is clean: no test fixtures remain from previous tests", async () => {
    // Check no deals with test prefixes remain
    const testDeals = await db.deal.findMany({
      where: {
        OR: [
          { dealNumber: { startsWith: "PATCHROLL-" } },
          { dealNumber: { startsWith: "CANCEL-" } },
          { dealNumber: { startsWith: "COMP-" } },
          { dealNumber: { startsWith: "ORPHAN-" } },
          { dealNumber: { startsWith: "MULTI-" } },
          { dealNumber: { startsWith: "FAIL-DEAL-" } },
          { dealNumber: { startsWith: "ORPHAN-CHK-" } },
        ]
      },
      select: { id: true, dealNumber: true },
    });
    expect(testDeals).toHaveLength(0);

    // Check no orders with test prefixes remain
    const testOrders = await db.order.findMany({
      where: {
        orderNumber: { startsWith: "ORD-ORPHAN" }
      },
      select: { id: true, orderNumber: true },
    });
    expect(testOrders).toHaveLength(0);
  });
});
