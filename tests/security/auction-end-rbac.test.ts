/**
 * HEAVIX — Security Test: Issue #112 / STEP 16.83
 * ------------------------------------------------------------
 * RBAC guard verification for POST /api/admin/auctions/[id]/end
 *
 * Background (STEP 16.82 audit):
 *   The route previously used only getCurrentUser() (true for ANY
 *   logged-in user) as the authorization gate. A dead import of
 *   requirePermission was present but never called. Any authenticated
 *   BUYER could end any auction and trigger winner selection; the
 *   audit log would be attributed to the BUYER's userId (false
 *   attribution). Same class as STEP 11.35 isAuthenticated()-IDOR.
 *
 * Fix (STEP 16.83):
 *   Replaced getCurrentUser()-only with requireAdmin("auction.manage")
 *   from @/lib/admin-guard. requireAdmin returns:
 *     [null, 401 response] if not authenticated
 *     [null, 403 response] if authenticated but lacks admin/permission
 *     [user, null] if authorized
 *   The verified user.id is passed to endAuction for audit attribution.
 *
 * This test verifies BOTH:
 *   1. Source-code contract: the route imports + calls requireAdmin
 *      (not getCurrentUser-only).
 *   2. Behavioral contract: anonymous → 401, BUYER → 403, ADMIN → success.
 *
 * Runs under `bun run test:security`
 * (config: vitest.security.config.ts → includes tests/security/**).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   Mocks — the route handler imports:
     - requireAdmin from @/lib/admin-guard
     - endAuction, AuctionServiceError from @/lib/auction-service
     - NextResponse from 'next/server' (built-in, no mock needed)
   ============================================================ */

let mockRequireAdminResult:
  | [{ id: string; firstName?: string } | null, Response | null]
  | null = null;

vi.mock("@/lib/admin-guard", () => ({
  requireAdmin: vi.fn(async (permissionKey?: string) => {
    if (mockRequireAdminResult) return mockRequireAdminResult;
    // Default: not authenticated
    return [
      null,
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    ] as unknown as [null, Response];
  }),
}));

const endAuctionMock = vi.fn(async (id: string, userId: string) => ({
  id,
  endedAt: new Date().toISOString(),
  winnerId: "winner-1",
}));

vi.mock("@/lib/auction-service", () => ({
  endAuction: endAuctionMock,
  AuctionServiceError: class AuctionServiceError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

beforeEach(() => {
  mockRequireAdminResult = null;
  endAuctionMock.mockClear();
});

/* ============================================================
   1. Source-code contract (static verification)
   ------------------------------------------------------------
   The route MUST import requireAdmin from @/lib/admin-guard and
   MUST NOT use getCurrentUser()-only as the authorization gate.
   This catches the dead-import regression pattern.
   ============================================================ */
describe("Issue #112 / STEP 16.83 — source-code contract", () => {
  it("route imports requireAdmin from @/lib/admin-guard", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "src/app/api/admin/auctions/[id]/end/route.ts",
      ),
      "utf-8",
    );
    expect(source).toMatch(/import.*requireAdmin.*from.*@\/lib\/admin-guard/);
  });

  it("route calls requireAdmin (not just imports it — dead-import guard)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "src/app/api/admin/auctions/[id]/end/route.ts",
      ),
      "utf-8",
    );
    // Must actually CALL requireAdmin (the STEP 16.82 finding was a
    // dead import that was never invoked).
    expect(source).toMatch(/await requireAdmin\(/);
    // The permission key must be "auction.manage"
    expect(source).toMatch(/requireAdmin\(["']auction\.manage["']\)/);
  });

  it("route does NOT use getCurrentUser()-only as the admin gate", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "src/app/api/admin/auctions/[id]/end/route.ts",
      ),
      "utf-8",
    );
    // The previous buggy pattern: getCurrentUser() called, then used
    // user?.id directly without an admin/permission check.
    // After the fix, getCurrentUser should NOT be imported (requireAdmin
    // handles it internally).
    expect(source).not.toMatch(/import.*getCurrentUser.*from.*@\/lib\/auth/);
  });

  it("route does NOT have a dead requirePermission import", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "src/app/api/admin/auctions/[id]/end/route.ts",
      ),
      "utf-8",
    );
    // The STEP 16.82 finding: requirePermission was imported but never
    // called. After the fix, it should not be imported at all (we use
    // requireAdmin from admin-guard instead).
    expect(source).not.toMatch(
      /import.*requirePermission.*from.*@\/lib\/authorization/,
    );
  });

  it("route passes verified user.id (not null) to endAuction for audit attribution", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "src/app/api/admin/auctions/[id]/end/route.ts",
      ),
      "utf-8",
    );
    // The previous pattern `user?.id ?? null` could pass null to
    // endAuction, causing false audit attribution. After the fix,
    // the verified user.id is passed (non-null because requireAdmin
    // returned successfully).
    expect(source).not.toMatch(/\?\.\s*id\s*\?\?\s*null/);
    expect(source).toMatch(/endAuction\(.*user!?\.id\)/);
  });
});

