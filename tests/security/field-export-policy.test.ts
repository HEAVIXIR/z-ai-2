/**
 * HEAVIX — Security Tests: Field Export Policy on REAL production configs
 * ----------------------------------------------------------------------
 * Behavioral tests that import REAL production resource configs
 * (`paymentConfig`, `userConfig`) and verify that the field-level
 * `permissions.export` declarations are ACTUALLY present and that
 * `filterExportableFieldsAsync` strips unauthorized fields.
 *
 * This is the production-activation test that closes the STEP 11.7-SEC
 * gap: "Field EXPORT function works in unit tests, but ZERO production
 * configs declare field-level permissions.export → never activated."
 *
 * STEP 11.11 added `permissions.export` to:
 *   - payment.trackingCode (AdminColumn + AdminField) → 'payment.manage'
 *   - payment.idempotencyKey (AdminField) → 'payment.manage'
 *   - payment.type (AdminColumn) → 'payment.manage'  ← FIRST visible column
 *   - user.passwordHash (AdminField) → 'system.manage'
 *
 * These tests prove the declarations are present and that the filter
 * ACTUALLY strips the fields for users lacking the permission.
 *
 * Runs under `bun run test:security`
 * (config: vitest.security.config.ts → includes tests/security/**).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

/* ── Mock authorization ───────────────────────────────────────────
   Only `can` is needed by filterExportableFieldsAsync.
   ============================================================ */

const canMock = vi.fn<(userId: string | null, permission: string) => Promise<boolean>>();

vi.mock("@/lib/authorization", () => ({
  get can() {
    return canMock;
  },
}));

// Import REAL production configs + REAL filter function.
const { paymentConfig } = await import("@/lib/admin/resources/store-resources");
const { userConfig } = await import("@/lib/admin/resources/user");
const { filterExportableFieldsAsync, buildExportPermissionMap } =
  await import("@/lib/admin/field-policy");

beforeEach(() => {
  canMock.mockReset();
  canMock.mockResolvedValue(false);
});

/* ────────────────────────────────────────────────────────────────
   Production config declarations (STEP 11.11)
   ──────────────────────────────────────────────────────────────── */

describe("Production config — permissions.export declarations", () => {
  it("payment.trackingCode AdminField declares export: 'payment.manage'", () => {
    const field = paymentConfig.fields.find(f => f.key === "trackingCode");
    expect(field).toBeDefined();
    expect(field!.permissions?.export).toBe("payment.manage");
  });

  it("payment.trackingCode AdminColumn declares export: 'payment.manage'", () => {
    const col = paymentConfig.columns.find(c => c.key === "trackingCode");
    expect(col).toBeDefined();
    expect(col!.permissions?.export).toBe("payment.manage");
  });

  it("payment.idempotencyKey AdminField declares export: 'payment.manage'", () => {
    const field = paymentConfig.fields.find(f => f.key === "idempotencyKey");
    expect(field).toBeDefined();
    expect(field!.permissions?.export).toBe("payment.manage");
  });

  it("payment.type AdminColumn declares export: 'payment.manage' (FIRST visible column)", () => {
    // STEP 11.11: `type` is the FIRST visible AdminColumn in production
    // to declare a field-level export policy. This is what makes the
    // export policy CAUSALLY VERIFIABLE at the HTTP level.
    const col = paymentConfig.columns.find(c => c.key === "type");
    expect(col).toBeDefined();
    expect(col!.permissions?.export).toBe("payment.manage");
  });

  it("user.passwordHash AdminField declares export: 'system.manage'", () => {
    const field = userConfig.fields.find(f => f.key === "passwordHash");
    expect(field).toBeDefined();
    expect(field!.permissions?.export).toBe("system.manage");
  });
});

/* ────────────────────────────────────────────────────────────────
   Causal behavior — filterExportableFieldsAsync on REAL configs
   ──────────────────────────────────────────────────────────────── */

