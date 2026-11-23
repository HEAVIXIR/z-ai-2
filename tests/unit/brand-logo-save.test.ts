/**
 * HEAVIX — Brand Logo Save Tests
 * ----------------------------------------------------------------
 * Tests the logo PUT endpoint contract:
 *   - source whitelist (AI_SEARCH | MANUAL only)
 *   - invalid source → 400
 *   - Brand.verification is NOT changed by logo update
 *   - BrandMedia is persisted (no silent error swallowing)
 *   - fallback only runs for missing-constraint errors, NOT all errors
 *   - fallback uses transaction for atomicity
 *   - response includes source
 *
 * All tests are mocked — no real DB or AI calls.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  brandFindUnique: vi.fn(),
  brandUpdate: vi.fn(),
  brandMediaUpsert: vi.fn(),
  brandMediaDeleteMany: vi.fn(),
  brandMediaCreate: vi.fn(),
  transaction: vi.fn(),
  logAudit: vi.fn(),
  getCurrentUser: vi.fn(),
  hasPermission: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    brand: {
      findUnique: mocks.brandFindUnique,
      update: mocks.brandUpdate,
    },
    brandMedia: {
      upsert: mocks.brandMediaUpsert,
      deleteMany: mocks.brandMediaDeleteMany,
      create: mocks.brandMediaCreate,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/rbac", () => ({
  hasPermission: mocks.hasPermission,
}));

vi.mock("@/lib/audit", () => ({
  logAudit: mocks.logAudit,
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
}));

vi.mock("@/lib/homepage-cache-tags", () => ({
  HOMEPAGE_CACHE_TAGS: { brands: "homepage-brands" },
}));

// Import AFTER mocks
import { PUT } from "@/app/api/admin/brands/[id]/logo/route";

function makeRequest(body: unknown): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request("http://localhost/api/admin/brands/test-id/logo", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "test-id" }) },
  ];
}

describe("PUT /api/admin/brands/[id]/logo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1" });
    mocks.hasPermission.mockResolvedValue(true);
    mocks.brandFindUnique.mockResolvedValue({
      id: "test-id",
      name: "Test Brand",
      slug: "test-brand",
      logoUrl: null,
      verification: "UNVERIFIED",
    });
    mocks.brandUpdate.mockResolvedValue({});
    mocks.brandMediaUpsert.mockResolvedValue({ id: "media-1" });
    mocks.logAudit.mockResolvedValue({});
  });

  // ── Source whitelist ──────────────────────────────────────

  it("accepts source=AI_SEARCH and persists it", async () => {
    const [req, ctx] = makeRequest({ logoUrl: "https://example.com/logo.png", source: "AI_SEARCH" });
    const res = await PUT(req as any, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.source).toBe("AI_SEARCH");
    expect(body.logoUrl).toBe("https://example.com/logo.png");
  });

  it("accepts source=MANUAL and persists it", async () => {
    const [req, ctx] = makeRequest({ logoUrl: "https://example.com/logo.png", source: "MANUAL" });
    const res = await PUT(req as any, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("MANUAL");
  });

  it("defaults to MANUAL when source is not provided", async () => {
    const [req, ctx] = makeRequest({ logoUrl: "https://example.com/logo.png" });
    const res = await PUT(req as any, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("MANUAL");
  });

  it("rejects invalid source values with 400", async () => {
    const [req, ctx] = makeRequest({ logoUrl: "https://example.com/logo.png", source: "HACKED" });
    const res = await PUT(req as any, ctx);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("AI_SEARCH");
    expect(body.error).toContain("MANUAL");
    expect(body.error).toContain("HACKED");
  });

  it("rejects empty source string with 400", async () => {
    const [req, ctx] = makeRequest({ logoUrl: "https://example.com/logo.png", source: "" });
    const res = await PUT(req as any, ctx);
    expect(res.status).toBe(400);
  });

  // ── Verification independence ─────────────────────────────

  it("does NOT change Brand.verification", async () => {
    const [req, ctx] = makeRequest({ logoUrl: "https://example.com/logo.png", source: "AI_SEARCH" });
    await PUT(req as any, ctx);

    const updateCall = mocks.brandUpdate.mock.calls[0]?.[0];
    expect(updateCall?.data?.logoUrl).toBe("https://example.com/logo.png");
    expect(updateCall?.data?.verification).toBeUndefined();
  });

  // ── BrandMedia persistence ────────────────────────────────

  it("persists BrandMedia with the correct source in title", async () => {
    const [req, ctx] = makeRequest({ logoUrl: "https://example.com/logo.png", source: "AI_SEARCH" });
    await PUT(req as any, ctx);

    expect(mocks.brandMediaUpsert).toHaveBeenCalledTimes(1);
    const upsertCall = mocks.brandMediaUpsert.mock.calls[0]?.[0];
    expect(upsertCall?.create?.title).toBe("Logo from AI_SEARCH");
    expect(upsertCall?.create?.url).toBe("https://example.com/logo.png");
    expect(upsertCall?.create?.type).toBe("LOGO");
  });

  // ── Fallback: only for missing constraint ─────────────────

  it("falls back to transaction when upsert fails with missing-constraint error (P2021)", async () => {
    // P2021 = "The table does not have a unique constraint"
    const constraintErr = Object.assign(new Error("Unknown argument `brandId_type`"), {
      code: "P2021",
    });
    mocks.brandMediaUpsert.mockRejectedValue(constraintErr);
    mocks.transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      // Simulate the transaction: provide a mock tx with deleteMany + create
      const tx = {
        brandMedia: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: vi.fn().mockResolvedValue({ id: "media-tx" }),
        },
      };
      return fn(tx);
    });

    const [req, ctx] = makeRequest({ logoUrl: "https://example.com/logo.png", source: "AI_SEARCH" });
    const res = await PUT(req as any, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("falls back to transaction when upsert fails with P2009", async () => {
    const constraintErr = Object.assign(new Error("Unknown argument"), { code: "P2009" });
    mocks.brandMediaUpsert.mockRejectedValue(constraintErr);
    mocks.transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        brandMedia: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          create: vi.fn().mockResolvedValue({ id: "media-tx" }),
        },
      };
      return fn(tx);
    });

    const [req, ctx] = makeRequest({ logoUrl: "https://example.com/logo.png", source: "MANUAL" });
    const res = await PUT(req as any, ctx);

    expect(res.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("does NOT fall back for connection errors — propagates without deleteMany", async () => {
    // A connection error should NOT trigger the fallback (which deletes old logo)
    const connErr = Object.assign(new Error("Connection lost"), { code: "P1001" });
    mocks.brandMediaUpsert.mockRejectedValue(connErr);

    const [req, ctx] = makeRequest({ logoUrl: "https://example.com/logo.png", source: "AI_SEARCH" });
    const res = await PUT(req as any, ctx);
    const body = await res.json();

    // Should be 500 (error propagated), NOT 200 (fallback)
    expect(res.status).toBe(500);
    // deleteMany should NOT be called — old logo preserved
    expect(mocks.brandMediaDeleteMany).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does NOT fall back for timeout errors — propagates without deleteMany", async () => {
    const timeoutErr = Object.assign(new Error("Transaction timed out"), { code: "P2028" });
    mocks.brandMediaUpsert.mockRejectedValue(timeoutErr);

    const [req, ctx] = makeRequest({ logoUrl: "https://example.com/logo.png", source: "AI_SEARCH" });
    const res = await PUT(req as any, ctx);

    expect(res.status).toBe(500);
    expect(mocks.brandMediaDeleteMany).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("propagates transaction errors (fallback create fails)", async () => {
    const constraintErr = Object.assign(new Error("Unknown argument `brandId_type`"), { code: "P2021" });
    mocks.brandMediaUpsert.mockRejectedValue(constraintErr);
    mocks.transaction.mockRejectedValue(new Error("create failed in transaction"));

    const [req, ctx] = makeRequest({ logoUrl: "https://example.com/logo.png", source: "AI_SEARCH" });
    const res = await PUT(req as any, ctx);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toContain("create failed");
  });

  // ── Audit log ─────────────────────────────────────────────

  it("records audit log with source and before/after logoUrl", async () => {
    mocks.brandFindUnique.mockResolvedValue({
      id: "test-id",
      name: "Test Brand",
      slug: "test-brand",
      logoUrl: "https://old.com/logo.png",
      verification: "VERIFIED",
    });

    const [req, ctx] = makeRequest({ logoUrl: "https://new.com/logo.png", source: "AI_SEARCH" });
    await PUT(req as any, ctx);

    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    const auditCall = mocks.logAudit.mock.calls[0]?.[0];
    expect(auditCall?.action).toBe("admin.brands.logo.update");
    expect(auditCall?.before?.logoUrl).toBe("https://old.com/logo.png");
    expect(auditCall?.after?.logoUrl).toBe("https://new.com/logo.png");
    expect(auditCall?.after?.source).toBe("AI_SEARCH");
    expect(auditCall?.reason).toContain("AI-suggested");
  });

  // ── Error cases ───────────────────────────────────────────

  it("returns 404 when brand does not exist", async () => {
    mocks.brandFindUnique.mockResolvedValue(null);
    const [req, ctx] = makeRequest({ logoUrl: "https://example.com/logo.png" });
    const res = await PUT(req as any, ctx);
    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const [req, ctx] = makeRequest({ logoUrl: "https://example.com/logo.png" });
    const res = await PUT(req as any, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 when lacking brand.update permission", async () => {
    mocks.hasPermission.mockResolvedValue(false);
    const [req, ctx] = makeRequest({ logoUrl: "https://example.com/logo.png" });
    const res = await PUT(req as any, ctx);
    expect(res.status).toBe(403);
  });
});
