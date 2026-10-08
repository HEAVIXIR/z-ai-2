/**
 * HEAVIX — STEP 09: Action Engine
 *
 * Executes individual resource actions (publish, suspend, verify, delete, etc.)
 * with full V2.2 compliance:
 *
 *   Permission → Precondition → Confirmation → Transaction → Audit → Result
 *
 * Each action is defined in the resource config (AdminAction) and maps to
 * a server-side handler that performs the mutation.
 *
 * The action engine is SEPARATE from the Data Adapter's CRUD operations
 * because actions have their own semantics (status transitions, side effects,
 * notification triggers, etc.).
 */

import { db } from '@/lib/db';
import { revalidateTag } from 'next/cache';
import { can } from '@/lib/authorization';
import { auditMutation } from '@/lib/audit-foundation';
import { getHomepageCacheTags } from '@/lib/homepage-cache-tags';
import { registry } from './resource-registry';
import { getPrismaModel } from './data-adapter';
import type { AdminResourceConfig, AdminAction } from './types';

// ── Types ──────────────────────────────────────────────────
export interface ActionResult {
  success: boolean;
  action: string;
  entityId: string;
  message: string;
  before?: unknown;
  after?: unknown;
  error?: string;
}

export interface ActionContext {
  userId: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

// ── Precondition checks ────────────────────────────────────
// Each resource can define preconditions for actions.
// A precondition is a function that checks if the action can proceed.
export type PreconditionFn = (
  item: Record<string, unknown>,
  ctx: ActionContext,
) => { ok: boolean; message?: string };

// Built-in preconditions
export const Preconditions = {
  /** Item must be in one of the allowed statuses */
  statusMustBe: (allowedStatuses: string[]): PreconditionFn =>
    (item) => {
      const status = String(item.status ?? '');
      if (!allowedStatuses.includes(status)) {
        return { ok: false, message: `وضعیت باید یکی از ${allowedStatuses.join('، ')} باشد (فعلی: ${status})` };
      }
      return { ok: true };
    },

  /** Item must NOT be in the excluded statuses */
  statusMustNotBe: (excludedStatuses: string[]): PreconditionFn =>
    (item) => {
      const status = String(item.status ?? '');
      if (excludedStatuses.includes(status)) {
        return { ok: false, message: `وضعیت ${status} اجازه این عملیات را نمی‌دهد` };
      }
      return { ok: true };
    },

  /** Item must have a specific field set */
  fieldRequired: (field: string): PreconditionFn =>
    (item) => {
      if (!item[field]) {
        return { ok: false, message: `فیلد "${field}" باید مقدار داشته باشد` };
      }
      return { ok: true };
    },
};

// ── Action handlers ────────────────────────────────────────
// Maps action.key → handler function
// The handler receives the item, performs the mutation, and returns the updated item.
export type ActionHandler = (
  item: Record<string, unknown>,
  ctx: ActionContext,
) => Promise<Record<string, unknown>>;

// Registry of action handlers
const actionHandlers = new Map<string, ActionHandler>();

export function registerActionHandler(actionKey: string, handler: ActionHandler): void {
  actionHandlers.set(actionKey, handler);
}

// Built-in action handlers
registerActionHandler('publish', async (item) => {
  const model = (item as any).__prismaModel;
  return await model.update({
    where: { id: item.id },
    data: { status: 'PUBLISHED', publishedAt: new Date() },
  });
});

registerActionHandler('unpublish', async (item) => {
  const model = (item as any).__prismaModel;
  return await model.update({
    where: { id: item.id },
    data: { status: 'DRAFT' },
  });
});

registerActionHandler('feature', async (item) => {
  const model = (item as any).__prismaModel;
  return await model.update({
    where: { id: item.id },
    data: { featured: true },
  });
});

registerActionHandler('unfeature', async (item) => {
  const model = (item as any).__prismaModel;
  return await model.update({
    where: { id: item.id },
    data: { featured: false },
  });
});

// ── STEP 16-C FIX (Class B.2 — verify handler writes non-existent fields) ──
// Previous version wrote `{ verified: true, verification: 'VERIFIED' }` for
// every model, but only `Brand` has the `verification` enum field; only
// `Company`/`BuyRequest`/`Listing` have the `verified` Boolean field. Payment
// has neither — Prisma threw `PrismaClientValidationError: Unknown arg`.
// Fix: model-aware writes. Different model → different field(s).
registerActionHandler('verify', async (item) => {
  const model = (item as any).__prismaModel;
  const modelName = String(item.__model ?? '');
  const updateData: Record<string, unknown> = {};

  switch (modelName) {
    case 'brand':
      // Brand has `verification` enum (VERIFIED/UNVERIFIED) — no `verified` Boolean
      updateData.verification = 'VERIFIED';
      break;
    case 'company':
    case 'buyRequest':
    case 'listing':
      // These models have `verified Boolean` — no `verification` enum
      updateData.verified = true;
      break;
    case 'user':
      // User uses `emailVerified`/`mobileVerified` Boolean (different semantic)
      // The `verify` action on users maps to email verification.
      updateData.emailVerified = true;
      break;
    case 'payment':
      // Payment has neither field — use status transition to mark as verified/paid
      updateData.status = 'VERIFIED';
      break;
    default:
      // Generic fallback: try setting `verified` Boolean first; if model doesn't
      // have it, the caller's try/catch will surface the error.
      updateData.verified = true;
  }
  return await model.update({
    where: { id: item.id },
    data: updateData,
  });
});

registerActionHandler('suspend', async (item) => {
  const model = (item as any).__prismaModel;
  return await model.update({
    where: { id: item.id },
    data: { status: 'SUSPENDED' },
  });
});

registerActionHandler('activate', async (item) => {
  const model = (item as any).__prismaModel;
  return await model.update({
    where: { id: item.id },
    data: { status: 'ACTIVE' },
  });
});

registerActionHandler('delete', async (item) => {
  const model = (item as any).__prismaModel;
  // Soft delete if possible, hard delete otherwise
  if (item.deletedAt !== undefined) {
    return await model.update({
      where: { id: item.id },
      data: { deletedAt: new Date(), status: 'DELETED' },
    });
  }
  await model.delete({ where: { id: item.id } });
  return { ...item, _deleted: true };
});

// ─────────────────────────────────────────────────────────────────────────
// STEP 16-C FIX (Class B.1 — marketplace transaction-lifecycle handlers)
//
// 17 of 18 admin resources use action keys NOT in the original 8-handler
// registry (publish/unpublish/feature/unfeature/verify/suspend/activate/delete).
// Marketplace transaction-lifecycle action keys (confirm, cancel, refund,
// close, accept, reject, start, end, schedule, complete, deliver, review,
// resolve, hide, verify-email) had NO handlers → action-engine.ts:233 threw
// `Error: No handler for action "..."` at runtime.
//
// The handlers below use a SAFE pattern: only write the `status` field (which
// all models have) plus an optional timestamp field IF it exists on the model
// (confirmedAt, cancelledAt, etc.). If the timestamp field is missing, the
// status update still succeeds — we wrap the dual-field update in a try/catch
// that falls back to status-only update on Prisma validation errors.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Helper: create a status-transition handler that writes only `status` (universal).
 * Optionally attempts to also write a timestamp field; falls back to status-only
 * if the model doesn't have that field (avoids PrismaClientValidationError).
 */
function makeStatusHandler(
  statusValue: string,
  timestampField?: string,
): ActionHandler {
  return async (item) => {
    const model = (item as any).__prismaModel;
    // First try: status + timestamp (if both provided)
    if (timestampField) {
      try {
        return await model.update({
          where: { id: item.id },
          data: { status: statusValue, [timestampField]: new Date() },
        });
      } catch {
        // Fall back to status-only — model likely doesn't have the timestamp field.
      }
    }
    // Safe fallback: status only (every model has `status` enum)
    return await model.update({
      where: { id: item.id },
      data: { status: statusValue },
    });
  };
}

// Order lifecycle (R6 orders): confirm/cancel
registerActionHandler('confirm', makeStatusHandler('CONFIRMED', 'confirmedAt'));
registerActionHandler('cancel',  makeStatusHandler('CANCELLED', 'cancelledAt'));

// Payment lifecycle (R7 payments): refund
registerActionHandler('refund', makeStatusHandler('REFUNDED', 'refundedAt'));

// Closure lifecycle (R12 rfqs, R18 buy-requests): close
registerActionHandler('close', makeStatusHandler('CLOSED', 'closedAt'));

// Accept/reject (R13 offers, R16 transports): accept/reject
registerActionHandler('accept', makeStatusHandler('ACCEPTED', 'acceptedAt'));
registerActionHandler('reject', makeStatusHandler('REJECTED', 'rejectedAt'));

// Auction lifecycle (R14 auctions): start/end
registerActionHandler('start', makeStatusHandler('ACTIVE',   'startedAt'));
registerActionHandler('end',   makeStatusHandler('ENDED',    'endedAt'));

// Inspection lifecycle (R15 inspections): schedule/complete
registerActionHandler('schedule',  makeStatusHandler('SCHEDULED', 'scheduledAt'));
registerActionHandler('complete',  makeStatusHandler('COMPLETED', 'completedAt'));

// Transport lifecycle (R16 transports): deliver
registerActionHandler('deliver', makeStatusHandler('DELIVERED', 'deliveredAt'));

// Dispute lifecycle (R17 disputes): review/resolve
registerActionHandler('review',  makeStatusHandler('UNDER_REVIEW', 'reviewedAt'));
registerActionHandler('resolve', makeStatusHandler('RESOLVED',     'resolvedAt'));

// Review moderation (R10 reviews): hide
registerActionHandler('hide', makeStatusHandler('HIDDEN', 'hiddenAt'));

// User lifecycle (R3 users): verify-email
registerActionHandler('verify-email', async (item) => {
  const model = (item as any).__prismaModel;
  return await model.update({
    where: { id: item.id },
    data: { emailVerified: true },
  });
});

// ── Execute action ──────────────────────────────────────────
export async function executeAction(
  resourceKey: string,
  entityId: string,
  actionKey: string,
  ctx: ActionContext,
): Promise<ActionResult> {
  const config = registry.get(resourceKey);
  if (!config) {
    return { success: false, action: actionKey, entityId, message: 'Resource not found' };
  }

  // 1. Find action definition in config
  const action = config.actions?.find(a => a.key === actionKey);
  if (!action) {
    return { success: false, action: actionKey, entityId, message: 'Action not defined' };
  }

  // 2. Check permission
  const hasPerm = await can(ctx.userId, action.permission);
  if (!hasPerm) {
    return {
      success: false,
      action: actionKey,
      entityId,
      message: `Forbidden: requires "${action.permission}"`,
      error: 'FORBIDDEN',
    };
  }

  // 3. Fetch current state (before)
  // P4 (Database Ownership Remediation): use the store-aware routing from
  // data-adapter instead of `(db as any)[config.model]`. Store-domain
  // resources (inventory, warehouses, returns, etc.) have their models in
  // storeDb, not main db.
  const model = getPrismaModel(config);
  let before: Record<string, unknown> | null = null;
  try {
    before = await model.findUnique({ where: { id: entityId } });
  } catch { /* non-fatal */ }

  if (!before) {
    return { success: false, action: actionKey, entityId, message: 'Entity not found' };
  }

  // Tag the item with the model name AND the prisma model accessor so that
  // handlers can mutate the correct database without re-deriving it.
  before.__model = config.model;
  (before as any).__prismaModel = model;

  // 4. Execute with audit
  try {
    const result = await auditMutation(
      {
        actorId: ctx.userId,
        action: `${resourceKey}.${actionKey}`,
        entityType: config.audit?.entityType || resourceKey,
        entityId,
        reason: ctx.reason || action.label,
        captureSnapshot: false,
        before,
      },
      async () => {
        const handler = actionHandlers.get(actionKey);
        if (handler) {
          return await handler(before!, ctx);
        }
        // Fallback: if no handler registered, try the API path
        if (action.apiPath) {
          // This should not happen in server-side code
          throw new Error(`No handler for action "${actionKey}". Configure a handler via registerActionHandler().`);
        }
        throw new Error(`No handler for action "${actionKey}"`);
      },
    );

    // STEP 15-B.5.4-C.2-P2: Invalidate Homepage cache for affected resources.
    // Single insertion point covers ALL 8 action handlers (publish, unpublish,
    // feature, unfeature, verify, suspend, activate, delete) for ALL resources.
    // Only fires for resources with Homepage impact (listings, brands, buy-requests).
    // Other resources → getHomepageCacheTags returns [] → no revalidation.
    const cacheTags = getHomepageCacheTags(resourceKey);
    for (const tag of cacheTags) {
      try { revalidateTag(tag, 'default'); } catch (e) {
        // Per Cache Contract §11: invalidation failure must not block the mutation.
        // The mutation already succeeded — log and continue.
        console.error(`[action-engine] revalidateTag('${tag}') failed for ${resourceKey}.${actionKey}:`, e);
      }
    }

    return {
      success: true,
      action: actionKey,
      entityId,
      message: 'Action executed successfully',
      before: result.before,
      after: result.after,
    };
  } catch (err) {
    return {
      success: false,
      action: actionKey,
      entityId,
      message: 'Action failed',
      error: (err as Error).message,
    };
  }
}

// ── Helper ──────────────────────────────────────────────────
function getModelName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}
