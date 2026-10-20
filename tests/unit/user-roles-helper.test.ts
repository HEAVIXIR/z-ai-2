import { describe, it, expect, beforeEach, vi } from "vitest";

/* ============================================================
   HEAVIX — Phase A: Unit tests for src/lib/authorization/user-roles.ts
   ------------------------------------------------------------
   Step: STEP 14.95 Phase A (owner-authorized, additive only)
   Pattern source: tests/unit/rbac.test.ts (mock-based, vi.mock)

   The helper depends on `db` (Prisma client). To keep these tests
   hermetic (no live DB needed), we mock `@/lib/db` with predictable
   per-call return values. The mock is reset before each test so
   tests do not leak state.

   Verifies (per design doc §2.2, 8 tests minimum):
     1. getUserPrimaryRole(null) → "BUYER"
     2. getUserPrimaryRole(undefined) → "BUYER"
     3. user with zero UserRole rows → "BUYER" (fail-closed)
     4. user with single BUYER UserRole → "BUYER"
     5. user with ADMIN + BUYER (multi-role) → "ADMIN" (highest precedence)
     6. user with SELLER + BUYER → "SELLER"
     7. db.userRole.findMany throws → "BUYER" + error logged (fail-closed)
     8. getUserRoleKeys returns all roles, sorted by precedence

   Additional tests (privilege-escalation protection):
     9. unknown role key does NOT escalate to ADMIN
    10. malformed data (null role) handled safely
    11. getUserRoleLabels returns Persian names
    12. getUserRoleLabels fail-closed on null userId
   ============================================================ */

/* ── Mock the db module ────────────────────────────────────────
   vi.mock is hoisted by Vitest before any import runs, so the
   user-roles module gets the mock even though it imports `db` at
   the top of the file. We use `mockImpl` as a mutable per-test
   impl so individual tests can swap return values.
   ============================================================ */

type MockImpl = {
  userRole: {
    findMany: (args: unknown) => Promise<unknown[]>;
  };
};

let mockImpl: MockImpl;

vi.mock("@/lib/db", () => ({
  get db(): MockImpl {
    return mockImpl;
  },
}));

// Import AFTER vi.mock so the module picks up the mock.
const { getUserPrimaryRole, getUserRoleKeys, getUserRoleLabels } = await import(
  "@/lib/authorization/user-roles"
);

beforeEach(() => {
  // Default: empty results so tests start from a known state.
  mockImpl = {
    userRole: {
      findMany: async () => [],
    },
  };
});

// ── getUserPrimaryRole ─────────────────────────────────────────

