/**
 * HEAVIX — STEP 04: Audit Foundation
 *
 * Enhanced audit system that automatically captures before/after state
 * for any mutation. Works with the Authorization Service (STEP 02) to
 * provide a single requirePermissionAndAudit() call that:
 *   1. Checks permission (STEP 02 RBAC)
 *   2. Captures before-state
 *   3. Runs the mutation
 *   4. Captures after-state
 *   5. Logs the audit entry with before/after/reason
 *
 * Usage in API routes:
 *
 *   import { auditMutation, requirePermissionAndAudit } from '@/lib/audit-foundation';
 *
 *   // Simple audit (no permission check):
 *   await auditMutation({
 *     actorId: user.id,
 *     action: 'listing.publish',
 *     entityType: 'Listing',
 *     entityId: listingId,
 *     reason: 'Seller documents verified',
 *     operation: async () => {
 *       return await db.listing.update({ where: { id: listingId }, data: { status: 'PUBLISHED' } });
 *     },
 *   });
 *
 *   // Permission + Audit (one call):
 *   await requirePermissionAndAudit({
 *     actorId: user.id,
 *     permission: 'listing.publish',
 *     action: 'listing.publish',
 *     entityType: 'Listing',
 *     entityId: listingId,
 *     reason: 'Approved by admin',
 *     operation: async () => {
 *       return await db.listing.update({ where: { id: listingId }, data: { status: 'PUBLISHED' } });
 *     },
 *   });
 */

import { db } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { requirePermission, AuthorizationError } from '@/lib/authorization';
import { headers } from 'next/headers';
import type { Prisma } from '@prisma/client';

// ── Types ──────────────────────────────────────────────────
export interface AuditMutationContext {
  actorId: string | null;
  actorType?: 'USER' | 'ADMIN' | 'SYSTEM' | 'AI';
  action: string;
  entityType: string;
  entityId?: string | null;
  reason?: string | null;
  /** If provided, the before-state will be fetched from this model */
  beforeModel?: string;
  /** If provided, the after-state will be fetched from this model */
  afterModel?: string;
  /** If true, captures before/after snapshots automatically */
  captureSnapshot?: boolean;
  /** Explicit before-state (overrides snapshot) */
  before?: unknown;
  /** Explicit after-state (overrides snapshot) */
  after?: unknown;
}

export interface AuditMutationResult<T> {
  result: T;
  before: unknown | null;
  after: unknown | null;
  audited: boolean;
}

// ── Helpers ────────────────────────────────────────────────
function safeStringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  try { return JSON.stringify(value); } catch { return String(value); }
}

async function getHeaders() {
  try { return await headers(); } catch { return null; }
}

async function getRequestInfo() {
  const h = await getHeaders();
  if (!h) return { ip: null, userAgent: null, requestId: null };
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
  const ua = h.get('user-agent') || null;
  const reqId = h.get('x-request-id') || null;
  return { ip, userAgent: ua, requestId: reqId };
}

// ── Core: auditMutation ────────────────────────────────────
/**
 * Wraps a mutation operation with before/after audit capture.
 *
 * 1. If beforeModel+entityId provided: fetch before-state
 * 2. Run the operation
 * 3. If afterModel+entityId provided: fetch after-state
 * 4. Log audit entry with before/after/reason
 *
 * The operation runs regardless of audit success.
 * Audit failures are non-fatal (best-effort, like logAudit).
 */
