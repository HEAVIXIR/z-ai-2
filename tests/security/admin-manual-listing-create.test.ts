import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ user: { id: "admin-1" }, isAdmin: true, csrf: true, categoryFind: vi.fn(), transactionFind: vi.fn(), serviceFind: vi.fn(), slugFind: vi.fn(), listingCreate: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth-helpers/require-admin", () => ({ requireAdminPermission: async () => ({ user: mocks.user, error: null }) }));
vi.mock("@/lib/authorization", () => ({ isAdmin: async () => mocks.isAdmin }));
vi.mock("@/lib/csrf", () => ({ checkCsrf: () => mocks.csrf }));
vi.mock("@/lib/db", () => ({ db: { category: { findFirst: mocks.categoryFind }, transactionType: { findFirst: mocks.transactionFind }, serviceType: { findFirst: mocks.serviceFind }, listing: { findUnique: mocks.slugFind, create: mocks.listingCreate } } }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));
vi.mock("@/lib/api-helpers", () => ({ parseBig: (v: unknown) => v ? BigInt(String(v).replace(/[^0-9]/g, "")) : null, slugify: (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }));

import { POST } from "@/app/api/admin/listings/manual/route";

beforeEach(() => {
  mocks.isAdmin = true; mocks.csrf = true; mocks.categoryFind.mockReset().mockResolvedValue({ id: "cat-1" });
  mocks.transactionFind.mockReset().mockResolvedValue({ id: "tx-1", key: "SALE" });
  mocks.serviceFind.mockReset().mockResolvedValue({ id: "service-1" });
  mocks.slugFind.mockReset().mockResolvedValue(null);
  mocks.listingCreate.mockReset().mockResolvedValue({ id: "listing-1", slug: "test-listing", status: "PENDING" });
  mocks.audit.mockReset().mockResolvedValue(undefined);
});

const request = (body: unknown) => new Request("http://localhost/api/admin/listings/manual", { method: "POST", headers: { "content-type": "application/json", Origin: "http://localhost:3000" }, body: JSON.stringify(body) });

describe("manual admin listing create is independent of AI", () => {
  it("creates a pending listing without provider or AI gateway dependencies", async () => {
    const res = await POST(request({ title: "Test Listing", description: "Details", categoryId: "cat-1", transactionTypeId: "tx-1", price: "250000", province: "تهران" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ok: true, id: "listing-1", status: "PENDING" });
    expect(mocks.listingCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PENDING", publishedAt: null, sourceSite: "MANUAL", priceType: "FIXED", showInLatest: false }) }));
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid taxonomy before creating a record", async () => {
    mocks.categoryFind.mockResolvedValue(null);
    const res = await POST(request({ title: "Test Listing", categoryId: "bad", transactionTypeId: "tx-1" }));
    expect(res.status).toBe(400); expect(mocks.listingCreate).not.toHaveBeenCalled();
  });
  it("rejects non-admin even if permission helper returned success", async () => {
    mocks.isAdmin = false;
    const res = await POST(request({ title: "Test Listing", categoryId: "cat-1", transactionTypeId: "tx-1" }));
    expect(res.status).toBe(403); expect(mocks.listingCreate).not.toHaveBeenCalled();
  });
  it("rejects missing CSRF before writes", async () => {
    mocks.csrf = false;
    const res = await POST(request({ title: "Test Listing", categoryId: "cat-1", transactionTypeId: "tx-1" }));
    expect(res.status).toBe(403); expect(mocks.listingCreate).not.toHaveBeenCalled();
  });
});
