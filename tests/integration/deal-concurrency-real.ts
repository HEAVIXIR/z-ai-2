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
import { Prisma } from "@prisma/client";

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
      await db.deal.delete({ where: { id: dealId } }).catch(() => {});
    }
    if (listingId) await db.listing.delete({ where: { id: listingId } }).catch(() => {});
    if (buyerId) await db.user.delete({ where: { id: buyerId } }).catch(() => {});
    if (sellerId) await db.user.delete({ where: { id: sellerId } }).catch(() => {});
  });

  it("two concurrent CONFIRMED → exactly one 200, one 409", async () => {
    // We need to call the PATCH handler directly with mocked auth
    // but real db. Since the route uses db.$transaction, we import
    // the route and mock only auth.
    const { PATCH } = await import("@/app/api/deals/[id]/route");

    // Mock auth to return the buyer
    const authModule = await import("@/lib/auth");
    vi.mocked(authModule.getCurrentUserId).mockResolvedValue(buyerId);

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
    const authModule = await import("@/lib/auth");
    vi.mocked(authModule.getCurrentUserId).mockResolvedValue(buyerId);

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
});
