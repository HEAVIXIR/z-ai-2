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
 * The delivery worker is tested with an injectable sink so failure/recovery,
 * stable idempotency keys, competing workers, and stale lease recovery can be
 * exercised against the real PostgreSQL outbox without loading the main Prisma
 * client in this store-schema test process.
 *
 * RUN
 *   bunx vitest run tests/integration/store-audit-outbox-resilience.test.ts
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { storeDb } from '@/lib/store-db';
import { drainAuditOutbox, enqueueAuditOutbox, getAuditOutboxStats } from '@/lib/store-audit-outbox';

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

  it('OUTBOX-6. sink failure retains PENDING and a later retry delivers the same event', async () => {
    const outboxId = await storeDb.$transaction(async (tx) => enqueueAuditOutbox(tx, {
      action: 'test.outbox.sink-retry',
      entityType: 'TestEntity',
      entityId: 'retry-1',
    }));
    let sinkCalls = 0;
    const deliveredKeys = new Set<string>();
    const auditWriter = async (_params: { action: string; entityType: string }, key: string) => {
      sinkCalls++;
      if (sinkCalls === 1) throw new Error('simulated main AuditLog database unavailable');
      deliveredKeys.add(key);
    };

    const first = await drainAuditOutbox({ auditWriter });
    expect(first.failed).toBe(1);
    expect(first.remaining).toBeGreaterThanOrEqual(1);
    const pending = await storeDb.auditOutbox.findUnique({ where: { id: outboxId } });
    expect(pending!.status).toBe('PENDING');
    expect(pending!.attempts).toBe(1);
    expect(pending!.lastError).toContain('database unavailable');

    const second = await drainAuditOutbox({ auditWriter });
    expect(second.delivered).toBe(1);
    const delivered = await storeDb.auditOutbox.findUnique({ where: { id: outboxId } });
    expect(delivered!.status).toBe('DELIVERED');
    expect(delivered!.attempts).toBe(2);
    expect(delivered!.lastError).toBeNull();
    expect(deliveredKeys.has(outboxId)).toBe(true);
    expect(sinkCalls).toBe(2);
  });

  it('OUTBOX-7. replay uses the same idempotency key so a sink can deduplicate duplicate delivery', async () => {
    const outboxId = await storeDb.$transaction(async (tx) => enqueueAuditOutbox(tx, {
      action: 'test.outbox.deduplicate',
      entityType: 'TestEntity',
      entityId: 'dedupe-1',
    }));
    const sinkByKey = new Map<string, { action: string; entityType: string }>();
    let sinkCalls = 0;
    const auditWriter = async (params: { action: string; entityType: string }, key: string) => {
      sinkCalls++;
      if (!sinkByKey.has(key)) sinkByKey.set(key, params);
    };

    expect((await drainAuditOutbox({ auditWriter })).delivered).toBe(1);
    // Simulate a crash after sink success but before the outbox delivery marker.
    await storeDb.auditOutbox.update({
      where: { id: outboxId },
      data: { status: 'PENDING', attempts: 0, lockedAt: null },
    });
    expect((await drainAuditOutbox({ auditWriter })).delivered).toBe(1);

    expect(sinkCalls).toBe(2);
    expect(sinkByKey.size).toBe(1);
    expect(sinkByKey.has(outboxId)).toBe(true);
  });

  it('OUTBOX-8. competing workers atomically claim a row so only one writes it', async () => {
    const outboxId = await storeDb.$transaction(async (tx) => enqueueAuditOutbox(tx, {
      action: 'test.outbox.concurrent-claim',
      entityType: 'TestEntity',
      entityId: 'claim-1',
    }));
    let sinkCalls = 0;
    const auditWriter = async () => {
      sinkCalls++;
      await new Promise((resolve) => setTimeout(resolve, 25));
    };

    await Promise.all([
      drainAuditOutbox({ auditWriter }),
      drainAuditOutbox({ auditWriter }),
    ]);

    expect(sinkCalls).toBe(1);
    expect((await storeDb.auditOutbox.findUnique({ where: { id: outboxId } }))!.status).toBe('DELIVERED');
  });

  it('OUTBOX-9. stale PROCESSING lease is reclaimed after a worker crash', async () => {
    const outboxId = await storeDb.$transaction(async (tx) => enqueueAuditOutbox(tx, {
      action: 'test.outbox.stale-lease',
      entityType: 'TestEntity',
      entityId: 'lease-1',
    }));
    await storeDb.auditOutbox.update({
      where: { id: outboxId },
      data: { status: 'PROCESSING', lockedAt: new Date(Date.now() - 60_000) },
    });
    let sinkCalls = 0;

    const result = await drainAuditOutbox({
      staleLockMs: 1_000,
      auditWriter: async () => { sinkCalls++; },
    });

    expect(result.delivered).toBe(1);
    expect(sinkCalls).toBe(1);
    const row = await storeDb.auditOutbox.findUnique({ where: { id: outboxId } });
    expect(row!.status).toBe('DELIVERED');
    expect(row!.lockedAt).toBeNull();
  });


  it.skipIf(!process.env.DATABASE_URL)('OUTBOX-10. real main PostgreSQL delivery is unique across a replay after sink success', async () => {
    const { db } = await import('@/lib/db');
    const outboxId = await storeDb.$transaction(async (tx) => enqueueAuditOutbox(tx, {
      actorType: 'SYSTEM',
      action: 'test.outbox.real-main-dedup',
      entityType: 'TestEntity',
      entityId: 'real-main-' + Date.now(),
    }));

    try {
      const first = await drainAuditOutbox({ onlyIds: [outboxId] });
      expect(first.delivered).toBe(1);
      let rows = await db.auditLog.findMany({ where: { idempotencyKey: outboxId } });
      expect(rows).toHaveLength(1);

      // Simulate a crash after main DB commit but before the outbox marker.
      await storeDb.auditOutbox.update({
        where: { id: outboxId },
        data: { status: 'PENDING', attempts: 0, lockedAt: null },
      });
      const second = await drainAuditOutbox({ onlyIds: [outboxId] });
      expect(second.delivered).toBe(1);
      rows = await db.auditLog.findMany({ where: { idempotencyKey: outboxId } });
      expect(rows).toHaveLength(1);
    } finally {
      await db.auditLog.deleteMany({ where: { idempotencyKey: outboxId } });
      await storeDb.auditOutbox.deleteMany({ where: { id: outboxId } });
    }
  });

});
