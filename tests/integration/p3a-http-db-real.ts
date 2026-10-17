/**
 * STEP 13.54 Phase 2 — P3-A Real HTTP→DB Authorization Tests
 * ============================================================
 *
 * OWNER DIRECTIVE (STEP 13.54 §5):
 *   For each HTTP entry-point endpoint, execute the 5 authorization scenarios
 *   with REAL HTTP handler calls + REAL isolated PostgreSQL + DB before/after
 *   INDEPENDENT queries proving no unauthorized mutation. Identity MUST come
 *   from getCurrentUserId() (server-side), never from the request body.
 *
 * ENDPOINTS COVERED (HTTP entry points):
 *   - PATCH /api/deals/[id]   (src/app/api/deals/[id]/route.ts → PATCH)
 *   - POST  /api/deals        (src/app/api/deals/route.ts → POST)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * acceptQuote / rejectQuote (rfq-service) — NO HTTP ENTRY POINT
 * ─────────────────────────────────────────────────────────────────────────
 * The rfq-service `acceptQuote` and `rejectQuote` functions are INTERNAL
 * service functions. They are NOT exposed via any HTTP route:
 *   - /api/rfq/[id]/quotes  exposes only GET (list) + POST (submitQuote).
 *   - The [quoteId] sub-route does NOT exist (defense-in-depth).
 *   - The admin store-services route uses a DIFFERENT `acceptQuote` from
 *     `services-service.ts` (NOT rfq-service), gated by requirePermission
 *     ('store.manage') RBAC.
 *
 * This is verified by test 12 in tests/security/step-13.40-p3a-quote-auth.test.ts
 * (filesystem proof: no [quoteId] route directory + quotes/route.ts source does
 * not contain acceptQuote/rejectQuote). The service-level authorization for
 * acceptQuote/rejectQuote (buyer-ownership, fail-closed, terminal guards) is
 * covered by the 15 tests in step-13.40-p3a-quote-auth.test.ts.
 *
 * The P3-A HTTP→DB proof in THIS file covers PATCH /api/deals/[id] and
 * POST /api/deals — the two endpoints that DO have HTTP entry points and
 * mutate Deal + Order state.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TEST MATRIX (9 scenarios, T1-T9)
 * ─────────────────────────────────────────────────────────────────────────
 * Each test follows the owner §5 template:
 *   Test ID / Endpoint+method / Auth identity source / Actor role /
 *   DB fixture IDs / DB before / HTTP request / Expected / Actual /
 *   DB after / Mutation? / Verdict
 *
 * The template is encoded as structured assertions + comments (not literal
 * text). The "Verdict" is the vitest pass/fail of the test.
 *
 *   T1  PATCH /api/deals/[id]  unauthenticated (null userId)      → 401, DB unchanged
 *   T2  PATCH /api/deals/[id]  authenticated non-party (3rd user) → 403, DB unchanged
 *   T3  PATCH /api/deals/[id]  tampered path [id] (other user's deal) → 403, DB unchanged
 *   T4  PATCH /api/deals/[id]  authorized buyer (CONFIRMED)       → 200, deal+order mutated
 *   T5  PATCH /api/deals/[id]  invalid transition (CONFIRMED→CONFIRMED) → 409, DB unchanged
 *   T6  POST  /api/deals       unauthenticated (null userId)      → 401, no deal created
 *   T7  POST  /api/deals       non-party (3rd user)               → 403, no deal created
 *   T8  POST  /api/deals       tampered body buyerId IGNORED      → 200, deal.buyerId == source-derived
 *   T9  POST  /api/deals       authorized buyer                   → 200, deal created with derived IDs
 *
 * IDENTITY SOURCE: mockGetCurrentUserId (vi.mock("@/lib/auth")) — simulates the
 * server-side session. The handler calls getCurrentUserId() which returns the
 * mocked userId. The body NEVER supplies identity (buyerId/sellerId in body is
 * ignored by the production handler — proven by T8).
 *
 * Run (CI): bunx vitest run --config vitest.integration.config.ts tests/integration/p3a-http-db-real.ts
 * Requires DATABASE_URL starting with postgresql:// (skips otherwise).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { db } from "@/lib/db";

// ── Mock the TRUSTED identity source ──────────────────────────────────────
// getCurrentUserId() is the canonical server-side identity contract
// (USER_COOKIE → Session.token → Session.userId → User). We mock it here to
// simulate an authenticated/unauthenticated session WITHOUT a real HTTP
// cookie round-trip. The mocked value is the ONLY identity the handler sees.
const mockGetCurrentUserId = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUserId: mockGetCurrentUserId,
  getCurrentUser: vi.fn(),
}));
// Mock audit + request-context so the handler runs without side-effects on
// non-target tables. The DB (db) is NOT mocked — we use the REAL PostgreSQL
// instance to prove before/after state with independent queries.
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/request-context", () => ({ getClientIp: () => "127.0.0.1" }));

const RUN =
  process.env.DATABASE_URL?.startsWith("postgresql://") ||
  process.env.DATABASE_URL?.startsWith("postgres://");

/**
 * Independent cleanup: attempts EVERY operation, collects all errors, and
 * throws an AggregateError if any failed. A failure on one operation NEVER
 * prevents the remaining operations from being attempted. This is the same
 * robust pattern proven in tests/integration/deal-concurrency-real.ts.
 */
