/**
 * HEAVIX — STEP 15.95+ — Transactional Audit Outbox
 *
 * Store mutations and their outbox records commit in one STORE_DATABASE_URL
 * transaction. A worker delivers records to the independent main AuditLog DB.
 *
 * Delivery is at-least-once. The main AuditLog.idempotencyKey UNIQUE constraint
 * makes the sink operation idempotent, including a crash after the sink write
 * but before the outbox row is marked DELIVERED.
 */

import { storeDb } from '@/lib/store-db';
import type { LogAuditParams } from '@/lib/admin/audit';

/**
 * The enqueue path only needs the transaction-scoped AuditOutbox.create
 * operation. This structural contract is intentionally independent of either
 * generated Prisma runtime and is checked by both Node/Worker call-site tests.
 */
export type AuditOutboxCreateTransaction = {
  auditOutbox: {
    create(args: {
      data: { payloadJson: string; status: 'PENDING' };
      select: { id: true };
    }): PromiseLike<{ id: string }>;
  };
};
type AuditWriter = (params: LogAuditParams, idempotencyKey: string) => Promise<void>;

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_STALE_LOCK_MS = 5 * 60 * 1000;

export async function enqueueAuditOutbox(
  tx: AuditOutboxCreateTransaction,
  params: LogAuditParams,
): Promise<string> {
  const outboxRow = await tx.auditOutbox.create({
    data: {
      payloadJson: JSON.stringify(params),
      status: 'PENDING',
    },
    select: { id: true },
  });
  return outboxRow.id;
}

/**
 * Deliver one event to the main database. createMany(skipDuplicates) relies on
 * the database-enforced UNIQUE idempotencyKey constraint, not application-only
 * error handling. Import the main Prisma client lazily so store-only tests and
 * enqueue callers do not load the unrelated generated client.
 */
async function writeAuditToMainDb(params: LogAuditParams, idempotencyKey: string): Promise<void> {
  const { db } = await import('@/lib/db');
  await db.auditLog.createMany({
    data: [{
      idempotencyKey,
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
    }],
    skipDuplicates: true,
  });
}

/**
 * Claim rows with a compare-and-set update, process them outside a long-running
 * DB transaction, and release the lease on success/failure. PROCESSING leases
 * older than staleLockMs are reclaimable after worker crashes.
 *
 * auditWriter is injectable for integration tests which simulate a failing
 * cross-database sink without importing the main generated Prisma client.
 */
export async function drainAuditOutbox(options?: {
  batchSize?: number;
  maxAttempts?: number;
  /** Restrict a drain to known row IDs; useful for controlled replay and tests. */
  onlyIds?: string[];
  staleLockMs?: number;
  auditWriter?: AuditWriter;
}): Promise<{ delivered: number; failed: number; remaining: number }> {
  const batchSize = Math.max(1, Math.min(options?.batchSize ?? DEFAULT_BATCH_SIZE, 500));
  const maxAttempts = Math.max(1, options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const staleLockMs = Math.max(1000, options?.staleLockMs ?? DEFAULT_STALE_LOCK_MS);
  const auditWriter = options?.auditWriter ?? writeAuditToMainDb;
  const now = new Date();
  const staleBefore = new Date(now.getTime() - staleLockMs);

  const candidates = await storeDb.auditOutbox.findMany({
    where: {
      id: options?.onlyIds ? { in: options.onlyIds } : undefined,
      attempts: { lt: maxAttempts },
      OR: [
        { status: 'PENDING' },
        { status: 'PROCESSING', lockedAt: { lt: staleBefore } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });

  let delivered = 0;
  let failed = 0;

  for (const row of candidates) {
    // Atomic claim: only one worker can change a fresh PENDING row to PROCESSING.
    const claimed = await storeDb.auditOutbox.updateMany({
      where: {
        id: row.id,
        attempts: { lt: maxAttempts },
        OR: [
          { status: 'PENDING' },
          { status: 'PROCESSING', lockedAt: { lt: staleBefore } },
        ],
      },
      data: { status: 'PROCESSING', lockedAt: new Date() },
    });
    if (claimed.count !== 1) continue;

    let params: LogAuditParams;
    try {
      params = JSON.parse(row.payloadJson) as LogAuditParams;
      if (!params || typeof params.action !== 'string' || typeof params.entityType !== 'string') {
        throw new Error('payload missing required action/entityType');
      }
    } catch (err) {
      const message = 'payload parse/validation error: ' + errorMessage(err);
      await storeDb.auditOutbox.update({
        where: { id: row.id },
        data: {
          status: 'FAILED',
          attempts: { increment: 1 },
          lastError: message,
          lockedAt: null,
        },
      });
      failed++;
      continue;
    }

    try {
      // row.id is passed as the main DB's UNIQUE idempotency key.
      await auditWriter(params, row.id);
      await storeDb.auditOutbox.update({
        where: { id: row.id },
        data: {
          status: 'DELIVERED',
          attempts: { increment: 1 },
          lastError: null,
          lockedAt: null,
        },
      });
      delivered++;
    } catch (err) {
      const newAttempts = row.attempts + 1;
      await storeDb.auditOutbox.update({
        where: { id: row.id },
        data: {
          attempts: newAttempts,
          lastError: errorMessage(err),
          status: newAttempts >= maxAttempts ? 'FAILED' : 'PENDING',
          lockedAt: null,
        },
      });
      failed++;
    }
  }

  const remaining = await storeDb.auditOutbox.count({
    where: { status: { in: ['PENDING', 'PROCESSING'] } },
  });
  return { delivered, failed, remaining };
}

/**
 * Explicit operator action to retry exhausted rows after investigating their
 * lastError. Only FAILED rows named by the caller are reset; no event is deleted.
 */
export async function requeueFailedAuditOutbox(ids: string[]): Promise<number> {
  const uniqueIds = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))];
  if (uniqueIds.length === 0) return 0;
  const result = await storeDb.auditOutbox.updateMany({
    where: { id: { in: uniqueIds }, status: 'FAILED' },
    data: {
      status: 'PENDING',
      attempts: 0,
      lastError: null,
      lockedAt: null,
    },
  });
  return result.count;
}

export async function getAuditOutboxStats(): Promise<{
  pending: number;
  processing: number;
  delivered: number;
  failed: number;
  oldestPendingAt: Date | null;
}> {
  const [pending, processing, delivered, failed, oldestPending] = await Promise.all([
    storeDb.auditOutbox.count({ where: { status: 'PENDING' } }),
    storeDb.auditOutbox.count({ where: { status: 'PROCESSING' } }),
    storeDb.auditOutbox.count({ where: { status: 'DELIVERED' } }),
    storeDb.auditOutbox.count({ where: { status: 'FAILED' } }),
    storeDb.auditOutbox.findFirst({
      where: { status: { in: ['PENDING', 'PROCESSING'] } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ]);

  return {
    pending,
    processing,
    delivered,
    failed,
    oldestPendingAt: oldestPending?.createdAt ?? null,
  };
}

function safeStringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
