/**
 * HEAVIX — Brand Logo Save Tests
 * ----------------------------------------------------------------
 * Tests the logo PUT endpoint contract:
 *   - source whitelist (AI_SEARCH | MANUAL only)
 *   - invalid source → 400
 *   - Brand.verification is NOT changed by logo update
 *   - BrandMedia persisted via transaction (deleteMany + create)
 *   - Transaction errors propagate (old logo preserved by rollback)
 *   - response includes source
 *
 * All tests are mocked — no real DB or AI calls.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  brandFindUnique: vi.fn(),
  brandUpdate: vi.fn(),
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
    mocks.transaction.mockImplementation(makeTxMock());
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

  // ── BrandMedia persistence (via transaction) ──────────────

  it("persists BrandMedia with source in title via transaction", async () => {
    const txDelete = vi.fn().mockResolvedValue({ count: 0 });
    const txCreate = vi.fn().mockResolvedValue({ id: "media-1" });
    mocks.transaction.mockImplementation(async (fn: any) => fn({
      brandMedia: { deleteMany: txDelete, create: txCreate },
    }));

    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png", source: "AI_SEARCH" });
    await PUT(req as any, ctx);

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(txDelete).toHaveBeenCalledWith({ where: { brandId: "test-id", type: "LOGO" } });
    expect(txCreate).toHaveBeenCalledWith({
      data: {
        brandId: "test-id", type: "LOGO",
        url: "https://x.com/l.png", title: "Logo from AI_SEARCH",
      },
    });
  });

  it("stores source in BrandMedia.title as 'Logo from MANUAL'", async () => {
    const txCreate = vi.fn().mockResolvedValue({ id: "media-2" });
    mocks.transaction.mockImplementation(async (fn: any) => fn({
      brandMedia: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), create: txCreate },
    }));

    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png", source: "MANUAL" });
    await PUT(req as any, ctx);

    expect(txCreate.mock.calls[0]?.[0]?.data?.title).toBe("Logo from MANUAL");
  });

  it("BrandMedia.title format is parseable by BrandControlCenter regex", async () => {
    const txCreate = vi.fn().mockResolvedValue({ id: "media-3" });
    mocks.transaction.mockImplementation(async (fn: any) => fn({
      brandMedia: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), create: txCreate },
    }));

    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png", source: "AI_SEARCH" });
    await PUT(req as any, ctx);

    const title = txCreate.mock.calls[0]?.[0]?.data?.title;
    const match = title?.match(/Logo from (\w+)/);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("AI_SEARCH");
  });

  // ── Transaction error handling ────────────────────────────

  it("transaction error propagates as HTTP 500 (old logo preserved by rollback)", async () => {
    mocks.transaction.mockRejectedValue(new Error("create failed in tx"));

    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png", source: "AI_SEARCH" });
    const res = await PUT(req as any, ctx);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toContain("create failed");
    // Audit log NOT written (error threw before reaching it)
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it("connection error in transaction propagates as HTTP 500", async () => {
    mocks.transaction.mockRejectedValue(
      Object.assign(new Error("Connection lost"), { code: "P1001" }),
    );

    const [req, ctx] = makeRequest({ logoUrl: "https://x.com/l.png", source: "AI_SEARCH" });
    const res = await PUT(req as any, ctx);

    expect(res.status).toBe(500);
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  // ── Legacy logo ───────────────────────────────────────────

  it("brand with logoUrl but no BrandMedia → source is unknown until new save", async () => {
    mocks.brandFindUnique.mockResolvedValue({
      id: "legacy-id", name: "Legacy Brand", slug: "legacy-brand",
      logoUrl: "https://old.com/logo.png", verification: "UNVERIFIED",
    });

    const [req, ctx] = makeRequest({ logoUrl: "https://new.com/logo.png", source: "MANUAL" });
    const res = await PUT(req as any, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.source).toBe("MANUAL");

    const auditCall = mocks.logAudit.mock.calls[0]?.[0];
    expect(auditCall?.before?.logoUrl).toBe("https://old.com/logo.png");
    expect(auditCall?.after?.source).toBe("MANUAL");
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
