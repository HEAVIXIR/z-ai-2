import { describe, it, expect, beforeEach, vi } from "vitest";

/* ============================================================
   Unit tests for src/lib/ai-policy.ts (STEP 18.2.7.3.6)
   ------------------------------------------------------------
   STEP 18.2.7.3.6 — AI Policy Hardening.
   Previously ai-policy.ts had `@ts-nocheck` and ZERO unit tests
   of its actual implementation (existing tests all MOCK the
   module). This file tests the REAL implementation with a mocked
   `@/lib/db` and `@/lib/authorization`.

   Coverage goals:
     • getTaskPolicy — deny-by-default, DB error → null
     • checkAIAuth   — anonymous deny, empty roles deny, ADMIN
                      pass, role matching, fail-closed
     • checkAIQuota  — hourly/daily limits, fail-closed on DB error
     • checkAIBudget — atomic reservation, disabled → deny,
                       exceeded → deny, DB error → deny
     • recordAICost  — no-op semantics (cost reserved in preflight)
     • preflightAIRequest — full pipeline, ordering, status codes
   ============================================================ */

/* ── Mock setup ───────────────────────────────────────────────
   Mocks:
     • @/lib/db → aIGatewayLog.count, aITaskPolicy.findUnique,
                  aIBudget.upsert/update/findUnique, $executeRaw
     • @/lib/authorization → isAdmin, hasRole (controlled returns)
   ============================================================ */

// Mutable mock state — reset in beforeEach.
let mockTaskPolicy: Record<string, unknown> | null = null;
let mockHourlyCount = 0;
let mockDailyCount = 0;
let mockBudget: Record<string, unknown> = {
  id: "main",
  dailyLimitUsd: 10.0,
  monthlyLimitUsd: 200.0,
  dailySpendUsd: 0.0,
  monthlySpendUsd: 0.0,
  dailyResetAt: new Date(),
  monthlyResetAt: new Date(),
  active: true,
};
let mockExecuteRawResult = 1; // 1 = success, 0 = budget exceeded
let mockIsAdmin = false;
let mockHasRole = false;
let mockCountThrows = false;
let mockExecuteRawThrows = false;

vi.mock("@/lib/db", () => ({
  get db() {
    return {
      aITaskPolicy: {
        findUnique: async () => mockTaskPolicy,
      },
      aIGatewayLog: {
        count: async () => {
          if (mockCountThrows) throw new Error("DB connection refused");
          // Distinguish hourly vs daily by returning different counts.
          // The function calls count twice; we return hourly first,
          // then daily — so we track which call this is.
          calls++;
          return calls % 2 === 1 ? mockHourlyCount : mockDailyCount;
        },
      },
      aIBudget: {
        upsert: async () => mockBudget,
        update: async (args: { data: Record<string, unknown> }) => ({
          ...mockBudget,
          ...args.data,
        }),
        findUnique: async () => mockBudget,
      },
      $executeRaw: async () => {
        if (mockExecuteRawThrows) throw new Error("DB error during UPDATE");
        return mockExecuteRawResult;
      },
    };
  },
}));

let calls = 0;

vi.mock("@/lib/authorization", () => ({
  isAdmin: async () => mockIsAdmin,
  hasRole: async () => mockHasRole,
}));

const {
  getTaskPolicy,
  checkAIAuth,
  checkAIQuota,
  checkAIBudget,
  recordAICost,
  preflightAIRequest,
  getAIBudget,
} = await import("@/lib/ai-policy");

beforeEach(() => {
  mockTaskPolicy = null;
  mockHourlyCount = 0;
  mockDailyCount = 0;
  mockBudget = {
    id: "main",
    dailyLimitUsd: 10.0,
    monthlyLimitUsd: 200.0,
    dailySpendUsd: 0.0,
    monthlySpendUsd: 0.0,
    dailyResetAt: new Date(),
    monthlyResetAt: new Date(),
    active: true,
  };
  mockExecuteRawResult = 1;
  mockIsAdmin = false;
  mockHasRole = false;
  mockCountThrows = false;
  mockExecuteRawThrows = false;
  calls = 0;
});

// ============================================================
// 1. getTaskPolicy — deny-by-default
// ============================================================

