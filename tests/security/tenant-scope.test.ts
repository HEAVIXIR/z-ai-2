import { describe, it, expect } from "vitest";
import {
  buildTenantWhere,
  mergeTenantWhere,
  assertCreateOwner,
  checkRowOwnership,
  DENY_ALL,
  type TenantAccessContext,
} from "@/lib/admin/tenant-scope";
import type { AdminResourceConfig, AdminOwnershipConfig } from "@/lib/admin/types";

/* ============================================================
   Unit tests for src/lib/admin/tenant-scope.ts (PR-SC-00)
   ------------------------------------------------------------
   The tenant-scope module is the PURE-FUNCTION core of the
   row-level authorization fix (BLOCKER-A4). These tests pin
   every branch: no-ownership, admin bypass, moderator bypass,
   direct ownerField, relation-based ownership, fail-closed on
   anonymous, fail-closed on misconfigured ownership, AND-merge
   semantics, create-owner assertion, and row-ownership check.

   No DB, no I/O — these run in CI.
   ============================================================ */

function makeConfig(ownership?: AdminOwnershipConfig): AdminResourceConfig {
  return {
    key: "test-resource",
    titleFa: "تست",
    model: "testModel",
    apiBase: "/api/test",
    adminPath: "/admin/test",
    permissions: { read: "test.read" },
    columns: [],
    fields: [],
    ownership,
  };
}

const directOwnership = makeConfig({
  ownerField: "sellerId",
  moderatePermission: "listing.moderate",
});

const relationOwnership = makeConfig({
  relation: { field: "listing", ownerField: "sellerId" },
  moderatePermission: "lead.moderate",
});

const noOwnership = makeConfig(undefined);

const sellerCtx: TenantAccessContext = { userId: "seller-A", isAdmin: false, hasModeratePerm: false };
const sellerBCtx: TenantAccessContext = { userId: "seller-B", isAdmin: false, hasModeratePerm: false };
const adminCtx: TenantAccessContext = { userId: "admin-1", isAdmin: true, hasModeratePerm: false };
const moderatorCtx: TenantAccessContext = { userId: "mod-1", isAdmin: false, hasModeratePerm: true };
const anonCtx: TenantAccessContext = { userId: null, isAdmin: false, hasModeratePerm: false };

// ── buildTenantWhere ────────────────────────────────────────

describe("buildTenantWhere — no ownership config", () => {
  it("returns empty where (no filter) for any user when resource has no ownership", () => {
    expect(buildTenantWhere(noOwnership, sellerCtx)).toEqual({ where: {} });
    expect(buildTenantWhere(noOwnership, adminCtx)).toEqual({ where: {} });
    expect(buildTenantWhere(noOwnership, anonCtx)).toEqual({ where: {} });
  });
});

describe("buildTenantWhere — admin bypass", () => {
  it("admin sees all rows (empty where) even when ownership is declared", () => {
    expect(buildTenantWhere(directOwnership, adminCtx)).toEqual({ where: {} });
    expect(buildTenantWhere(relationOwnership, adminCtx)).toEqual({ where: {} });
  });
});

describe("buildTenantWhere — moderator bypass", () => {
  it("user with moderatePermission sees all rows (empty where)", () => {
    expect(buildTenantWhere(directOwnership, moderatorCtx)).toEqual({ where: {} });
    expect(buildTenantWhere(relationOwnership, moderatorCtx)).toEqual({ where: {} });
  });
});

describe("buildTenantWhere — direct ownerField (seller scope)", () => {
  it("non-admin, non-moderator seller gets { sellerId: userId } filter", () => {
    const r = buildTenantWhere(directOwnership, sellerCtx);
    expect("denyAll" in r).toBe(false);
    if ("where" in r) {
      expect(r.where).toEqual({ sellerId: "seller-A" });
    }
  });
  it("different seller gets a different filter", () => {
    const r = buildTenantWhere(directOwnership, sellerBCtx);
    if ("where" in r) {
      expect(r.where).toEqual({ sellerId: "seller-B" });
    }
  });
});

describe("buildTenantWhere — relation-based ownership", () => {
  it("non-admin seller gets nested { listing: { sellerId: userId } } filter", () => {
    const r = buildTenantWhere(relationOwnership, sellerCtx);
    expect("denyAll" in r).toBe(false);
    if ("where" in r) {
      expect(r.where).toEqual({ listing: { sellerId: "seller-A" } });
    }
  });
});

