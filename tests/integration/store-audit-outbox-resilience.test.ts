/**
 * HEAVIX — STEP 15.95+ — Audit Outbox Resilience Test
 *
 * Task ID: STEP-15.95-AUDIT-OUTBOX-RESILIENCE
 *
 * WHAT THIS TESTS
 *   The Transactional Outbox pattern guarantees that every committed store
 *   mutation has a corresponding audit event that WILL eventually be delivered
 *   to the main AuditLog table, even if the main DB is temporarily unavailable
 *   at commit time.
 *
 * SCENARIOS
 *   1. The audit event is enqueued INSIDE the storeDb transaction (atomic
 *      with the mutation). If the transaction commits, the outbox row exists.
 *   2. The outbox row retains PENDING status until drained.
 *   3. Stats reporting is accurate.
 *
 * NOTE: The full drain-to-main-DB path (drainAuditOutbox writing to
 * db.auditLog) is NOT tested here because loading the main HEAVIX
 * @prisma/client in the integration test environment conflicts with the
 * store-schema Prisma client. The drain path is exercised by the
 * audit-transaction-real.ts integration test and by the CI verify job's
 * contract tests (which verify audit hook presence + field correctness).
 *
 * RUN
 *   bunx vitest run tests/integration/store-audit-outbox-resilience.test.ts
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { storeDb } from '@/lib/store-db';
import { enqueueAuditOutbox, getAuditOutboxStats } from '@/lib/store-audit-outbox';

// ─── Infrastructure detection (top-level) ──────────────────────────────────
const STORE_DB_AVAILABLE = (() => {
  try {
    return !!process.env.STORE_DATABASE_URL;
  } catch {
    return false;
  }
})();

beforeAll(async () => {
  if (!STORE_DB_AVAILABLE) {
    console.warn(
      `[store-audit-outbox-resilience] SKIP: STORE_DATABASE_URL not set`,
    );
    return;
  }
});

afterEach(async () => {
  if (!STORE_DB_AVAILABLE) return;
  try {
    await storeDb.auditOutbox.deleteMany({});
  } catch {
    // best-effort cleanup
  }
});

describe.skipIf(!STORE_DB_AVAILABLE)('STEP 15.95+ — Audit Outbox Resilience (real PostgreSQL store DB)', () => {
  it('OUTBOX-1. enqueueAuditOutbox writes a PENDING row inside a storeDb transaction', async () => {
    const outboxId = await storeDb.$transaction(async (tx) => {
      return enqueueAuditOutbox(tx, {
        actorId: 'test-user',
        actorType: 'ADMIN',
        action: 'test.outbox.enqueue',
        entityType: 'TestEntity',
        entityId: 'test-1',
        after: { foo: 'bar' },
      });
    });

    expect(outboxId).toBeTruthy();
    expect(typeof outboxId).toBe('string');

    const row = await storeDb.auditOutbox.findUnique({ where: { id: outboxId } });
    expect(row).not.toBeNull();
    expect(row!.status).toBe('PENDING');
    expect(row!.attempts).toBe(0);
    expect(row!.payloadJson).toContain('test.outbox.enqueue');
    expect(row!.payloadJson).toContain('test-1');
    expect(row!.payloadJson).toContain('bar');
  });

  it('OUTBOX-2. outbox row stays PENDING until drainAuditOutbox is called (not auto-delivered)', async () => {
    const outboxId = await storeDb.$transaction(async (tx) => {
      return enqueueAuditOutbox(tx, {
        action: 'test.outbox.pending',
        entityType: 'TestEntity',
        entityId: 'test-2',
      });
    });

    // Verify PENDING (no drain has run)
    const row = await storeDb.auditOutbox.findUnique({ where: { id: outboxId } });
    expect(row!.status).toBe('PENDING');
    expect(row!.attempts).toBe(0);
  });

  it('OUTBOX-3. getAuditOutboxStats reports pending/delivered/failed counts accurately', async () => {
    await storeDb.auditOutbox.deleteMany({});

    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = await storeDb.$transaction(async (tx) => {
        return enqueueAuditOutbox(tx, {
          action: 'test.outbox.stats',
          entityType: 'TestEntity',
          entityId: `stats-${i}`,
        });
      });
      ids.push(id);
    }

    const stats = await getAuditOutboxStats();
    expect(stats.pending).toBe(3);
    expect(stats.delivered).toBe(0);
    expect(stats.failed).toBe(0);
    expect(stats.oldestPendingAt).not.toBeNull();

    // Manually mark one as DELIVERED (simulating a successful drain)
    await storeDb.auditOutbox.update({
      where: { id: ids[0] },
      data: { status: 'DELIVERED', attempts: 1, lastError: null },
    });

    const stats2 = await getAuditOutboxStats();
    expect(stats2.pending).toBe(2);
    expect(stats2.delivered).toBe(1);
    expect(stats2.failed).toBe(0);
  });

  it('OUTBOX-4. multiple audit events can be enqueued in one transaction (atomic batch)', async () => {
    const ids = await storeDb.$transaction(async (tx) => {
      const id1 = await enqueueAuditOutbox(tx, {
        action: 'test.outbox.batch.1',
        entityType: 'TestEntity',
        entityId: 'batch-1',
      });
      const id2 = await enqueueAuditOutbox(tx, {
        action: 'test.outbox.batch.2',
        entityType: 'TestEntity',
        entityId: 'batch-2',
      });
      const id3 = await enqueueAuditOutbox(tx, {
        action: 'test.outbox.batch.3',
        entityType: 'TestEntity',
        entityId: 'batch-3',
      });
      return [id1, id2, id3];
    });

    expect(ids).toHaveLength(3);
    for (const id of ids) {
      const row = await storeDb.auditOutbox.findUnique({ where: { id } });
      expect(row).not.toBeNull();
      expect(row!.status).toBe('PENDING');
    }

    const stats = await getAuditOutboxStats();
    expect(stats.pending).toBeGreaterThanOrEqual(3);
  });

  it('OUTBOX-5. transaction rollback does NOT leave orphan outbox rows (atomic guarantee)', async () => {
    // Enqueue inside a transaction that is then rolled back
    let thrownError: unknown = null;
    try {
      await storeDb.$transaction(async (tx) => {
        await enqueueAuditOutbox(tx, {
          action: 'test.outbox.rollback',
          entityType: 'TestEntity',
          entityId: 'rollback-1',
        });
        // Force a rollback by throwing
        throw new Error('intentional rollback for test');
      });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(Error);
    expect((thrownError as Error).message).toContain('intentional rollback');

    // Verify the outbox row was NOT persisted (rolled back with the transaction)
    const rows = await storeDb.auditOutbox.findMany({
      where: { payloadJson: { contains: 'test.outbox.rollback' } },
    });
    expect(rows).toHaveLength(0);
  });
});
