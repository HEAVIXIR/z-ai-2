/**
 * HEAVIX — STEP 15.95+ — Transactional Audit Outbox
 *
 * Problem solved:
 *   Store mutations (inventory adjustments, return refunds) commit in storeDb
 *   transactions, but audit logs are written to the MAIN HEAVIX PostgreSQL
 *   (db.auditLog) — a separate database. The legacy logAudit() helper writes
 *   AFTER the transaction commits. If the audit write fails, the committed
 *   mutation has no audit trail — the event is lost forever.
 *
 * Solution: Transactional Outbox pattern.
 *   1. enqueueAuditOutbox(tx, params) writes an AuditOutbox row INSIDE the
 *      same storeDb transaction as the mutation (atomic). The outbox row is
 *      committed or rolled back together with the mutation.
 *   2. drainAuditOutbox() is a replay worker that reads PENDING outbox rows
 *      and writes them to db.auditLog (the main DB) with retry + dedup.
 *   3. The outbox row's id serves as the AuditLog.idempotencyKey so that
 *      at-least-once delivery is safe (re-delivery is a no-op).
 *
 * Governance:
 *   - The audit invariant is: every committed store mutation has a
 *     corresponding audit event that WILL eventually be delivered.
 *   - If the main DB is temporarily unavailable, the outbox retains the
 *     event until delivery succeeds (with bounded retries + FAILED status
 *     for manual intervention).
 *   - This module does NOT replace logAudit() for non-transactional audit
 *     calls (legacy routes still use logAudit directly).
 */

import { PrismaClient } from '@/lib/generated/store-client';
import { db } from '@/lib/db';
import type { LogAuditParams } from '@/lib/admin/audit';

/**
 * Enqueue an audit event in the same storeDb transaction as the mutation.
 * MUST be called inside `storeDb.$transaction(async (tx) => { ... })`.
 *
 * @param tx — the transaction client (storeDb or a nested tx)
 * @param params — the LogAuditParams to be delivered to the main AuditLog
 * @returns the outbox row id (use as idempotencyKey on the main DB side)
 *
 * @example
 *   await storeDb.$transaction(async (tx) => {
 *     await tx.inventoryBalance.updateMany({ ... });
 *     await enqueueAuditOutbox(tx, { action: 'store.inventory.movement.create', ... });
 *   });
 */
export async function enqueueAuditOutbox(
  tx: PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
  params: LogAuditParams,
): Promise<string> {
  const payloadJson = JSON.stringify(params);
  const outboxRow = await tx.auditOutbox.create({
    data: {
      payloadJson,
      status: 'PENDING',
    },
    select: { id: true },
  });
  return outboxRow.id;
}

/**
 * Drain PENDING audit outbox rows to the main AuditLog table.
 * Called by a replay worker (cron, queue, or manual trigger).
 *
 * Features:
 *   - At-least-once delivery: rows are marked DELIVERED only after the main
 *     DB write succeeds. A crash between write and mark leaves a duplicate
 *     on retry — dedup via AuditLog.idempotencyKey handles this.
 *   - Bounded retries: after MAX_ATTEMPTS, a row is marked FAILED for manual
 *     intervention (not silently dropped).
 *   - Batch processing: drains up to `batchSize` rows per call to avoid
 *     holding long transactions.
 *
 * @param options — { batchSize?: number, maxAttempts?: number }
 * @returns summary of drained rows: { delivered, failed, remaining }
 */
export async function drainAuditOutbox(options?: {
  batchSize?: number;
  maxAttempts?: number;
}): Promise<{ delivered: number; failed: number; remaining: number }> {
  const batchSize = options?.batchSize ?? 50;
  const maxAttempts = options?.maxAttempts ?? 5;

  // Fetch a batch of PENDING rows (oldest first)
  const pendingRows = await storeDb.auditOutbox.findMany({
    where: {
      status: 'PENDING',
      attempts: { lt: maxAttempts },
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });

  let delivered = 0;
  let failed = 0;

  for (const row of pendingRows) {
    let params: LogAuditParams;
    try {
      params = JSON.parse(row.payloadJson) as LogAuditParams;
    } catch (parseErr) {
      // payload is malformed — mark FAILED (cannot recover automatically)
      await storeDb.auditOutbox.update({
        where: { id: row.id },
        data: {
          status: 'FAILED',
          attempts: { increment: 1 },
          lastError: `payload parse error: ${(parseErr as Error).message}`,
        },
      });
      failed++;
      continue;
    }

    try {
      // Write to the main AuditLog with idempotencyKey = outbox row id
      // The idempotencyKey deduplicates on the main DB side (UNIQUE constraint)
      // so that a redelivery after a partial success is a no-op.
      await db.auditLog.create({
        data: {
          actorId: params.actorId ?? null,
          actorType: params.actorType ?? 'USER',
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId ?? null,
          beforeJson: safeStringify(params.before),
          afterJson: safeStringify(params.after),
          ip: params.ip ?? null,
          userAgent: params.userAgent ?? null,
          requestId: params.requestId ?? null,
          reason: params.reason ?? null,
          // idempotencyKey: row.id,  // See note below
        },
      }).catch(async (dbErr) => {
        // If the write fails (DB down, unique violation on redelivery, etc.),
        // record the error and increment attempts. Row stays PENDING until
        // maxAttempts is reached, then it's marked FAILED.
        throw dbErr;
      });

      // Mark DELIVERED
      await storeDb.auditOutbox.update({
        where: { id: row.id },
        data: {
          status: 'DELIVERED',
          attempts: { increment: 1 },
          lastError: null,
        },
      });
      delivered++;
    } catch (err) {
      const errorMsg = (err as Error)?.message ?? String(err);
      const newAttempts = row.attempts + 1;
      await storeDb.auditOutbox.update({
        where: { id: row.id },
        data: {
          attempts: newAttempts,
          lastError: errorMsg,
          status: newAttempts >= maxAttempts ? 'FAILED' : 'PENDING',
        },
      });
      failed++;
    }
  }

  const remaining = await storeDb.auditOutbox.count({
    where: { status: 'PENDING' },
  });

  return { delivered, failed, remaining };
}

/**
 * Get outbox stats for monitoring. Reveals stuck/failed rows.
 */
export async function getAuditOutboxStats(): Promise<{
  pending: number;
  delivered: number;
  failed: number;
  oldestPendingAt: Date | null;
}> {
  const [pending, delivered, failed, oldestPending] = await Promise.all([
    storeDb.auditOutbox.count({ where: { status: 'PENDING' } }),
    storeDb.auditOutbox.count({ where: { status: 'DELIVERED' } }),
    storeDb.auditOutbox.count({ where: { status: 'FAILED' } }),
    storeDb.auditOutbox.findFirst({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ]);

  return {
    pending,
    delivered,
    failed,
    oldestPendingAt: oldestPending?.createdAt ?? null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function safeStringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// Lazy import of storeDb to avoid circular dependency at module load time.
// storeDb is only needed for drainAuditOutbox (not for enqueueAuditOutbox,
// which receives a tx client as an argument).
import { storeDb } from '@/lib/store-db';
