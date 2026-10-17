/**
 * STEP 13.52 — Real PostgreSQL Failure Matrix (P2-A)
 * ===================================================
 * Exercises the PRODUCTION PATCH /api/deals/[id] path and the DB layer
 * against a real PostgreSQL instance, proving the owner's FM-01..FM-10
 * matrix with INDEPENDENT DB verification (no mock-only assertions).
 *
 * Architecture (per owner STEP 13.52 directive):
 *  - Deal + Order are created inside ONE Serializable $transaction in the
 *    production PATCH handler → real PostgreSQL rollback is the PRIMARY
 *    mechanism. There is NO compensating cleanup in production code.
 *  - The "cleanup" exercised by FM-03/FM-04/FM-05 is the TEST HARNESS's
 *    fixture cleanup, whose robustness contract (independent deletion,
 *    error preservation, AggregateError) is proven here by REAL fault
 *    injection on existing records — not by re-deleting absent rows.
 *
 * Run (CI): bunx vitest run --config vitest.integration.config.ts tests/integration/deal-concurrency-real.ts
 * Requires DATABASE_URL starting with postgresql:// (skips otherwise).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { db } from "@/lib/db";

// Mock auth so the route handler can use getCurrentUserId without a session.
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

/**
 * Independent cleanup: attempts EVERY operation, collects all errors,
 * and throws an AggregateError preserving the primary error (if any)
 * plus every cleanup error. A failure on one operation NEVER prevents
 * the remaining operations from being attempted.
 */
async function independentCleanup(
  ops: Array<() => Promise<unknown>>,
  primaryError?: Error | null,
): Promise<void> {
  const errors: Error[] = [];
  for (const op of ops) {
    try {
      await op();
    } catch (e) {
      errors.push(e as Error);
    }
  }
  if (primaryError && errors.length > 0) {
    throw new AggregateError(
      [primaryError, ...errors],
      "Primary test error + cleanup error(s)",
    );
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, "Cleanup error(s)");
  }
  if (primaryError) throw primaryError;
}

/**
 * Finalize helper: runs cleanup ops AND absence-check ops, collecting EVERY error
 * (cleanup failures + absence-assertion failures) WITHOUT swallowing any. Returns
 * the collected errors so the caller can combine them with a primary error and throw
 * a single AggregateError that preserves all causes. A failure on one op NEVER
 * prevents the remaining ops from being attempted.
 *
 * This is the counterpart to independentCleanup for the recovery phase: it does NOT
 * throw by itself, so the caller controls how errors are surfaced (combined with a
 * primary error, rethrown, etc.).
 */
async function finalizeCollecting(ops: Array<() => Promise<unknown>>): Promise<Error[]> {
  const errors: Error[] = [];
  for (const op of ops) {
    try {
      await op();
    } catch (e) {
      errors.push(e as Error);
    }
  }
  return errors;
}

/** Combine a primary error (if any) with finalize errors into a single thrown AggregateError. */
function throwCombined(primaryError: Error | null, finalizeErrors: Error[], label: string): void {
  if (primaryError && finalizeErrors.length > 0) {
    throw new AggregateError([primaryError, ...finalizeErrors], `${label}: primary + finalize error(s)`);
  }
  if (finalizeErrors.length > 0) {
    throw new AggregateError(finalizeErrors, `${label}: finalize error(s)`);
  }
  if (primaryError) throw primaryError;
}

