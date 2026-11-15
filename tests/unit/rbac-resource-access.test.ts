import { describe, it, expect, beforeEach, vi } from "vitest";

/* ============================================================
   Unit tests for canAccessResource — SQL injection hardening
   STEP 18.2.7.3.5 — Finding R-1
   ------------------------------------------------------------
   canAccessResource uses db.$queryRawUnsafe with `resource`
   (table name) and `options.ownerField` (column name) interpolated
   into the SQL. STEP 18.2.7.3.5 added a strict SQL-identifier
   allowlist (`^[a-zA-Z_][a-zA-Z0-9_]*$`) that runs BEFORE the query
   is constructed. Invalid identifiers → fail closed (return false),
   never reaching the database.

   These tests mock `@/lib/db` and `@/lib/rbac-legacy` (for
   getUserPermissions) so we can assert:
     1. Valid identifiers reach the database query.
     2. SQL-injection payloads NEVER reach $queryRawUnsafe.
     3. Ownership is correctly resolved (owner match → true).
     4. Non-owner without moderate permission → false.
     5. Moderate permission grants access regardless of ownership.
     6. DB errors fail closed (return false, never throw).
   ============================================================ */

/* ── Mock setup ───────────────────────────────────────────────
   We mock:
     • @/lib/db → captures $queryRawUnsafe calls so we can assert
       the SQL string and that it was/wasn't called.
     • @/lib/rbac-legacy → getUserPermissions returns a controlled
       set so can() / canAny() resolve predictably.
   ============================================================ */

let queryRawCalls: { sql: string; params: unknown[] }[] = [];
let mockPermissions: string[] = [];
let mockQueryResult: { owner_id: string }[] = [];

vi.mock("@/lib/db", () => ({
  get db() {
    return {
      $queryRawUnsafe: async (sql: string, ...params: unknown[]) => {
        queryRawCalls.push({ sql, params });
        return mockQueryResult;
      },
    };
  },
}));

vi.mock("@/lib/rbac-legacy", () => ({
  getUserPermissions: async () => mockPermissions,
  ForbiddenError: class ForbiddenError extends Error {
    readonly statusCode = 403;
    constructor(message = "Forbidden") {
      super(message);
      this.name = "ForbiddenError";
    }
  },
}));

const { canAccessResource } = await import("@/lib/authorization");

beforeEach(() => {
  queryRawCalls = [];
  mockPermissions = [];
  mockQueryResult = [];
});

// ============================================================
// 1. SQL IDENTIFIER ALLOWLIST — injection payloads rejected
// ============================================================

describe("canAccessResource — SQL identifier allowlist (Finding R-1)", () => {
  it("rejects a resource name with a semicolon (classic SQLi)", async () => {
    const result = await canAccessResource("user-1", "listings; DROP TABLE users; --", "rec-1", {
      ownerField: "sellerId",
    });
    expect(result).toBe(false);
    expect(queryRawCalls).toHaveLength(0);
  });

  it("rejects a resource name with a double-quote breakout", async () => {
    const result = await canAccessResource("user-1", 'foo"; DROP TABLE x; --', "rec-1", {
      ownerField: "sellerId",
    });
    expect(result).toBe(false);
    expect(queryRawCalls).toHaveLength(0);
  });

  it("rejects an ownerField with a semicolon", async () => {
    const result = await canAccessResource("user-1", "listing", "rec-1", {
      ownerField: "sellerId; SELECT pg_sleep(1000000)",
    });
    expect(result).toBe(false);
    expect(queryRawCalls).toHaveLength(0);
  });

  it("rejects an ownerField with a double-quote breakout", async () => {
    const result = await canAccessResource("user-1", "listing", "rec-1", {
      ownerField: 'sellerId" || "1"="1',
    });
    expect(result).toBe(false);
    expect(queryRawCalls).toHaveLength(0);
  });

  it("rejects a resource name with a space", async () => {
    const result = await canAccessResource("user-1", "listings table", "rec-1", {
      ownerField: "sellerId",
    });
    expect(result).toBe(false);
    expect(queryRawCalls).toHaveLength(0);
  });

  it("rejects a resource name starting with a digit", async () => {
    const result = await canAccessResource("user-1", "9table", "rec-1", {
      ownerField: "sellerId",
    });
    expect(result).toBe(false);
    expect(queryRawCalls).toHaveLength(0);
  });

  it("rejects a resource name with a hyphen", async () => {
    const result = await canAccessResource("user-1", "store-items", "rec-1", {
      ownerField: "sellerId",
    });
    expect(result).toBe(false);
    expect(queryRawCalls).toHaveLength(0);
  });

  it("rejects an empty resource name", async () => {
    const result = await canAccessResource("user-1", "", "rec-1", {
      ownerField: "sellerId",
    });
    expect(result).toBe(false);
    expect(queryRawCalls).toHaveLength(0);
  });

  it("rejects a resource name with UNION SELECT", async () => {
    const result = await canAccessResource("user-1", "listing UNION SELECT password FROM users", "rec-1", {
      ownerField: "sellerId",
    });
    expect(result).toBe(false);
    expect(queryRawCalls).toHaveLength(0);
  });

  it("rejects undefined options (defensive)", async () => {
    const result = await canAccessResource("user-1", "listing", "rec-1", undefined as any);
    expect(result).toBe(false);
    expect(queryRawCalls).toHaveLength(0);
  });

  it("rejects an empty ownerField", async () => {
    const result = await canAccessResource("user-1", "listing", "rec-1", {
      ownerField: "",
    });
    expect(result).toBe(false);
    expect(queryRawCalls).toHaveLength(0);
  });
});

