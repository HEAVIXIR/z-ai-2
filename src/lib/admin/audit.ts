/**
 * HEAVIX - Audit logger utility
 *
 * Records admin actions to the AuditLog table.
 * Used by all admin API endpoints to keep an append-only trail.
 */

import { db } from '@/lib/db';
import { headers } from 'next/headers';
import { Prisma } from '@prisma/client';

export type AuditContext = {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;        // e.g. "user.create", "feature_flag.toggle"
  resource?: string | null;
  resourceId?: string | null;
  metadata?: Prisma.InputJsonValue;
  status?: 'success' | 'failure' | 'warning';
};

/**
 * Write an audit log entry. Best-effort: never throws to the caller.
 */
export async function audit(ctx: AuditContext): Promise<void> {
  try {
    const h = await headers();
    const ip = h.get('x-forwarded-for') || h.get('x-real-ip') || '127.0.0.1';
    const ua = h.get('user-agent') || 'unknown';

    await db.auditLog.create({
      data: {
        actorId: ctx.actorId ?? null,
        actorEmail: ctx.actorEmail ?? null,
        action: ctx.action,
        resource: ctx.resource ?? null,
        resourceId: ctx.resourceId ?? null,
        metadata: (ctx.metadata ?? {}) as Prisma.InputJsonValue,
        ip: ip.split(',')[0]?.trim() || ip,
        userAgent: ua,
        status: ctx.status ?? 'success',
      },
    });
  } catch (err) {
    // Audit failure must never break the main operation.
    console.error('[audit] failed to write audit log:', err);
  }
}
