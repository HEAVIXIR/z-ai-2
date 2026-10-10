import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import { buildTenantWhere, type TenantAccessContext } from "@/lib/admin/tenant-scope";

/* ============================================================
   PR-SC-00 — Ownership config for 8 seller-scoped resources
   ------------------------------------------------------------
   STEP 11.48 Phase 1 — Add `ownership` to the 8 remaining
   seller-scoped resources so the Universal Resource API enforces
   row-level tenant isolation for non-admin / non-moderator users.

   Resources covered (1 existing + 8 new = 9 protected):
     1. listingConfig        — direct, sellerId (existing — baseline)
     2. offerConfig          — relation { listing.sellerId }
     3. buyRequestConfig     — direct, userId
     4. dealConfig           — direct, sellerId
     5. inspectionConfig     — direct, requestedBy
     6. transportConfig      — direct, requestedBy
     7. disputeConfig        — direct, openedBy
     8. rfqConfig            — direct, buyerId
     9. reviewConfig         — direct, authorId

   This test is a SOURCE-CODE + behavior contract. It loads each
   config and pins:
     (a) `ownership` is defined (the resource IS seller-scoped),
     (b) the ownerField / relation is the expected value
         (verified against prisma/schema.prisma field names),
     (c) `moderatePermission` is set (so moderators can cross-scope),
     (d) for direct ownership, buildTenantWhere threads the userId
         into the Prisma where clause as `{ [ownerField]: userId }`.
         for relation ownership, the where is nested as
         `{ [relation.field]: { [relation.ownerField]: userId } }`.

   No DB, no I/O — runs in CI.
   ============================================================ */

const sellerCtx: TenantAccessContext = {
  userId: "seller-A",
  isAdmin: false,
  hasModeratePerm: false,
};
const adminCtx: TenantAccessContext = {
  userId: "admin-1",
  isAdmin: true,
  hasModeratePerm: false,
};
const moderatorCtx: TenantAccessContext = {
  userId: "mod-1",
  isAdmin: false,
  hasModeratePerm: true,
};
const anonCtx: TenantAccessContext = {
  userId: null,
  isAdmin: false,
  hasModeratePerm: false,
};

// ── 1. listingConfig (existing baseline — proves the pattern) ──

describe("listingConfig (baseline) ownership", () => {
  it("declares direct ownership on sellerId with listing.moderate", async () => {
    const { listingConfig } = await import("@/lib/admin/resources/listing");
    expect(listingConfig.ownership).toBeDefined();
    expect(listingConfig.ownership?.ownerField).toBe("sellerId");
    expect(listingConfig.ownership?.moderatePermission).toBe("listing.moderate");
    expect(listingConfig.ownership?.relation).toBeUndefined();
  });
});

// ── 2. offerConfig — relation-based via listing.sellerId ──

describe("offerConfig ownership — relation-based (listing.sellerId)", () => {
  it("declares relation ownership via listing.sellerId with offer.update", async () => {
    const mod = await import("@/lib/admin/resources/marketplace-resources");
    expect(mod.offerConfig.ownership).toBeDefined();
    expect(mod.offerConfig.ownership?.ownerField).toBeUndefined();
    expect(mod.offerConfig.ownership?.relation).toEqual({
      field: "listing",
      ownerField: "sellerId",
    });
    expect(mod.offerConfig.ownership?.moderatePermission).toBe("offer.update");
  });

  it("non-admin seller gets a nested { listing: { sellerId } } where filter", async () => {
    const { offerConfig } = await import("@/lib/admin/resources/marketplace-resources");
    const r = buildTenantWhere(offerConfig, sellerCtx);
    expect("denyAll" in r).toBe(false);
    if ("where" in r) {
      expect(r.where).toEqual({ listing: { sellerId: "seller-A" } });
    }
  });

  it("admin sees all (no filter)", async () => {
    const { offerConfig } = await import("@/lib/admin/resources/marketplace-resources");
    expect(buildTenantWhere(offerConfig, adminCtx)).toEqual({ where: {} });
  });

  it("moderator with offer.update sees all (no filter)", async () => {
    const { offerConfig } = await import("@/lib/admin/resources/marketplace-resources");
    expect(buildTenantWhere(offerConfig, moderatorCtx)).toEqual({ where: {} });
  });

  it("anonymous → denyAll (fail-closed)", async () => {
    const { offerConfig } = await import("@/lib/admin/resources/marketplace-resources");
    expect("denyAll" in buildTenantWhere(offerConfig, anonCtx)).toBe(true);
  });
});

// ── 3. buyRequestConfig — direct, userId ──

