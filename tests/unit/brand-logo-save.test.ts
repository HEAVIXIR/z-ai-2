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
});
