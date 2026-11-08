import { describe, it, expect, beforeEach, vi } from "vitest";

let queryRawCalls: { sql: string; params: unknown[] }[] = [];
let mockPermissions: string[] = [];
let mockQueryResult: { owner_id: string }[] = [];
const mockQueryRaw = vi.fn(async (sql: string, ...params: unknown[]) => {
  queryRawCalls.push({ sql, params });
  return mockQueryResult;
});

vi.mock("@/lib/db", () => ({
  db: {
    $queryRawUnsafe: mockQueryRaw,
    userRole: { findFirst: vi.fn().mockResolvedValue(null) },
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
  mockQueryRaw.mockReset();
  mockQueryRaw.mockImplementation(async (sql: string, ...params: unknown[]) => {
    queryRawCalls.push({ sql, params });
    return mockQueryResult;
  });
});

describe("canAccessResource — SQL identifier allowlist", () => {
  it("rejects a resource name with a semicolon", async () => {
    const result = await canAccessResource("user-1", "listings; DROP TABLE users; --", "rec-1", { ownerField: "sellerId" });
    expect(result).toBe(false);
    expect(queryRawCalls).toHaveLength(0);
  });

  it("rejects a resource name with a double-quote breakout", async () => {
    const result = await canAccessResource("user-1", 'foo"; DROP TABLE x; --', "rec-1", { ownerField: "sellerId" });
    expect(result).toBe(false);
    expect(queryRawCalls).toHaveLength(0);
  });

  it("rejects an ownerField with a semicolon", async () => {
    const result = await canAccessResource("user-1", "listing", "rec-1", { ownerField: "sellerId; SELECT pg_sleep(1000000)" });
    expect(result).toBe(false);
    expect(queryRawCalls).toHaveLength(0);
  });

  it("rejects an ownerField with a quote breakout", async () => {
    const result = await canAccessResource("user-1", "listing", "rec-1", { ownerField: 'sellerId" FROM "users"; --' });
    expect(result).toBe(false);
    expect(queryRawCalls).toHaveLength(0);
  });

  it("allows a valid owner lookup and parameterizes the resource id", async () => {
    mockQueryResult = [{ owner_id: "user-1" }];
    const result = await canAccessResource("user-1", "listing", "rec-1", { ownerField: "sellerId" });
    expect(result).toBe(true);
    expect(queryRawCalls).toHaveLength(1);
    expect(queryRawCalls[0].sql).toContain('FROM "listing" WHERE id = $1');
    expect(queryRawCalls[0].params).toEqual(["rec-1"]);
  });

  it("denies access to a non-owner without moderation permission", async () => {
    mockQueryResult = [{ owner_id: "someone-else" }];
    const result = await canAccessResource("user-1", "listing", "rec-1", { ownerField: "sellerId" });
    expect(result).toBe(false);
  });

  it("allows a moderator with the explicit moderation permission", async () => {
    mockPermissions = ["listing.moderate"];
    const result = await canAccessResource("user-1", "listing", "rec-1", { ownerField: "sellerId", moderatePermission: "listing.moderate" });
    expect(result).toBe(true);
    expect(queryRawCalls).toHaveLength(0);
  });

  it("fails closed when the database query throws", async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error("database unavailable"));
    const result = await canAccessResource("user-1", "listing", "rec-1", { ownerField: "sellerId" });
    expect(result).toBe(false);
  });
});