export async function auditMutation<T>(
  ctx: AuditMutationContext,
  operation: () => Promise<T>,
): Promise<AuditMutationResult<T>> {
  const reqInfo = await getRequestInfo();

  // 1. Capture before-state
  let before: unknown = ctx.before ?? null;
  if (ctx.captureSnapshot && ctx.beforeModel && ctx.entityId) {
    try {
      const model = (db as any)[ctx.beforeModel.charAt(0).toLowerCase() + ctx.beforeModel.slice(1)];
      if (model?.findUnique) {
        before = await model.findUnique({ where: { id: ctx.entityId } });
      }
    } catch { /* non-fatal */ }
  }

  // 2. Run the operation
  let result: T;
  try {
    result = await operation();
  } catch (err) {
    // Log the FAILED mutation attempt too (for security audit)
    await logAudit({
      actorId: ctx.actorId,
      actorType: ctx.actorType ?? 'USER',
      action: `${ctx.action}.failed`,
      entityType: ctx.entityType,
      entityId: ctx.entityId,
      before: before,
      after: null,
      reason: ctx.reason ? `${ctx.reason} | FAILED: ${(err as Error).message}` : `FAILED: ${(err as Error).message}`,
      ip: reqInfo.ip,
      userAgent: reqInfo.userAgent,
      requestId: reqInfo.requestId,
    });
    throw err; // re-throw — the caller handles the error
  }

  // 3. Capture after-state
  let after: unknown = ctx.after ?? null;
  if (ctx.captureSnapshot && ctx.afterModel && ctx.entityId) {
    try {
      const model = (db as any)[ctx.afterModel.charAt(0).toLowerCase() + ctx.afterModel.slice(1)];
      if (model?.findUnique) {
        after = await model.findUnique({ where: { id: ctx.entityId } });
      }
    } catch { /* non-fatal */ }
  }
  // If operation returned the updated entity, use it as after-state
  if (!after && result && typeof result === 'object') {
    after = result;
  }

  // 4. Log audit entry
  await logAudit({
    actorId: ctx.actorId,
    actorType: ctx.actorType ?? 'USER',
    action: ctx.action,
    entityType: ctx.entityType,
    entityId: ctx.entityId,
    before,
    after,
    reason: ctx.reason,
    ip: reqInfo.ip,
    userAgent: reqInfo.userAgent,
    requestId: reqInfo.requestId,
  });

  return { result, before, after, audited: true };
}

// ── Combined: requirePermissionAndAudit ────────────────────
/**
 * Combines STEP 02 (RBAC permission check) with STEP 04 (audit logging)
 * into a single call. Throws AuthorizationError (403) if permission denied.
 * Runs the operation and logs the audit entry.
 *
 * Usage:
 *   await requirePermissionAndAudit({
 *     actorId: user.id,
 *     permission: 'payment.refund',
 *     action: 'payment.refund',
 *     entityType: 'Payment',
 *     entityId: paymentId,
 *     reason: 'Customer request - duplicate charge',
 *     captureSnapshot: true,
 *     beforeModel: 'Payment',
 *     afterModel: 'Payment',
 *     operation: async () => {
 *       return await db.payment.update({
 *         where: { id: paymentId },
 *         data: { status: 'REFUNDED' },
 *       });
 *     },
 *   });
 */
export async function requirePermissionAndAudit<T>(
  params: {
    actorId: string | null;
    permission: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    reason?: string | null;
    captureSnapshot?: boolean;
    beforeModel?: string;
    afterModel?: string;
    before?: unknown;
    after?: unknown;
    operation: () => Promise<T>;
  },
): Promise<AuditMutationResult<T>> {
  // 1. Check permission (STEP 02 RBAC)
  await requirePermission(params.actorId, params.permission);

  // 2. Audit + execute (STEP 04)
  return auditMutation(
    {
      actorId: params.actorId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      reason: params.reason,
      captureSnapshot: params.captureSnapshot,
      beforeModel: params.beforeModel,
      afterModel: params.afterModel,
      before: params.before,
      after: params.after,
    },
    params.operation,
  );
}

// ── Simple audit for creates/deletes (no before/after diff) ──
export async function auditCreate(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  data: unknown,
  reason?: string | null,
): Promise<void> {
  const reqInfo = await getRequestInfo();
  await logAudit({
    actorId,
    action,
    entityType,
    entityId,
    after: data,
    reason: reason ?? 'Created',
    ip: reqInfo.ip,
    userAgent: reqInfo.userAgent,
    requestId: reqInfo.requestId,
  });
}

export async function auditDelete(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  beforeData: unknown,
  reason?: string | null,
): Promise<void> {
  const reqInfo = await getRequestInfo();
  await logAudit({
    actorId,
    action,
    entityType,
    entityId,
    before: beforeData,
    reason: reason ?? 'Deleted',
    ip: reqInfo.ip,
    userAgent: reqInfo.userAgent,
    requestId: reqInfo.requestId,
  });
}

// ── Query helpers for audit log ────────────────────────────
export async function getAuditTrail(
  entityType: string,
  entityId: string,
  limit: number = 50,
): Promise<{ id: string; action: string; actorId: string | null; actorType: string; beforeJson: string | null; afterJson: string | null; reason: string | null; createdAt: Date }[]> {
  return await db.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function getActorActivity(
  actorId: string,
  limit: number = 50,
): Promise<{ id: string; action: string; entityType: string; entityId: string | null; reason: string | null; createdAt: Date }[]> {
  return await db.auditLog.findMany({
    where: { actorId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
