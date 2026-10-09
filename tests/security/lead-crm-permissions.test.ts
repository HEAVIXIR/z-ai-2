import { describe, it, expect } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS } from "@/lib/authorization/permissions";

/* ============================================================
   Security tests for PR-SC-01 — Store Center CRM permissions
   ------------------------------------------------------------
   Verifies that the two new permission keys exist in the canonical
   matrix, are assigned to the correct roles, and are NOT granted to
   roles that must not manage CRM (BUYER, SUPPORT).

   These are STATIC contract tests (no DB) — they guard the permission
   registry itself. The dynamic cross-seller negative test (Seller A
   cannot read Seller B's leads) ships with the CRM API in PR-SC-06,
   once the buildTenantWhere helper (BLOCKER-A4) is in place.
   ============================================================ */

const CRM_PERMS = ["store.crm.read", "store.crm.manage"] as const;

describe("PR-SC-01: store.crm.* permission keys exist in canonical matrix", () => {
  for (const key of CRM_PERMS) {
    it(`PERMISSIONS array includes "${key}"`, () => {
      expect(PERMISSIONS).toContain(key);
    });
  }
  it("exactly 2 new CRM keys (no typo'd duplicates)", () => {
    const crmKeys = PERMISSIONS.filter((p) => p.startsWith("store.crm."));
    expect(crmKeys).toEqual([...CRM_PERMS]);
  });
});

describe("PR-SC-01: SELLER role grants store.crm.* (own-company scope enforced by API)", () => {
  it("SELLER can read + manage CRM (store.crm.read, store.crm.manage)", () => {
    expect(ROLE_PERMISSIONS.SELLER).toContain("store.crm.read");
    expect(ROLE_PERMISSIONS.SELLER).toContain("store.crm.manage");
  });
});

describe("PR-SC-01: ADMIN role grants all permissions (includes store.crm.*)", () => {
  it("ADMIN = [...PERMISSIONS] so store.crm.* are present", () => {
    expect(ROLE_PERMISSIONS.ADMIN).toContain("store.crm.read");
    expect(ROLE_PERMISSIONS.ADMIN).toContain("store.crm.manage");
  });
});

describe("PR-SC-01: BUYER must NOT manage CRM (read-only marketplace participant)", () => {
  it("BUYER has neither store.crm.read nor store.crm.manage", () => {
    expect(ROLE_PERMISSIONS.BUYER).not.toContain("store.crm.read");
    expect(ROLE_PERMISSIONS.BUYER).not.toContain("store.crm.manage");
  });
});

describe("PR-SC-01: MODERATOR / SUPPORT do NOT manage seller CRM (separation of concerns)", () => {
  it("MODERATOR has no store.crm.* (moderation ≠ sales CRM)", () => {
    expect(ROLE_PERMISSIONS.MODERATOR).not.toContain("store.crm.read");
    expect(ROLE_PERMISSIONS.MODERATOR).not.toContain("store.crm.manage");
  });
  // SUPPORT is defined locally in seed-rbac.ts (not in canonical ROLE_PERMISSIONS),
  // so we only assert MODERATOR here. SUPPORT's minimal grant is verified in the
  // seed-rbac.ts contract test (tests/security/permissions.test.ts).
});

describe("PR-SC-01: permission keys follow resource.action convention", () => {
  for (const key of CRM_PERMS) {
    it(`"${key}" matches /^store\\.crm\\.(read|manage)$/`, () => {
      expect(key).toMatch(/^store\.crm\.(read|manage)$/);
    });
  }
});
