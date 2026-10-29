/**
 * HEAVIX — Audit Log helper
 *
 * Records admin actions to the AuditLog table (append-only).
 * Uses the REAL HEAVIX AuditLog schema fields:
 *   actorId, actorType, action, entityType, entityId,
 *   beforeJson, afterJson, ip, userAgent, requestId, reason
 *
 * CROSS-DB DESIGN (Track A P0):
 *   This function writes to the MAIN PostgreSQL AuditLog table (db.auditLog).
 *   Store routes (src/app/api/admin/store/*) also use this function — their
 *   audit entries are written to PostgreSQL, NOT to the store SQLite DB.
 *   This is intentional: store audit is cross-DB (verified E2E-07).
 *   The store-schema AuditLog model was removed as dead code.
 */

import { db } from '@/lib/db';
import { headers } from 'next/headers';
import { Prisma } from '@prisma/client';

export type AuditActorType = 'USER' | 'ADMIN' | 'SYSTEM' | 'AI';

export interface LogAuditParams {
  actorId?: string | null;
  actorType?: AuditActorType;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  reason?: string | null;
}

function safeStringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

/**
 * Append an entry to the AuditLog table. Best-effort (never throws).
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    const h = await headers();
    const ip = params.ip ?? (h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null);
    const ua = params.userAgent ?? (h.get('user-agent') || null);

    await db.auditLog.create({
      data: {
        actorId: params.actorId ?? null,
        actorType: params.actorType ?? 'USER',
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        beforeJson: safeStringify(params.before),
        afterJson: safeStringify(params.after),
        ip: ip ?? null,
        userAgent: ua,
        requestId: params.requestId ?? null,
        reason: params.reason ?? null,
      },
    });
  } catch (err) {
    console.error('[audit] failed to write audit log:', {
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      error: (err as Error)?.message,
    });
  }
}

// Keep the old `audit()` function for backward compat (maps to logAudit)
export async function audit(ctx: {
  actorId?: string | null;
  action: string;
  resource?: string | null;
  resourceId?: string | null;
  reason?: string | null;
}): Promise<void> {
  await logAudit({
    actorId: ctx.actorId,
    action: ctx.action,
    entityType: ctx.resource ?? 'Unknown',
    entityId: ctx.resourceId,
    reason: ctx.reason,
  });
}