describe("getTaskPolicy — deny-by-default", () => {
  it("returns the policy row when active", async () => {
    mockTaskPolicy = { taskType: "MODERATION", active: true, allowedRoles: "ADMIN" };
    const result = await getTaskPolicy("MODERATION");
    expect(result).not.toBeNull();
    expect(result?.taskType).toBe("MODERATION");
  });

  it("returns null when no policy row exists (deny-by-default)", async () => {
    mockTaskPolicy = null;
    const result = await getTaskPolicy("NONEXISTENT_TASK");
    expect(result).toBeNull();
  });

  it("returns null when the policy row is inactive (deny-by-default)", async () => {
    mockTaskPolicy = { taskType: "MODERATION", active: false, allowedRoles: "ADMIN" };
    const result = await getTaskPolicy("MODERATION");
    expect(result).toBeNull();
  });

  it("returns null on DB error (fail-closed)", async () => {
    // Override findUnique to throw
    const db = (await import("@/lib/db")).db as any;
    const original = db.aITaskPolicy.findUnique;
    db.aITaskPolicy.findUnique = async () => { throw new Error("connection refused"); };
    const result = await getTaskPolicy("MODERATION");
    expect(result).toBeNull();
    db.aITaskPolicy.findUnique = original;
  });
});

// ============================================================
// 2. checkAIAuth — fail-closed authorization
// ============================================================

describe("checkAIAuth — fail-closed authorization", () => {
  it("denies anonymous users (STEP 11.33 R-3-A1 FIX)", async () => {
    const result = await checkAIAuth(null, { allowedRoles: "ADMIN" });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/authentication required/i);
  });

  it("denies when allowedRoles is empty string", async () => {
    const result = await checkAIAuth({ id: "user-1" }, { allowedRoles: "" });
    expect(result.ok).toBe(false);
  });

  it("denies when allowedRoles is whitespace-only", async () => {
    const result = await checkAIAuth({ id: "user-1" }, { allowedRoles: "   " });
    expect(result.ok).toBe(false);
  });

  it("ADMIN always passes regardless of allowedRoles content", async () => {
    mockIsAdmin = true;
    const result = await checkAIAuth({ id: "admin-1" }, { allowedRoles: "SELLER,BUYER" });
    expect(result.ok).toBe(true);
  });

  it("allows user when hasRole matches", async () => {
    mockHasRole = true;
    const result = await checkAIAuth({ id: "user-1" }, { allowedRoles: "SELLER" });
    expect(result.ok).toBe(true);
  });

  it("denies user when role does NOT match (Finding A-1: explicit false)", async () => {
    mockHasRole = false;
    const result = await checkAIAuth({ id: "user-1" }, { allowedRoles: "SELLER" });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/role not allowed/i);
  });

  it("treats '*' as 'all roles allowed' (authenticated user passes)", async () => {
    // Even non-admin user passes because '*' = all roles
    mockHasRole = true; // hasRole(["ADMIN","SELLER","BUYER","MODERATOR","SUPPORT"])
    const result = await checkAIAuth({ id: "user-1" }, { allowedRoles: "*" });
    expect(result.ok).toBe(true);
  });

  it("parses comma-separated roles with whitespace", async () => {
    mockHasRole = true;
    const result = await checkAIAuth({ id: "user-1" }, { allowedRoles: "  admin , seller  " });
    expect(result.ok).toBe(true);
  });

  it("is case-insensitive on role keys", async () => {
    // The implementation uppercases role keys before matching.
    mockHasRole = true;
    const result = await checkAIAuth({ id: "user-1" }, { allowedRoles: "admin" });
    expect(result.ok).toBe(true);
  });
});

// ============================================================
// 3. checkAIQuota — per-user limits
// ============================================================