describe("Causal export behavior on production paymentConfig", () => {
  const samplePayments = [
    {
      id: "pay-1",
      amount: 1000,
      currency: "IRR",
      type: "ORDER_PAYMENT",
      status: "PAID",
      trackingCode: "TC-001",
      providerReference: "PR-001",
      paidAt: new Date(),
      createdAt: new Date(),
      idempotencyKey: "ID-001",
    },
  ];

  it("buildExportPermissionMap finds >= 3 export-restricted fields in paymentConfig", () => {
    const map = buildExportPermissionMap(paymentConfig);
    // trackingCode (column+field), idempotencyKey (field), type (column)
    expect(map.size).toBeGreaterThanOrEqual(3);
    expect(map.get("trackingCode")).toBe("payment.manage");
    expect(map.get("idempotencyKey")).toBe("payment.manage");
    expect(map.get("type")).toBe("payment.manage");
  });

  it("user WITH payment.manage: ALL export-restricted fields present", async () => {
    canMock.mockImplementation(async (_uid, perm) =>
      perm === "payment.read" || perm === "payment.manage");

    const result = await filterExportableFieldsAsync(paymentConfig, samplePayments, "admin-user");

    expect(result[0].trackingCode).toBe("TC-001");
    expect(result[0].idempotencyKey).toBe("ID-001");
    expect(result[0].type).toBe("ORDER_PAYMENT");
  });

  it("user WITHOUT payment.manage: export-restricted fields ABSENT", async () => {
    // User has payment.read but NOT payment.manage → can READ these fields
    // in List/Detail, but CANNOT export them.
    canMock.mockImplementation(async (_uid, perm) => perm === "payment.read");

    const result = await filterExportableFieldsAsync(paymentConfig, samplePayments, "user-B");

    expect(result[0].trackingCode).toBeUndefined();
    expect(result[0].idempotencyKey).toBeUndefined();
    expect(result[0].type).toBeUndefined();
    // amount has no export perm — always exported
    expect(result[0].amount).toBe(1000);
  });
});

/* ────────────────────────────────────────────────────────────────
   passwordHash — defense in depth
   ──────────────────────────────────────────────────────────────── */

describe("user.passwordHash — export policy defense in depth", () => {
  it("passwordHash is NOT in userConfig.columns (not projected, never exported)", () => {
    // passwordHash is an AdminField only — it's not in columns, so
    // applyFieldPolicy (which builds the Prisma select from columns)
    // never fetches it from the DB. This is the PRIMARY defense.
    const col = userConfig.columns.find(c => c.key === "passwordHash");
    expect(col).toBeUndefined();
  });

  it("passwordHash AdminField declares export: 'system.manage' (defense in depth)", () => {
    // Even if a future bug accidentally projects passwordHash into an
    // export payload, filterExportableFieldsAsync will strip it for
    // any user lacking system.manage (which is everyone except a
    // hypothetical super-admin). This is defense in depth.
    const field = userConfig.fields.find(f => f.key === "passwordHash");
    expect(field?.permissions?.export).toBe("system.manage");
  });

  it("user WITHOUT system.manage: passwordHash would be stripped from export", async () => {
    canMock.mockResolvedValue(false); // no permissions at all

    const sampleUser = [{ id: "u1", firstName: "Test", passwordHash: "$2a$hash" }];
    const result = await filterExportableFieldsAsync(userConfig, sampleUser, "user-X");

    expect(result[0].passwordHash).toBeUndefined();
  });
});

/* ────────────────────────────────────────────────────────────────
   Causal differential test (THE KEY EVIDENCE)
   ──────────────────────────────────────────────────────────────── */

describe("Causal differential — same user, only permission changes", () => {
  it("GRANT payment.manage → type field APPEARS in export; DENY → type DISAPPEARS", async () => {
    const samplePayments = [
      { id: "p1", amount: 1000, type: "ORDER_PAYMENT", trackingCode: "TC", idempotencyKey: "ID" },
    ];

    // Case 1: DENY payment.manage
    canMock.mockImplementation(async (_uid, perm) => perm === "payment.read");
    const denied = await filterExportableFieldsAsync(paymentConfig, samplePayments, "user-B");
    expect(denied[0].type).toBeUndefined();

    // Case 2: GRANT payment.manage to the SAME user
    canMock.mockImplementation(async (_uid, perm) =>
      perm === "payment.read" || perm === "payment.manage");
    const granted = await filterExportableFieldsAsync(paymentConfig, samplePayments, "user-B");
    expect(granted[0].type).toBe("ORDER_PAYMENT");

    // Same field, same dataset, same user — only difference is the
    // permissions.export grant. This PROVES permissions.export is CAUSAL.
  });
});
