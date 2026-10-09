/**
 * HEAVIX — Security Tests: Action Preconditions (STEP 11.6 Phase C.1)
 * ------------------------------------------------------------------
 * Behavioral tests for the precondition evaluation in
 * `src/lib/admin/action-engine.ts:executeAction`.
 *
 * STEP 11.6 Phase C.1 added a `precondition?` field to `AdminAction`
 * and wired its evaluation in `executeAction` (AFTER permission,
 * BEFORE mutation). STEP 11.7-SEC found that the code had 3-state
 * logic but ZERO behavioral tests for the failure path. This file
 * closes that gap.
 *
 * Test strategy:
 *   - Mock `can` (permission check), `getPrismaModel` (DB lookup),
 *     `auditMutation` + `auditMutationTransactional` (audit wrap),
 *     `revalidateTag` (cache invalidation), and
 *     `getHomepageCacheTags` (cache tag list).
 *   - Use the REAL `executeAction` function and REAL `paymentConfig`
 *     from production (`store-resources.ts`).
 *   - Verify: precondition PASS → mutation executes; precondition
 *     FAIL → returns PRECONDITION_FAILED, mutation NOT executed.
 *
 * Runs under `bun run test:security`
 * (config: vitest.security.config.ts → includes tests/security/**).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

/* ── Hoisted spies (avoid TDZ issues with vi.mock factories) ─────
   vi.mock factories run before any top-level code, so any variable
   they reference must be hoisted via vi.hoisted (which makes it
   available at module-init time).
   ============================================================ */

const spies = vi.hoisted(() => {
  return {
    can: vi.fn<(userId: string | null, permission: string) => Promise<boolean>>(),
    getPrismaModel: vi.fn(),
    auditMutation: vi.fn(),
    auditMutationTransactional: vi.fn(),
    revalidateTag: vi.fn(),
    getHomepageCacheTags: vi.fn(),
  };
});