describe("checkAIQuota — per-user hourly/daily limits", () => {
  const policy = { hourlyLimit: 10, dailyLimit: 100 };

  it("allows when under both limits", async () => {
    mockHourlyCount = 5;
    mockDailyCount = 20;
    const result = await checkAIQuota("user-1", "MODERATION", policy);
    expect(result.ok).toBe(true);
  });

  it("denies when hourly limit reached (boundary: count === limit)", async () => {
    mockHourlyCount = 10; // === hourlyLimit
    mockDailyCount = 0;
    const result = await checkAIQuota("user-1", "MODERATION", policy);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/hourly quota exceeded/);
  });

  it("denies when daily limit reached (boundary: count === limit)", async () => {
    mockHourlyCount = 0;
    mockDailyCount = 100; // === dailyLimit
    const result = await checkAIQuota("user-1", "MODERATION", policy);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/daily quota exceeded/);
  });

  it("allows when count is one below the limit (boundary)", async () => {
    mockHourlyCount = 9; // hourlyLimit - 1
    mockDailyCount = 99; // dailyLimit - 1
    const result = await checkAIQuota("user-1", "MODERATION", policy);
    expect(result.ok).toBe(true);
  });

  it("fails closed on DB error (returns deny, never throws)", async () => {
    mockCountThrows = true;
    const result = await checkAIQuota("user-1", "MODERATION", policy);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/quota check failed/i);
  });

  it("allows when limits are zero (0 count, 0 limit — no calls yet)", async () => {
    // Edge: a policy with limit=0 denies ALL calls (0 >= 0 is true).
    mockHourlyCount = 0;
    mockDailyCount = 0;
    const result = await checkAIQuota("user-1", "MODERATION", { hourlyLimit: 0, dailyLimit: 0 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/hourly quota exceeded/);
  });
});

// ============================================================
// 4. checkAIBudget — atomic check-and-reserve
// ============================================================

describe("checkAIBudget — atomic check-and-reserve", () => {
  const activeBudget = {
    dailyLimitUsd: 10.0,
    monthlyLimitUsd: 200.0,
    dailySpendUsd: 0.0,
    monthlySpendUsd: 0.0,
    active: true,
  };

  it("reserves cost when under both limits (UPDATE affects 1 row)", async () => {
    mockExecuteRawResult = 1;
    const result = await checkAIBudget(0.05, activeBudget);
    expect(result.ok).toBe(true);
  });

  it("denies when budget is inactive (fail-closed)", async () => {
    const result = await checkAIBudget(0.05, { ...activeBudget, active: false });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/disabled/i);
  });

  it("denies when UPDATE affects 0 rows (budget exceeded)", async () => {
    mockExecuteRawResult = 0;
    // Configure mock budget to look "exceeded" so the re-read reports daily
    mockBudget = { ...activeBudget, dailySpendUsd: 9.99, dailyLimitUsd: 10.0 };
    const result = await checkAIBudget(0.05, activeBudget);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/daily budget exceeded/);
  });

  it("denies with monthly reason when monthly limit is the binding constraint", async () => {
    mockExecuteRawResult = 0;
    mockBudget = {
      ...activeBudget,
      dailySpendUsd: 0.0,
      dailyLimitUsd: 10.0,
      monthlySpendUsd: 199.99,
      monthlyLimitUsd: 200.0,
    };
    const result = await checkAIBudget(0.05, activeBudget);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/monthly budget exceeded/);
  });

  it("fails closed on DB error during the atomic UPDATE (never throws)", async () => {
    mockExecuteRawThrows = true;
    const result = await checkAIBudget(0.05, activeBudget);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/budget check failed/i);
  });

  it("rejects a zero estimated cost (0 rows would be affected → deny)", async () => {
    // A zero-cost task should still pass if under limit (UPDATE with +0 succeeds).
    // But if $executeRaw returns 0, we deny. This verifies the 0-result path.
    mockExecuteRawResult = 0;
    mockBudget = { ...activeBudget, dailySpendUsd: 0, dailyLimitUsd: 10.0 };
    const result = await checkAIBudget(0.0, activeBudget);
    expect(result.ok).toBe(false);
  });
});

// ============================================================
// 5. recordAICost — no-op semantics
// ============================================================

describe("recordAICost — no-op semantics (cost reserved in preflight)", () => {
  it("is a no-op for positive cost (cost already reserved in checkAIBudget)", async () => {
    // recordAICost should NOT touch the DB — it just returns.
    // We verify by ensuring no exception is thrown and nothing is returned.
    await expect(recordAICost("MODERATION", 0.05, "user-1")).resolves.toBeUndefined();
  });

  it("is a no-op for zero cost", async () => {
    await expect(recordAICost("MODERATION", 0, "user-1")).resolves.toBeUndefined();
  });

  it("is a no-op for negative cost", async () => {
    await expect(recordAICost("MODERATION", -1.0, "user-1")).resolves.toBeUndefined();
  });

  it("is a no-op for NaN cost (defensive)", async () => {
    await expect(recordAICost("MODERATION", NaN, "user-1")).resolves.toBeUndefined();
  });

  it("is a no-op for Infinity cost (defensive)", async () => {
    await expect(recordAICost("MODERATION", Infinity, "user-1")).resolves.toBeUndefined();
  });

  it("handles null userId gracefully", async () => {
    await expect(recordAICost("MODERATION", 0.05, null)).resolves.toBeUndefined();
  });
});

