/**
 * HEAVIX — Security Tests: Audit Transactionality (STEP 11.8)
 * -----------------------------------------------------------
 * Behavioral tests for `auditMutationTransactional` in
 * `src/lib/audit-foundation.ts`.
 *
 * STEP 11.8 added `auditMutationTransactional` to wrap a mutation +
 * audit log insert in a single `db.$transaction` so BOTH commit
 * atomically or BOTH roll back. This closes the "audit gap" risk for
 * CRITICAL operations (payment.refund, payment.verify).
 *
 * Test strategy:
 *   - Hoist a stable spy on `db.$transaction` so we can simulate
 *     success/failure of the transaction itself.
 *   - Mock `logAudit` (used by the non-transactional path; not
 *     expected to be called here).
 *   - Mock `next/headers` (used by getRequestInfo for IP/UA).
 *   - Use REAL `auditMutationTransactional` function.
 *
 * Runs under `bun run test:security`
 * (config: vitest.security.config.ts → includes tests/security/**).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

/* ── Hoisted spies ────────────────────────────────────────────────
   db.$transaction spy must be hoisted so the vi.mock factory can
   reference it without TDZ issues.
   ============================================================ */

const spies = vi.hoisted(() => ({
  // $transaction is called as db.$transaction(async (tx) => { ... }).
  // We implement it as: invoke the callback with a mock tx object.
  $transaction: vi.fn<(cb: (tx: any) => Promise<any>) => Promise<any>>(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    get $transaction() {
      return spies.$transaction;
    },
  },
}));

vi.mock("@/lib/audit", () => ({
  logAudit: spies.logAudit,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

// Import AFTER vi.mock.
const { auditMutationTransactional } = await import("@/lib/audit-foundation");

beforeEach(() => {
  spies.$transaction.mockReset();
  spies.logAudit.mockReset();

  // Default $transaction: invoke callback with a mock tx that has
  // auditLog.create returning a resolved promise.
  spies.$transaction.mockImplementation(async (cb) => {
    const mockTx = {
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-1" }),
      },
    };
    return cb(mockTx);
  });
});

/* ────────────────────────────────────────────────────────────────
   Test 1: mutation + audit both succeed → both commit
   ──────────────────────────────────────────────────────────────── */

describe("auditMutationTransactional — atomicity", () => {
  it("mutation succeeds + audit succeeds → both commit (transaction returns result)", async () => {
    const mutationSpy = vi.fn().mockResolvedValue({ id: "p1", status: "REFUNDED" });

    const result = await auditMutationTransactional(
      {
        actorId: "admin-1",
        action: "payments.refund",
        entityType: "Payment",
        entityId: "p1",
        reason: "Customer dispute",
        before: { id: "p1", status: "PAID" },
      },
      async (tx) => {
        // Simulate the mutation writing through tx
        return mutationSpy(tx);
      },
    );

    // Mutation was called with the tx client
    expect(mutationSpy).toHaveBeenCalledTimes(1);
    // $transaction was called once
    expect(spies.$transaction).toHaveBeenCalledTimes(1);
    // Result has the expected shape
    expect(result.audited).toBe(true);
    expect(result.result).toEqual({ id: "p1", status: "REFUNDED" });
    expect(result.before).toEqual({ id: "p1", status: "PAID" });
    expect(result.after).toEqual({ id: "p1", status: "REFUNDED" });
  });

  it("audit insert FAILS → mutation rolled back (db.$transaction throws)", async () => {
    // Simulate audit insert failure: tx.auditLog.create rejects
    spies.$transaction.mockImplementation(async (cb) => {
      const mockTx = {
        auditLog: {
          create: vi.fn().mockRejectedValue(new Error("Audit DB constraint violated")),
        },
      };
      // The cb will: run mutation (succeeds), then call tx.auditLog.create
      // (rejects) → cb throws → $transaction rethrows → result is rejected.
      return cb(mockTx);
    });

    const mutationSpy = vi.fn().mockResolvedValue({ id: "p1", status: "REFUNDED" });

    // The transaction should reject — proving atomicity (no partial commit)
    await expect(
      auditMutationTransactional(
        {
          actorId: "admin-1",
          action: "payments.refund",
          entityType: "Payment",
          entityId: "p1",
        },
        async () => mutationSpy(),
      ),
    ).rejects.toThrow(/Audit DB constraint violated/);

    // Mutation was CALLED (the operation callback ran inside the tx) — but
    // because the audit failed afterward, the entire tx rolled back. The
    // mutation's effect is undone (in a real DB, the UPDATE would be
    // rolled back; here we just verify the tx rejected).
    expect(mutationSpy).toHaveBeenCalledTimes(1);
  });

  it("mutation FAILS → audit NOT attempted (operation throws before audit insert)", async () => {
    // Mutation rejects — the operation callback throws before reaching
    // tx.auditLog.create. $transaction rethrows → no audit insert.
    const auditCreateSpy = vi.fn().mockResolvedValue({ id: "audit-1" });
    spies.$transaction.mockImplementation(async (cb) => {
      const mockTx = {
        auditLog: { create: auditCreateSpy },
      };
      return cb(mockTx);
    });

    const mutationError = new Error("Payment not found");
    await expect(
      auditMutationTransactional(
        {
          actorId: "admin-1",
          action: "payments.refund",
          entityType: "Payment",
          entityId: "p1",
        },
        async () => {
          throw mutationError;
        },
      ),
    ).rejects.toThrow(/Payment not found/);

    // CRITICAL: audit insert must NOT have been called — the mutation
    // failed, so no audit row should be created via this path. (The
    // non-transactional auditMutation logs `.failed` entries; this
    // transactional variant does NOT — failure propagation is the
    // caller's responsibility.)
    expect(auditCreateSpy).not.toHaveBeenCalled();
  });

  it("afterJson captures the operation result (passed to tx.auditLog.create)", async () => {
    const auditCreateSpy = vi.fn().mockResolvedValue({ id: "audit-1" });
    spies.$transaction.mockImplementation(async (cb) => {
      const mockTx = {
        auditLog: { create: auditCreateSpy },
      };
      return cb(mockTx);
    });

    const opResult = { id: "p1", status: "REFUNDED", refundedAt: "2026-10-08T00:00:00Z" };

    await auditMutationTransactional(
      {
        actorId: "admin-1",
        action: "payments.refund",
        entityType: "Payment",
        entityId: "p1",
        before: { id: "p1", status: "PAID" },
      },
      async () => opResult,
    );

    // Verify tx.auditLog.create was called with the after-state derived
    // from the operation's return value.
    expect(auditCreateSpy).toHaveBeenCalledTimes(1);
    const createArg = auditCreateSpy.mock.calls[0][0];
    expect(createArg.data.action).toBe("payments.refund");
    expect(createArg.data.entityId).toBe("p1");
    // beforeJson is a string (JSON.stringify of the before object)
    expect(createArg.data.beforeJson).toContain('"status":"PAID"');
    // afterJson is a string (JSON.stringify of the operation result)
    expect(createArg.data.afterJson).toContain('"status":"REFUNDED"');
    expect(createArg.data.afterJson).toContain('"refundedAt"');
  });
});