/* ============================================================
   2. Behavioral contract (negative + positive tests)
   ------------------------------------------------------------
   The route handler's POST function must:
     - anonymous (no session) → 401
     - authenticated BUYER (no admin, no permission) → 403
     - admin with auction.manage → success (endAuction called)
   ============================================================ */
describe("Issue #112 / STEP 16.83 — behavioral contract", () => {
  it("anonymous request → 401 Unauthorized", async () => {
    mockRequireAdminResult = [
      null,
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    ] as unknown as [null, Response];

    const { POST } = await import(
      "@/app/api/admin/auctions/[id]/end/route"
    );
    const req = new Request("http://localhost/api/admin/auctions/a1/end", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Unauthorized/i);
    // endAuction must NOT be called (authorization failed before it)
    expect(endAuctionMock).not.toHaveBeenCalled();
  });

  it("authenticated BUYER (no admin/permission) → 403 Forbidden", async () => {
    mockRequireAdminResult = [
      null,
      new Response(
        JSON.stringify({
          error: 'Forbidden: requires "auction.manage"',
        }),
        { status: 403 },
      ),
    ] as unknown as [null, Response];

    const { POST } = await import(
      "@/app/api/admin/auctions/[id]/end/route"
    );
    const req = new Request("http://localhost/api/admin/auctions/a1/end", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Forbidden/i);
    expect(body.error).toMatch(/auction\.manage/);
    // endAuction must NOT be called
    expect(endAuctionMock).not.toHaveBeenCalled();
  });

  it("admin with auction.manage → success + endAuction called with verified userId", async () => {
    const adminUser = { id: "admin-1", firstName: "Admin" };
    mockRequireAdminResult = [adminUser, null] as unknown as [
      { id: string; firstName?: string },
      null,
    ];

    const { POST } = await import(
      "@/app/api/admin/auctions/[id]/end/route"
    );
    const req = new Request("http://localhost/api/admin/auctions/a1/end", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    // endAuction must be called with the verified admin userId (not null)
    expect(endAuctionMock).toHaveBeenCalledTimes(1);
    expect(endAuctionMock).toHaveBeenCalledWith("a1", "admin-1");
  });

  it("endAuction error (e.g., auction not found) → error response, not 500 crash", async () => {
    const adminUser = { id: "admin-1", firstName: "Admin" };
    mockRequireAdminResult = [adminUser, null] as unknown as [
      { id: string; firstName?: string },
      null,
    ];
    // Make endAuction throw an AuctionServiceError
    endAuctionMock.mockRejectedValueOnce(
      Object.assign(new Error("Auction not found"), { status: 404 }),
    );

    const { POST } = await import(
      "@/app/api/admin/auctions/[id]/end/route"
    );
    const req = new Request("http://localhost/api/admin/auctions/missing/end", {
      method: "POST",
    });
    const res = await POST(req, {
      params: Promise.resolve({ id: "missing" }),
    });
    // Should be a structured error response, not an unhandled 500
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });
});