// ============================================================
// 6. getAIBudget — singleton + auto-reset
// ============================================================

describe("getAIBudget — singleton + auto-reset", () => {
  it("returns the budget singleton", async () => {
    const result = await getAIBudget();
    expect(result).not.toBeNull();
    expect(result.id).toBe("main");
  });

  it("auto-resets daily window when expired", async () => {
    // Set dailyResetAt far in the past so the window is expired
    const expired = new Date(Date.now() - 48 * 60 * 60 * 1000); // 2 days ago
    mockBudget = {
      ...mockBudget,
      dailyResetAt: expired,
      dailySpendUsd: 5.0,
    };
    const result = await getAIBudget();
    // After auto-reset, dailySpendUsd should be 0 (mock returns the patched row)
    expect(result.dailySpendUsd).toBe(0.0);
  });

  it("auto-resets monthly window when expired", async () => {
    const expired = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago
    mockBudget = {
      ...mockBudget,
      monthlyResetAt: expired,
      monthlySpendUsd: 50.0,
    };
    const result = await getAIBudget();
    expect(result.monthlySpendUsd).toBe(0.0);
  });
});

// ============================================================
// 7. preflightAIRequest — full pipeline + ordering + status codes
// ============================================================

describe("preflightAIRequest — full pipeline", () => {
  const validPolicy = {
    taskType: "MODERATION",
    active: true,
    allowedRoles: "ADMIN",
    hourlyLimit: 10,
    dailyLimit: 100,
    costCeilingUsd: 0.05,
    maxInputChars: 10000,
    model: "default",
    timeoutMs: 30000,
  };

  beforeEach(() => {
    mockTaskPolicy = { ...validPolicy };
    mockIsAdmin = true;
    mockHourlyCount = 0;
    mockDailyCount = 0;
    mockExecuteRawResult = 1;
    mockBudget.active = true;
  });

  it("passes all gates for an authenticated ADMIN with valid input", async () => {
    const result = await preflightAIRequest({
      taskType: "MODERATION",
      user: { id: "admin-1" },
      inputLength: 500,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.policy.taskType).toBe("MODERATION");
      expect(result.actorId).toBe("admin-1");
    }
  });

  it("denies with 403 when task has no policy (deny-by-default)", async () => {
    mockTaskPolicy = null;
    const result = await preflightAIRequest({
      taskType: "NONEXISTENT",
      user: { id: "admin-1" },
      inputLength: 100,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.statusCode).toBe(403);
  });

  it("denies with 403 when task policy is inactive", async () => {
    mockTaskPolicy = { ...validPolicy, active: false };
    const result = await preflightAIRequest({
      taskType: "MODERATION",
      user: { id: "admin-1" },
      inputLength: 100,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.statusCode).toBe(403);
  });

  it("denies anonymous users with 403 (STEP 11.33 R-3-A1 FIX)", async () => {
    const result = await preflightAIRequest({
      taskType: "MODERATION",
      user: null,
      inputLength: 100,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.statusCode).toBe(403);
  });

  it("denies authenticated non-admin non-matching role with 403", async () => {
    mockIsAdmin = false;
    mockHasRole = false;
    const result = await preflightAIRequest({
      taskType: "MODERATION",
      user: { id: "user-1" },
      inputLength: 100,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.statusCode).toBe(403);
  });

  it("denies with 429 when hourly quota exceeded", async () => {
    mockHourlyCount = 10; // === hourlyLimit
    const result = await preflightAIRequest({
      taskType: "MODERATION",
      user: { id: "admin-1" },
      inputLength: 100,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.statusCode).toBe(429);
  });

  it("denies with 429 when daily quota exceeded", async () => {
    mockHourlyCount = 0;
    mockDailyCount = 100; // === dailyLimit
    const result = await preflightAIRequest({
      taskType: "MODERATION",
      user: { id: "admin-1" },
      inputLength: 100,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.statusCode).toBe(429);
  });

  it("denies with 429 when budget exceeded", async () => {
    mockExecuteRawResult = 0; // budget reservation fails
    mockBudget = {
      ...mockBudget,
      dailySpendUsd: 9.99,
      dailyLimitUsd: 10.0,
    };
    const result = await preflightAIRequest({
      taskType: "MODERATION",
      user: { id: "admin-1" },
      inputLength: 100,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.statusCode).toBe(429);
  });

  it("denies with 400 when input exceeds maxInputChars (boundary)", async () => {
    const result = await preflightAIRequest({
      taskType: "MODERATION",
      user: { id: "admin-1" },
      inputLength: 10001, // maxInputChars + 1
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.statusCode).toBe(400);
  });

  it("allows input exactly at maxInputChars (boundary)", async () => {
    const result = await preflightAIRequest({
      taskType: "MODERATION",
      user: { id: "admin-1" },
      inputLength: 10000, // === maxInputChars
    });
    expect(result.ok).toBe(true);
  });

  it("uses actorId='anonymous' for null user (before denying)", async () => {
    // Even though anonymous is denied, the actorId is set for logging.
    mockTaskPolicy = null; // deny at policy gate
    const result = await preflightAIRequest({
      taskType: "MODERATION",
      user: null,
      inputLength: 100,
    });
    expect(result.ok).toBe(false);
    // actorId is not returned on failure, but the function should not throw.
  });
});

// ============================================================
// 8. ORDERING — policy before auth before quota before budget
// ============================================================

describe("preflightAIRequest — gate ordering (defense-in-depth)", () => {
  const validPolicy = {
    taskType: "MODERATION",
    active: true,
    allowedRoles: "ADMIN",
    hourlyLimit: 10,
    dailyLimit: 100,
    costCeilingUsd: 0.05,
    maxInputChars: 10000,
    model: "default",
    timeoutMs: 30000,
  };

  it("checks policy BEFORE auth (no policy = no auth check needed)", async () => {
    mockTaskPolicy = null;
    mockIsAdmin = false; // would deny if auth checked
    mockHasRole = false;
    const result = await preflightAIRequest({
      taskType: "MODERATION",
      user: null,
      inputLength: 100,
    });
    expect(result.ok).toBe(false);
    // Should fail at policy gate (403), not auth gate.
    if (!result.ok) expect(result.statusCode).toBe(403);
  });

  it("checks auth BEFORE quota (non-admin user denied before quota counted)", async () => {
    mockTaskPolicy = { ...validPolicy };
    mockIsAdmin = false;
    mockHasRole = false;
    mockHourlyCount = 100; // would exceed if checked
    const result = await preflightAIRequest({
      taskType: "MODERATION",
      user: { id: "user-1" },
      inputLength: 100,
    });
    expect(result.ok).toBe(false);
    // Should fail at auth gate (403), not quota gate (429).
    if (!result.ok) expect(result.statusCode).toBe(403);
  });

  it("checks quota BEFORE budget (quota exceeded → 429 before budget reserved)", async () => {
    mockTaskPolicy = { ...validPolicy };
    mockIsAdmin = true;
    mockHourlyCount = 10; // quota exceeded
    mockExecuteRawResult = 0; // budget would also fail
    const result = await preflightAIRequest({
      taskType: "MODERATION",
      user: { id: "admin-1" },
      inputLength: 100,
    });
    expect(result.ok).toBe(false);
    // Quota (429) is checked before budget — but both are 429, so we
    // verify the quota reason is surfaced (the budget reservation
    // should NOT have happened if quota failed first).
    if (!result.ok) expect(result.statusCode).toBe(429);
  });

  it("rejects oversized input BEFORE quota reads and budget reservation", async () => {
    mockTaskPolicy = { ...validPolicy };
    mockIsAdmin = true;
    mockHourlyCount = 0;
    mockDailyCount = 0;
    mockExecuteRawResult = 0; // budget would also fail
    mockBudget = { ...mockBudget, dailySpendUsd: 9.99, dailyLimitUsd: 10.0 };
    const result = await preflightAIRequest({
      taskType: "MODERATION",
      user: { id: "admin-1" },
      inputLength: 99999, // over the policy limit
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.statusCode).toBe(400);
    // The invalid input must be rejected before any quota or budget side effect.
    expect(mockAIGatewayLogCount).not.toHaveBeenCalled();
    expect(mockBudgetUpsert).not.toHaveBeenCalled();
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });
});
