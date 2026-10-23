/**
 * HEAVIX — STEP 15.40 Phase B: RBAC Dual-Write + Role Shim Tests
 * ------------------------------------------------------------
 * Document: docs/phase3/RBAC-MIGRATION-DESIGN.md §11.2 (addendum §REVISION-5)
 *
 * 7 tests covering:
 *   1. Idempotency (mock): dual-write twice with same role → 1 UserRole row
 *   2. Error propagation (mock): two concurrent PATCHes serialize via mutex
 *   3. Error propagation (mock): tx.userRole.upsert throws → 500, logAudit NOT called
 *   4. Shim fallback: 0 UserRole + User.role=SELLER → SELLER; after backfill → SELLER
 *   5. DB-error: findMany throws → {BUYER, DB_ERROR}; shim returns BUYER (not legacy)
 *   6. Canonical-wins: ADMIN UserRole + User.role=BUYER → ADMIN
 *   7. No-authz-import guard (REVISION-7): role-shim NOT imported by authz modules
 *
 * NOTE (STEP 15.41): Tests 2 and 3 are MOCK-BASED error-propagation tests.
 * They do NOT prove real database transaction rollback or real concurrency
 * behavior. Real PostgreSQL evidence for C-1 (rollback) and C-2 (concurrency)
 * is provided by tests/integration/rbac-phase-b-real.test.ts, which runs
 * against postgres:17 in CI.
 *
 * Pattern source: tests/security/step-13.31-patch-txn.test.ts (mock-based, vi.mock)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

/* ============================================================
   Top-level mocks — shared across all test groups.
   vi.hoisted ensures spies exist before vi.mock factory runs.
   ============================================================ */

const spies = vi.hoisted(() => ({
  $transaction: vi.fn(),
  userUpdate: vi.fn(),
  userCreate: vi.fn(),
  userFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  userRoleFindMany: vi.fn(),
  userRoleDeleteMany: vi.fn(),
  userRoleUpsert: vi.fn(),
  roleFindUnique: vi.fn(),
  logAudit: vi.fn(),
  getCurrentUser: vi.fn(),
  hasPermission: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    role: { findUnique: spies.roleFindUnique },
    user: {
      findUnique: spies.userFindUnique,
      findFirst: spies.userFindFirst,
      update: spies.userUpdate,
      create: spies.userCreate,
    },
    userRole: {
      findMany: spies.userRoleFindMany,
      deleteMany: spies.userRoleDeleteMany,
      upsert: spies.userRoleUpsert,
    },
    $transaction: spies.$transaction,
  },
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: spies.getCurrentUser,
}));

vi.mock("@/lib/rbac", () => ({
  hasPermission: spies.hasPermission,
}));

