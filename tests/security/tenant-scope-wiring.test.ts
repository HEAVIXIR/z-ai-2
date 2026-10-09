import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AdminResourceConfig } from "@/lib/admin/types";

/* ============================================================
   PR-SC-00 — Tenant-scope wiring contract test
   ------------------------------------------------------------
   Proves the data-adapter threads the tenant filter into the
   actual Prisma model query (findMany / count / findFirst /
   findUnique / delete). Mocks the Prisma client via a Proxy that
   returns the mock model for any property access. Runs in CI
   (no DB needed). Catches regressions where a refactor drops the
   tenantCtx parameter from a data-adapter call.

   The real-API-path test (with a live PostgreSQL) lives at
   tests/integration/tenant-scope-real.ts.
   ============================================================ */

type MockModel = {
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

let mockModel: MockModel;

// Use vi.hoisted so the mock factory can reference the shared slot.
const { modelSlot } = vi.hoisted(() => ({ modelSlot: { current: null as MockModel | null } }));

vi.mock("@/lib/db", () => ({
  db: new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "$transaction") {
          return async (cb: (tx: unknown) => Promise<unknown>) => {
            // The tx is used as `(tx as any)[config.model]` — return the mock model.
            const tx = new Proxy(
              { $queryRaw: async () => [] },
              { get(_t, p) {
                if (p === "$queryRaw") return async () => [];
                return modelSlot.current ?? undefined;
              } },
            );
            return cb(tx);
          };
        }
        // Any model key access → return the mock model.
        return modelSlot.current ?? undefined;
      },
    },
  ),
}));
vi.mock("@/lib/store-db", () => ({ storeDb: {} }));
vi.mock("@/lib/admin/resource-registry", () => ({ registry: { get: () => undefined } }));

const { listResources, getResource, deleteResource } = await import("@/lib/admin/data-adapter");

function makeConfig(ownership?: AdminResourceConfig["ownership"]): AdminResourceConfig {
  return {
    key: "test",
    titleFa: "تست",
    model: "testModel",
    apiBase: "/api/test",
    adminPath: "/admin/test",
    permissions: { read: "test.read", delete: "test.delete" },
    columns: [],
    fields: [],
    ownership,
  };
}

const queryParams = {
  pagination: { page: 1, pageSize: 25 },
  filters: [] as unknown[],
  sort: undefined as unknown,
  search: undefined as unknown,
};

beforeEach(() => {
  mockModel = {
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
    findFirst: vi.fn(async () => null),
    findUnique: vi.fn(async () => null),
    create: vi.fn(async (a: unknown) => a),
    update: vi.fn(async (a: unknown) => a),
    delete: vi.fn(async () => undefined),
  };
  modelSlot.current = mockModel;
});

describe("PR-SC-00 wiring — listResources threads tenant filter", () => {
  it("non-admin seller: findMany where includes { sellerId: userId }", async () => {
    const config = makeConfig({ ownerField: "sellerId", moderatePermission: "listing.moderate" });
    await listResources(config, queryParams, undefined, {
      userId: "seller-A",
      isAdmin: false,
      hasModeratePerm: false,
    });
    expect(mockModel.findMany).toHaveBeenCalledTimes(1);
    const call = mockModel.findMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ sellerId: "seller-A" });
  });

  it("admin: findMany where has NO sellerId filter", async () => {
    const config = makeConfig({ ownerField: "sellerId", moderatePermission: "listing.moderate" });
    await listResources(config, queryParams, undefined, {
      userId: "admin-1",
      isAdmin: true,
      hasModeratePerm: false,
    });
    const call = mockModel.findMany.mock.calls[0][0];
    expect(call.where).not.toHaveProperty("sellerId");
  });

  it("no ownership config: findMany where has NO sellerId filter", async () => {
    const config = makeConfig(undefined);
    await listResources(config, queryParams, undefined, {
      userId: "seller-A",
      isAdmin: false,
      hasModeratePerm: false,
    });
    const call = mockModel.findMany.mock.calls[0][0];
    expect(call.where).not.toHaveProperty("sellerId");
  });

  it("anonymous on seller-scoped resource: where is deny-all (unsatisfiable id)", async () => {
    const config = makeConfig({ ownerField: "sellerId", moderatePermission: "listing.moderate" });
    await listResources(config, queryParams, undefined, {
      userId: null,
      isAdmin: false,
      hasModeratePerm: false,
    });
    const call = mockModel.findMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: "__tenant_scope_deny_all__" });
  });

  it("count also receives the tenant filter", async () => {
    const config = makeConfig({ ownerField: "sellerId", moderatePermission: "listing.moderate" });
    await listResources(config, queryParams, undefined, {
      userId: "seller-A",
      isAdmin: false,
      hasModeratePerm: false,
    });
    expect(mockModel.count).toHaveBeenCalledTimes(1);
    const countCall = mockModel.count.mock.calls[0][0];
    expect(countCall.where).toMatchObject({ sellerId: "seller-A" });
  });
});