describe("buyRequestConfig ownership — direct (userId)", () => {
  it("declares direct ownership on userId with request.manage", async () => {
    const { buyRequestConfig } = await import("@/lib/admin/resources/marketplace-resources");
    expect(buyRequestConfig.ownership).toBeDefined();
    expect(buyRequestConfig.ownership?.ownerField).toBe("userId");
    expect(buyRequestConfig.ownership?.moderatePermission).toBe("request.manage");
    expect(buyRequestConfig.ownership?.relation).toBeUndefined();
  });

  it("non-admin user gets { userId } where filter", async () => {
    const { buyRequestConfig } = await import("@/lib/admin/resources/marketplace-resources");
    const r = buildTenantWhere(buyRequestConfig, sellerCtx);
    expect("denyAll" in r).toBe(false);
    if ("where" in r) {
      expect(r.where).toEqual({ userId: "seller-A" });
    }
  });

  it("admin sees all (no filter)", async () => {
    const { buyRequestConfig } = await import("@/lib/admin/resources/marketplace-resources");
    expect(buildTenantWhere(buyRequestConfig, adminCtx)).toEqual({ where: {} });
  });

  it("anonymous → denyAll (fail-closed)", async () => {
    const { buyRequestConfig } = await import("@/lib/admin/resources/marketplace-resources");
    expect("denyAll" in buildTenantWhere(buyRequestConfig, anonCtx)).toBe(true);
  });
});

// ── 4. dealConfig — direct, sellerId ──

describe("dealConfig ownership — direct (sellerId)", () => {
  it("declares direct ownership on sellerId with deal.manage", async () => {
    const { dealConfig } = await import("@/lib/admin/resources/marketplace-resources");
    expect(dealConfig.ownership).toBeDefined();
    expect(dealConfig.ownership?.ownerField).toBe("sellerId");
    expect(dealConfig.ownership?.moderatePermission).toBe("deal.manage");
    expect(dealConfig.ownership?.relation).toBeUndefined();
  });

  it("non-admin seller gets { sellerId } where filter", async () => {
    const { dealConfig } = await import("@/lib/admin/resources/marketplace-resources");
    const r = buildTenantWhere(dealConfig, sellerCtx);
    expect("denyAll" in r).toBe(false);
    if ("where" in r) {
      expect(r.where).toEqual({ sellerId: "seller-A" });
    }
  });

  it("admin sees all (no filter)", async () => {
    const { dealConfig } = await import("@/lib/admin/resources/marketplace-resources");
    expect(buildTenantWhere(dealConfig, adminCtx)).toEqual({ where: {} });
  });

  it("anonymous → denyAll (fail-closed)", async () => {
    const { dealConfig } = await import("@/lib/admin/resources/marketplace-resources");
    expect("denyAll" in buildTenantWhere(dealConfig, anonCtx)).toBe(true);
  });
});

// ── 5. inspectionConfig — direct, requestedBy ──

describe("inspectionConfig ownership — direct (requestedBy)", () => {
  it("declares direct ownership on requestedBy with inspection.manage", async () => {
    const { inspectionConfig } = await import("@/lib/admin/resources/marketplace-resources");
    expect(inspectionConfig.ownership).toBeDefined();
    expect(inspectionConfig.ownership?.ownerField).toBe("requestedBy");
    expect(inspectionConfig.ownership?.moderatePermission).toBe("inspection.manage");
    expect(inspectionConfig.ownership?.relation).toBeUndefined();
  });

  it("non-admin user gets { requestedBy } where filter", async () => {
    const { inspectionConfig } = await import("@/lib/admin/resources/marketplace-resources");
    const r = buildTenantWhere(inspectionConfig, sellerCtx);
    expect("denyAll" in r).toBe(false);
    if ("where" in r) {
      expect(r.where).toEqual({ requestedBy: "seller-A" });
    }
  });

  it("admin sees all (no filter)", async () => {
    const { inspectionConfig } = await import("@/lib/admin/resources/marketplace-resources");
    expect(buildTenantWhere(inspectionConfig, adminCtx)).toEqual({ where: {} });
  });

  it("anonymous → denyAll (fail-closed)", async () => {
    const { inspectionConfig } = await import("@/lib/admin/resources/marketplace-resources");
    expect("denyAll" in buildTenantWhere(inspectionConfig, anonCtx)).toBe(true);
  });
});

// ── 6. transportConfig — direct, requestedBy ──

