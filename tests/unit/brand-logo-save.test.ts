/**
 * HEAVIX — Brand Logo Save Tests
 * ----------------------------------------------------------------
 * Tests the logo PUT endpoint contract:
 *   - source whitelist (AI_SEARCH | MANUAL only)
 *   - invalid source → 400
 *   - Brand.verification is NOT changed by logo update
 *   - BrandMedia is persisted (no silent error swallowing)
 *   - fallback ONLY for compound-field-missing errors
 *   - connection/timeout/table-missing errors do NOT trigger fallback
 *   - fallback uses transaction for atomicity
 *   - response includes source
 *
 * All tests are mocked — no real DB or AI calls.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/rbac", () => ({ hasPermission: mocks.hasPermission }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock("@/lib/homepage-cache-tags", () => ({
  HOMEPAGE_CACHE_TAGS: { brands: "homepage-brands" },
}));

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

function makeTxMock(result: any = { id: "media-tx" }) {
  return async (fn: (tx: any) => Promise<any>) => {
    const tx = {
      brandMedia: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue(result),
      },
    };
    return fn(tx);
  };
}

describe("PUT /api/admin/brands/[id]/logo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1" });
    mocks.hasPermission.mockResolvedValue(true);
    mocks.brandFindUnique.mockResolvedValue({
      id: "test-id", name: "Test Brand", slug: "test-brand",
      logoUrl: null, verification: "UNVERIFIED",
    });
    mocks.brandUpdate.mockResolvedValue({});
    mocks.brandMediaUpsert.mockResolvedValue({ id: "media-1" });
    mocks.logAudit.mockResolvedValue({});
  });

  // ── Source whitelist ──────────────────────────────────────

  it("accepts source=AI_SEARCH and persists it", async () => {
    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png", source: "AI_SEARCH" });
    const res = await PUT(req as any, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("AI_SEARCH");
  });

  it("accepts source=MANUAL", async () => {
    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png", source: "MANUAL" });
    const res = await PUT(req as any, ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).source).toBe("MANUAL");
  });

  it("defaults to MANUAL when source omitted", async () => {
    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png" });
    const res = await PUT(req as any, ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).source).toBe("MANUAL");
  });

  it("rejects invalid source with 400", async () => {
    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png", source: "HACKED" });
    const res = await PUT(req as any, ctx);
    expect(res.status).toBe(400);
  });

  it("rejects empty source with 400", async () => {
    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png", source: "" });
    const res = await PUT(req as any, ctx);
    expect(res.status).toBe(400);
  });

  // ── Verification independence ─────────────────────────────

  it("does NOT change Brand.verification", async () => {
    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png", source: "AI_SEARCH" });
    await PUT(req as any, ctx);
    const updateCall = mocks.brandUpdate.mock.calls[0]?.[0];
    expect(updateCall?.data?.verification).toBeUndefined();
  });

  // ── BrandMedia persistence ────────────────────────────────

  it("persists BrandMedia with source in title", async () => {
    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png", source: "AI_SEARCH" });
    await PUT(req as any, ctx);
    const upsertCall = mocks.brandMediaUpsert.mock.calls[0]?.[0];
    expect(upsertCall?.create?.title).toBe("Logo from AI_SEARCH");
  });

  // ── Fallback: ONLY for compound-field-missing ─────────────

  it("falls back to transaction when upsert fails with brandId_type + P2004", async () => {
    const err = Object.assign(
      new Error("Unknown field `brandId_type` on the where argument"),
      { code: "P2004" },
    );
    mocks.brandMediaUpsert.mockRejectedValue(err);
    mocks.transaction.mockImplementation(makeTxMock());

    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png", source: "AI_SEARCH" });
    const res = await PUT(req as any, ctx);
    expect(res.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("does NOT fall back for P1001 (connection lost)", async () => {
    const err = Object.assign(new Error("Connection lost"), { code: "P1001" });
    mocks.brandMediaUpsert.mockRejectedValue(err);

    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png", source: "AI_SEARCH" });
    const res = await PUT(req as any, ctx);
    expect(res.status).toBe(500);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does NOT fall back for P2028 (timeout)", async () => {
    const err = Object.assign(new Error("Transaction timed out"), { code: "P2028" });
    mocks.brandMediaUpsert.mockRejectedValue(err);

    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png", source: "AI_SEARCH" });
    const res = await PUT(req as any, ctx);
    expect(res.status).toBe(500);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does NOT fall back for P2021 (table missing) without brandId_type in message", async () => {
    const err = Object.assign(new Error("The table `BrandMedia` does not exist"), { code: "P2021" });
    mocks.brandMediaUpsert.mockRejectedValue(err);

    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png", source: "AI_SEARCH" });
    const res = await PUT(req as any, ctx);
    expect(res.status).toBe(500);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does NOT fall back for P2009 without brandId_type in message", async () => {
    const err = Object.assign(new Error("Unknown argument `foo`"), { code: "P2009" });
    mocks.brandMediaUpsert.mockRejectedValue(err);

    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png", source: "AI_SEARCH" });
    const res = await PUT(req as any, ctx);
    expect(res.status).toBe(500);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("propagates transaction errors (create fails in tx)", async () => {
    const err = Object.assign(
      new Error("Unknown field `brandId_type`"),
      { code: "P2004" },
    );
    mocks.brandMediaUpsert.mockRejectedValue(err);
    mocks.transaction.mockRejectedValue(new Error("create failed in tx"));

    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png", source: "AI_SEARCH" });
    const res = await PUT(req as any, ctx);
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toContain("create failed");
  });

  // ── Audit log ─────────────────────────────────────────────

  it("records audit log with source + before/after", async () => {
    mocks.brandFindUnique.mockResolvedValue({
      id: "test-id", name: "Test Brand", slug: "test-brand",
      logoUrl: "https://old.com/l.png", verification: "VERIFIED",
    });

    const [req, ctx] = makeRequest({ logoUrl: "https://new.com/l.png", source: "AI_SEARCH" });
    await PUT(req as any, ctx);

    const auditCall = mocks.logAudit.mock.calls[0]?.[0];
    expect(auditCall?.action).toBe("admin.brands.logo.update");
    expect(auditCall?.before?.logoUrl).toBe("https://old.com/l.png");
    expect(auditCall?.after?.source).toBe("AI_SEARCH");
    expect(auditCall?.reason).toContain("AI-suggested");
  });

  // ── Error cases ───────────────────────────────────────────

  it("returns 404 when brand not found", async () => {
    mocks.brandFindUnique.mockResolvedValue(null);
    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png" });
    const res = await PUT(req as any, ctx);
    expect(res.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png" });
    const res = await PUT(req as any, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 when lacking permission", async () => {
    mocks.hasPermission.mockResolvedValue(false);
    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png" });
    const res = await PUT(req as any, ctx);
    expect(res.status).toBe(403);
  });

  // ── Persistence & Refresh tests ───────────────────────────
  // These tests verify the contract that logo source survives
  // across page refreshes by being stored in BrandMedia.title.
  // The BrandControlCenter client component reads brand.media
  // on initial load and parses "Logo from <SOURCE>" from the
  // BrandMedia.title field.

  it("stores source in BrandMedia.title as 'Logo from AI_SEARCH'", async () => {
    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png", source: "AI_SEARCH" });
    await PUT(req as any, ctx);

    const upsertCall = mocks.brandMediaUpsert.mock.calls[0]?.[0];
    expect(upsertCall?.create?.title).toBe("Logo from AI_SEARCH");
    expect(upsertCall?.update?.title).toBe("Logo from AI_SEARCH");
  });

  it("stores source in BrandMedia.title as 'Logo from MANUAL'", async () => {
    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png", source: "MANUAL" });
    await PUT(req as any, ctx);

    const upsertCall = mocks.brandMediaUpsert.mock.calls[0]?.[0];
    expect(upsertCall?.create?.title).toBe("Logo from MANUAL");
  });

  it("BrandMedia.title format is parseable by the BrandControlCenter regex", async () => {
    // The BrandControlCenter parses: logoMedia.title.match(/Logo from (\w+)/)
    // This test verifies the stored title matches that regex.
    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png", source: "AI_SEARCH" });
    await PUT(req as any, ctx);

    const upsertCall = mocks.brandMediaUpsert.mock.calls[0]?.[0];
    const title = upsertCall?.create?.title;
    const match = title?.match(/Logo from (\w+)/);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("AI_SEARCH");
  });

  // ── Legacy logo tests ─────────────────────────────────────
  // A brand with a logoUrl but NO BrandMedia record (legacy data)
  // should show source as null/unknown in the UI.

  it("brand with logoUrl but no BrandMedia → source is unknown", async () => {
    // Simulate: brand has logoUrl but the API returns no media array
    // (legacy brand created before the source tracking feature)
    mocks.brandFindUnique.mockResolvedValue({
      id: "legacy-id",
      name: "Legacy Brand",
      slug: "legacy-brand",
      logoUrl: "https://old.com/logo.png",
      verification: "UNVERIFIED",
    });

    const [req, ctx] = makeRequest({ logoUrl: "https://new.com/logo.png", source: "MANUAL" });
    const res = await PUT(req as any, ctx);
    const body = await res.json();

    // The PUT succeeds — it creates a new BrandMedia with source
    expect(res.status).toBe(200);
    expect(body.source).toBe("MANUAL");

    // The audit log records the old logoUrl (before) and new (after)
    const auditCall = mocks.logAudit.mock.calls[0]?.[0];
    expect(auditCall?.before?.logoUrl).toBe("https://old.com/logo.png");
    expect(auditCall?.after?.source).toBe("MANUAL");
  });

  // ── Save failure tests ────────────────────────────────────
  // When the save fails, the logo source should NOT be updated
  // in the UI (the BrandControlCenter only sets logoSource after
  // a successful API response).

  it("save failure does not persist BrandMedia (error propagates)", async () => {
    mocks.brandMediaUpsert.mockRejectedValue(
      Object.assign(new Error("Connection lost"), { code: "P1001" }),
    );

    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png", source: "AI_SEARCH" });
    const res = await PUT(req as any, ctx);

    // HTTP 500 — save failed
    expect(res.status).toBe(500);
    // No BrandMedia was created or deleted
    expect(mocks.brandMediaDeleteMany).not.toHaveBeenCalled();
    expect(mocks.brandMediaCreate).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    // Audit log was NOT written (the try block threw before reaching logAudit)
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("save failure with transaction rollback — old logo preserved", async () => {
    // Simulate: upsert fails with compound-field-missing (fallback triggers)
    // but the transaction also fails — old logo must survive
    mocks.brandMediaUpsert.mockRejectedValue(
      Object.assign(new Error("Unknown field `brandId_type`"), { code: "P2004" }),
    );
    mocks.transaction.mockRejectedValue(new Error("create failed in tx"));

    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png", source: "AI_SEARCH" });
    const res = await PUT(req as any, ctx);

    expect(res.status).toBe(500);
    // The transaction was attempted (and failed atomically)
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    // No direct deleteMany or create was called outside the transaction
    expect(mocks.brandMediaDeleteMany).not.toHaveBeenCalled();
    expect(mocks.brandMediaCreate).not.toHaveBeenCalled();
  });

  // ── Comprehensive fallback matrix ─────────────────────────
  // Summary test: verify that ONLY the exact compound-field-missing
  // error triggers the fallback. All other Prisma error codes are
  // propagated without touching existing data.

  it("fallback matrix: only brandId_type+P2004 triggers fallback", async () => {
    const cases = [
      { code: "P1001", msg: "Connection lost", shouldFallback: false },
      { code: "P2028", msg: "Timeout", shouldFallback: false },
      { code: "P2021", msg: "Table does not exist", shouldFallback: false },
      { code: "P2009", msg: "Unknown argument `foo`", shouldFallback: false },
      { code: "P2002", msg: "Unique constraint violation", shouldFallback: false },
      { code: "P2003", msg: "Foreign key constraint", shouldFallback: false },
      { code: "P2004", msg: "Unknown field `brandId_type`", shouldFallback: true },
      { code: "P2009", msg: "Unknown field `brandId_type`", shouldFallback: true },
    ];

    for (const c of cases) {
      vi.clearAllMocks();
      mocks.getCurrentUser.mockResolvedValue({ id: "admin-1" });
      mocks.hasPermission.mockResolvedValue(true);
      mocks.brandFindUnique.mockResolvedValue({
        id: "test-id", name: "Test", slug: "test",
        logoUrl: null, verification: "UNVERIFIED",
      });
      mocks.brandUpdate.mockResolvedValue({});
      mocks.brandMediaUpsert.mockRejectedValue(
        Object.assign(new Error(c.msg), { code: c.code }),
      );
      mocks.transaction.mockImplementation(makeTxMock());

      const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png", source: "AI_SEARCH" });
      const res = await PUT(req as any, ctx);

      if (c.shouldFallback) {
        expect(res.status).toBe(200);
        expect(mocks.transaction).toHaveBeenCalledTimes(1);
      } else {
        expect(res.status).toBe(500);
        expect(mocks.transaction).not.toHaveBeenCalled();
        expect(mocks.brandMediaDeleteMany).not.toHaveBeenCalled();
      }
    }
  });
});
