import { describe, it, expect, vi, beforeEach } from "vitest";

/* ============================================================
   STEP 11.45 — Security Closure: Budget Race + Quota Fail-Closed
   ------------------------------------------------------------
   Tests:
   1. checkAIBudget uses atomic reservation (not read-then-write)
   2. checkAIBudget fails CLOSED on DB error (not fail-open)
   3. recordAICost is now a no-op (cost reserved in checkAIBudget)
   4. Source-code verification of the atomic SQL UPDATE
   ============================================================ */

vi.mock("@/lib/db", () => ({
  db: {
    $executeRaw: vi.fn(async () => 1),
    aIBudget: {
      findUnique: vi.fn(async () => ({
        id: "main",
        dailySpendUsd: 5.0,
        monthlySpendUsd: 50.0,
        dailyLimitUsd: 10.0,
        monthlyLimitUsd: 200.0,
        active: true,
      })),
      update: vi.fn(async (args: any) => args.data),
      upsert: vi.fn(async () => ({
        id: "main",
        dailySpendUsd: 5.0,
        monthlySpendUsd: 50.0,
        dailyLimitUsd: 10.0,
        monthlyLimitUsd: 200.0,
        active: true,
        dailyResetAt: new Date(),
        monthlyResetAt: new Date(),
      })),
    },
    aIGatewayLog: { count: vi.fn(async () => 0) },
  },
}));
vi.mock("@/lib/rbac-legacy", () => ({ getUserPermissions: vi.fn(async () => []) }));
vi.mock("@/lib/authorization", () => ({
  isAdmin: vi.fn(async () => false),
  hasRole: vi.fn(async () => false),
}));

const { checkAIBudget, recordAICost } = await import("@/lib/ai-policy");
const { db } = await import("@/lib/db");

beforeEach(() => {
  vi.clearAllMocks();
  (db.$executeRaw as any).mockResolvedValue(1);
});

describe("STEP 11.45: checkAIBudget — atomic reservation", () => {
  it("POSITIVE: budget available → ok:true + atomic UPDATE called", async () => {
    (db.$executeRaw as any).mockResolvedValue(1);
    const result = await checkAIBudget(0.05, {
      dailyLimitUsd: 10,
      monthlyLimitUsd: 200,
      dailySpendUsd: 5,
      monthlySpendUsd: 50,
      active: true,
    });
    expect(result.ok).toBe(true);
    expect(db.$executeRaw).toHaveBeenCalled();
  });

  it("NEGATIVE: budget exceeded (0 rows affected) → ok:false", async () => {
    (db.$executeRaw as any).mockResolvedValue(0);
    (db.aIBudget.findUnique as any).mockResolvedValueOnce({
      dailySpendUsd: 9.98,
      monthlySpendUsd: 50,
      dailyLimitUsd: 10,
      monthlyLimitUsd: 200,
      active: true,
    });
    const result = await checkAIBudget(0.05, {
      dailyLimitUsd: 10,
      monthlyLimitUsd: 200,
      dailySpendUsd: 9.98,
      monthlySpendUsd: 50,
      active: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/budget/);
  });

  it("NEGATIVE: budget inactive → ok:false (before DB call)", async () => {
    const result = await checkAIBudget(0.05, {
      dailyLimitUsd: 10,
      monthlyLimitUsd: 200,
      dailySpendUsd: 0,
      monthlySpendUsd: 0,
      active: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/disabled/);
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it("NEGATIVE: DB error → fail-CLOSED (ok:false, not ok:true)", async () => {
    (db.$executeRaw as any).mockRejectedValue(new Error("DB connection lost"));
    const result = await checkAIBudget(0.05, {
      dailyLimitUsd: 10,
      monthlyLimitUsd: 200,
      dailySpendUsd: 5,
      monthlySpendUsd: 50,
      active: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/database error/);
  });
});

describe("STEP 11.45: recordAICost — now a no-op (cost reserved in checkAIBudget)", () => {
  it("VERIFY: recordAICost does NOT call db.aIBudget.update", async () => {
    await recordAICost("SEARCH", 0.05, "user-1");
    expect(db.aIBudget.update).not.toHaveBeenCalled();
  });

  it("VERIFY: recordAICost with 0 or negative cost → early return", async () => {
    await recordAICost("SEARCH", 0, "user-1");
    await recordAICost("SEARCH", -1, "user-1");
    expect(db.aIBudget.update).not.toHaveBeenCalled();
  });
});

describe("STEP 11.45: source-code verification", () => {
  it("VERIFY: ai-policy.ts uses $executeRaw for atomic budget reservation", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/ai-policy.ts"),
      "utf-8",
    );
    expect(source).toMatch(/\$executeRaw/);
    expect(source).toMatch(/UPDATE "AIBudget"/);
    expect(source).toMatch(/"dailySpendUsd" \+ /);
    expect(source).toMatch(/<= "dailyLimitUsd"/);
    // Fail-closed on DB error
    expect(source).toMatch(/budget check failed.*database error/);
    // recordAICost is now a no-op
    expect(source).toMatch(/Intentionally empty.*cost already reserved/);
  });

  it("VERIFY: checkAIQuota fails CLOSED on DB error", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/ai-policy.ts"),
      "utf-8",
    );
    // The catch block should return ok: false (fail-closed)
    const quotaCatchMatch = source.match(/checkAIQuota[\s\S]*?catch[\s\S]*?return\s*\{[^}]*ok:\s*false/);
    expect(quotaCatchMatch).not.toBeNull();
  });
});
