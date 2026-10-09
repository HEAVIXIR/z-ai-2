/**
 * HEAVIX — Security Tests: Field Policy (STEP 11.6 Phase B.1 + B.2)
 * ----------------------------------------------------------------
 * Behavioral tests for `filterReadableFieldsAsync` and
 * `filterExportableFieldsAsync` in `src/lib/admin/field-policy.ts`.
 *
 * These tests verify the UNIFIED PERMISSION MAP (config.fields +
 * config.columns) correctly strips fields the user lacks permission
 * to read or export. The STEP 11.5 audit found that the previous
 * implementation only walked `config.columns` (which had ZERO
 * permission declarations in production) — sensitive fields like
 * `payment.trackingCode` were silently bypassed.
 *
 * Test strategy:
 *   - Mock `@/lib/authorization` (only `can`) so we can control
 *     per-user permission decisions.
 *   - Import REAL `filterReadableFieldsAsync` and
 *     `filterExportableFieldsAsync` — the functions under test are
 *     real, only their permission-check dependency is mocked.
 *   - Use a synthetic resource config that mirrors the shape of
 *     production configs (AdminField + AdminColumn with permissions).
 *
 * Runs under `bun run test:security`
 * (config: vitest.security.config.ts → includes tests/security/**).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AdminResourceConfig } from "@/lib/admin/types";

/* ── Mock the authorization module ────────────────────────────────
   `can(userId, permission)` is the ONLY function used by
   filterReadableFieldsAsync / filterExportableFieldsAsync. We mock
   it with a per-test implementation so each test can assert what
   happens when the user has / lacks specific permissions.
   ============================================================ */

const canMock = vi.fn<(userId: string | null, permission: string) => Promise<boolean>>();

vi.mock("@/lib/authorization", () => ({
  get can() {
    return canMock;
  },
}));

// Import AFTER vi.mock so the field-policy module picks up the mock.
const { filterReadableFieldsAsync, filterExportableFieldsAsync, buildReadPermissionMap, buildExportPermissionMap } =
  await import("@/lib/admin/field-policy");

beforeEach(() => {
  canMock.mockReset();
  // Default: deny everything. Individual tests opt in by granting.
  canMock.mockResolvedValue(false);
});

/* ── Synthetic test config ────────────────────────────────────────
   Mirrors the shape of production paymentConfig:
     - trackingCode: AdminField with permissions.read
     - idempotencyKey: AdminField with permissions.read + permissions.export
     - amount: no field-level permissions (always visible)
   This lets us test ALL the interesting cases without depending on
   production config drift.
   ============================================================ */

const testConfig: AdminResourceConfig = {
  key: "payments",
  titleFa: "تست",
  model: "payment",
  database: "main",
  apiBase: "/api/admin/resources/payments",
  adminPath: "/admin/resources/payments",
  permissions: { read: "payment.read" },
  columns: [
    { key: "amount", label: "Amount", type: "currency" },
    { key: "trackingCode", label: "Tracking", type: "text", visible: false,
      permissions: { read: "payment.read" } },
    { key: "idempotencyKey", label: "Idempotency", type: "text", visible: false,
      permissions: { export: "payment.manage" } },
  ],
  fields: [
    { key: "amount", label: "Amount", type: "currency" },
    { key: "trackingCode", label: "Tracking", type: "text",
      permissions: { read: "payment.read" } },
    { key: "idempotencyKey", label: "Idempotency", type: "text",
      permissions: { read: "payment.manage", export: "payment.manage" } },
  ],
};

const sampleItems = [
  { id: "p1", amount: 1000, trackingCode: "TC-001", idempotencyKey: "ID-001" },
  { id: "p2", amount: 2000, trackingCode: "TC-002", idempotencyKey: "ID-002" },
];

/* ────────────────────────────────────────────────────────────────
   READ policy tests (7 tests)
   ──────────────────────────────────────────────────────────────── */