// ============================================================
// 2. VALID IDENTIFIERS — reach the database query
// ============================================================

describe("canAccessResource — valid identifiers reach the query", () => {
  it("constructs the query with valid resource + ownerField", async () => {
    mockQueryResult = [{ owner_id: "user-1" }];
    const result = await canAccessResource("user-1", "listing", "rec-1", {
      ownerField: "sellerId",
    });
    expect(result).toBe(true);
    expect(queryRawCalls).toHaveLength(1);
    expect(queryRawCalls[0].sql).toBe(
      'SELECT "sellerId" as owner_id FROM "listing" WHERE id = $1',
    );
    expect(queryRawCalls[0].params).toEqual(["rec-1"]);
  });

  it("accepts resource names with underscores", async () => {
    mockQueryResult = [{ owner_id: "user-1" }];
    const result = await canAccessResource("user-1", "store_inventory", "rec-1", {
      ownerField: "owner_id",
    });
    expect(result).toBe(true);
    expect(queryRawCalls).toHaveLength(1);
  });

  it("accepts camelCase ownerField", async () => {
    mockQueryResult = [{ owner_id: "user-1" }];
    const result = await canAccessResource("user-1", "listing", "rec-1", {
      ownerField: "sellerId",
    });
    expect(result).toBe(true);
    expect(queryRawCalls[0].sql).toContain('"sellerId"');
  });
});

// ============================================================
// 3. OWNERSHIP RESOLUTION
// ============================================================

describe("canAccessResource — ownership resolution", () => {
  it("returns true when the user owns the resource", async () => {
    mockQueryResult = [{ owner_id: "user-1" }];
    const result = await canAccessResource("user-1", "listing", "rec-1", {
      ownerField: "sellerId",
    });
    expect(result).toBe(true);
  });

  it("returns false when a different user owns the resource", async () => {
    mockQueryResult = [{ owner_id: "user-2" }];
    const result = await canAccessResource("user-1", "listing", "rec-1", {
      ownerField: "sellerId",
    });
    expect(result).toBe(false);
  });

  it("returns false when the resource does not exist (empty result)", async () => {
    mockQueryResult = [];
    const result = await canAccessResource("user-1", "listing", "nonexistent", {
      ownerField: "sellerId",
    });
    expect(result).toBe(false);
  });

  it("returns false on database error (fail-closed)", async () => {
    // Re-mock $queryRawUnsafe to throw for this test
    const { db } = await import("@/lib/db");
    const original = db.$queryRawUnsafe;
    (db as any).$queryRawUnsafe = async () => {
      throw new Error("connection refused");
    };
    const result = await canAccessResource("user-1", "listing", "rec-1", {
      ownerField: "sellerId",
    });
    expect(result).toBe(false);
    // Restore
    (db as any).$queryRawUnsafe = original;
  });
});

// ============================================================
// 4. MODERATE PERMISSION — overrides ownership check
// ============================================================

describe("canAccessResource — moderate permission", () => {
  it("grants access when user has the moderate permission (regardless of ownership)", async () => {
    mockPermissions = ["listing.moderate"];
    // Even if the DB query would return a different owner, it should
    // never be called because the moderate-permission check short-circuits.
    mockQueryResult = [{ owner_id: "user-2" }];
    const result = await canAccessResource("user-1", "listing", "rec-1", {
      ownerField: "sellerId",
      moderatePermission: "listing.moderate",
    });
    expect(result).toBe(true);
    // The moderate path short-circuits BEFORE the DB query.
    expect(queryRawCalls).toHaveLength(0);
  });

  it("falls through to ownership check when moderate permission is absent", async () => {
    mockPermissions = [];
    mockQueryResult = [{ owner_id: "user-1" }];
    const result = await canAccessResource("user-1", "listing", "rec-1", {
      ownerField: "sellerId",
      moderatePermission: "listing.moderate",
    });
    expect(result).toBe(true);
    expect(queryRawCalls).toHaveLength(1);
  });

  it("validates identifiers BEFORE checking moderate permission", async () => {
    // Even with moderate permission, an invalid resource name must fail closed
    // (defense-in-depth: the identifier check is the first gate).
    mockPermissions = ["listing.moderate"];
    const result = await canAccessResource("user-1", "listing; DROP TABLE users", "rec-1", {
      ownerField: "sellerId",
      moderatePermission: "listing.moderate",
    });
    expect(result).toBe(false);
    expect(queryRawCalls).toHaveLength(0);
  });
});
