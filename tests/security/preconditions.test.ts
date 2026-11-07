import { describe, it, expect, beforeEach, vi } from "vitest";

const spies = vi.hoisted(() => ({
  can: vi.fn<(userId: string | null, permission: string) => Promise<boolean>>(),
  getPrismaModel: vi.fn(),
  auditMutation: vi.fn(),
  auditMutationTransactional: vi.fn(),
  revalidateTag: vi.fn(),
  getHomepageCacheTags: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({
  get can() { return spies.can; },
}));
vi.mock("@/lib/admin/data-adapter", () => ({
  getPrismaModel: spies.getPrismaModel,
}));
vi.mock("@/lib/audit-foundation", () => ({
  auditMutation: spies.auditMutation,
  auditMutationTransactional: spies.auditMutationTransactional,
}));
vi.mock("next/cache", () => ({
  revalidateTag: spies.revalidateTag,
}));
vi.mock("@/lib/homepage-cache-tags", () => ({
  getHomepageCacheTags: spies.getHomepageCacheTags,
}));

// Register real resource definitions before loading the action engine.
await import("@/lib/admin/resource-index");
const { executeAction } = await import("@/lib/admin/action-engine");
const { paymentConfig } = await import("@/lib/admin/resources/store-resources");

beforeEach(() => {
  spies.can.mockReset();
  spies.getPrismaModel.mockReset();
  spies.auditMutation.mockReset();
  spies.auditMutationTransactional.mockReset();
  spies.revalidateTag.mockReset();
  spies.getHomepageCacheTags.mockReset();
  spies.can.mockResolvedValue(true);
  spies.getHomepageCacheTags.mockReturnValue([]);
  spies.getPrismaModel.mockReturnValue({
    findUnique: vi.fn(),
    update: vi.fn(),
  });
});

describe("Payment action safety boundaries", () => {
  it("exposes transactional verify but deliberately does not expose refund", () => {
    expect(paymentConfig.actions?.some((action) => action.key === "verify")).toBe(true);
    expect(paymentConfig.actions?.some((action) => action.key === "refund")).toBe(false);
  });

  it("rejects refund before permission checks, database reads, mutations, or audit", async () => {
    const result = await executeAction("payments", "pay-1", "refund", {
      userId: "admin-1",
      reason: "Customer dispute",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("ACTION_UNAVAILABLE");
    expect(result.message).toMatch(/evidence-backed refund workflow/);
    expect(spies.can).not.toHaveBeenCalled();
    expect(spies.getPrismaModel).not.toHaveBeenCalled();
    expect(spies.auditMutationTransactional).not.toHaveBeenCalled();
    expect(spies.auditMutation).not.toHaveBeenCalled();
  });

  it("verify precondition passes only for PENDING payments", () => {
    const verifyAction = paymentConfig.actions?.find((action) => action.key === "verify");
    expect(verifyAction?.precondition).toBeDefined();
    const precondition = verifyAction!.precondition!;

    expect(precondition({ status: "PENDING" }, { userId: "u1" })).toEqual({ ok: true });
    expect(precondition({ status: "PAID" }, { userId: "u1" }).ok).toBe(false);
    expect(precondition({ status: "REFUNDED" }, { userId: "u1" }).ok).toBe(false);
    expect(precondition({}, { userId: "u1" }).ok).toBe(false);
  });

  it("permission denial for verify short-circuits before loading the payment", async () => {
    spies.can.mockResolvedValue(false);
    const findUnique = vi.fn();
    spies.getPrismaModel.mockReturnValue({ findUnique, update: vi.fn() });

    const result = await executeAction("payments", "pay-1", "verify", {
      userId: "user-without-payment-manage",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("FORBIDDEN");
    expect(findUnique).not.toHaveBeenCalled();
    expect(spies.auditMutationTransactional).not.toHaveBeenCalled();
  });
});
