import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   STEP 11.33 — NEW-C2 Security Fix: /api/listings/[id] IDOR
   ------------------------------------------------------------
   Reproduction (BEFORE fix):
   - authorize() used `isAuthenticated()` (any logged-in user) as
     `isAdmin`. So any logged-in BUYER could GET/PATCH/DELETE ANY
     seller's listing (IDOR + privilege escalation).

   Fix (AFTER):
   - authorize() now uses `isAdmin()` from @/lib/authorization
     (RBAC-only, checks UserRole with ADMIN role).
   - A non-admin logged-in user (BUYER) is NOT treated as admin →
     ownership check (listing.sellerId === userId) applies → 403
     for non-owned listings.

   These tests verify the authorize() logic by mocking getCurrentUserId
   + isAdmin + db.listing.findUnique.
   ============================================================ */

let mockCurrentUserId: string | null = null;
let mockIsAdminResult = false;

vi.mock("@/lib/auth", () => ({
  getCurrentUserId: async () => mockCurrentUserId,
  isAuthenticated: async () => mockCurrentUserId !== null,
}));
vi.mock("@/lib/authorization", () => ({
  isAdmin: async () => mockIsAdminResult,
}));
vi.mock("@/lib/db", () => ({
  db: {
    listing: {
      findUnique: vi.fn(async () => null),
    },
  },
}));
vi.mock("@/lib/api-helpers", () => ({
  parseBig: vi.fn(),
  parseNumber: vi.fn(),
  slugify: vi.fn(),
}));
vi.mock("@/lib/homepage-cache-tags", () => ({
  HOMEPAGE_CACHE_TAGS: { listings: "listings" },
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

const { GET } = await import("@/app/api/listings/[id]/route");
const { db } = await import("@/lib/db");

beforeEach(() => {
  mockCurrentUserId = null;
  mockIsAdminResult = false;
  (db.listing.findUnique as any).mockReset();
});

function makeReq(url: string): Request {
  return new Request(url);
}

describe("NEW-C2: GET /api/listings/[id] — authorize() IDOR fix", () => {
  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUserId = null;
    mockIsAdminResult = false;
    const res = await GET(makeReq("http://localhost/api/listings/123"), {
      params: Promise.resolve({ id: "123" }),
    });
    expect(res.status).toBe(401);
  });

  it("NEGATIVE: BUYER (logged-in, non-admin, non-owner) → 403 (IDOR fix)", async () => {
    mockCurrentUserId = "buyer-1";
    mockIsAdminResult = false; // BUYER is not admin
    // Mock: first findUnique (authorize) returns a listing owned by seller-A
    (db.listing.findUnique as any).mockResolvedValueOnce({
      id: "123", sellerId: "seller-A", slug: "test", title: "Test",
    });
    const res = await GET(makeReq("http://localhost/api/listings/123"), {
      params: Promise.resolve({ id: "123" }),
    });
    // BEFORE fix: 200 (isAuthenticated=true → isAdmin=true → ownership skipped)
    // AFTER fix: 403 (isAdmin=false → ownership check applies → not owner)
    expect(res.status).toBe(403);
  });

  it("POSITIVE: owner (logged-in, non-admin, owns listing) → passes auth", async () => {
    mockCurrentUserId = "seller-A";
    mockIsAdminResult = false;
    // Mock: authorize findUnique returns listing owned by seller-A
    (db.listing.findUnique as any).mockResolvedValueOnce({
      id: "123", sellerId: "seller-A", slug: "test", title: "Test",
    });
    // Mock: second findUnique (the actual GET query) returns the listing
    (db.listing.findUnique as any).mockResolvedValueOnce({
      id: "123", sellerId: "seller-A", title: "Test", price: BigInt(1000),
      brand: null, category: null, model: null, images: [], attributeValues: [],
    });
    const res = await GET(makeReq("http://localhost/api/listings/123"), {
      params: Promise.resolve({ id: "123" }),
    });
    // Owner passes auth — should NOT be 401 or 403
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("POSITIVE: ADMIN (RBAC admin role) → passes auth for any listing", async () => {
    mockCurrentUserId = "admin-1";
    mockIsAdminResult = true; // RBAC admin
    (db.listing.findUnique as any).mockResolvedValueOnce({
      id: "123", sellerId: "seller-B", slug: "test", title: "Test",
    });
    (db.listing.findUnique as any).mockResolvedValueOnce({
      id: "123", sellerId: "seller-B", title: "Test", price: BigInt(1000),
      brand: null, category: null, model: null, images: [], attributeValues: [],
    });
    const res = await GET(makeReq("http://localhost/api/listings/123"), {
      params: Promise.resolve({ id: "123" }),
    });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it("NEGATIVE: listing not found → 404", async () => {
    mockCurrentUserId = "seller-A";
    mockIsAdminResult = false;
    (db.listing.findUnique as any).mockResolvedValueOnce(null); // authorize returns not found
    const res = await GET(makeReq("http://localhost/api/listings/nonexistent"), {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("NEW-C2: source-code check — authorize() uses RBAC isAdmin, not isAuthenticated", () => {
  it("authorize() does NOT call isAuthenticated() for the admin check", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/api/listings/[id]/route.ts"),
      "utf-8",
    );
    // The authorize function should use rbacIsAdmin, not isAuthenticated, for the admin check.
    // Extract the authorize function body
    const match = source.match(/async function authorize\(listingId[^}]*\}[^}]*\}/);
    expect(match).not.toBeNull();
    const authorizeBody = match![0];
    // rbacIsAdmin should be used
    expect(authorizeBody).toMatch(/rbacIsAdmin/);
    // isAuthenticated should NOT be used as the admin flag (it's still imported but not used for admin check)
    expect(authorizeBody).not.toMatch(/const isAdmin = await isAuthenticated/);
  });
});