async function independentCleanup(ops: Array<() => Promise<unknown>>): Promise<void> {
  const errors: Error[] = [];
  for (const op of ops) {
    try {
      await op();
    } catch (e) {
      errors.push(e as Error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, "P3-A cleanup error(s)");
  }
}

/** Snapshot of deal fields used for before/after comparison (negative tests). */
interface DealSnapshot {
  id: string;
  status: string;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
}

async function snapshotDeal(id: string): Promise<DealSnapshot | null> {
  return db.deal.findUnique({
    where: { id },
    select: { id: true, status: true, confirmedAt: true, cancelledAt: true },
  });
}

/** Assert two deal snapshots are identical (no unauthorized mutation). */
function assertDealUnchanged(before: DealSnapshot | null, after: DealSnapshot | null, label: string) {
  expect(after, `${label}: deal must still exist after rejected request`).not.toBeNull();
  expect(before, `${label}: deal must exist before request`).not.toBeNull();
  expect(after!.id).toBe(before!.id);
  expect(after!.status).toBe(before!.status);
  expect(after!.confirmedAt?.toISOString() ?? null).toBe(before!.confirmedAt?.toISOString() ?? null);
  expect(after!.cancelledAt?.toISOString() ?? null).toBe(before!.cancelledAt?.toISOString() ?? null);
}

describe.skipIf(!RUN)("STEP 13.54 Phase 2 — P3-A Real HTTP→DB Authorization (real PostgreSQL)", () => {
  // ── Shared fixture IDs (created in beforeAll, cleaned in afterAll) ──
  let buyerId: string | undefined;
  let sellerId: string | undefined;
  let thirdUserId: string | undefined;
  let listingId: string | undefined;
  let offer1Id: string | undefined; // for T6/T7/T8 (LISTING_OFFER source)
  let offer2Id: string | undefined; // for T9 (LISTING_OFFER source)
  let deal1Id: string | undefined; // buyer's PENDING deal — for T1/T2
  let deal2Id: string | undefined; // thirdUser's PENDING deal — for T3 (path tampering)

  beforeAll(async () => {
    // ── Create real fixtures in PostgreSQL ──────────────────────────────
    // Each ID is tracked immediately so afterAll can clean up even if a
    // later create fails (failure-safe, same pattern as deal-concurrency-real).
    const buyer = await db.user.create({
      data: {
        mobile: "09129992001",
        email: "p3a-buyer@test.com",
        firstName: "P3A",
        lastName: "Buyer",
        passwordHash: "hash",
      },
    });
    buyerId = buyer.id;

    const seller = await db.user.create({
      data: {
        mobile: "09129992002",
        email: "p3a-seller@test.com",
        firstName: "P3A",
        lastName: "Seller",
        passwordHash: "hash",
      },
    });
    sellerId = seller.id;

    const thirdUser = await db.user.create({
      data: {
        mobile: "09129992003",
        email: "p3a-third@test.com",
        firstName: "P3A",
        lastName: "Third",
        passwordHash: "hash",
      },
    });
    thirdUserId = thirdUser.id;

    const listing = await db.listing.create({
      data: {
        slug: "p3a-listing-" + Date.now(),
        title: "P3-A Test Listing",
        sellerId,
        sellerName: "P3A Seller",
        status: "PUBLISHED",
        price: 500000000n,
      },
    });
    listingId = listing.id;

    // Two ACCEPTED ListingOffers — buyer is the real buyer of both.
    // T6/T7/T8 use offer1; T9 uses offer2 (so the duplicate-deal check
    // inside POST $transaction doesn't conflict across tests).
    const offer1 = await db.listingOffer.create({
      data: {
        listingId,
        buyerId,
        buyerPhone: "09129992001",
        offerAmount: 400000000n,
        status: "ACCEPTED",
      },
    });
    offer1Id = offer1.id;

    const offer2 = await db.listingOffer.create({
      data: {
        listingId,
        buyerId,
        buyerPhone: "09129992001",
        offerAmount: 300000000n,
        status: "ACCEPTED",
      },
    });
    offer2Id = offer2.id;

    // deal1: buyer's PENDING_CONFIRMATION deal (for T1/T2 — no mutation expected).
    const deal1 = await db.deal.create({
      data: {
        dealNumber: "P3A-DEAL1-" + Date.now().toString(36),
        sourceType: "LISTING_OFFER",
        sourceId: "p3a-fixture-deal1",
        buyerId,
        sellerId,
        listingId,
        agreedAmount: 400000000n,
        currency: "IRR",
        transactionType: "SALE",
        status: "PENDING_CONFIRMATION",
        agreedAt: new Date(),
      },
    });
    deal1Id = deal1.id;

    // deal2: thirdUser's PENDING_CONFIRMATION deal (for T3 — path tampering).
    // buyer tries to PATCH deal2 (which belongs to thirdUser) → 403.
    const deal2 = await db.deal.create({
      data: {
        dealNumber: "P3A-DEAL2-" + Date.now().toString(36),
        sourceType: "LISTING_OFFER",
        sourceId: "p3a-fixture-deal2",
        buyerId: thirdUserId,
        sellerId,
        listingId,
        agreedAmount: 250000000n,
        currency: "IRR",
        transactionType: "SALE",
        status: "PENDING_CONFIRMATION",
        agreedAt: new Date(),
      },
    });
    deal2Id = deal2.id;
  });

  afterAll(async () => {
    // Independent cleanup of all shared fixtures. Guards against undefined IDs
    // (if beforeAll partially failed). Collects all errors into AggregateError.
    await independentCleanup([
      // deal2 (belongs to thirdUser) — orders first (FK cascade would handle,
      // but we delete explicitly to be safe + independent).
      () => (deal2Id ? db.order.deleteMany({ where: { dealId: deal2Id } }) : Promise.resolve()),
      () => (deal2Id ? db.deal.delete({ where: { id: deal2Id } }) : Promise.resolve()),
      // deal1 (belongs to buyer)
      () => (deal1Id ? db.order.deleteMany({ where: { dealId: deal1Id } }) : Promise.resolve()),
      () => (deal1Id ? db.deal.delete({ where: { id: deal1Id } }) : Promise.resolve()),
      // offers
      () => (offer1Id ? db.listingOffer.delete({ where: { id: offer1Id } }) : Promise.resolve()),
      () => (offer2Id ? db.listingOffer.delete({ where: { id: offer2Id } }) : Promise.resolve()),
      // listing
      () => (listingId ? db.listing.delete({ where: { id: listingId } }) : Promise.resolve()),
      // users
      () => (buyerId ? db.user.delete({ where: { id: buyerId } }) : Promise.resolve()),
      () => (sellerId ? db.user.delete({ where: { id: sellerId } }) : Promise.resolve()),
      () => (thirdUserId ? db.user.delete({ where: { id: thirdUserId } }) : Promise.resolve()),
    ]);
  });

  // ── Helper: create a standalone PENDING_CONFIRMATION deal for per-test use ──
  async function makePendingDeal(prefix: string, buyer: string, amount = 100000000n) {
    return db.deal.create({
      data: {
        dealNumber: `P3A-${prefix}-${Date.now().toString(36)}`,
        sourceType: "LISTING_OFFER",
        sourceId: `p3a-${prefix.toLowerCase()}`,
        buyerId: buyer,
        sellerId: sellerId!,
        listingId: listingId!,
        agreedAmount: amount,
        currency: "IRR",
        transactionType: "SALE",
        status: "PENDING_CONFIRMATION",
        agreedAt: new Date(),
      },
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // PATCH /api/deals/[id] — 5 scenarios (T1-T5)
  // ════════════════════════════════════════════════════════════════════

  // ── T1: Unauthenticated request ──────────────────────────────────────
  // Template: T1 / PATCH /api/deals/[id] / getCurrentUserId (null) /
  //   anonymous / deal1 / before snapshot / PATCH status=CONFIRMED /
  //   expected 401 / actual 401 / after snapshot == before / NO mutation / PASS
  it("T1 PATCH unauthenticated (null userId) → 401, deal unchanged (before==after)", async () => {
    mockGetCurrentUserId.mockResolvedValue(null);

    const before = await snapshotDeal(deal1Id!);
    const orderCountBefore = await db.order.count({ where: { dealId: deal1Id! } });

    const { PATCH } = await import("@/app/api/deals/[id]/route");
    const res = await PATCH(
      new Request(`http://localhost/api/deals/${deal1Id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CONFIRMED" }),
      }),
      { params: Promise.resolve({ id: deal1Id! }) },
    );

    expect(res.status).toBe(401);

    const after = await snapshotDeal(deal1Id!);
    assertDealUnchanged(before, after, "T1");
    const orderCountAfter = await db.order.count({ where: { dealId: deal1Id! } });
    expect(orderCountAfter).toBe(orderCountBefore); // no order created
  });

  // ── T2: Authenticated but non-party user ─────────────────────────────
  // Template: T2 / PATCH /api/deals/[id] / getCurrentUserId (thirdUser) /
  //   non-party / deal1 / before snapshot / PATCH status=CONFIRMED /
  //   expected 403 / actual 403 / after snapshot == before / NO mutation / PASS
  it("T2 PATCH non-party (thirdUser) → 403, deal unchanged (before==after)", async () => {
    mockGetCurrentUserId.mockResolvedValue(thirdUserId);

    const before = await snapshotDeal(deal1Id!);
    const orderCountBefore = await db.order.count({ where: { dealId: deal1Id! } });

    const { PATCH } = await import("@/app/api/deals/[id]/route");
    const res = await PATCH(
      new Request(`http://localhost/api/deals/${deal1Id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CONFIRMED" }),
      }),
      { params: Promise.resolve({ id: deal1Id! }) },
    );

    expect(res.status).toBe(403);

    const after = await snapshotDeal(deal1Id!);
    assertDealUnchanged(before, after, "T2");
    const orderCountAfter = await db.order.count({ where: { dealId: deal1Id! } });
    expect(orderCountAfter).toBe(orderCountBefore);
  });

  // ── T3: Tampered path [id] — buyer's userId but another user's deal ──
  // Template: T3 / PATCH /api/deals/[id] / getCurrentUserId (buyer) /
  //   path-tampered / deal2 (thirdUser's) / before snapshot /
  //   PATCH status=CONFIRMED / expected 403 / actual 403 /
  //   after snapshot == before / NO mutation / PASS
  it("T3 PATCH tampered path [id] (buyer → thirdUser's deal) → 403, deal unchanged", async () => {
    // buyer is a legitimate authenticated user, but the path [id] points to
    // deal2 which belongs to thirdUser. The handler loads deal2, checks
    // deal2.buyerId !== buyerId → 403. Body status is valid (CONFIRMED).
    mockGetCurrentUserId.mockResolvedValue(buyerId);

    const before = await snapshotDeal(deal2Id!);
    const orderCountBefore = await db.order.count({ where: { dealId: deal2Id! } });

    const { PATCH } = await import("@/app/api/deals/[id]/route");
    const res = await PATCH(
      new Request(`http://localhost/api/deals/${deal2Id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CONFIRMED" }),
      }),
      { params: Promise.resolve({ id: deal2Id! }) },
    );

    expect(res.status).toBe(403);

    const after = await snapshotDeal(deal2Id!);
    assertDealUnchanged(before, after, "T3");
    const orderCountAfter = await db.order.count({ where: { dealId: deal2Id! } });
    expect(orderCountAfter).toBe(orderCountBefore);
  });

  // ── T4: Authorized buyer — successful CONFIRMED transition ───────────
  // Template: T4 / PATCH /api/deals/[id] / getCurrentUserId (buyer) /
  //   authorized buyer / per-test deal / before: PENDING_CONFIRMATION /
  //   PATCH status=CONFIRMED / expected 200 / actual 200 /
  //   after: CONFIRMED + exactly 1 order / MUTATION (authorized) / PASS
  it("T4 PATCH authorized buyer → 200, deal=CONFIRMED, exactly 1 order created", async () => {
    let testDealId: string | undefined;
    try {
      const testDeal = await makePendingDeal("T4", buyerId!, 150000000n);
      testDealId = testDeal.id;

      const before = await snapshotDeal(testDeal.id);
      expect(before!.status).toBe("PENDING_CONFIRMATION");
      const orderCountBefore = await db.order.count({ where: { dealId: testDeal.id } });
      expect(orderCountBefore).toBe(0);

      mockGetCurrentUserId.mockResolvedValue(buyerId);
      const { PATCH } = await import("@/app/api/deals/[id]/route");
      const res = await PATCH(
        new Request(`http://localhost/api/deals/${testDeal.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "CONFIRMED" }),
        }),
        { params: Promise.resolve({ id: testDeal.id }) },
      );

      expect(res.status).toBe(200);

      // Independent DB verification: deal transitioned + exactly 1 order.
      const after = await db.deal.findUnique({
        where: { id: testDeal.id },
        select: { id: true, status: true, confirmedAt: true, order: { select: { id: true, status: true } } },
      });
      expect(after!.status).toBe("CONFIRMED");
      expect(after!.confirmedAt).not.toBeNull();
      expect(after!.order).not.toBeNull();
      expect(after!.order!.status).toBe("CONFIRMED");
      const orderCountAfter = await db.order.count({ where: { dealId: testDeal.id } });
      expect(orderCountAfter).toBe(1); // not 0, not 2
    } finally {
      await independentCleanup([
        () => (testDealId ? db.order.deleteMany({ where: { dealId: testDealId } }) : Promise.resolve()),
        () => (testDealId ? db.deal.delete({ where: { id: testDealId } }) : Promise.resolve()),
      ]);
    }
  });

  // ── T5: Invalid transition — CONFIRMED → CONFIRMED → 409 ─────────────
  // Template: T5 / PATCH /api/deals/[id] / getCurrentUserId (buyer) /
  //   authorized buyer / per-test CONFIRMED deal + CONFIRMED order /
  //   before: CONFIRMED + 1 order / PATCH status=CONFIRMED /
  //   expected 409 / actual 409 / after: CONFIRMED + 1 order (no duplicate) /
  //   NO mutation / PASS
  it("T5 PATCH invalid transition (CONFIRMED→CONFIRMED) → 409, no duplicate order", async () => {
    let testDealId: string | undefined;
    try {
      // Create a CONFIRMED deal with an existing CONFIRMED order.
      const testDeal = await db.deal.create({
        data: {
          dealNumber: `P3A-T5-${Date.now().toString(36)}`,
          sourceType: "LISTING_OFFER",
          sourceId: "p3a-t5",
          buyerId: buyerId!,
          sellerId: sellerId!,
          listingId: listingId!,
          agreedAmount: 180000000n,
          currency: "IRR",
          transactionType: "SALE",
          status: "CONFIRMED",
          agreedAt: new Date(),
          confirmedAt: new Date(),
        },
      });
      testDealId = testDeal.id;

      await db.order.create({
        data: {
          orderNumber: `ORD-P3A-T5-${Date.now().toString(36)}`,
          dealId: testDeal.id,
          titleSnapshot: "P3A T5",
          priceSnapshot: 180000000n,
          currencySnapshot: "IRR",
          sellerSnapshot: sellerId,
          buyerSnapshot: buyerId,
          quantity: 1,
          status: "CONFIRMED",
          confirmedAt: new Date(),
        },
      });

      const before = await snapshotDeal(testDeal.id);
      expect(before!.status).toBe("CONFIRMED");
      const orderCountBefore = await db.order.count({ where: { dealId: testDeal.id } });
      expect(orderCountBefore).toBe(1);

      mockGetCurrentUserId.mockResolvedValue(buyerId);
      const { PATCH } = await import("@/app/api/deals/[id]/route");
      const res = await PATCH(
        new Request(`http://localhost/api/deals/${testDeal.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "CONFIRMED" }),
        }),
        { params: Promise.resolve({ id: testDeal.id }) },
      );

      expect(res.status).toBe(409);

      // Independent DB verification: deal unchanged + still exactly 1 order.
      const after = await snapshotDeal(testDeal.id);
      assertDealUnchanged(before, after, "T5");
      const orderCountAfter = await db.order.count({ where: { dealId: testDeal.id } });
      expect(orderCountAfter).toBe(1); // no duplicate order created
    } finally {
      await independentCleanup([
        () => (testDealId ? db.order.deleteMany({ where: { dealId: testDealId } }) : Promise.resolve()),
        () => (testDealId ? db.deal.delete({ where: { id: testDealId } }) : Promise.resolve()),
      ]);
    }
  });

  // ════════════════════════════════════════════════════════════════════
  // POST /api/deals — 4 scenarios (T6-T9)
  // ════════════════════════════════════════════════════════════════════

  // ── T6: Unauthenticated request ──────────────────────────────────────
  // Template: T6 / POST /api/deals / getCurrentUserId (null) / anonymous /
  //   offer1 / before: 0 deals with sourceId=offer1 / POST sourceType=LISTING_OFFER sourceId=offer1 /
  //   expected 401 / actual 401 / after: 0 deals / NO mutation / PASS
  it("T6 POST unauthenticated (null userId) → 401, no deal created", async () => {
    mockGetCurrentUserId.mockResolvedValue(null);

    const dealsBefore = await db.deal.count({ where: { sourceId: offer1Id! } });
    expect(dealsBefore).toBe(0);

    const { POST } = await import("@/app/api/deals/route");
    const res = await POST(
      new Request("http://localhost/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType: "LISTING_OFFER", sourceId: offer1Id }),
      }),
    );

    expect(res.status).toBe(401);

    const dealsAfter = await db.deal.count({ where: { sourceId: offer1Id! } });
    expect(dealsAfter).toBe(0); // no deal created
  });

  // ── T7: Authenticated but non-party user ─────────────────────────────
  // Template: T7 / POST /api/deals / getCurrentUserId (thirdUser) /
  //   non-party / offer1 / before: 0 deals with sourceId=offer1 /
  //   POST sourceType=LISTING_OFFER sourceId=offer1 / expected 403 /
  //   actual 403 / after: 0 deals / NO mutation / PASS
  it("T7 POST non-party (thirdUser) → 403, no deal created (party-membership check)", async () => {
    mockGetCurrentUserId.mockResolvedValue(thirdUserId);

    const dealsBefore = await db.deal.count({ where: { sourceId: offer1Id! } });
    expect(dealsBefore).toBe(0);

    const { POST } = await import("@/app/api/deals/route");
    const res = await POST(
      new Request("http://localhost/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType: "LISTING_OFFER", sourceId: offer1Id }),
      }),
    );

    expect(res.status).toBe(403);

    const dealsAfter = await db.deal.count({ where: { sourceId: offer1Id! } });
    expect(dealsAfter).toBe(0); // no deal created
  });

  // ── T8: Tampered body buyerId IGNORED — source-derived ID used ────────
  // Template: T8 / POST /api/deals / getCurrentUserId (buyer) /
  //   authorized buyer (real party) / offer1 / before: 0 deals with sourceId=offer1 /
  //   POST sourceType=LISTING_OFFER sourceId=offer1 buyerId="attacker-id" /
  //   expected 200 / actual 200 / after: 1 deal with buyerId==offer1.buyerId (NOT "attacker-id") /
  //   MUTATION (authorized, but buyerId derived from source — body ignored) / PASS
  it("T8 POST tampered body buyerId IGNORED → 200, deal.buyerId == source-derived (NOT body)", async () => {
    mockGetCurrentUserId.mockResolvedValue(buyerId);

    const dealsBefore = await db.deal.count({ where: { sourceId: offer1Id! } });
    expect(dealsBefore).toBe(0);

    const { POST } = await import("@/app/api/deals/route");
    // Body includes a TAMPERED buyerId — the handler MUST ignore it.
    // Production handler only reads sourceType/sourceId/transactionType from body;
    // buyerId/sellerId/listingId are DERIVED from the source entity.
    const res = await POST(
      new Request("http://localhost/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: "LISTING_OFFER",
          sourceId: offer1Id,
          buyerId: "attacker-id-P3A-T8", // TAMPERED — must be ignored
          sellerId: "attacker-seller-P3A-T8", // TAMPERED — must be ignored
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.id).toBeTruthy();
    const createdDealId: string = body.id;

    // Independent DB verification: the created deal's buyerId is the
    // SOURCE-derived value (offer1.buyerId == buyerId), NOT the body value.
    const createdDeal = await db.deal.findUnique({
      where: { id: createdDealId },
      select: { id: true, buyerId: true, sellerId: true, listingId: true, sourceId: true, status: true },
    });
    expect(createdDeal).not.toBeNull();
    expect(createdDeal!.buyerId).toBe(buyerId); // source-derived, NOT "attacker-id-P3A-T8"
    expect(createdDeal!.buyerId).not.toBe("attacker-id-P3A-T8");
    expect(createdDeal!.sellerId).toBe(sellerId); // source-derived (listing.sellerId), NOT body
    expect(createdDeal!.sellerId).not.toBe("attacker-seller-P3A-T8");
    expect(createdDeal!.listingId).toBe(listingId); // source-derived
    expect(createdDeal!.sourceId).toBe(offer1Id);
    expect(createdDeal!.status).toBe("PENDING_CONFIRMATION");

    // Cleanup the created deal (per-test — not a shared fixture).
    await independentCleanup([
      () => db.order.deleteMany({ where: { dealId: createdDealId } }),
      () => db.deal.delete({ where: { id: createdDealId } }),
    ]);
    // Verify cleanup.
    expect(await db.deal.findUnique({ where: { id: createdDealId }, select: { id: true } })).toBeNull();
  });

  // ── T9: Authorized buyer — deal created with correct derived IDs ─────
  // Template: T9 / POST /api/deals / getCurrentUserId (buyer) /
  //   authorized buyer / offer2 / before: 0 deals with sourceId=offer2 /
  //   POST sourceType=LISTING_OFFER sourceId=offer2 / expected 200 / actual 200 /
  //   after: 1 deal with buyerId==buyerId, sellerId==sellerId, listingId==listingId /
  //   MUTATION (authorized, all IDs derived from source) / PASS
  it("T9 POST authorized buyer → 200, deal created with correct source-derived IDs", async () => {
    mockGetCurrentUserId.mockResolvedValue(buyerId);

    const dealsBefore = await db.deal.count({ where: { sourceId: offer2Id! } });
    expect(dealsBefore).toBe(0);

    const { POST } = await import("@/app/api/deals/route");
    const res = await POST(
      new Request("http://localhost/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType: "LISTING_OFFER", sourceId: offer2Id }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.id).toBeTruthy();
    const createdDealId: string = body.id;

    // Independent DB verification: deal created with all IDs derived from source.
    const createdDeal = await db.deal.findUnique({
      where: { id: createdDealId },
      select: {
        id: true,
        buyerId: true,
        sellerId: true,
        listingId: true,
        sourceType: true,
        sourceId: true,
        agreedAmount: true,
        status: true,
      },
    });
    expect(createdDeal).not.toBeNull();
    expect(createdDeal!.buyerId).toBe(buyerId); // from offer2.buyerId
    expect(createdDeal!.sellerId).toBe(sellerId); // from listing.sellerId
    expect(createdDeal!.listingId).toBe(listingId); // from offer2.listingId
    expect(createdDeal!.sourceType).toBe("LISTING_OFFER");
    expect(createdDeal!.sourceId).toBe(offer2Id);
    expect(createdDeal!.agreedAmount).toBe(300000000n); // from offer2.offerAmount
    expect(createdDeal!.status).toBe("PENDING_CONFIRMATION");

    // Cleanup the created deal (per-test — not a shared fixture).
    await independentCleanup([
      () => db.order.deleteMany({ where: { dealId: createdDealId } }),
      () => db.deal.delete({ where: { id: createdDealId } }),
    ]);
    expect(await db.deal.findUnique({ where: { id: createdDealId }, select: { id: true } })).toBeNull();
  });

  // ── Suite-end independent verification: no P3-A test fixtures remain ──
  it("T-SUITE-END: no P3-A test fixtures remain in PostgreSQL (independent query)", async () => {
    const testDeals = await db.deal.findMany({
      where: { dealNumber: { startsWith: "P3A-" } },
      select: { id: true, dealNumber: true },
    });
    expect(testDeals).toHaveLength(0);
    const testOrders = await db.order.findMany({
      where: { orderNumber: { startsWith: "ORD-P3A-" } },
      select: { id: true, orderNumber: true },
    });
    expect(testOrders).toHaveLength(0);
  });
});