describe("PR-SC-00 wiring — getResource uses findFirst when tenantCtx present", () => {
  it("non-admin seller: findFirst where includes both id and sellerId (AND-merged)", async () => {
    const config = makeConfig({ ownerField: "sellerId", moderatePermission: "listing.moderate" });
    await getResource(config, "rec-1", undefined, {
      userId: "seller-A",
      isAdmin: false,
      hasModeratePerm: false,
    });
    expect(mockModel.findFirst).toHaveBeenCalledTimes(1);
    const call = mockModel.findFirst.mock.calls[0][0];
    // mergeTenantWhere produces AND-semantics when both { id } and tenant are non-empty.
    const whereJson = JSON.stringify(call.where);
    expect(whereJson).toContain("rec-1");
    expect(whereJson).toContain("seller-A");
    expect(whereJson).toContain("sellerId");
  });

  it("no tenantCtx: falls back to findUnique (preserves existing callers)", async () => {
    const config = makeConfig({ ownerField: "sellerId", moderatePermission: "listing.moderate" });
    await getResource(config, "rec-1");
    expect(mockModel.findUnique).toHaveBeenCalledTimes(1);
    expect(mockModel.findFirst).not.toHaveBeenCalled();
  });

  it("admin with tenantCtx: findFirst where has id but NO sellerId filter", async () => {
    const config = makeConfig({ ownerField: "sellerId", moderatePermission: "listing.moderate" });
    await getResource(config, "rec-1", undefined, {
      userId: "admin-1",
      isAdmin: true,
      hasModeratePerm: false,
    });
    const call = mockModel.findFirst.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: "rec-1" });
    expect(JSON.stringify(call.where)).not.toContain("sellerId");
  });
});

describe("PR-SC-00 wiring — deleteResource verifies ownership before delete", () => {
  it("non-owner (findFirst returns null): throws 404, delete never called", async () => {
    const config = makeConfig({ ownerField: "sellerId", moderatePermission: "listing.moderate" });
    mockModel.findFirst.mockResolvedValueOnce(null);
    await expect(
      deleteResource(config, "rec-1", { userId: "seller-A", isAdmin: false, hasModeratePerm: false }),
    ).rejects.toThrow(/not found/i);
    expect(mockModel.delete).not.toHaveBeenCalled();
    expect(mockModel.update).not.toHaveBeenCalled();
  });

  it("owner (findFirst returns the row): proceeds to delete", async () => {
    const config = makeConfig({ ownerField: "sellerId", moderatePermission: "listing.moderate" });
    mockModel.findFirst.mockResolvedValueOnce({ id: "rec-1", sellerId: "seller-A" });
    await deleteResource(config, "rec-1", { userId: "seller-A", isAdmin: false, hasModeratePerm: false });
    expect(mockModel.delete).toHaveBeenCalledTimes(1);
  });

  it("no tenantCtx: delete proceeds without findFirst pre-check", async () => {
    const config = makeConfig(undefined);
    await deleteResource(config, "rec-1");
    expect(mockModel.delete).toHaveBeenCalledTimes(1);
  });
});
