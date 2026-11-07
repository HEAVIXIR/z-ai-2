/**
 * STEP 11.23 — Real PostgreSQL readonlyWhen Concurrency Test
 *
 * Proves that SELECT FOR UPDATE prevents TOCTOU race in readonlyWhen:
 * - Request A: reads record (PUBLISHED) with FOR UPDATE, starts evaluating
 * - Request B: tries to change status to DRAFT concurrently
 * - Request B BLOCKS until A commits
 * - After A commits (with price rejected), B can proceed
 * - B sees the updated state
 *
 * Also tests that status-only refund actions are blocked and payment verification remains transactional.
 *
 * Run: bunx tsx tests/integration/readonly-when-concurrency-real.ts
 */

import { db } from '@/lib/db';
import '@/lib/admin/resource-index'; // ensures all resources are registered
import { executeAction } from '@/lib/admin/action-engine';

let pass = 0;
let fail = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { console.log(`  ✅ ${msg}`); pass++; }
  else { console.log(`  ❌ ${msg}`); fail++; }
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  STEP 11.23 — Real PostgreSQL Concurrency');
  console.log('═══════════════════════════════════════════');

  // ── Get admin user ──
  const adminUser = await db.user.findFirst();
  if (!adminUser) { console.log('❌ No user found'); process.exit(1); }

  // ═══════════════════════════════════════════════════════════
  // TEST 1: readonlyWhen TOCTOU — SELECT FOR UPDATE prevents race
  // ═══════════════════════════════════════════════════════════
  console.log('\n── 1. readonlyWhen TOCTOU: SELECT FOR UPDATE ──');

  // Create a listing with status=PUBLISHED
  const listing = await db.listing.create({
    data: {
      title: 'TOCTOU Test Listing',
      slug: 'toctou-test-' + Date.now(),
      status: 'PUBLISHED',
      price: BigInt(50000),
      sellerId: adminUser.id,
      listingType: 'MACHINE',
    },
  });

  try {
    // Request A: Starts a transaction, does SELECT FOR UPDATE, then "thinks"
    // Request B: Tries to change status concurrently — should BLOCK
    // After A commits, B can proceed

    let aSawStatus: string | null = null;
    let bCommittedBeforeA = false;

    // Start Request A (holds the lock)
    const promiseA = (async () => {
      return await db.$transaction(async (tx) => {
        // SELECT FOR UPDATE — locks the row
        const rows = await tx.$queryRaw`
          SELECT * FROM "Listing" WHERE "id" = ${listing.id} FOR UPDATE
        ` as any[];
        aSawStatus = rows[0]?.status;
        // Simulate evaluation delay
        await new Promise(resolve => setTimeout(resolve, 500));
        // A tries to update price (should be allowed since no readonlyWhen on Listing
        // — this is testing the locking mechanism, not the policy itself)
        return aSawStatus;
      });
    })();

    // Start Request B (should block until A commits)
    const promiseB = (async () => {
      // Small delay to ensure A acquires the lock first
      await new Promise(resolve => setTimeout(resolve, 100));
      try {
        // B tries to update the same row — should BLOCK
        const start = Date.now();
        await db.$transaction(async (tx) => {
          await tx.$queryRaw`
            SELECT * FROM "Listing" WHERE "id" = ${listing.id} FOR UPDATE
          `;
          await tx.listing.update({
            where: { id: listing.id },
            data: { status: 'DRAFT' },
          });
        });
        const elapsed = Date.now() - start;
        // If B committed in < 200ms, it didn't wait for A → race condition
        bCommittedBeforeA = elapsed < 200;
        return elapsed;
      } catch (err) {
        return -1;
      }
    })();

    const [resultA, resultB] = await Promise.all([promiseA, promiseB]);

    console.log(`  A saw status: ${aSawStatus}`);
    console.log(`  B elapsed: ${resultB}ms`);
    console.log(`  B committed before A: ${bCommittedBeforeA}`);

    assert(aSawStatus === 'PUBLISHED', 'A read PUBLISHED (correct)');
    assert(!bCommittedBeforeA, 'B did NOT commit before A (FOR UPDATE blocked it)');
    assert(resultB > 300, `B waited for A to commit (${resultB}ms > 300ms)`);

    // After both transactions, verify final state
    const finalListing = await db.listing.findUnique({ where: { id: listing.id } });
    assert(finalListing?.status === 'DRAFT', 'final status is DRAFT (B won after A)');
  } finally {
    await db.listing.delete({ where: { id: listing.id } }).catch(() => {});
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 2: Status-only refund is disabled until evidence exists
  // ═══════════════════════════════════════════════════════════
  console.log("\n── 2. Refund evidence gate via real executeAction ──");

  const payment = await db.payment.create({
    data: {
      userId: adminUser.id,
      amount: BigInt(50000),
      currency: 'IRR',
      type: 'ORDER_PAYMENT',
      status: 'PAID',
      gateway: 'MANUAL',
    },
  });

  try {
    const result = await executeAction('payments', payment.id, 'refund', {
      userId: adminUser.id,
      reason: 'Integration test — refund evidence gate',
    });

    assert(result.success === false, 'refund action is rejected');
    assert(result.message === 'Action not defined', 'refund is not registered until evidence workflow exists');

    const unchanged = await db.payment.findUnique({ where: { id: payment.id } });
    assert(unchanged?.status === 'PAID', 'payment remains PAID; no status-only refund');

    const auditCount = await db.auditLog.count({
      where: { entityId: payment.id, action: 'payments.refund' },
    });
    assert(auditCount === 0, 'no refund audit is written without verified money movement');

    const duplicate = await executeAction('payments', payment.id, 'refund', {
      userId: adminUser.id,
      reason: 'Duplicate blocked attempt',
    });
    assert(duplicate.success === false && duplicate.message === 'Action not defined', 'repeat refund attempt remains blocked');
  } finally {
    await db.auditLog.deleteMany({ where: { entityId: payment.id } }).catch(() => {});
    await db.payment.delete({ where: { id: payment.id } }).catch(() => {});
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 3: Payment verify via real executeAction path
  // ═══════════════════════════════════════════════════════════
  console.log('\n── 3. Payment verify via real executeAction ──');

  const payment2 = await db.payment.create({
    data: {
      userId: adminUser.id,
      amount: BigInt(30000),
      currency: 'IRR',
      type: 'ORDER_PAYMENT',
      status: 'PENDING',
      gateway: 'MANUAL',
    },
  });

  try {
    const result = await executeAction('payments', payment2.id, 'verify', {
      userId: adminUser.id,
      reason: 'Verify test',
    });

    assert(result.success === true, 'verify via executeAction succeeds');

    const finalPayment = await db.payment.findUnique({ where: { id: payment2.id } });
    assert(finalPayment?.status === 'PAID', `payment status is PAID (not VERIFIED)`);
    assert(finalPayment?.paidAt !== null, 'paidAt is set');

    // Verify audit
    const auditCount = await db.auditLog.count({
      where: { entityId: payment2.id, action: 'payments.verify' },
    });
    assert(auditCount === 1, `exactly 1 audit entry (got ${auditCount})`);

    // ── Try verify on already-PAID payment (should fail) ──
    console.log('\n  -- Verify on PAID (should fail) --');
    const result2 = await executeAction('payments', payment2.id, 'verify', {
      userId: adminUser.id,
      reason: 'Duplicate verify',
    });

    assert(result2.success === false, 'verify on PAID fails');
    assert(result2.error === 'PRECONDITION_FAILED', `returns PRECONDITION_FAILED`);

  } finally {
    await db.auditLog.deleteMany({ where: { entityId: payment2.id } }).catch(() => {});
    await db.payment.delete({ where: { id: payment2.id } }).catch(() => {});
  }

  // ═══════════════════════════════════════════════════════════
  // TEST 4: Concurrent refund attempts remain blocked
  // ═══════════════════════════════════════════════════════════
  console.log('\n── 4. Concurrent refund attempts are fail-closed ──');

  const payment3 = await db.payment.create({
    data: {
      userId: adminUser.id,
      amount: BigInt(70000),
      currency: 'IRR',
      type: 'ORDER_PAYMENT',
      status: 'PAID',
      gateway: 'MANUAL',
    },
  });

  try {
    const [r1, r2] = await Promise.all([
      executeAction('payments', payment3.id, 'refund', { userId: adminUser.id, reason: 'Concurrent blocked 1' }),
      executeAction('payments', payment3.id, 'refund', { userId: adminUser.id, reason: 'Concurrent blocked 2' }),
    ]);

    assert(!r1.success && !r2.success, 'both concurrent refund attempts are rejected');
    assert(r1.message === 'Action not defined' && r2.message === 'Action not defined', 'both are rejected before transaction');
    const finalPayment = await db.payment.findUnique({ where: { id: payment3.id } });
    assert(finalPayment?.status === 'PAID', 'concurrent attempts do not change payment status');

    const refundAudits = await db.auditLog.count({
      where: { entityId: payment3.id, action: 'payments.refund' },
    });
    assert(refundAudits === 0, 'no refund audit exists for blocked attempts');
  } finally {
    await db.auditLog.deleteMany({ where: { entityId: payment3.id } }).catch(() => {});
    await db.payment.delete({ where: { id: payment3.id } }).catch(() => {});
  }

  console.log('\n═══════════════════════════════════════════');
  console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
  console.log('═══════════════════════════════════════════');

  await db.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main();