describe("transportConfig ownership — direct (requestedBy)", () => {
  it("declares direct ownership on requestedBy with transport.manage", async () => {
    const { transportConfig } = await import("@/lib/admin/resources/marketplace-resources");
    expect(transportConfig.ownership).toBeDefined();
    expect(transportConfig.ownership?.ownerField).toBe("requestedBy");
    expect(transportConfig.ownership?.moderatePermission).toBe("transport.manage");
    expect(transportConfig.ownership?.relation).toBeUndefined();
  });

  it("non-admin user gets { requestedBy } where filter", async () => {
    const { transportConfig } = await import("@/lib/admin/resources/marketplace-resources");
    const r = buildTenantWhere(transportConfig, sellerCtx);
    expect("denyAll" in r).toBe(false);
    if ("where" in r) {
      expect(r.where).toEqual({ requestedBy: "seller-A" });
    }
  });

  it("admin sees all (no filter)", async () => {
    const { transportConfig } = await import("@/lib/admin/resources/marketplace-resources");
    expect(buildTenantWhere(transportConfig, adminCtx)).toEqual({ where: {} });
  });

  it("anonymous → denyAll (fail-closed)", async () => {
    const { transportConfig } = await import("@/lib/admin/resources/marketplace-resources");
    expect("denyAll" in buildTenantWhere(transportConfig, anonCtx)).toBe(true);
  });
});

// ── 7. disputeConfig — direct, openedBy ──

describe("disputeConfig ownership — direct (openedBy)", () => {
  it("declares direct ownership on openedBy with dispute.manage", async () => {
    const { disputeConfig } = await import("@/lib/admin/resources/marketplace-resources");
    expect(disputeConfig.ownership).toBeDefined();
    expect(disputeConfig.ownership?.ownerField).toBe("openedBy");
    expect(disputeConfig.ownership?.moderatePermission).toBe("dispute.manage");
    expect(disputeConfig.ownership?.relation).toBeUndefined();
  });

  it("non-admin user gets { openedBy } where filter", async () => {
    const { disputeConfig } = await import("@/lib/admin/resources/marketplace-resources");
    const r = buildTenantWhere(disputeConfig, sellerCtx);
    expect("denyAll" in r).toBe(false);
    if ("where" in r) {
      expect(r.where).toEqual({ openedBy: "seller-A" });
    }
  });

  it("admin sees all (no filter)", async () => {
    const { disputeConfig } = await import("@/lib/admin/resources/marketplace-resources");
    expect(buildTenantWhere(disputeConfig, adminCtx)).toEqual({ where: {} });
  });

  it("anonymous → denyAll (fail-closed)", async () => {
    const { disputeConfig } = await import("@/lib/admin/resources/marketplace-resources");
    expect("denyAll" in buildTenantWhere(disputeConfig, anonCtx)).toBe(true);
  });
});

// ── 8. rfqConfig — direct, buyerId ──

describe("rfqConfig ownership — direct (buyerId)", () => {
  it("declares direct ownership on buyerId with rfq.manage", async () => {
    const { rfqConfig } = await import("@/lib/admin/resources/marketplace-resources");
    expect(rfqConfig.ownership).toBeDefined();
    expect(rfqConfig.ownership?.ownerField).toBe("buyerId");
    expect(rfqConfig.ownership?.moderatePermission).toBe("rfq.manage");
    expect(rfqConfig.ownership?.relation).toBeUndefined();
  });

  it("non-admin user gets { buyerId } where filter", async () => {
    const { rfqConfig } = await import("@/lib/admin/resources/marketplace-resources");
    const r = buildTenantWhere(rfqConfig, sellerCtx);
    expect("denyAll" in r).toBe(false);
    if ("where" in r) {
      expect(r.where).toEqual({ buyerId: "seller-A" });
    }
  });

  it("admin sees all (no filter)", async () => {
    const { rfqConfig } = await import("@/lib/admin/resources/marketplace-resources");
    expect(buildTenantWhere(rfqConfig, adminCtx)).toEqual({ where: {} });
  });

  it("anonymous → denyAll (fail-closed)", async () => {
    const { rfqConfig } = await import("@/lib/admin/resources/marketplace-resources");
    expect("denyAll" in buildTenantWhere(rfqConfig, anonCtx)).toBe(true);
  });
});

// ── 9. reviewConfig — direct, authorId ──

describe("reviewConfig ownership — direct (authorId)", () => {
  it("declares direct ownership on authorId with review.moderate", async () => {
    const { reviewConfig } = await import("@/lib/admin/resources/store-resources");
    expect(reviewConfig.ownership).toBeDefined();
    expect(reviewConfig.ownership?.ownerField).toBe("authorId");
    expect(reviewConfig.ownership?.moderatePermission).toBe("review.moderate");
    expect(reviewConfig.ownership?.relation).toBeUndefined();
  });

  it("non-admin author gets { authorId } where filter", async () => {
    const { reviewConfig } = await import("@/lib/admin/resources/store-resources");
    const r = buildTenantWhere(reviewConfig, sellerCtx);
    expect("denyAll" in r).toBe(false);
    if ("where" in r) {
      expect(r.where).toEqual({ authorId: "seller-A" });
    }
  });

  it("admin sees all (no filter)", async () => {
    const { reviewConfig } = await import("@/lib/admin/resources/store-resources");
    expect(buildTenantWhere(reviewConfig, adminCtx)).toEqual({ where: {} });
  });

  it("anonymous → denyAll (fail-closed)", async () => {
    const { reviewConfig } = await import("@/lib/admin/resources/store-resources");
    expect("denyAll" in buildTenantWhere(reviewConfig, anonCtx)).toBe(true);
  });
});

