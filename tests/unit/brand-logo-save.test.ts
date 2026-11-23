/**
 * HEAVIX — Brand Logo Save Tests
 * ----------------------------------------------------------------
 * Tests the logo PUT endpoint contract:
 *   - source whitelist (AI_SEARCH | MANUAL only)
 *   - invalid source → 400
 *   - Brand.verification is NOT changed by logo update
 *   - BrandMedia is persisted (no silent error swallowing)
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
    // Empty string → trimmed → "" → uppercased → "" → not in whitelist
    // But the default path should catch this: rawSource defaults to "MANUAL"
    // when the trimmed value is empty... wait, let me check the code.
    // Actually: rawSource = "".trim().toUpperCase() = "" → not in VALID_LOGO_SOURCES → 400
    const body = await res.json();
    expect(res.status).toBe(400);
  });

  it("does NOT change Brand.verification", async () => {
    const [req, ctx] = makeRequest({ logoUrl: "https://example.com/logo.png", source: "AI_SEARCH" });
    await PUT(req as any, ctx);

    // brand.update should only set logoUrl, not verification
    const updateCall = mocks.brandUpdate.mock.calls[0]?.[0];
    expect(updateCall?.data?.logoUrl).toBe("https://example.com/logo.png");
    expect(updateCall?.data?.verification).toBeUndefined();
  });

  it("persists BrandMedia with the correct source in title", async () => {
    const [req, ctx] = makeRequest({ logoUrl: "https://example.com/logo.png", source: "AI_SEARCH" });
    await PUT(req as any, ctx);

    // BrandMedia upsert should be called with source in title
    expect(mocks.brandMediaUpsert).toHaveBeenCalledTimes(1);
    const upsertCall = mocks.brandMediaUpsert.mock.calls[0]?.[0];
    expect(upsertCall?.create?.title).toBe("Logo from AI_SEARCH");
    expect(upsertCall?.create?.url).toBe("https://example.com/logo.png");
    expect(upsertCall?.create?.type).toBe("LOGO");
  });

  it("falls back to deleteMany+create when upsert fails (no @@unique constraint)", async () => {
    // Simulate the case where BrandMedia has no @@unique([brandId, type])
    mocks.brandMediaUpsert.mockRejectedValue(new Error("unique constraint not found"));
    mocks.brandMediaDeleteMany.mockResolvedValue({ count: 0 });
    mocks.brandMediaCreate.mockResolvedValue({ id: "media-fallback" });

    const [req, ctx] = makeRequest({ logoUrl: "https://example.com/logo.png", source: "AI_SEARCH" });
    const res = await PUT(req as any, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.brandMediaDeleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.brandMediaCreate).toHaveBeenCalledTimes(1);
    const createCall = mocks.brandMediaCreate.mock.calls[0]?.[0];
    expect(createCall?.data?.title).toBe("Logo from AI_SEARCH");
  });

  it("propagates BrandMedia errors instead of swallowing them", async () => {
    // Both upsert AND fallback fail
    mocks.brandMediaUpsert.mockRejectedValue(new Error("upsert failed"));
    mocks.brandMediaDeleteMany.mockRejectedValue(new Error("delete failed"));

    const [req, ctx] = makeRequest({ logoUrl: "https://example.com/logo.png", source: "AI_SEARCH" });
    const res = await PUT(req as any, ctx);
    const body = await res.json();

    // The error should surface as a 500, NOT be silently swallowed
    expect(res.status).toBe(500);
    expect(body.error).toContain("delete failed");
  });

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