describe("getUserPrimaryRole", () => {
  it("1. returns 'BUYER' for null userId (fail-closed)", async () => {
    const result = await getUserPrimaryRole(null);
    expect(result).toBe("BUYER");
  });

  it("2. returns 'BUYER' for undefined userId (fail-closed)", async () => {
    const result = await getUserPrimaryRole(undefined);
    expect(result).toBe("BUYER");
  });

  it("3. returns 'BUYER' when user has zero UserRole rows (fail-closed)", async () => {
    mockImpl.userRole.findMany = async () => [];
    const result = await getUserPrimaryRole("user-123");
    expect(result).toBe("BUYER");
  });

  it("4. returns 'BUYER' for user with single BUYER UserRole", async () => {
    mockImpl.userRole.findMany = async () => [{ role: { key: "BUYER" } }];
    const result = await getUserPrimaryRole("user-123");
    expect(result).toBe("BUYER");
  });

  it("5. returns 'ADMIN' for user with ADMIN + BUYER (highest precedence wins)", async () => {
    mockImpl.userRole.findMany = async () => [
      { role: { key: "BUYER" } },
      { role: { key: "ADMIN" } },
    ];
    const result = await getUserPrimaryRole("user-123");
    expect(result).toBe("ADMIN");
  });

  it("6. returns 'SELLER' for user with SELLER + BUYER", async () => {
    mockImpl.userRole.findMany = async () => [
      { role: { key: "SELLER" } },
      { role: { key: "BUYER" } },
    ];
    const result = await getUserPrimaryRole("user-123");
    expect(result).toBe("SELLER");
  });

  it("7. returns 'BUYER' when db.userRole.findMany throws (fail-closed + log)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockImpl.userRole.findMany = async () => {
      throw new Error("connection lost");
    };
    const result = await getUserPrimaryRole("user-123");
    expect(result).toBe("BUYER");
    expect(consoleSpy).toHaveBeenCalledWith(
      "[user-roles] getUserPrimaryRole failed:",
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it("8. does NOT escalate to ADMIN when only unknown role keys present", async () => {
    // Unknown role key should NOT become ADMIN — must return the first key, not escalate
    mockImpl.userRole.findMany = async () => [{ role: { key: "UNKNOWN_ROLE" } }];
    const result = await getUserPrimaryRole("user-123");
    expect(result).toBe("UNKNOWN_ROLE"); // returned as-is, NOT escalated
    expect(result).not.toBe("ADMIN");
  });

  it("9. handles malformed data (null role) safely — returns 'BUYER'", async () => {
    // If a UserRole row has a null role (shouldn't happen, but defensive)
    mockImpl.userRole.findMany = async () => [{ role: null }];
    const result = await getUserPrimaryRole("user-123");
    // Should not throw; should return BUYER (safest default)
    expect(result).toBe("BUYER");
  });

  it("10. handles empty-string userId (falsy) — returns 'BUYER'", async () => {
    const result = await getUserPrimaryRole("");
    expect(result).toBe("BUYER");
  });
});

// ── getUserRoleKeys ────────────────────────────────────────────

describe("getUserRoleKeys", () => {
  it("11. returns [] for null userId", async () => {
    const result = await getUserRoleKeys(null);
    expect(result).toEqual([]);
  });

  it("12. returns [] when user has zero UserRole rows", async () => {
    mockImpl.userRole.findMany = async () => [];
    const result = await getUserRoleKeys("user-123");
    expect(result).toEqual([]);
  });

  it("13. returns all role keys, sorted by precedence (ADMIN first)", async () => {
    // Return in "wrong" order — helper must sort by precedence
    mockImpl.userRole.findMany = async () => [
      { role: { key: "BUYER" } },
      { role: { key: "ADMIN" } },
      { role: { key: "SELLER" } },
    ];
    const result = await getUserRoleKeys("user-123");
    expect(result).toEqual(["ADMIN", "SELLER", "BUYER"]);
  });

  it("14. returns [] when db throws (fail-closed)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockImpl.userRole.findMany = async () => {
      throw new Error("db down");
    };
    const result = await getUserRoleKeys("user-123");
    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("15. places unknown role keys last (after known precedence order)", async () => {
    mockImpl.userRole.findMany = async () => [
      { role: { key: "UNKNOWN_ROLE" } },
      { role: { key: "BUYER" } },
    ];
    const result = await getUserRoleKeys("user-123");
    // BUYER (index 2) before UNKNOWN_ROLE (index 999)
    expect(result).toEqual(["BUYER", "UNKNOWN_ROLE"]);
  });
});

// ── getUserRoleLabels ──────────────────────────────────────────

describe("getUserRoleLabels", () => {
  it("16. returns ['خریدار'] for null userId (fail-closed, Persian label)", async () => {
    const result = await getUserRoleLabels(null);
    expect(result).toEqual(["خریدار"]);
  });

  it("17. returns ['خریدار'] when user has zero UserRole rows", async () => {
    mockImpl.userRole.findMany = async () => [];
    const result = await getUserRoleLabels("user-123");
    expect(result).toEqual(["خریدار"]);
  });

  it("18. returns Persian names sorted by precedence", async () => {
    mockImpl.userRole.findMany = async () => [
      { role: { key: "BUYER", nameFa: "خریدار", nameEn: "Buyer" } },
      { role: { key: "ADMIN", nameFa: "مدیر", nameEn: "Administrator" } },
    ];
    const result = await getUserRoleLabels("user-123");
    expect(result).toEqual(["مدیر", "خریدار"]);
  });

  it("19. falls back to role.key when nameFa is missing", async () => {
    mockImpl.userRole.findMany = async () => [
      { role: { key: "CUSTOM_ROLE", nameFa: null, nameEn: "Custom" } },
    ];
    const result = await getUserRoleLabels("user-123");
    expect(result).toEqual(["CUSTOM_ROLE"]);
  });

  it("20. returns ['خریدار'] when db throws (fail-closed)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockImpl.userRole.findMany = async () => {
      throw new Error("connection timeout");
    };
    const result = await getUserRoleLabels("user-123");
    expect(result).toEqual(["خریدار"]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