describe("buildTenantWhere — fail-closed on anonymous", () => {
  it("anonymous user on a seller-scoped resource gets denyAll", () => {
    const r = buildTenantWhere(directOwnership, anonCtx);
    expect("denyAll" in r).toBe(true);
  });
  it("anonymous user on a relation-scoped resource gets denyAll", () => {
    const r = buildTenantWhere(relationOwnership, anonCtx);
    expect("denyAll" in r).toBe(true);
  });
});

describe("buildTenantWhere — fail-closed on misconfigured ownership", () => {
  it("ownership with neither ownerField nor relation → denyAll for non-admin", () => {
    const misconfigured = makeConfig({ moderatePermission: "x.moderate" });
    const r = buildTenantWhere(misconfigured, sellerCtx);
    expect("denyAll" in r).toBe(true);
  });
  it("relation ownership missing ownerField → denyAll", () => {
    const misconfigured = makeConfig({ relation: { field: "listing", ownerField: "" } });
    // empty string ownerField → buildOwnerFilter returns null → denyAll
    const r = buildTenantWhere(misconfigured, sellerCtx);
    expect("denyAll" in r).toBe(true);
  });
});

// ── mergeTenantWhere ────────────────────────────────────────

describe("mergeTenantWhere", () => {
  it("returns existing where when tenant is empty (admin/no-ownership)", () => {
    expect(mergeTenantWhere({ status: "PUBLISHED" }, { where: {} })).toEqual({ status: "PUBLISHED" });
  });
  it("returns tenant where when existing is empty", () => {
    expect(mergeTenantWhere(undefined, { where: { sellerId: "A" } })).toEqual({ sellerId: "A" });
    expect(mergeTenantWhere({}, { where: { sellerId: "A" } })).toEqual({ sellerId: "A" });
  });
  it("AND-merges existing + tenant when both present", () => {
    const r = mergeTenantWhere({ status: "PUBLISHED" }, { where: { sellerId: "A" } });
    expect(r).toEqual({ AND: [{ status: "PUBLISHED" }, { sellerId: "A" }] });
  });
  it("preserves an existing AND array", () => {
    const r = mergeTenantWhere(
      { AND: [{ status: "PUBLISHED" }], orderBy: { createdAt: "desc" } },
      { where: { sellerId: "A" } },
    );
    expect(r).toEqual({ AND: [{ status: "PUBLISHED" }, { sellerId: "A" }], orderBy: { createdAt: "desc" } });
  });
  it("denyAll → unsatisfiable id clause (never matches a real row)", () => {
    const r = mergeTenantWhere({ status: "PUBLISHED" }, { denyAll: true });
    expect(r).toEqual({ id: "__tenant_scope_deny_all__" });
  });
});

// ── assertCreateOwner ───────────────────────────────────────

describe("assertCreateOwner — no ownership config", () => {
  it("always ok when resource has no ownership", () => {
    expect(assertCreateOwner(noOwnership, sellerCtx, { title: "x" })).toEqual({ ok: true });
    expect(assertCreateOwner(noOwnership, anonCtx, { title: "x" })).toEqual({ ok: true });
  });
});

describe("assertCreateOwner — admin / moderator bypass", () => {
  it("admin can create with any owner", () => {
    const r = assertCreateOwner(directOwnership, adminCtx, { sellerId: "someone-else" });
    expect(r.ok).toBe(true);
  });
  it("moderator can create with any owner", () => {
    const r = assertCreateOwner(directOwnership, moderatorCtx, { sellerId: "someone-else" });
    expect(r.ok).toBe(true);
  });
});

