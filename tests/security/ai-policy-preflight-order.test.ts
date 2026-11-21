import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findPolicy: vi.fn(),
  countLogs: vi.fn(),
  upsertBudget: vi.fn(),
  executeRaw: vi.fn(),
  isAdmin: vi.fn(),
  hasRole: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    aITaskPolicy: { findUnique: mocks.findPolicy },
    aIGatewayLog: { count: mocks.countLogs },
    aIBudget: {
      upsert: mocks.upsertBudget,
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $executeRaw: mocks.executeRaw,
  },
}));

vi.mock("@/lib/authorization", () => ({
  isAdmin: mocks.isAdmin,
  hasRole: mocks.hasRole,
}));

const { preflightAIRequest } = await import("@/lib/ai-policy");

const policy = {
  taskType: "SEARCH",
  active: true,
  allowedRoles: "ADMIN",
  hourlyLimit: 30,
  dailyLimit: 100,
  maxInputChars: 100,
  maxOutputTokens: 2000,
  model: "default",
  timeoutMs: 30000,
  costCeilingUsd: 0.05,
};

const budget = {
  id: "main",
  dailyLimitUsd: 10,
  monthlyLimitUsd: 200,
  dailySpendUsd: 1,
  monthlySpendUsd: 5,
  dailyResetAt: new Date(),
  monthlyResetAt: new Date(),
  active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findPolicy.mockResolvedValue(policy);
  mocks.countLogs.mockResolvedValue(0);
  mocks.upsertBudget.mockResolvedValue(budget);
  mocks.executeRaw.mockResolvedValue(1);
  mocks.isAdmin.mockResolvedValue(true);
  mocks.hasRole.mockResolvedValue(false);
});

describe("AI preflight side-effect ordering", () => {
  it("rejects oversized input before quota reads or budget reservation", async () => {
    const result = await preflightAIRequest({
      taskType: "SEARCH",
      user: { id: "admin-1" },
      inputLength: policy.maxInputChars + 1,
    });

    expect(result).toMatchObject({ ok: false, statusCode: 400 });
    expect(mocks.countLogs).not.toHaveBeenCalled();
    expect(mocks.upsertBudget).not.toHaveBeenCalled();
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    "rejects invalid input length %s without reserving budget",
    async (inputLength) => {
      const result = await preflightAIRequest({
        taskType: "SEARCH",
        user: { id: "admin-1" },
        inputLength,
      });

      expect(result).toMatchObject({ ok: false, statusCode: 400 });
      expect(mocks.countLogs).not.toHaveBeenCalled();
      expect(mocks.upsertBudget).not.toHaveBeenCalled();
      expect(mocks.executeRaw).not.toHaveBeenCalled();
    },
  );

  it("checks quota before reserving the global budget for valid input", async () => {
    const result = await preflightAIRequest({
      taskType: "SEARCH",
      user: { id: "admin-1" },
      inputLength: 80,
    });

    expect(result).toMatchObject({ ok: true });
    expect(mocks.countLogs).toHaveBeenCalledTimes(2);
    expect(mocks.upsertBudget).toHaveBeenCalledTimes(1);
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.countLogs.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.upsertBudget.mock.invocationCallOrder[0],
    );
    expect(mocks.upsertBudget.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.executeRaw.mock.invocationCallOrder[0],
    );
  });
});
