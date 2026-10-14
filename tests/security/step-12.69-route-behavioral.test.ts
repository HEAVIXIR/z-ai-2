/**
 * HEAVIX — STEP 12.69 Route-Level Behavioral Tests: W-03 + W-04
 * ====================================================================
 *
 * REAL behavioral tests that INVOKE the actual route handlers with
 * mocked auth + db. Pattern matches existing
 * tests/security/new-c1-legacy-listing-routes.test.ts.
 *
 * These tests call the actual POST/DELETE functions and assert the
 * HTTP status code returned. This is a TRUE behavioral test (not
 * just file-content assertion).
 *
 * W-03: POST /api/listings
 *   - anonymous → 401 (BEFORE fix: would proceed, sellerId=null)
 *   - authenticated → proceeds (sellerId from session)
 *
 * W-04: DELETE /api/offers/[id]
 *   - anonymous → 401
 *   - non-owner authenticated → 403 (BEFORE fix: 200 — the bug!)
 *   - owner authenticated → 200
 *
 * These tests FAIL on main (vulnerable) and PASS on fix branches.
 * Runs under `bun run test:security`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks for W-03 (POST /api/listings) ────────────────────
let mockCurrentUser: { id: string; firstName?: string } | null = null;

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => mockCurrentUser,
  getCurrentUserId: async () => mockCurrentUser?.id ?? null,
}));
vi.mock("@/lib/db", () => ({
  db: {
    listing: {
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      create: vi.fn(async (args: any) => ({ id: "listing-new", ...args.data })),
    },
    listingOffer: {
      findUnique: vi.fn(async () => null),
      delete: vi.fn(async () => ({})),
    },
  },
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => ({})) }));
vi.mock("@/lib/homepage-cache-tags", () => ({
  HOMEPAGE_CACHE_TAGS: { listings: "listings" },
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/api-helpers", () => ({
  parseBig: (v: any) => (v ? BigInt(String(v).replace(/\D/g, "") || "0") : null),
  parseNumber: (v: any) => (v ? Number(v) : null),
  slugify: (s: string) => s.toLowerCase().replace(/\s+/g, "-"),
  uniqueSlug: vi.fn(async () => "test-slug-" + Date.now()),
}));
vi.mock("@/lib/search", () => ({
  normalizeSearchQuery: vi.fn(),
  buildSearchWhere: vi.fn(),
  searchListings: vi.fn(async () => ({ results: [], total: 0 })),
}));
vi.mock("@/lib/demand-engine", () => ({ logSearchQuery: vi.fn() }));
vi.mock("@/lib/request-context", () => ({
  getClientIp: () => "127.0.0.1",
  rateLimitKey: (a: string, b: string) => a + ":" + b,
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/error-tracking", () => ({ trackError: vi.fn() }));
vi.mock("@/lib/authorization", () => ({ isAdmin: async () => false }));

// Import AFTER mocks
const listingsRoute = await import("@/app/api/listings/route");
const offersRoute = await import("@/app/api/offers/[id]/route");

beforeEach(() => {
  mockCurrentUser = null;
});

function makePostReq(body: any): Request {
  return new Request("http://localhost/api/listings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteReq(id: string): Request {
  return new Request(`http://localhost/api/offers/${id}`, { method: "DELETE" });
}

// ════════════════════════════════════════════════════════════
// W-03: POST /api/listings — auth + sellerId integrity
// ════════════════════════════════════════════════════════════

describe("W-03: POST /api/listings — behavioral route test", () => {
  it("NEGATIVE: anonymous user → 401 (BEFORE fix: would proceed with sellerId=null)", async () => {
    mockCurrentUser = null;
    const res = await listingsRoute.POST(makePostReq({
      title: "Test Excavator",
      brandId: "brand-1",
      price: "100000000",
    }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("POSITIVE: authenticated user proceeds (not 401)", async () => {
    mockCurrentUser = { id: "seller-A" };
    const res = await listingsRoute.POST(makePostReq({
      title: "Test Excavator",
      brandId: "brand-1",
      price: "100000000",
    }));
    // Should NOT be 401 — the auth check passed
    expect(res.status).not.toBe(401);
  });
});

// ════════════════════════════════════════════════════════════
// W-04: DELETE /api/offers/[id] — authorization
// ════════════════════════════════════════════════════════════

describe("W-04: DELETE /api/offers/[id] — behavioral route test", () => {
  const offerId = "offer-123";
  const ownerId = "buyer-A";
  const otherUserId = "buyer-B";

  // Helper to set the mocked offer + current user
  async function setupDelete(offerBuyerId: string | null, currentUser: { id: string } | null) {
    const { db } = await import("@/lib/db");
    (db.listingOffer.findUnique as any).mockResolvedValue(
      offerBuyerId ? { id: offerId, buyerId: offerBuyerId, buyerPhone: "09120000000" } : null,
    );
    (db.listingOffer.delete as any).mockResolvedValue({});
    mockCurrentUser = currentUser;
  }

  it("NEGATIVE: anonymous user → 401", async () => {
    await setupDelete(ownerId, null);
    const res = await offersRoute.DELETE(makeDeleteReq(offerId), {
      params: Promise.resolve({ id: offerId }),
    });
    expect(res.status).toBe(401);
  });

  it("NEGATIVE: non-owner authenticated user → 403 (BEFORE fix: 200 — the bug!)", async () => {
    await setupDelete(ownerId, { id: otherUserId });
    const res = await offersRoute.DELETE(makeDeleteReq(offerId), {
      params: Promise.resolve({ id: offerId }),
    });
    // AFTER fix: 403. BEFORE fix: 200 (because !offer.buyerPhone was always false)
    expect(res.status).toBe(403);
  });

  it("POSITIVE: owner authenticated → 200", async () => {
    await setupDelete(ownerId, { id: ownerId });
    const res = await offersRoute.DELETE(makeDeleteReq(offerId), {
      params: Promise.resolve({ id: offerId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("EDGE: non-existent offer → 404", async () => {
    await setupDelete(null, { id: ownerId });
    const res = await offersRoute.DELETE(makeDeleteReq("nonexistent"), {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    expect(res.status).toBe(404);
  });
});