// ── 10. Source-code sanity: each config object literal contains `ownership:` ──
//      This protects against accidental deletion: if the field is removed,
//      the source file no longer contains the literal pattern at all.

describe("source-code presence — each config file contains the ownership literal", () => {
  it("marketplace-resources.ts declares ownership for all 7 new resources", () => {
    const src = fs.readFileSync(
      nodePath.join(process.cwd(), "src/lib/admin/resources/marketplace-resources.ts"),
      "utf8",
    );
    // Sanity: the file is non-empty.
    expect(src.length).toBeGreaterThan(0);

    // For each of the 7 new resources, expect `ownership:` to appear
    // at least once between the config's `export const X` line and
    // its closing `};`. We approximate by counting — each resource
    // declares ownership exactly once, so 7 occurrences of `ownership:`
    // following the 7 config exports is the lower bound.
    const ownershipMatches = src.match(/^  ownership: \{/gm) ?? [];
    expect(ownershipMatches.length).toBeGreaterThanOrEqual(7);

    // Spot-check that each resource key is followed (within ~3 lines) by an
    // `ownership:` literal. We do this by extracting the body of each config
    // export and asserting the literal exists inside it.
    const configNames = [
      "dealConfig",
      "rfqConfig",
      "offerConfig",
      "inspectionConfig",
      "transportConfig",
      "disputeConfig",
      "buyRequestConfig",
    ];
    for (const name of configNames) {
      const re = new RegExp(`export const ${name}:[\\s\\S]*?\\n\\};`);
      const m = src.match(re);
      expect(m, `could not locate export for ${name}`).not.toBeNull();
      expect(m?.[0].includes("ownership:"), `${name} is missing ownership:`).toBe(true);
    }
  });

  it("store-resources.ts declares ownership for reviewConfig", () => {
    const src = fs.readFileSync(
      nodePath.join(process.cwd(), "src/lib/admin/resources/store-resources.ts"),
      "utf8",
    );
    const m = src.match(/export const reviewConfig:[\s\S]*?\n};/);
    expect(m, "could not locate export for reviewConfig").not.toBeNull();
    expect(m?.[0].includes("ownership:"), "reviewConfig is missing ownership:").toBe(true);
  });
});

// ── 11. Schema-level cross-check: owner fields exist on the models ──
//       Confirms that the ownerField / relation ownerField names declared
//       in the configs correspond to REAL columns / relations in
//       prisma/schema.prisma (so the Prisma where clause won't error at
//       runtime). This catches typos like `userId` → `userID` and
//       protects against silent contract drift.

const SCHEMA_TEXT = fs.readFileSync(
  nodePath.join(process.cwd(), "prisma/schema.prisma"),
  "utf8",
);

describe("schema cross-check — declared owner fields exist in prisma schema", () => {
  /** Extract the body of a `model Foo { ... }` block (non-nested). */
  function modelBody(name: string): string {
    // Prisma model blocks are flat — no nested braces inside scalar/field
    // definitions except for `@@index`/`@@unique` arg lists, which we can
    // safely ignore for our purposes.
    const re = new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, "m");
    const m = SCHEMA_TEXT.match(re);
    if (!m) throw new Error(`model ${name} not found in prisma schema`);
    return m[1];
  }

  it("Listing has sellerId (the relation-target owner for offers)", () => {
    expect(modelBody("Listing")).toMatch(/^\s*sellerId\s+String/m);
  });

  it("ListingOffer has a `listing` relation pointing to Listing", () => {
    expect(modelBody("ListingOffer")).toMatch(/^\s*listing\s+Listing\s/m);
  });

  it("BuyRequest has userId", () => {
    expect(modelBody("BuyRequest")).toMatch(/^\s*userId\s+String/m);
  });

  it("Deal has sellerId", () => {
    expect(modelBody("Deal")).toMatch(/^\s*sellerId\s+String/m);
  });

  it("Inspection has requestedBy", () => {
    expect(modelBody("Inspection")).toMatch(/^\s*requestedBy\s+String/m);
  });

  it("TransportRequest has requestedBy", () => {
    expect(modelBody("TransportRequest")).toMatch(/^\s*requestedBy\s+String/m);
  });

  it("Dispute has openedBy", () => {
    expect(modelBody("Dispute")).toMatch(/^\s*openedBy\s+String/m);
  });

  it("RFQ has buyerId", () => {
    expect(modelBody("RFQ")).toMatch(/^\s*buyerId\s+String/m);
  });

  it("Review has authorId", () => {
    expect(modelBody("Review")).toMatch(/^\s*authorId\s+String/m);
  });
});
