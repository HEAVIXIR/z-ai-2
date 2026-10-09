import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   STEP 11.32 — NEW-C1 Security Fix: Legacy /api/admin/listings/*
   ------------------------------------------------------------
   These tests verify that the legacy listing admin routes now
   require the ADMIN role (not just `listing.read`/`listing.update`/
   `listing.publish` permissions, which SELLERs also have).

   The routes are Next.js App Router route handlers. We test the
   auth-guard logic by mocking `getCurrentUser` + `isAdmin` + the
   Prisma `db` and invoking the exported handlers directly.

   NEGATIVE: a SELLER (non-admin with listing.read) gets 403.
   POSITIVE: an ADMIN gets past the auth gate (we don't assert the
   full response — just that it's not 403 from the admin gate).
   ============================================================ */

// ── Mocks ──────────────────────────────────────────────────
let mockCurrentUser: { id: string } | null = null;
let mockIsAdminResult: boolean = false;
let mockHasPermissionResult: boolean = false;

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => mockCurrentUser,
}));
vi.mock("@/lib/authorization", () => ({
  isAdmin: async () => mockIsAdminResult,
}));
vi.mock("@/lib/rbac", () => ({
  hasPermission: async () => mockHasPermissionResult,
}));
vi.mock("@/lib/db", () => ({
  db: {
    listing: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      updateMany: vi.fn(async () => ({ count: 0 })),
      findUnique: vi.fn(async () => null),
      update: vi.fn(async (args: any) => args.data),
    },
  },
}));
vi.mock("@/lib/audit", () => ({
  logAudit: vi.fn(async () => ({})),
}));
vi.mock("@/lib/homepage-cache-tags", () => ({
  HOMEPAGE_CACHE_TAGS: { listings: "listings" },
}));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

// Import AFTER mocks are set up
const listingsRoute = await import("@/app/api/admin/listings/route");
const listingIdRoute = await import("@/app/api/admin/listings/[id]/route");

beforeEach(() => {
  mockCurrentUser = null;
  mockIsAdminResult = false;
  mockHasPermissionResult = false;
});

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

// ── /api/admin/listings (GET + POST) ───────────────────────

describe("NEW-C1: GET /api/admin/listings — admin gate", () => {
  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const res = await listingsRoute.GET(makeReq("http://localhost/api/admin/listings"));
    expect(res.status).toBe(401);
  });

  it("NEGATIVE: SELLER (non-admin, has listing.read) → 403 from admin gate", async () => {
    mockCurrentUser = { id: "seller-A" };
    mockIsAdminResult = false; // SELLER is not admin
    mockHasPermissionResult = true; // SELLER has listing.read
    const res = await listingsRoute.GET(makeReq("http://localhost/api/admin/listings"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/admin access required/i);
  });

  it("POSITIVE: ADMIN (isAdmin + listing.read) passes the admin gate (may proceed to query)", async () => {
    mockCurrentUser = { id: "admin-1" };
    mockIsAdminResult = true;
    mockHasPermissionResult = true;
    const res = await listingsRoute.GET(makeReq("http://localhost/api/admin/listings"));
    // Admin passes the gate — the response should NOT be 403 from the admin gate.
    // It might be 200 (success) or 500 (mock db issue), but NOT 403.
    expect(res.status).not.toBe(403);
  });
});

describe("NEW-C1: POST /api/admin/listings (bulk) — admin gate", () => {
  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const res = await listingsRoute.POST(
      makeReq("http://localhost/api/admin/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", ids: ["x"] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("NEGATIVE: SELLER (non-admin, has listing.publish) → 403 from admin gate", async () => {
    mockCurrentUser = { id: "seller-A" };
    mockIsAdminResult = false;
    mockHasPermissionResult = true; // SELLER has listing.publish
    const res = await listingsRoute.POST(
      makeReq("http://localhost/api/admin/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids: ["other-sellers-listing"] }),
      }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/admin access required/i);
  });

  it("POSITIVE: ADMIN passes the admin gate", async () => {
    mockCurrentUser = { id: "admin-1" };
    mockIsAdminResult = true;
    mockHasPermissionResult = true;
    const res = await listingsRoute.POST(
      makeReq("http://localhost/api/admin/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", ids: ["x"] }),
      }),
    );
    expect(res.status).not.toBe(403);
  });
});

// ── /api/admin/listings/[id] (GET + PATCH) ─────────────────

describe("NEW-C1: GET /api/admin/listings/[id] — admin gate", () => {
  it("NEGATIVE: SELLER (non-admin) → 403 from admin gate", async () => {
    mockCurrentUser = { id: "seller-A" };
    mockIsAdminResult = false;
    mockHasPermissionResult = true;
    const res = await listingIdRoute.GET(
      makeReq("http://localhost/api/admin/listings/123"),
      { params: Promise.resolve({ id: "123" }) },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/admin access required/i);
  });

  it("NEGATIVE: anonymous → 401", async () => {
    mockCurrentUser = null;
    const res = await listingIdRoute.GET(
      makeReq("http://localhost/api/admin/listings/123"),
      { params: Promise.resolve({ id: "123" }) },
    );
    expect(res.status).toBe(401);
  });
});

describe("NEW-C1: PATCH /api/admin/listings/[id] — admin gate + sellerId removal", () => {
  it("NEGATIVE: SELLER (non-admin) → 403 from admin gate", async () => {
    mockCurrentUser = { id: "seller-A" };
    mockIsAdminResult = false;
    mockHasPermissionResult = true;
    const res = await listingIdRoute.PATCH(
      makeReq("http://localhost/api/admin/listings/123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "hacked" }),
      }),
      { params: Promise.resolve({ id: "123" }) },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/admin access required/i);
  });

  it("DEFENSE-IN-DEPTH: sellerId + companyId are NOT in allowedFields (source code check)", async () => {
    // Read the actual source file and verify sellerId/companyId are removed
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/api/admin/listings/[id]/route.ts"),
      "utf-8",
    );
    // Extract the allowedFields array
    const match = source.match(/const allowedFields = \[([\s\S]*?)\]/);
    expect(match).not.toBeNull();
    const allowedFieldsContent = match![1];
    // sellerId and companyId must NOT be in the allowedFields array
    expect(allowedFieldsContent).not.toMatch(/"sellerId"/);
    expect(allowedFieldsContent).not.toMatch(/"companyId"/);
    // But other fields like title should still be there
    expect(allowedFieldsContent).toMatch(/"title"/);
  });
});