describe("Field READ policy — filterReadableFieldsAsync", () => {
  it("authorized user sees restricted fields (payment.read granted)", async () => {
    canMock.mockImplementation(async (_uid, perm) => perm === "payment.read");

    const result = await filterReadableFieldsAsync(testConfig, sampleItems, "user-A");

    expect(result).toHaveLength(2);
    expect(result[0].trackingCode).toBe("TC-001");
    expect(result[0].idempotencyKey).toBeUndefined(); // user-A lacks payment.manage
    expect(result[1].trackingCode).toBe("TC-002");
  });

  it("unauthorized user does NOT see trackingCode (payment.read denied)", async () => {
    canMock.mockImplementation(async (_uid, perm) => perm === "payment.read" ? false : true);

    const result = await filterReadableFieldsAsync(testConfig, sampleItems, "user-B");

    expect(result).toHaveLength(2);
    expect(result[0].trackingCode).toBeUndefined();
    expect(result[1].trackingCode).toBeUndefined();
    // amount is unrestricted — always visible
    expect(result[0].amount).toBe(1000);
  });

  it("user with no perms at all sees only unrestricted fields", async () => {
    canMock.mockResolvedValue(false);

    const result = await filterReadableFieldsAsync(testConfig, sampleItems, "user-C");

    expect(result).toHaveLength(2);
    expect(result[0].trackingCode).toBeUndefined();
    expect(result[0].idempotencyKey).toBeUndefined();
    expect(result[0].amount).toBe(1000); // unrestricted
  });

  it("fields without permissions are NEVER stripped (even for null user)", async () => {
    canMock.mockResolvedValue(false);

    const result = await filterReadableFieldsAsync(testConfig, sampleItems, null);

    expect(result[0].amount).toBe(1000);
  });

  it("config with no field-level permissions returns items unchanged (fast path)", async () => {
    const noPermsConfig: AdminResourceConfig = {
      ...testConfig,
      columns: [{ key: "amount", label: "Amount", type: "currency" }],
      fields: [{ key: "amount", label: "Amount", type: "currency" }],
    };

    const result = await filterReadableFieldsAsync(noPermsConfig, sampleItems, "user-X");

    // Fast path: no per-item work, items returned as-is
    expect(result).toBe(sampleItems);
  });

  it("AdminField takes precedence over AdminColumn on permission collision", async () => {
    // Set up: column says permissions.read = "payment.read", field says
    // permissions.read = "payment.manage". User has payment.read but NOT
    // payment.manage. AdminField should win → field stripped.
    const collisionConfig: AdminResourceConfig = {
      ...testConfig,
      columns: [
        { key: "amount", label: "Amount", type: "currency" },
        { key: "trackingCode", label: "Tracking", type: "text",
          permissions: { read: "payment.read" } },
      ],
      fields: [
        { key: "amount", label: "Amount", type: "currency" },
        { key: "trackingCode", label: "Tracking", type: "text",
          permissions: { read: "payment.manage" } },
      ],
    };
    canMock.mockImplementation(async (_uid, perm) => perm === "payment.read");

    const result = await filterReadableFieldsAsync(collisionConfig, sampleItems, "user-A");

    // AdminField said "payment.manage" — user lacks it → stripped
    expect(result[0].trackingCode).toBeUndefined();
  });

  it("handles multiple items independently (per-strip works)", async () => {
    canMock.mockImplementation(async (_uid, perm) => perm === "payment.read");

    const manyItems = [
      { id: "p1", amount: 1, trackingCode: "A", idempotencyKey: "x" },
      { id: "p2", amount: 2, trackingCode: "B", idempotencyKey: "y" },
      { id: "p3", amount: 3, trackingCode: "C", idempotencyKey: "z" },
    ];

    const result = await filterReadableFieldsAsync(testConfig, manyItems, "user-A");

    expect(result).toHaveLength(3);
    expect(result.every(r => r.trackingCode !== undefined)).toBe(true);
    expect(result.every(r => r.idempotencyKey === undefined)).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────
   EXPORT policy tests (4 tests)
   ──────────────────────────────────────────────────────────────── */

describe("Field EXPORT policy — filterExportableFieldsAsync", () => {
  it("authorized user exports restricted fields (payment.manage granted)", async () => {
    canMock.mockImplementation(async (_uid, perm) =>
      perm === "payment.read" || perm === "payment.manage");

    const result = await filterExportableFieldsAsync(testConfig, sampleItems, "user-admin");

    expect(result[0].idempotencyKey).toBe("ID-001");
    expect(result[1].idempotencyKey).toBe("ID-002");
  });

  it("unauthorized user does NOT export idempotencyKey (payment.manage denied)", async () => {
    canMock.mockImplementation(async (_uid, perm) => perm === "payment.read");

    const result = await filterExportableFieldsAsync(testConfig, sampleItems, "user-B");

    expect(result[0].idempotencyKey).toBeUndefined();
    expect(result[1].idempotencyKey).toBeUndefined();
    // amount has no export perm — always exported
    expect(result[0].amount).toBe(1000);
  });

  it("config with no export permissions returns items unchanged (fast path)", async () => {
    const noExportConfig: AdminResourceConfig = {
      ...testConfig,
      columns: [{ key: "amount", label: "Amount", type: "currency" }],
      fields: [{ key: "amount", label: "Amount", type: "currency" }],
    };

    const result = await filterExportableFieldsAsync(noExportConfig, sampleItems, "user-X");

    expect(result).toBe(sampleItems);
  });

  it("EXPORT policy is INDEPENDENT of READ policy (same user, different result)", async () => {
    // User has payment.read (can READ trackingCode) but NOT payment.manage
    // (cannot EXPORT idempotencyKey). This proves READ ≠ EXPORT.
    canMock.mockImplementation(async (_uid, perm) => perm === "payment.read");

    const readResult = await filterReadableFieldsAsync(testConfig, sampleItems, "user-B");
    const exportResult = await filterExportableFieldsAsync(testConfig, sampleItems, "user-B");

    // READ: trackingCode visible (user has payment.read)
    expect(readResult[0].trackingCode).toBe("TC-001");
    // EXPORT: idempotencyKey stripped (user lacks payment.manage)
    expect(exportResult[0].idempotencyKey).toBeUndefined();
  });
});

/* ────────────────────────────────────────────────────────────────
   Unified permission map tests (2 tests)
   ──────────────────────────────────────────────────────────────── */

describe("Unified permission map — buildReadPermissionMap + buildExportPermissionMap", () => {
  it("buildReadPermissionMap walks BOTH columns and fields (AdminField wins on collision)", () => {
    const map = buildReadPermissionMap(testConfig);

    // From AdminColumn: trackingCode (payment.read), idempotencyKey (none on column)
    // From AdminField: trackingCode (payment.read), idempotencyKey (payment.manage)
    expect(map.get("trackingCode")).toBe("payment.read");
    expect(map.get("idempotencyKey")).toBe("payment.manage");
    // amount has no permission — not in map
    expect(map.has("amount")).toBe(false);
  });

  it("buildExportPermissionMap walks BOTH columns and fields", () => {
    const map = buildExportPermissionMap(testConfig);

    // idempotencyKey: column has export=payment.manage, field has export=payment.manage
    expect(map.get("idempotencyKey")).toBe("payment.manage");
    // trackingCode: no export permission declared anywhere
    expect(map.has("trackingCode")).toBe(false);
  });
});