vi.mock("@/lib/authorization", () => ({
  get can() {
    return spies.can;
  },
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

// Import AFTER vi.mock so the action-engine picks up the mocks.
// CRITICAL: import resource-index FIRST so the registry singleton is
// populated before executeAction tries to look up the payment config.
// Without this, registry.get("payments") returns undefined and
// executeAction returns "Resource not found" (no error code set).
await import("@/lib/admin/resource-index");
const { executeAction } = await import("@/lib/admin/action-engine");
const { paymentConfig } = await import("@/lib/admin/resources/store-resources");

beforeEach(() => {
  // Reset all spies
  spies.can.mockReset();
  spies.getPrismaModel.mockReset();
  spies.auditMutation.mockReset();
  spies.auditMutationTransactional.mockReset();
  spies.revalidateTag.mockReset();
  spies.getHomepageCacheTags.mockReset();

  // Default: user has all permissions (admin-like)
  spies.can.mockResolvedValue(true);
  spies.getHomepageCacheTags.mockReturnValue([]);

  // Default getPrismaModel: returns a mock model with findUnique
  spies.getPrismaModel.mockReturnValue({
    findUnique: vi.fn(),
    update: vi.fn(),
  });
});

/* ────────────────────────────────────────────────────────────────
   Test 1: precondition PASSES → mutation executes (auditMutationTransactional)
   ──────────────────────────────────────────────────────────────── */

describe("Action preconditions — payment.refund", () => {
  it("precondition passes (status=PAID) → refund executes via transactional path", async () => {
    // Setup: payment is in PAID status → precondition passes
    const mockPayment = { id: "pay-1", status: "PAID", amount: 1000 };
    spies.getPrismaModel.mockReturnValue({
      findUnique: vi.fn().mockResolvedValue(mockPayment),
      update: vi.fn().mockResolvedValue({ ...mockPayment, status: "REFUNDED" }),
    });

    // auditMutationTransactional should be called (action.transactional=true)
    spies.auditMutationTransactional.mockImplementation(async (_ctx, op) => {
      const result = await op({ payment: { update: vi.fn().mockResolvedValue({ ...mockPayment, status: "REFUNDED" }) } } as any);
      return { result, before: mockPayment, after: result, audited: true };
    });

    const result = await executeAction("payments", "pay-1", "refund", {
      userId: "admin-1",
      reason: "Customer dispute",
    });

    expect(result.success).toBe(true);
    expect(spies.auditMutationTransactional).toHaveBeenCalled();
    expect(spies.auditMutation).not.toHaveBeenCalled();
  });

  it("precondition FAILS (status=REFUNDED) → returns PRECONDITION_FAILED, mutation NOT executed", async () => {
    // Setup: payment already refunded → precondition fails
    const mockPayment = { id: "pay-1", status: "REFUNDED", amount: 1000 };
    const updateSpy = vi.fn();
    spies.getPrismaModel.mockReturnValue({
      findUnique: vi.fn().mockResolvedValue(mockPayment),
      update: updateSpy,
    });

    const result = await executeAction("payments", "pay-1", "refund", {
      userId: "admin-1",
      reason: "Customer dispute",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("PRECONDITION_FAILED");
    expect(result.message).toMatch(/بازگشت وجه فقط برای پرداخت‌های پرداخت‌شده/);
    // CRITICAL: mutation must NOT be executed
    expect(updateSpy).not.toHaveBeenCalled();
    expect(spies.auditMutationTransactional).not.toHaveBeenCalled();
    expect(spies.auditMutation).not.toHaveBeenCalled();
  });
});

/* ────────────────────────────────────────────────────────────────
   Test 3: permission DENIED → returns FORBIDDEN, precondition not evaluated
   ──────────────────────────────────────────────────────────────── */

describe("Action preconditions — permission denial short-circuits", () => {
  it("permission DENIED → returns FORBIDDEN, precondition not evaluated, mutation not executed", async () => {
    // User lacks payment.refund permission
    spies.can.mockResolvedValue(false);

    const findUniqueSpy = vi.fn();
    spies.getPrismaModel.mockReturnValue({
      findUnique: findUniqueSpy,
      update: vi.fn(),
    });

    const result = await executeAction("payments", "pay-1", "refund", {
      userId: "user-no-refund",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("FORBIDDEN");
    // Permission check is BEFORE the findUnique call (precondition check)
    // → neither findUnique nor update should have been called.
    expect(findUniqueSpy).not.toHaveBeenCalled();
  });
});

/* ────────────────────────────────────────────────────────────────
   Test 4: payment.verify precondition (status === PENDING)
   ──────────────────────────────────────────────────────────────── */

describe("Action preconditions — payment.verify", () => {
  it("verify precondition passes only when status === PENDING", async () => {
    // Test the precondition function directly by extracting it from the config
    const verifyAction = paymentConfig.actions?.find(a => a.key === "verify");
    expect(verifyAction).toBeDefined();
    expect(verifyAction!.precondition).toBeDefined();

    const precondition = verifyAction!.precondition!;

    // PENDING → passes
    expect(precondition({ status: "PENDING" }, { userId: "u1" })).toEqual({ ok: true });

    // PAID → fails
    const failedResult = precondition({ status: "PAID" }, { userId: "u1" });
    expect(failedResult.ok).toBe(false);

    // REFUNDED → fails
    const failedResult2 = precondition({ status: "REFUNDED" }, { userId: "u1" });
    expect(failedResult2.ok).toBe(false);

    // Empty/missing status → fails (defensive)
    const failedResult3 = precondition({}, { userId: "u1" });
    expect(failedResult3.ok).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────
   Test 5: refund precondition (status ∈ {PAID, AUTHORIZED})
   ──────────────────────────────────────────────────────────────── */

describe("Action preconditions — payment.refund (precondition function)", () => {
  it("refund precondition passes only when status ∈ {PAID, AUTHORIZED}", async () => {
    const refundAction = paymentConfig.actions?.find(a => a.key === "refund");
    expect(refundAction).toBeDefined();
    expect(refundAction!.precondition).toBeDefined();

    const precondition = refundAction!.precondition!;

    // PAID → passes
    expect(precondition({ status: "PAID" }, { userId: "u1" })).toEqual({ ok: true });

    // AUTHORIZED → passes
    expect(precondition({ status: "AUTHORIZED" }, { userId: "u1" })).toEqual({ ok: true });

    // PENDING → fails (can't refund a pending payment)
    const r1 = precondition({ status: "PENDING" }, { userId: "u1" });
    expect(r1.ok).toBe(false);

    // REFUNDED → fails (already refunded)
    const r2 = precondition({ status: "REFUNDED" }, { userId: "u1" });
    expect(r2.ok).toBe(false);

    // FAILED → fails
    const r3 = precondition({ status: "FAILED" }, { userId: "u1" });
    expect(r3.ok).toBe(false);
  });
});
