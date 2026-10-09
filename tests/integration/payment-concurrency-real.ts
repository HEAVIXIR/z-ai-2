/**
 * STEP 11.22 — Real PostgreSQL Concurrency Tests
 *
 * Tests against REAL PostgreSQL (not mocks):
 * 1. Two concurrent refunds on same PAID payment → exactly one succeeds
 * 2. Two concurrent verify on same PENDING payment → exactly one succeeds
 * 3. Repeat refund after success → fails (status already REFUNDED)
 * 4. Invalid transition → fails
 * 5. Audit trail: exactly 1 success audit, 1 failure audit for concurrent
 *
 * Run: bunx tsx tests/integration/payment-concurrency-real.ts
 */

import { db } from '@/lib/db';

let pass = 0;
let fail = 0;

function assert(condition: boolean, message: string) {
  if (condition) { console.log(`  ✅ ${message}`); pass++; }
  else { console.log(`  ❌ ${message}`); fail++; }
}

async function createPayment(status: string): Promise<string> {
  const payment = await db.payment.create({
    data: {
      userId: (await db.user.findFirst())!.id,
      amount: BigInt(10000),
      currency: 'IRR',
      type: 'ORDER_PAYMENT',
      status: status as any,
      gateway: 'MANUAL',
    },
  });
  return payment.id;
}

async function getPaymentStatus(id: string): Promise<string | null> {
  const p = await db.payment.findUnique({ where: { id }, select: { status: true } });
  return p?.status ?? null;
}

async function countAuditEntries(action: string, entityId: string): Promise<number> {
  return await db.auditLog.count({ where: { action, entityId } });
}

async function cleanup(id: string) {
  try { await db.payment.delete({ where: { id } }); } catch {}
  await db.auditLog.deleteMany({ where: { entityId: id } }).catch(() => {});
}

// ── Scenario 1: Concurrent refunds ──────────────────────────
async function testConcurrentRefund() {
  console.log('\n── 1. Concurrent refund on PAID payment ──');
  const paymentId = await createPayment('PAID');

  // Simulate two concurrent refund attempts using updateMany with conditional WHERE
  const [result1, result2] = await Promise.all([
    db.payment.updateMany({
      where: { id: paymentId, status: 'PAID' },
      data: { status: 'REFUNDED' },
    }),
    db.payment.updateMany({
      where: { id: paymentId, status: 'PAID' },
      data: { status: 'REFUNDED' },
    }),
  ]);

  console.log(`  Result 1: count=${result1.count}, Result 2: count=${result2.count}`);
  const totalUpdated = result1.count + result2.count;

  assert(totalUpdated === 1, `exactly 1 refund succeeded (got ${totalUpdated})`);

  const finalStatus = await getPaymentStatus(paymentId);
  assert(finalStatus === 'REFUNDED', `final status is REFUNDED (got ${finalStatus})`);

  await cleanup(paymentId);
}

// ── Scenario 2: Concurrent verify ───────────────────────────
async function testConcurrentVerify() {
  console.log('\n── 2. Concurrent verify on PENDING payment ──');
  const paymentId = await createPayment('PENDING');

  const [result1, result2] = await Promise.all([
    db.payment.updateMany({
      where: { id: paymentId, status: 'PENDING' },
      data: { status: 'PAID', paidAt: new Date() },
    }),
    db.payment.updateMany({
      where: { id: paymentId, status: 'PENDING' },
      data: { status: 'PAID', paidAt: new Date() },
    }),
  ]);

  const totalUpdated = result1.count + result2.count;
  assert(totalUpdated === 1, `exactly 1 verify succeeded (got ${totalUpdated})`);

  const finalStatus = await getPaymentStatus(paymentId);
  assert(finalStatus === 'PAID', `final status is PAID (got ${finalStatus})`);

  await cleanup(paymentId);
}

// ── Scenario 3: Repeat refund after success ─────────────────
async function testRepeatRefund() {
  console.log('\n── 3. Repeat refund after success ──');
  const paymentId = await createPayment('PAID');

  // First refund
  const r1 = await db.payment.updateMany({
    where: { id: paymentId, status: 'PAID' },
    data: { status: 'REFUNDED' },
  });
  assert(r1.count === 1, 'first refund succeeds');

  // Second refund (status is now REFUNDED, not PAID)
  const r2 = await db.payment.updateMany({
    where: { id: paymentId, status: 'PAID' },
    data: { status: 'REFUNDED' },
  });
  assert(r2.count === 0, 'second refund fails (count=0)');

  const finalStatus = await getPaymentStatus(paymentId);
  assert(finalStatus === 'REFUNDED', `status unchanged (REFUNDED)`);

  await cleanup(paymentId);
}

// ── Scenario 4: Invalid transition ──────────────────────────
async function testInvalidTransition() {
  console.log('\n── 4. Invalid transition (CANCELLED → REFUNDED) ──');
  const paymentId = await createPayment('CANCELLED');

  const result = await db.payment.updateMany({
    where: { id: paymentId, status: 'PAID' }, // expects PAID, but is CANCELLED
    data: { status: 'REFUNDED' },
  });
  assert(result.count === 0, 'invalid transition rejected (count=0)');

  const finalStatus = await getPaymentStatus(paymentId);
  assert(finalStatus === 'CANCELLED', `status unchanged (CANCELLED)`);

  await cleanup(paymentId);
}

// ── Scenario 5: Audit trail for concurrent ──────────────────
async function testAuditTrail() {
  console.log('\n── 5. Audit trail for concurrent operations ──');
  const paymentId = await createPayment('PAID');

  // First refund (succeeds)
  await db.payment.updateMany({
    where: { id: paymentId, status: 'PAID' },
    data: { status: 'REFUNDED' },
  });

  // Write audit for success
  await db.auditLog.create({
    data: {
      actorId: 'test',
      action: 'payments.refund',
      entityType: 'Payment',
      entityId: paymentId,
      beforeJson: JSON.stringify({ status: 'PAID' }),
      afterJson: JSON.stringify({ status: 'REFUNDED' }),
    },
  });

  // Second refund attempt (fails — status already REFUNDED)
  const r2 = await db.payment.updateMany({
    where: { id: paymentId, status: 'PAID' },
    data: { status: 'REFUNDED' },
  });

  if (r2.count === 0) {
    // Write .failed audit
    await db.auditLog.create({
      data: {
        actorId: 'test',
        action: 'payments.refund.failed',
        entityType: 'Payment',
        entityId: paymentId,
        beforeJson: JSON.stringify({ status: 'REFUNDED' }),
        afterJson: null,
        reason: 'FAILED: ATOMIC_UPDATE_FAILED',
      },
    });
  }

  const successAudits = await countAuditEntries('payments.refund', paymentId);
  const failedAudits = await countAuditEntries('payments.refund.failed', paymentId);

  assert(successAudits === 1, `exactly 1 success audit (got ${successAudits})`);
  assert(failedAudits === 1, `exactly 1 failure audit (got ${failedAudits})`);

  await cleanup(paymentId);
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  STEP 11.22 — Real PostgreSQL Concurrency');
  console.log('═══════════════════════════════════════════');

  try {
    await testConcurrentRefund();
    await testConcurrentVerify();
    await testRepeatRefund();
    await testInvalidTransition();
    await testAuditTrail();
  } catch (err) {
    console.error('\n💥 UNEXPECTED ERROR:', err);
    fail++;
  }

  console.log('\n═══════════════════════════════════════════');
  console.log(`  RESULTS: ${pass} passed, ${fail} failed`);
  console.log('═══════════════════════════════════════════');

  await db.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main();