describe("assertCreateOwner — direct ownership (seller)", () => {
  it("ok + injectOwner when payload omits ownerField", () => {
    const r = assertCreateOwner(directOwnership, sellerCtx, { title: "x" });
    expect(r).toEqual({ ok: true, injectOwner: "sellerId" });
  });
  it("ok when payload ownerField equals authenticated userId", () => {
    const r = assertCreateOwner(directOwnership, sellerCtx, { sellerId: "seller-A" });
    expect(r.ok).toBe(true);
  });
  it("FORBIDDEN when payload ownerField is a different user (cross-tenant create)", () => {
    const r = assertCreateOwner(directOwnership, sellerCtx, { sellerId: "seller-B" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("sellerId");
  });
  it("FORBIDDEN when anonymous (no userId) on a seller-scoped resource", () => {
    const r = assertCreateOwner(directOwnership, anonCtx, { title: "x" });
    expect(r.ok).toBe(false);
  });
});

describe("assertCreateOwner — relation-based ownership", () => {
  it("ok + relation hint when payload includes the relation field", () => {
    const r = assertCreateOwner(relationOwnership, sellerCtx, { listingId: "list-1" });
    expect(r.ok).toBe(true);
    if (r.ok && "injectOwner" in r) expect(r.injectOwner).toBe("__relation__");
  });
  it("FORBIDDEN when payload omits the relation field (cannot verify ownership)", () => {
    const r = assertCreateOwner(relationOwnership, sellerCtx, { note: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("listingId");
  });
});

// ── checkRowOwnership ───────────────────────────────────────

describe("checkRowOwnership — no ownership config", () => {
  it("always allowed (resource not seller-scoped)", () => {
    expect(checkRowOwnership(noOwnership, sellerCtx, { id: "1" })).toEqual({ allowed: true });
    expect(checkRowOwnership(noOwnership, anonCtx, null)).toEqual({ allowed: true });
  });
});

describe("checkRowOwnership — direct ownership", () => {
  it("allowed when row.ownerField === ctx.userId", () => {
    expect(checkRowOwnership(directOwnership, sellerCtx, { id: "1", sellerId: "seller-A" })).toEqual({ allowed: true });
  });
  it("not_owner when row.ownerField is a different user", () => {
    expect(checkRowOwnership(directOwnership, sellerCtx, { id: "1", sellerId: "seller-B" })).toEqual({ allowed: false, reason: "not_owner" });
  });
  it("not_owner when row.ownerField is null (unowned row, fail-closed)", () => {
    expect(checkRowOwnership(directOwnership, sellerCtx, { id: "1", sellerId: null })).toEqual({ allowed: false, reason: "not_owner" });
  });
  it("not_found when row is null", () => {
    expect(checkRowOwnership(directOwnership, sellerCtx, null)).toEqual({ allowed: false, reason: "not_found" });
  });
  it("admin bypasses (allowed even if not owner)", () => {
    expect(checkRowOwnership(directOwnership, adminCtx, { id: "1", sellerId: "seller-B" })).toEqual({ allowed: true });
  });
  it("moderator bypasses", () => {
    expect(checkRowOwnership(directOwnership, moderatorCtx, { id: "1", sellerId: "seller-B" })).toEqual({ allowed: true });
  });
  it("deny_all when anonymous", () => {
    expect(checkRowOwnership(directOwnership, anonCtx, { id: "1", sellerId: "seller-A" })).toEqual({ allowed: false, reason: "deny_all" });
  });
});

describe("checkRowOwnership — relation-based ownership", () => {
  it("allowed when resolvedOwner === ctx.userId", () => {
    expect(checkRowOwnership(relationOwnership, sellerCtx, { id: "1" }, "seller-A")).toEqual({ allowed: true });
  });
  it("not_owner when resolvedOwner is a different user", () => {
    expect(checkRowOwnership(relationOwnership, sellerCtx, { id: "1" }, "seller-B")).toEqual({ allowed: false, reason: "not_owner" });
  });
  it("not_owner when resolvedOwner is null (related row unowned)", () => {
    expect(checkRowOwnership(relationOwnership, sellerCtx, { id: "1" }, null)).toEqual({ allowed: false, reason: "not_owner" });
  });
  it("not_owner when resolvedOwner is undefined (caller did not resolve — fail-closed)", () => {
    expect(checkRowOwnership(relationOwnership, sellerCtx, { id: "1" }, undefined)).toEqual({ allowed: false, reason: "not_owner" });
  });
});

// ── DENY_ALL sentinel ───────────────────────────────────────

describe("DENY_ALL sentinel", () => {
  it("is a unique symbol", () => {
    expect(typeof DENY_ALL).toBe("symbol");
    expect(DENY_ALL).toBe(DENY_ALL);
  });
});

// ── Integration-style: the full Listing config is protected ──

describe("Listing resource config has PR-SC-00 ownership", () => {
  it("listingConfig.ownership.ownerField === 'sellerId'", async () => {
    const { listingConfig } = await import("@/lib/admin/resources/listing");
    expect(listingConfig.ownership).toBeDefined();
    expect(listingConfig.ownership?.ownerField).toBe("sellerId");
    expect(listingConfig.ownership?.moderatePermission).toBe("listing.moderate");
  });
  it("a seller querying listings gets a sellerId filter", async () => {
    const { listingConfig } = await import("@/lib/admin/resources/listing");
    const r = buildTenantWhere(listingConfig, sellerCtx);
    expect("denyAll" in r).toBe(false);
    if ("where" in r) {
      expect(r.where).toEqual({ sellerId: "seller-A" });
    }
  });
  it("admin querying listings gets no filter", async () => {
    const { listingConfig } = await import("@/lib/admin/resources/listing");
    const r = buildTenantWhere(listingConfig, adminCtx);
    expect(r).toEqual({ where: {} });
  });
});