vi.mock("@/lib/audit", () => ({
  logAudit: spies.logAudit,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

// Import AFTER vi.mock so modules pick up the mocked dependencies.
const { getUserPrimaryRoleWithStatus } = await import("@/lib/authorization/user-roles");
const { getUserRoleWithFallback } = await import("@/lib/authorization/role-shim");
const { PATCH } = await import("@/app/api/admin/users/[id]/route");

/* ── Helpers ── */

function makeReq(id: string, body: unknown): Request {
  return new Request(`http://localhost/api/admin/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  // Reset all mock state (calls + implementations).
  vi.resetAllMocks();

  // ── Defaults for PATCH route tests ──
  spies.getCurrentUser.mockResolvedValue({ id: "admin-1", firstName: "Admin" });
  spies.hasPermission.mockResolvedValue(true);
  spies.userFindUnique.mockResolvedValue({
    id: "user-123",
    role: "BUYER",
    email: "user@example.com",
    mobile: "1234567890",
    firstName: "User",
    lastName: "Example",
    status: "ACTIVE",
    companyName: null,
  });
  spies.userFindFirst.mockResolvedValue(null); // no email/mobile conflict
  spies.roleFindUnique.mockImplementation(async (args: any) => {
    // Map role key → roleId
    const key = args?.where?.key;
    if (key === "SELLER") return { id: "role-seller-id" };
    if (key === "ADMIN") return { id: "role-admin-id" };
    if (key === "BUYER") return { id: "role-buyer-id" };
    return { id: `role-${key?.toLowerCase()}-id` };
  });
  spies.userRoleFindMany.mockResolvedValue([]);
  spies.userRoleDeleteMany.mockResolvedValue({ count: 0 });
  spies.userRoleUpsert.mockResolvedValue({ id: "ur-1" });
  spies.userUpdate.mockImplementation(async (args: any) => ({
    id: "user-123",
    role: args.data.role ?? "BUYER",
    firstName: args.data.firstName ?? "User",
    lastName: args.data.lastName ?? "Example",
    email: args.data.email ?? "user@example.com",
    mobile: args.data.mobile ?? "1234567890",
    status: args.data.status ?? "ACTIVE",
    companyName: args.data.companyName ?? null,
    _count: { listings: 0, offers: 0, requests: 0 },
  }));
  spies.logAudit.mockResolvedValue(undefined);

  // Default $transaction: invoke callback with a mock tx whose methods
  // delegate to the same spies (so we can assert call counts).
  spies.$transaction.mockImplementation(async (cb: any) => {
    const mockTx = {
      user: { update: spies.userUpdate },
      userRole: {
        findMany: spies.userRoleFindMany,
        deleteMany: spies.userRoleDeleteMany,
        upsert: spies.userRoleUpsert,
      },
      // STEP 15.44-B: route.ts uses tx.$queryRaw for SELECT ... FOR UPDATE
      // (defense-in-depth row lock at TX start). Mock returns an empty row
      // list — the route never reads the result, it only acquires the lock.
      $queryRaw: vi.fn().mockResolvedValue([{ id: "user-123" }]),
    };
    return cb(mockTx);
  });
});

/* ============================================================
   Test 7 (REVISION-7): No-authz-import guard
   The shim file MUST NOT be imported by any authorization-path module.
   ============================================================ */

describe("[REVISION-7] No-authz-import guard for role-shim", () => {
  const ROOT = path.resolve(__dirname, "..", "..");
  const authzFiles = [
    "src/lib/authorization/index.ts",
    "src/lib/rbac.ts",
    "src/lib/rbac-legacy.ts",
    "src/lib/admin-guard.ts",
  ];

  it.each(authzFiles)("file %s does NOT import role-shim", (rel) => {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) return; // tolerate missing files gracefully
    const content = fs.readFileSync(full, "utf8");
    expect(content).not.toMatch(/from ['"]@\/lib\/authorization\/role-shim['"]/);
  });

  it("ripgrep returns 0 matches across all authz-path files", () => {
    // Run the exact command from REVISION-7 (using -l for listing matches)
    const files = authzFiles.map((f) => path.join(ROOT, f)).join(" ");
    const cmd = `rg -l "from '@/lib/authorization/role-shim'" ${files} 2>/dev/null; true`;
    const out = execSync(cmd, { encoding: "utf8" });
    // rg -l returns matching file paths; we expect ZERO matches.
    expect(out.trim()).toBe("");
  });
});

/* ============================================================
   Tests 4, 5, 6: Shim + helper behavior
   ============================================================ */

describe("getUserPrimaryRoleWithStatus + getUserRoleWithFallback (shim)", () => {
  it("5. DB-error: findMany throws → {BUYER, DB_ERROR}; shim returns BUYER (NOT legacy)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    spies.userRoleFindMany.mockRejectedValue(new Error("connection lost"));

    const status = await getUserPrimaryRoleWithStatus("user-123");
    expect(status).toEqual({ role: "BUYER", status: "DB_ERROR" });

    // Shim MUST return BUYER (not legacy "SELLER") when DB is down.
    const shimResult = await getUserRoleWithFallback("user-123", { role: "SELLER" });
    expect(shimResult).toBe("BUYER");
    expect(shimResult).not.toBe("SELLER");

    consoleSpy.mockRestore();
  });

  it("4. Shim fallback: 0 UserRole + User.role=SELLER → SELLER; after backfill → SELLER (canonical)", async () => {
    // Before backfill: 0 UserRole rows → status=EMPTY → consult legacy
    spies.userRoleFindMany.mockResolvedValue([]);
    const before = await getUserRoleWithFallback("user-123", { role: "SELLER" });
    expect(before).toBe("SELLER");

    // After backfill: UserRole(SELLER) exists → status=FOUND → canonical wins
    spies.userRoleFindMany.mockResolvedValue([{ role: { key: "SELLER" } }]);
    const after = await getUserRoleWithFallback("user-123", { role: "SELLER" });
    expect(after).toBe("SELLER");
  });

  it("6. Canonical-wins: ADMIN UserRole + User.role=BUYER → ADMIN", async () => {
    spies.userRoleFindMany.mockResolvedValue([{ role: { key: "ADMIN" } }]);
    const result = await getUserRoleWithFallback("user-123", { role: "BUYER" });
    expect(result).toBe("ADMIN");
  });

  it("(extra) Shim: FOUND + BUYER UserRole + User.role=ADMIN → BUYER (canonical wins over legacy)", async () => {
    // User has explicit BUYER UserRole → canonical wins, do NOT fall back to legacy ADMIN.
    spies.userRoleFindMany.mockResolvedValue([{ role: { key: "BUYER" } }]);
    const result = await getUserRoleWithFallback("user-123", { role: "ADMIN" });
    expect(result).toBe("BUYER");
  });

  it("(extra) Shim: null userId → BUYER (fail-closed)", async () => {
    const result = await getUserRoleWithFallback(null, null);
    expect(result).toBe("BUYER");
  });
});

/* ============================================================
   Tests 1, 2, 3: PATCH /api/admin/users/[id] — transactional dual-write
   ============================================================ */

describe("PATCH /api/admin/users/[id] — transactional dual-write (BLOCKER-1)", () => {
  it("1. Idempotency: dual-write twice with same role → 1 UserRole, User.role unchanged on 2nd", async () => {
    // ── First call: existingUserRoles = [] (no UserRole yet) ──
    spies.userRoleFindMany.mockResolvedValueOnce([]);
    const res1 = await PATCH(makeReq("user-123", { role: "SELLER" }), makeParams("user-123"));
    expect(res1.status).toBe(200);

    // After first call: tx.user.update called once with data.role = "SELLER"
    expect(spies.userUpdate).toHaveBeenCalledTimes(1);
    expect(spies.userUpdate.mock.calls[0][0].data.role).toBe("SELLER");
    // UserRole upsert called once
    expect(spies.userRoleUpsert).toHaveBeenCalledTimes(1);
    // deleteMany NOT called (no existing replaceable UserRoles)
    expect(spies.userRoleDeleteMany).not.toHaveBeenCalled();
    // $transaction called once
    expect(spies.$transaction).toHaveBeenCalledTimes(1);

    // ── Second call with SAME role: existingUserRoles = [{ id: "ur-1" }] ──
    spies.userRoleFindMany.mockResolvedValueOnce([{ id: "ur-1" }]);
    const res2 = await PATCH(makeReq("user-123", { role: "SELLER" }), makeParams("user-123"));
    expect(res2.status).toBe(200);

    // user.update called again (2 total) — role UNCHANGED (still "SELLER")
    expect(spies.userUpdate).toHaveBeenCalledTimes(2);
    expect(spies.userUpdate.mock.calls[1][0].data.role).toBe("SELLER");
    // UserRole upsert called again (2 total) — idempotent via @@unique
    expect(spies.userRoleUpsert).toHaveBeenCalledTimes(2);
    // deleteMany called once (deleted the existing row from first call)
    expect(spies.userRoleDeleteMany).toHaveBeenCalledTimes(1);
    // $transaction called twice
    expect(spies.$transaction).toHaveBeenCalledTimes(2);

    // Verify response shape
    const json = await res2.json();
    expect(json.success).toBe(true);
    expect(json.data.role).toBe("SELLER");
  });

  it("2. Error propagation (mock): two PATCHes serialize via mutex → consistent mock state", async () => {
    // NOTE (STEP 15.41): This is a MOCK-BASED test of error propagation,
    // NOT a real concurrency test. It uses a mutex to serialize the two
    // transactions, which mirrors SERIALIZABLE isolation but does NOT
    // test real PostgreSQL READ COMMITTED behavior.
    // Real concurrency evidence is in tests/integration/rbac-phase-b-real.test.ts (C-2a).
    //
    // This test verifies: when two PATCHes run (serialized), the mock
    // state ends up consistent (1 UserRole, User.role matches).
    // Simulate a shared in-memory DB state for User + UserRole tables.
    const dbState: {
      user: { id: string; role: string };
      userRoles: { id: string; userId: string; roleId: string; roleKey: string }[];
    } = {
      user: { id: "user-123", role: "BUYER" },
      userRoles: [],
    };

    let urIdCounter = 0;
    let txnLock: Promise<void> = Promise.resolve();

    spies.$transaction.mockImplementation(async (cb: any) => {
      // Serialize transactions via a mutex (mirrors SERIALIZABLE isolation).
      const prev = txnLock;
      let release!: () => void;
      txnLock = new Promise<void>((resolve) => {
        release = resolve;
      });
      await prev;
      try {
        const tx = {
          user: {
            update: async (args: any) => {
              dbState.user.role = args.data.role;
              return {
                id: "user-123",
                role: args.data.role,
                firstName: "User",
                lastName: "Example",
                email: "user@example.com",
                mobile: "1234567890",
                status: "ACTIVE",
                companyName: null,
                _count: { listings: 0, offers: 0, requests: 0 },
              };
            },
          },
          userRole: {
            findMany: async () => {
              return dbState.userRoles
                .filter((ur) => ["ADMIN", "SELLER", "BUYER"].includes(ur.roleKey))
                .map((ur) => ({ id: ur.id }));
            },
            deleteMany: async (args: any) => {
              const idsToDelete: string[] = args.where.id.in;
              dbState.userRoles = dbState.userRoles.filter(
                (ur) => !idsToDelete.includes(ur.id),
              );
              return { count: idsToDelete.length };
            },
            upsert: async (args: any) => {
              // @@unique([userId, roleId]) — if (userId, roleId) exists, update (no-op);
              // else create new.
              const existing = dbState.userRoles.find(
                (ur) =>
                  ur.userId === args.where.userId_roleId.userId &&
                  ur.roleId === args.where.userId_roleId.roleId,
              );
              if (existing) return existing;
              const roleId: string = args.where.userId_roleId.roleId;
              const roleKey =
                roleId === "role-seller-id"
                  ? "SELLER"
                  : roleId === "role-admin-id"
                    ? "ADMIN"
                    : "BUYER";
              const newUr = {
                id: `ur-${++urIdCounter}`,
                userId: args.where.userId_roleId.userId,
                roleId,
                roleKey,
              };
              dbState.userRoles.push(newUr);
              return newUr;
            },
          },
          // STEP 15.44-B: route.ts uses tx.$queryRaw for SELECT ... FOR UPDATE
          // (defense-in-depth row lock at TX start). Mock returns a row — the
          // route only uses this to acquire the lock, never reads the result.
          $queryRaw: async () => [{ id: "user-123" }],
        };
        return await cb(tx);
      } finally {
        release();
      }
    });

    // Run two concurrent PATCH calls with DIFFERENT roles
    const [res1, res2] = await Promise.all([
      PATCH(makeReq("user-123", { role: "SELLER" }), makeParams("user-123")),
      PATCH(makeReq("user-123", { role: "ADMIN" }), makeParams("user-123")),
    ]);

    // Both should succeed (200)
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // ── Assert: final state is ONE of the two (not a mix) ──
    // (Mutex serialization ensures the second transaction deletes the
    // first's UserRole before upserting its own.)
    expect(dbState.userRoles.length).toBe(1);
    expect(["SELLER", "ADMIN"]).toContain(dbState.userRoles[0].roleKey);

    // ── Assert: no partial state (User.role matches UserRole) ──
    expect(dbState.user.role).toBe(dbState.userRoles[0].roleKey);

    // ── Assert: @@unique([userId, roleId]) holds (no duplicate pairs) ──
    const uniquePairs = new Set(
      dbState.userRoles.map((ur) => `${ur.userId}:${ur.roleId}`),
    );
    expect(uniquePairs.size).toBe(dbState.userRoles.length);
  });

  it("3. Error propagation (mock): tx.userRole.upsert throws → 500, logAudit NOT called", async () => {
    // NOTE (STEP 15.41): This is a MOCK-BASED error-propagation test.
    // It verifies the route handler returns 500 and does NOT call
    // logAudit when the transaction throws. It does NOT prove real
    // database rollback (the mock doesn't implement rollback semantics).
    // Real rollback evidence is in tests/integration/rbac-phase-b-real.test.ts (C-1a).
    //
    // This test verifies: externally-observable behavior (500 response
    // + no audit log) when the transaction callback throws.
    spies.userRoleFindMany.mockResolvedValue([{ id: "ur-existing-1" }]);
    // Make upsert throw inside the transaction.
    spies.userRoleUpsert.mockRejectedValue(new Error("upsert failed (DB constraint)"));

    const res = await PATCH(makeReq("user-123", { role: "SELLER" }), makeParams("user-123"));

    // ── Response is 500 ──
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("upsert failed");

    // ── Transaction callback threw → $transaction rethrew ──
    expect(spies.userUpdate).toHaveBeenCalledTimes(1); // ran before throw
    expect(spies.userRoleFindMany).toHaveBeenCalledTimes(1); // ran before throw
    expect(spies.userRoleDeleteMany).toHaveBeenCalledTimes(1); // ran before throw
    expect(spies.userRoleUpsert).toHaveBeenCalledTimes(1); // threw

    // ── Audit log MUST NOT have been called ──
    // (logAudit runs OUTSIDE the transaction, AFTER it commits.
    // Since the transaction threw, we never reached logAudit.)
    expect(spies.logAudit).not.toHaveBeenCalled();
  });
});