describe.skipIf(!RUN)("STEP 13.52 — P2-A Failure Matrix (real PostgreSQL)", () => {
  let dealId: string | undefined;
  let buyerId: string | undefined;
  let sellerId: string | undefined;
  let listingId: string | undefined;

  // STEP 13.54 P2-A (dellk00k review 5560288437): the shared setup/cleanup logic is extracted
  // into a REUSABLE function so that both beforeAll AND the FM-SETUP test exercise the SAME
  // real path (not a hand-rebuilt copy). The `failAfter` parameter lets FM-SETUP inject a
  // controlled failure between two creates to prove the failure-safe cleanup path works.
  // Each created ID is tracked immediately; on any failure, independentCleanup of every
  // recorded ID is attempted; BOTH setup + cleanup errors are preserved (AggregateError).
  interface SetupIds {
    buyerId?: string; sellerId?: string; listingId?: string; dealId?: string;
  }
  async function setupSharedFixtures(opts: {
    failAfter?: "buyer" | "seller" | "listing";
    ids: SetupIds;
  }): Promise<{ setupError: Error | null; cleanupError: Error | null }> {
    const { ids } = opts;
    let setupError: Error | null = null;
    try {
      const buyer = await db.user.create({
        data: {
          mobile: opts.failAfter === "buyer" ? "09129990061" : "09129990001",
          email: opts.failAfter ? "fm-setupfail-buyer@test.com" : "fm-buyer@test.com",
          firstName: "FM", lastName: "Buyer", passwordHash: "hash",
        },
      });
      ids.buyerId = buyer.id;
      if (opts.failAfter === "buyer") throw new Error("INJECTED setup failure after buyer (FM-SETUP)");

      const seller = await db.user.create({
        data: {
          mobile: opts.failAfter === "seller" ? "09129990062" : "09129990002",
          email: opts.failAfter ? "fm-setupfail-seller@test.com" : "fm-seller@test.com",
          firstName: "FM", lastName: "Seller", passwordHash: "hash",
        },
      });
      ids.sellerId = seller.id;
      if (opts.failAfter === "seller") throw new Error("INJECTED setup failure after seller (FM-SETUP)");

      const listing = await db.listing.create({
        data: {
          slug: (opts.failAfter ? "fm-setupfail-listing-" : "fm-listing-") + Date.now(),
          title: "FM Test Listing", sellerId: ids.sellerId!, sellerName: "FM Seller",
          status: "PUBLISHED", price: 500000000n,
        },
      });
      ids.listingId = listing.id;
      if (opts.failAfter === "listing") throw new Error("INJECTED setup failure after listing (FM-SETUP)");

      const deal = await db.deal.create({
        data: {
          dealNumber: "CONC-" + Date.now().toString(36),
          sourceType: "LISTING_OFFER", sourceId: "fm-concurrency",
          buyerId: ids.buyerId!, sellerId: ids.sellerId!, listingId: ids.listingId!,
          agreedAmount: 500000000n, currency: "IRR", transactionType: "SALE",
          status: "PENDING_CONFIRMATION", agreedAt: new Date(),
        },
      });
      ids.dealId = deal.id;
    } catch (e) {
      setupError = e as Error;
    }

    let cleanupError: Error | null = null;
    if (setupError) {
      try {
        await independentCleanup([
          () => (ids.dealId ? db.order.deleteMany({ where: { dealId: ids.dealId } }) : Promise.resolve()),
          () => (ids.dealId ? db.deal.delete({ where: { id: ids.dealId } }) : Promise.resolve()),
          () => (ids.listingId ? db.listing.delete({ where: { id: ids.listingId } }) : Promise.resolve()),
          () => (ids.buyerId ? db.user.delete({ where: { id: ids.buyerId } }) : Promise.resolve()),
          () => (ids.sellerId ? db.user.delete({ where: { id: ids.sellerId } }) : Promise.resolve()),
        ]);
      } catch (e) {
        cleanupError = e as Error;
      }
    }
    return { setupError, cleanupError };
  }

  beforeAll(async () => {
    // Pass the suite-scoped vars wrapped in an object (passed by reference) so
    // setupSharedFixtures can assign them as each create succeeds.
    const ids: SetupIds = {};
    const { setupError, cleanupError } = await setupSharedFixtures({ ids });
    buyerId = ids.buyerId; sellerId = ids.sellerId; listingId = ids.listingId; dealId = ids.dealId;
    if (setupError) {
      if (cleanupError) {
        throw new AggregateError([setupError, cleanupError], "beforeAll setup + cleanup");
      }
      throw setupError;
    }
  });

  afterAll(async () => {
    // Independent cleanup of the shared concurrency fixture. Guards against undefined IDs
    // (if beforeAll partially failed, the relevant IDs are undefined and skipped).
    await independentCleanup([
      () => (dealId ? db.order.deleteMany({ where: { dealId } }) : Promise.resolve()),
      () => (dealId ? db.deal.delete({ where: { id: dealId } }) : Promise.resolve()),
      () => (listingId ? db.listing.delete({ where: { id: listingId } }) : Promise.resolve()),
      () => (buyerId ? db.user.delete({ where: { id: buyerId } }) : Promise.resolve()),
      () => (sellerId ? db.user.delete({ where: { id: sellerId } }) : Promise.resolve()),
    ]);
  });

  // Helper to create a standalone PENDING_CONFIRMATION deal for per-test use.
  async function makeDeal(prefix: string, amount = 100000000n) {
    return db.deal.create({
      data: {
        dealNumber: prefix + "-" + Date.now().toString(36),
        sourceType: "LISTING_OFFER",
        sourceId: prefix.toLowerCase(),
        buyerId,
        sellerId,
        listingId,
        agreedAmount: amount,
        currency: "IRR",
        transactionType: "SALE",
        status: "PENDING_CONFIRMATION",
        agreedAt: new Date(),
      },
    });
  }

  // ── FM-08: Concurrent requests — one succeeds, other rejected per contract ──
  it("FM-08 concurrent CONFIRMED → exactly one 200, one 409; final DB state verified", async () => {
    const { PATCH } = await import("@/app/api/deals/[id]/route");
    mockGetCurrentUserId.mockResolvedValue(buyerId);
    const makeReq = () =>
      new Request(`http://localhost/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CONFIRMED" }),
      });
    const makeParams = () => ({ params: Promise.resolve({ id: dealId }) });

    const [res1, res2] = await Promise.all([PATCH(makeReq(), makeParams()), PATCH(makeReq(), makeParams())]);
    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);

    // Independent DB verification (not just HTTP status).
    const deal = await db.deal.findUnique({ where: { id: dealId }, include: { order: true } });
    expect(deal).toBeTruthy();
    expect(deal!.status).toBe("CONFIRMED");
    const orderCount = await db.order.count({ where: { dealId } });
    expect(orderCount).toBe(1); // not 0, not 2
    expect(deal!.order).toBeTruthy();
    expect(deal!.order!.status).toBe("CONFIRMED");
    expect(deal!.order!.dealId).toBe(dealId);
  });

  // ── FM-09: CANCELLED & COMPLETED order states — invalid transition rejected, records unchanged ──
  it("FM-09a CANCELLED order → 409; deal AND order unchanged (before/after DB comparison)", async () => {
    let testDealId: string | undefined;
    let cancelledOrderId: string | undefined;
    try {
      const testDeal = await makeDeal("FM-CANCEL", 200000000n);
      testDealId = testDeal.id;
      const cancelledOrder = await db.order.create({
        data: {
          orderNumber: "ORD-FM-CANCEL-" + Date.now().toString(36),
          dealId: testDeal.id,
          titleSnapshot: "FM Cancel",
          priceSnapshot: 200000000n,
          currencySnapshot: "IRR",
          sellerSnapshot: sellerId,
          buyerSnapshot: buyerId,
          quantity: 1,
          status: "CANCELLED",
          cancelledAt: new Date(),
        },
      });
      cancelledOrderId = cancelledOrder.id;

      const dealBefore = await db.deal.findUnique({ where: { id: testDeal.id }, select: { id: true, status: true, confirmedAt: true } });
      const orderBefore = await db.order.findUnique({ where: { id: cancelledOrder.id }, select: { id: true, status: true, confirmedAt: true } });

      const { PATCH } = await import("@/app/api/deals/[id]/route");
      mockGetCurrentUserId.mockResolvedValue(buyerId);
      const res = await PATCH(
        new Request(`http://localhost/api/deals/${testDeal.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "CONFIRMED" }) }),
        { params: Promise.resolve({ id: testDeal.id }) },
      );
      expect(res.status).toBe(409);

      // Independent DB verification: both records unchanged.
      const dealAfter = await db.deal.findUnique({ where: { id: testDeal.id }, select: { id: true, status: true, confirmedAt: true } });
      const orderAfter = await db.order.findUnique({ where: { id: cancelledOrder.id }, select: { id: true, status: true, confirmedAt: true } });
      expect(dealAfter).toMatchObject({ id: dealBefore!.id, status: dealBefore!.status, confirmedAt: dealBefore!.confirmedAt });
      expect(orderAfter).toMatchObject({ id: orderBefore!.id, status: orderBefore!.status, confirmedAt: orderBefore!.confirmedAt });
    } finally {
      await independentCleanup([
        () => (cancelledOrderId ? db.order.delete({ where: { id: cancelledOrderId } }) : Promise.resolve()),
        () => (testDealId ? db.deal.delete({ where: { id: testDealId } }) : Promise.resolve()),
      ]);
      // FM-10 per-scenario: no orphan remains.
      if (testDealId) {
        expect(await db.deal.findUnique({ where: { id: testDealId }, select: { id: true } })).toBeNull();
        expect(await db.order.count({ where: { dealId: testDealId } })).toBe(0);
      }
    }
  });

  it("FM-09b COMPLETED order → 409; deal AND order unchanged (before/after DB comparison)", async () => {
    let testDealId: string | undefined;
    let completedOrderId: string | undefined;
    try {
      const testDeal = await makeDeal("FM-COMP", 150000000n);
      testDealId = testDeal.id;
      const completedOrder = await db.order.create({
        data: {
          orderNumber: "ORD-FM-COMP-" + Date.now().toString(36),
          dealId: testDeal.id,
          titleSnapshot: "FM Completed",
          priceSnapshot: 150000000n,
          currencySnapshot: "IRR",
          sellerSnapshot: sellerId,
          buyerSnapshot: buyerId,
          quantity: 1,
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });
      completedOrderId = completedOrder.id;

      const dealBefore = await db.deal.findUnique({ where: { id: testDeal.id }, select: { id: true, status: true, confirmedAt: true } });
      const orderBefore = await db.order.findUnique({ where: { id: completedOrder.id }, select: { id: true, status: true, confirmedAt: true } });

      const { PATCH } = await import("@/app/api/deals/[id]/route");
      mockGetCurrentUserId.mockResolvedValue(buyerId);
      const res = await PATCH(
        new Request(`http://localhost/api/deals/${testDeal.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "CONFIRMED" }) }),
        { params: Promise.resolve({ id: testDeal.id }) },
      );
      expect(res.status).toBe(409);

      const dealAfter = await db.deal.findUnique({ where: { id: testDeal.id }, select: { id: true, status: true, confirmedAt: true } });
      const orderAfter = await db.order.findUnique({ where: { id: completedOrder.id }, select: { id: true, status: true, confirmedAt: true } });
      expect(dealAfter).toMatchObject({ id: dealBefore!.id, status: dealBefore!.status, confirmedAt: dealBefore!.confirmedAt });
      expect(orderAfter).toMatchObject({ id: orderBefore!.id, status: orderBefore!.status, confirmedAt: orderBefore!.confirmedAt });
    } finally {
      await independentCleanup([
        () => (completedOrderId ? db.order.delete({ where: { id: completedOrderId } }) : Promise.resolve()),
        () => (testDealId ? db.deal.delete({ where: { id: testDealId } }) : Promise.resolve()),
      ]);
      if (testDealId) {
        expect(await db.deal.findUnique({ where: { id: testDealId }, select: { id: true } })).toBeNull();
        expect(await db.order.count({ where: { dealId: testDealId } })).toBe(0);
      }
    }
  });

  // ── FM-02 + FM-06: order.create fails inside PRODUCTION PATCH transaction → rollback; error reaches caller ──
  it("FM-02/FM-06 PATCH order.create fails inside transaction → HTTP 500 (error not swallowed), deal rolled back, 0 orders (independent DB proof)", async () => {
    let testDealId: string | undefined;
    let realDb: any;
    let originalTransaction: any;
    try {
      realDb = (await import("@/lib/db")).db;
      originalTransaction = realDb.$transaction.bind(realDb);
      const testDeal = await makeDeal("FM-ROLL", 250000000n);
      testDealId = testDeal.id;
      const dealBefore = await db.deal.findUnique({ where: { id: testDeal.id }, select: { id: true, status: true, confirmedAt: true } });
      expect(dealBefore?.status).toBe("PENDING_CONFIRMATION");

      // Inject order.create failure INSIDE the real PATCH transaction.
      realDb.$transaction = async (cb: any, opts?: any) =>
        originalTransaction(async (tx: any) => {
          tx.order.create = async () => { throw new Error("SIMULATED order.create failure FM-02"); };
          return cb(tx);
        }, opts);

      const { PATCH } = await import("@/app/api/deals/[id]/route");
      mockGetCurrentUserId.mockResolvedValue(buyerId);
      const patchResponse = await PATCH(
        new Request(`http://localhost/api/deals/${testDeal.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "CONFIRMED" }) }),
        { params: Promise.resolve({ id: testDeal.id }) },
      );

      // FM-06: error reached the caller (NOT swallowed into 200).
      expect(patchResponse.status).toBe(500);

      // FM-02: deal status UNCHANGED (real PostgreSQL rollback, independent query).
      const dealAfter = await db.deal.findUnique({ where: { id: testDeal.id }, select: { id: true, status: true, confirmedAt: true } });
      expect(dealAfter).toMatchObject({ id: dealBefore!.id, status: dealBefore!.status, confirmedAt: dealBefore!.confirmedAt });
      // FM-02: 0 orders (rolled back).
      expect(await db.order.count({ where: { dealId: testDeal.id } })).toBe(0);
    } finally {
      if (realDb && originalTransaction) realDb.$transaction = originalTransaction;
      await independentCleanup([
        () => (testDealId ? db.order.deleteMany({ where: { dealId: testDealId } }) : Promise.resolve()),
        () => (testDealId ? db.deal.delete({ where: { id: testDealId } }) : Promise.resolve()),
      ]);
      if (testDealId) {
        expect(await db.deal.findUnique({ where: { id: testDealId }, select: { id: true } })).toBeNull();
        expect(await db.order.count({ where: { dealId: testDealId } })).toBe(0);
      }
    }
  });

  // ── FM-01: deal.create failure → no incomplete record remains ──
  it("FM-01 deal.create fails (FK violation) → error reaches caller, no orphan deal (independent DB proof)", async () => {
    const badBuyer = "nonexistent-buyer-id-" + Date.now();
    let threw = false;
    try {
      await db.deal.create({
        data: {
          dealNumber: "FM-FAIL-DEAL-" + Date.now().toString(36),
          sourceType: "LISTING_OFFER",
          sourceId: "fm-fail-deal",
          buyerId: badBuyer, // FK violation
          sellerId,
          listingId,
          agreedAmount: 100n,
          currency: "IRR",
          transactionType: "SALE",
          status: "PENDING_CONFIRMATION",
          agreedAt: new Date(),
        },
      });
    } catch (e) {
      threw = true;
      // FM-01: error reaches caller (Prisma FK error, not swallowed).
      expect(e).toBeInstanceOf(Error);
    }
    expect(threw).toBe(true);
    // FM-01/FM-10: independent DB query — no deal with the fail prefix was persisted.
    const orphan = await db.deal.findFirst({ where: { dealNumber: { startsWith: "FM-FAIL-DEAL-" } } });
    expect(orphan).toBeNull();
  });

  // ── FM-07: FK + Unique constraints on the real DB layer ──
  it("FM-07a order.create with invalid dealId → FK rejection, 0 orders persisted (independent DB proof)", async () => {
    const invalidDealId = "nonexistent-deal-" + Date.now();
    let threw = false;
    try {
      await db.order.create({
        data: {
          orderNumber: "ORD-FM-FK-" + Date.now().toString(36),
          dealId: invalidDealId, // FK violation
          titleSnapshot: "FM FK",
          priceSnapshot: 100n,
          currencySnapshot: "IRR",
          sellerSnapshot: sellerId,
          buyerSnapshot: buyerId,
          quantity: 1,
          status: "CONFIRMED",
          confirmedAt: new Date(),
        },
      });
    } catch (e) {
      threw = true;
      expect(e).toBeInstanceOf(Error);
    }
    expect(threw).toBe(true);
    // Independent DB verification: no order with the FK-fail prefix exists.
    const orphanOrder = await db.order.findFirst({ where: { orderNumber: { startsWith: "ORD-FM-FK-" } } });
    expect(orphanOrder).toBeNull();
  });

  it("FM-07b duplicate order.dealId → unique rejection, FIRST order remains (independent DB proof)", async () => {
    let testDealId: string | undefined;
    let firstOrderId: string | undefined;
    try {
      const testDeal = await makeDeal("FM-UNIQ", 300000000n);
      testDealId = testDeal.id;
      const first = await db.order.create({
        data: {
          orderNumber: "ORD-FM-UNIQ1-" + Date.now().toString(36),
          dealId: testDeal.id,
          titleSnapshot: "FM Uniq 1",
          priceSnapshot: 300000000n,
          currencySnapshot: "IRR",
          sellerSnapshot: sellerId,
          buyerSnapshot: buyerId,
          quantity: 1,
          status: "CONFIRMED",
          confirmedAt: new Date(),
        },
      });
      firstOrderId = first.id;

      // Second order on the SAME dealId → unique(@unique) violation.
      let secondThrew = false;
      try {
        await db.order.create({
          data: {
            orderNumber: "ORD-FM-UNIQ2-" + Date.now().toString(36),
            dealId: testDeal.id,
            titleSnapshot: "FM Uniq 2",
            priceSnapshot: 300000000n,
            currencySnapshot: "IRR",
            sellerSnapshot: sellerId,
            buyerSnapshot: buyerId,
            quantity: 1,
            status: "CONFIRMED",
            confirmedAt: new Date(),
          },
        });
      } catch (e) {
        secondThrew = true;
        expect(e).toBeInstanceOf(Error);
      }
      expect(secondThrew).toBe(true);

      // Independent DB verification: exactly 1 order remains (the first), not 2.
      expect(await db.order.count({ where: { dealId: testDeal.id } })).toBe(1);
      const surviving = await db.order.findUnique({ where: { id: firstOrderId }, select: { id: true, status: true } });
      expect(surviving?.id).toBe(firstOrderId);
      expect(surviving?.status).toBe("CONFIRMED");
    } finally {
      await independentCleanup([
        () => (firstOrderId ? db.order.delete({ where: { id: firstOrderId } }) : Promise.resolve()),
        () => (testDealId ? db.deal.delete({ where: { id: testDealId } }) : Promise.resolve()),
      ]);
      if (testDealId) {
        expect(await db.deal.findUnique({ where: { id: testDealId }, select: { id: true } })).toBeNull();
        expect(await db.order.count({ where: { dealId: testDealId } })).toBe(0);
      }
    }
  });

  // ── FM-03: multi-record cleanup — first deletion fails on an EXISTING record; subsequent deletions still attempted ──
  it("FM-03 first deletion fails (existing record) → second deletion still attempted + succeeds; first record survives; cleanup error reported", async () => {
    // STEP 13.54 P2-A (dellk00k review 5560288437): BOTH fixture creations are INSIDE the
    // protected try/finally scope with immediate ID tracking. If deal2 creation fails,
    // deal1 is still cleaned up (independentCleanup attempts every recorded ID). No orphan.
    let deal1Id: string | undefined;
    let deal2Id: string | undefined;
    let fm03Primary: Error | null = null;
    try {
      const deal1 = await makeDeal("FM-MULTI-1", 100n);
      deal1Id = deal1.id; // tracked immediately — cleanup covers it even if deal2 fails
      const deal2 = await makeDeal("FM-MULTI-2", 200n);
      deal2Id = deal2.id; // tracked immediately

      // Inject a REAL deletion failure on deal1 (which exists) by overriding db.deal.delete.
      const origDelete = db.deal.delete.bind(db.deal);
      let deal1Attempted = false;
      let deal2Attempted = false;
      (db.deal as any).delete = async (args: any) => {
        if (args.where.id === deal1.id) {
          deal1Attempted = true;
          throw new Error("SIMULATED deletion failure FM-03 (existing record)");
        }
        deal2Attempted = true;
        return origDelete(args);
      };

      let cleanupError: Error | null = null;
      try {
        await independentCleanup([
          () => db.deal.delete({ where: { id: deal1.id } }),
          () => db.deal.delete({ where: { id: deal2.id } }),
        ]);
      } catch (e) {
        cleanupError = e as Error;
      } finally {
        (db.deal as any).delete = origDelete;
      }

      // deal1 deletion WAS attempted (and failed) on the existing record.
      expect(deal1Attempted).toBe(true);
      // deal2 deletion WAS STILL attempted despite deal1's failure.
      expect(deal2Attempted).toBe(true);
      // Cleanup reported the error (no silent success). Assert on the AggregateError's
      // inner .errors — String(AggregateError) only surfaces the top message, not sub-errors.
      expect(cleanupError).toBeInstanceOf(AggregateError);
      const agg03 = (cleanupError as AggregateError).errors.map((e) => String(e));
      expect(agg03.some((m) => m.includes("SIMULATED deletion failure FM-03"))).toBe(true);

      // Independent DB verification: deal1 STILL EXISTS (its delete genuinely failed), deal2 GONE.
      expect(await db.deal.findUnique({ where: { id: deal1.id }, select: { id: true } })).toBeTruthy();
      expect(await db.deal.findUnique({ where: { id: deal2.id }, select: { id: true } })).toBeNull();
    } catch (e) {
      fm03Primary = e as Error;
    }
    // STEP 13.53 P2-A finding #1/#3 (dellk00k): recovery cleanup must NOT swallow errors.
    // Real recovery delete of deal1/deal2 (deal1 survived the injected failure; deal2 was
    // deleted during cleanup but we re-attempt to be safe) + absence check. By this point
    // the db.deal.delete override is already restored (inner finally), so db.deal.delete is
    // the real Prisma client. Errors collected via finalizeCollecting, combined with any
    // primary error via throwCombined.
    const fm03FinalizeErrors = await finalizeCollecting([
      () => (deal1Id ? db.deal.delete({ where: { id: deal1Id } }) : Promise.resolve()),
      () => (deal2Id ? db.deal.delete({ where: { id: deal2Id } }) : Promise.resolve()),
      async () => { if (deal1Id) expect(await db.deal.findUnique({ where: { id: deal1Id }, select: { id: true } })).toBeNull(); },
      async () => { if (deal2Id) expect(await db.deal.findUnique({ where: { id: deal2Id }, select: { id: true } })).toBeNull(); },
    ]);
    throwCombined(fm03Primary, fm03FinalizeErrors, "FM-03 recovery");
  });

  // ── FM-04: cleanup-only failure — primary succeeds, cleanup fails → error reported (no silent success) ──
  it("FM-04 primary succeeds but cleanup deletion fails → cleanup error reported, not converted to false success", async () => {
    let testDealId: string | undefined;
    // STEP 13.53 P2-A finding #1/#3: capture primary error so it is preserved alongside
    // any recovery-cleanup error (no swallowing). throwCombined surfaces both.
    let fm04Primary: Error | null = null;
    try {
      const testDeal = await makeDeal("FM-CLONLY", 120000000n);
      testDealId = testDeal.id;

      // PRIMARY operation succeeds (read + assert).
      const d = await db.deal.findUnique({ where: { id: testDeal.id }, select: { id: true, status: true } });
      expect(d).toBeTruthy();
      expect(d!.status).toBe("PENDING_CONFIRMATION");

      // Inject a REAL cleanup deletion failure on the existing record.
      const origDelete = db.deal.delete.bind(db.deal);
      (db.deal as any).delete = async () => {
        throw new Error("SIMULATED cleanup-only failure FM-04");
      };
      let cleanupError: Error | null = null;
      try {
        await independentCleanup([() => db.deal.delete({ where: { id: testDeal.id } })]);
      } catch (e) {
        cleanupError = e as Error;
      } finally {
        (db.deal as any).delete = origDelete;
      }

      // FM-04: cleanup failure was REPORTED (AggregateError), not silent success.
      // Assert on inner .errors — String(AggregateError) only surfaces the top message.
      expect(cleanupError).toBeInstanceOf(AggregateError);
      const agg04 = (cleanupError as AggregateError).errors.map((e) => String(e));
      expect(agg04.some((m) => m.includes("SIMULATED cleanup-only failure FM-04"))).toBe(true);

      // Independent DB verification: deal STILL EXISTS (the failed cleanup did not delete it).
      expect(await db.deal.findUnique({ where: { id: testDeal.id }, select: { id: true } })).toBeTruthy();
    } catch (e) {
      fm04Primary = e as Error;
    }
    // Recovery cleanup + absence verification — errors collected, not swallowed.
    // Combined with any primary error so BOTH remain visible.
    const fm04FinalizeErrors = await finalizeCollecting([
      () => (testDealId ? db.deal.delete({ where: { id: testDealId } }) : Promise.resolve()),
      async () => { expect(await db.deal.findUnique({ where: { id: testDealId! }, select: { id: true } })).toBeNull(); },
    ]);
    throwCombined(fm04Primary, fm04FinalizeErrors, "FM-04 recovery");
  });

  // ── FM-05: assertion + cleanup simultaneous failure → both errors preserved (AggregateError) ──
  it("FM-05 primary assertion failure + cleanup failure → AggregateError preserves BOTH causes", async () => {
    let testDealId: string | undefined;
    let primaryError: Error | null = null;
    // STEP 13.53 P2-A finding #1/#3: capture any error from the body (including the
    // inner assertion checks) so it is preserved alongside recovery-cleanup errors.
    let fm05Primary: Error | null = null;
    try {
      const testDeal = await makeDeal("FM-BOTH", 130000000n);
      testDealId = testDeal.id;

      // Deliberately fail the primary assertion.
      try {
        expect(false).toBe(true); // throws AssertionError
      } catch (e) {
        primaryError = e as Error;
      }
      expect(primaryError).toBeInstanceOf(Error); // sanity: primary error captured

      // Inject a REAL cleanup deletion failure on the existing record.
      const origDelete = db.deal.delete.bind(db.deal);
      (db.deal as any).delete = async () => {
        throw new Error("SIMULATED cleanup failure FM-05");
      };
      let combinedError: Error | null = null;
      try {
        await independentCleanup([() => db.deal.delete({ where: { id: testDeal.id } })], primaryError);
      } catch (e) {
        combinedError = e as Error;
      } finally {
        (db.deal as any).delete = origDelete;
      }

      // FM-05: BOTH errors preserved in a single AggregateError.
      expect(combinedError).toBeInstanceOf(AggregateError);
      const agg = combinedError as AggregateError;
      expect(agg.errors.length).toBe(2);
      // First = primary assertion error; second = cleanup error.
      expect(String(agg.errors[0])).toContain("expected false to be true");
      expect(String(agg.errors[1])).toContain("SIMULATED cleanup failure FM-05");

      // Independent DB verification: deal STILL EXISTS (cleanup genuinely failed).
      expect(await db.deal.findUnique({ where: { id: testDeal.id }, select: { id: true } })).toBeTruthy();
    } catch (e) {
      fm05Primary = e as Error;
    }
    // Recovery cleanup + absence verification — errors collected, not swallowed.
    // Combined with any body error so ALL causes remain visible.
    const fm05FinalizeErrors = await finalizeCollecting([
      () => (testDealId ? db.deal.delete({ where: { id: testDealId } }) : Promise.resolve()),
      async () => { expect(await db.deal.findUnique({ where: { id: testDealId! }, select: { id: true } })).toBeNull(); },
    ]);
    throwCombined(fm05Primary, fm05FinalizeErrors, "FM-05 recovery");
  });

  // ── FM-SETUP: mid-shared-setup failure via the REAL setupSharedFixtures path ──
  // STEP 13.54 P2-A (dellk00k review 5560288437): this test exercises the SAME
  // setupSharedFixtures() function that beforeAll uses (not a hand-rebuilt copy).
  // It injects a controlled failure BETWEEN two creates (after buyer, after seller,
  // and after listing) and proves via independent PostgreSQL queries that:
  //   1. setupError is the injected failure (not a silent pass)
  //   2. every successfully-created fixture is cleaned up (no orphans)
  //   3. the failure-safe cleanup path (inside setupSharedFixtures) ran
  // This directly tests the real shared setup/cleanup helper's failure-safety.
  it("FM-SETUP real shared-path: failure after buyer → buyer cleaned, no orphans (independent PostgreSQL proof)", async () => {
    const ids: SetupIds = {};
    const { setupError } = await setupSharedFixtures({ failAfter: "buyer", ids });
    // Setup DID fail (injected failure after buyer creation).
    expect(setupError).toBeInstanceOf(Error);
    expect(String(setupError)).toContain("INJECTED setup failure after buyer");
    // buyer was created (id tracked) before the failure.
    expect(ids.buyerId).toBeTruthy();
    // seller/listing/deal were NOT created (failure happened before them).
    expect(ids.sellerId).toBeUndefined();
    expect(ids.listingId).toBeUndefined();
    expect(ids.dealId).toBeUndefined();
    // Independent PostgreSQL verification: the buyer created before the failure was CLEANED.
    expect(await db.user.findUnique({ where: { email: "fm-setupfail-buyer@test.com" }, select: { id: true } })).toBeNull();
  });

  it("FM-SETUP real shared-path: failure after seller → both users cleaned, no orphans (independent PostgreSQL proof)", async () => {
    const ids: SetupIds = {};
    const { setupError } = await setupSharedFixtures({ failAfter: "seller", ids });
    expect(setupError).toBeInstanceOf(Error);
    expect(String(setupError)).toContain("INJECTED setup failure after seller");
    expect(ids.buyerId).toBeTruthy();
    expect(ids.sellerId).toBeTruthy();
    expect(ids.listingId).toBeUndefined(); // listing not created (failure before it)
    // Independent PostgreSQL verification: both users cleaned.
    expect(await db.user.findUnique({ where: { email: "fm-setupfail-buyer@test.com" }, select: { id: true } })).toBeNull();
    expect(await db.user.findUnique({ where: { email: "fm-setupfail-seller@test.com" }, select: { id: true } })).toBeNull();
  });

  it("FM-SETUP real shared-path: failure after listing → all 3 fixtures cleaned, no orphans (independent PostgreSQL proof)", async () => {
    const ids: SetupIds = {};
    const { setupError } = await setupSharedFixtures({ failAfter: "listing", ids });
    expect(setupError).toBeInstanceOf(Error);
    expect(String(setupError)).toContain("INJECTED setup failure after listing");
    expect(ids.buyerId).toBeTruthy();
    expect(ids.sellerId).toBeTruthy();
    expect(ids.listingId).toBeTruthy();
    expect(ids.dealId).toBeUndefined(); // deal not created (failure before it)
    // Independent PostgreSQL verification: all 3 fixtures cleaned.
    expect(await db.user.findUnique({ where: { email: "fm-setupfail-buyer@test.com" }, select: { id: true } })).toBeNull();
    expect(await db.user.findUnique({ where: { email: "fm-setupfail-seller@test.com" }, select: { id: true } })).toBeNull();
    expect(await db.listing.findFirst({ where: { slug: { startsWith: "fm-setupfail-listing-" } }, select: { id: true } })).toBeNull();
  });

  // ── FM-10: suite-end independent verification — no test fixtures remain in PostgreSQL ──
  it("FM-10 suite-end: no FM test fixtures remain in PostgreSQL (independent query)", async () => {
    const testDeals = await db.deal.findMany({
      where: { dealNumber: { startsWith: "FM-" } },
      select: { id: true, dealNumber: true },
    });
    expect(testDeals).toHaveLength(0);
    const testOrders = await db.order.findMany({
      where: { orderNumber: { startsWith: "ORD-FM-" } },
      select: { id: true, orderNumber: true },
    });
    expect(testOrders).toHaveLength(0);
  });
});
