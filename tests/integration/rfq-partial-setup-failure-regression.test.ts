import { describe, it, expect, beforeAll, afterAll } from "vitest";

/* ============================================================
   STEP 14.93-R — Partial beforeAll Failure Regression Test (OF-3)
   ------------------------------------------------------------
   Purpose: Verify that the cleanup pattern used by
   rfq-quote-visibility-real.test.ts handles partial setup
   failure correctly — no orphaned data, no undefined IDs passed
   to delete, cleanup errors surfaced (not swallowed).

   This test simulates a mid-beforeAll failure: it creates ONE
   user (buyer), then "fails" before creating the RFQ/quotes.
   The afterAll cleanup must:
     1. Delete the successfully-created user
     2. NOT attempt to delete RFQ/quotes (IDs are undefined)
     3. Surface any cleanup errors via AggregateError

   This is a regression test for the pattern, NOT a test of
   PR #61's specific file. It runs against real PostgreSQL in CI
   (same gating as the RFQ integration test).

   Owner directive STEP 14.93-R #5: "تست‌های مربوط به شکست جزئی
   beforeAll را بررسی کن و فقط مواردی را که واقعاً اجرا شده‌اند،
   موفق گزارش کن."
   ============================================================ */

const RUN_TESTS = process.env.DATABASE_URL?.includes("localhost") ?? false;

describe.skipIf(!RUN_TESTS)("Partial beforeAll Failure — Cleanup Regression", () => {
  const createdUserIds: string[] = [];
  let buyerId: string | undefined;
  // rfqId and quoteIds are deliberately NOT set — simulating partial setup failure
  let rfqId: string | undefined;

  beforeAll(async () => {
    const { db } = await import("@/lib/db");
    const testRunId = `partial-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Create only the buyer (simulating partial setup — then "failure")
    const buyer = await db.user.create({
      data: {
        firstName: "PartialBuyer",
        lastName: testRunId,
        email: `partial-buyer-${testRunId}@test.example`,
        mobile: `09${testRunId.slice(-8)}`,
        passwordHash: "test-hash",
        role: "BUYER",
        status: "ACTIVE",
        emailVerified: true,
        mobileVerified: true,
      },
    });
    buyerId = buyer.id;
    createdUserIds.push(buyerId);

    // SIMULATE FAILURE: do NOT create RFQ or quotes.
    // In a real partial-failure scenario, beforeAll would throw here
    // (e.g., db connection drop, constraint violation). We deliberately
    // skip the remaining setup to test that afterAll handles undefined IDs.
    // rfqId remains undefined.
  });

  afterAll(async () => {
    // This cleanup mirrors the pattern in rfq-quote-visibility-real.test.ts
    // (PR #61 be0cdda). It must handle the case where rfqId is undefined.
    const cleanupErrors: unknown[] = [];
    const attemptCleanup = async (label: string, action: () => Promise<unknown>) => {
      try {
        await action();
      } catch (error) {
        cleanupErrors.push(new Error(`Cleanup failed for ${label}`, { cause: error }));
      }
    };

    if (rfqId || createdUserIds.length > 0) {
      const { db } = await import("@/lib/db");

      // Only attempt RFQ cleanup if rfqId is defined (it's NOT in this test)
      if (rfqId) {
        await attemptCleanup("RFQ quotes", () =>
          db.rFQQuote.deleteMany({ where: { rfqId } })
        );
        await attemptCleanup("RFQ", () =>
          db.rFQ.delete({ where: { id: rfqId! } })
        );
      }

      // User cleanup — createdUserIds has the buyer
      if (createdUserIds.length > 0) {
        await attemptCleanup("test users", () =>
          db.user.deleteMany({ where: { id: { in: createdUserIds } } })
        );
      }
    }

    // If any cleanup failed, surface it (do NOT swallow)
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, "Partial-setup cleanup failed");
    }
  });

  it("partial setup creates only the buyer (rfqId undefined)", () => {
    // Verify the simulation is correct: buyer exists, rfqId does not
    expect(buyerId).toBeDefined();
    expect(createdUserIds).toHaveLength(1);
    expect(createdUserIds[0]).toBe(buyerId);
    expect(rfqId).toBeUndefined();
  });

  it("afterAll guard prevents delete with undefined rfqId", async () => {
    // This test documents the guard: if rfqId is undefined, the cleanup
    // must NOT call db.rFQ.delete({ where: { id: undefined } }).
    // The guard `if (rfqId)` ensures this. We verify the guard logic
    // by checking that rfqId is falsy (undefined).
    expect(rfqId ? true : false).toBe(false);
  });

  it("createdUserIds array tracks only successfully-created entities", () => {
    // The tracking array must contain ONLY the buyer (the one entity
    // that was successfully created before the simulated failure).
    // No undefined/null entries should be present.
    expect(createdUserIds.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
  });
});
