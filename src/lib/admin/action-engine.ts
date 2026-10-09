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

import { revalidateTag } from 'next/cache';
import { can } from '@/lib/authorization';
import { auditMutation, auditMutationTransactional } from '@/lib/audit-foundation';
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
  /**
   * PR-SC-00: optional tenant access context. When provided and the
   * resource declares ownership, executeAction verifies the loaded
   * record belongs to the user (or the user is admin/moderator) BEFORE
   * running the action handler. Non-owners get a "not found" result
   * (fail-closed, no existence leak).
   */
  tenantCtx?: import('./tenant-scope').TenantAccessContext;
}

// ── Action handlers ────────────────────────────────────────
// STEP 11.6 (Phase C.1): The built-in `Preconditions` helper object that
// lived here (statusMustBe / statusMustNotBe / fieldRequired) was DEAD
// CODE — exported but ZERO callers anywhere in src/, tests/, or docs/.
// Removed in STEP 11.8 (dead-code cleanup). Action preconditions are
// now declared inline on `AdminAction.precondition` (types.ts) and
// evaluated by executeAction() below — see the precondition step.

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
    case 'payment': {
      // STEP 11.19: ATOMIC CONDITIONAL UPDATE for payment verify.
      // "verify" means admin confirms a PENDING payment as PAID (e.g., manual
      // bank confirmation). We use updateMany with expected status to prevent
      // race conditions: two concurrent verify requests cannot both succeed.
      // The precondition (status=PENDING) was already checked, but this
      // conditional update is the authoritative atomic guard.
      const currentStatus = String(item.status ?? '');
      const verifyResult = await model.updateMany({
        where: { id: item.id, status: currentStatus },
        data: { status: 'PAID', paidAt: new Date() },
      });
      if (verifyResult.count === 0) {
        throw new Error(
          `ATOMIC_UPDATE_FAILED: Payment ${item.id} status is no longer "${currentStatus}" — concurrent modification detected`,
        );
      }
      return await model.findUnique({ where: { id: item.id } });
    }
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
// STEP 11.19: Uses ATOMIC CONDITIONAL UPDATE (updateMany with expected status)
// instead of plain update. This prevents race conditions where two concurrent
// requests both pass the precondition check and both execute the refund.
// updateMany with { id, status: expectedStatus } in the WHERE clause ensures
// exactly one request succeeds — the other gets count=0 and we throw.
registerActionHandler('refund', async (item) => {
  const model = (item as any).__prismaModel;
  const currentStatus = String(item.status ?? '');

  // Conditional update: only succeeds if status is still what we expect
  const result = await model.updateMany({
    where: { id: item.id, status: currentStatus },
    data: { status: 'REFUNDED' },
  });

  if (result.count === 0) {
    throw new Error(
      `ATOMIC_UPDATE_FAILED: Payment ${item.id} status is no longer "${currentStatus}" — concurrent modification detected`,
    );
  }

  // Return the updated item (re-fetch to get the full record)
  return await model.findUnique({ where: { id: item.id } });
});

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

  // PR-SC-00: row-level ownership check. If the resource declares ownership
  // and a tenantCtx was provided, verify the user owns this record (or is
  // admin / moderator). Non-owners get "not found" — fail-closed, no leak.
  if (ctx.tenantCtx && config.ownership) {
    const { checkRowOwnership } = await import('./tenant-scope');
    const ownCheck = checkRowOwnership(config, ctx.tenantCtx, before);
    if (!ownCheck.allowed) {
      return { success: false, action: actionKey, entityId, message: 'Entity not found' };
    }
  }

  // Tag the item with the model name AND the prisma model accessor so that
  // handlers can mutate the correct database without re-deriving it.
  before.__model = config.model;
  (before as any).__prismaModel = model;

  // 4. STEP 11.6 (Phase C.1): Precondition check.
  //    Evaluated AFTER permission, BEFORE mutation. If the precondition
  //    fails, return PRECONDITION_FAILED (409) — the entity is NOT mutated.
  //    This catches e.g. refund-on-non-PAID, verify-on-non-PENDING.
  if (action.precondition) {
    try {
      const preconditionResult = action.precondition(before, {
        userId: ctx.userId,
        reason: ctx.reason,
      });
      if (!preconditionResult.ok) {
        return {
          success: false,
          action: actionKey,
          entityId,
          message: preconditionResult.message,
          error: 'PRECONDITION_FAILED',
        };
      }
    } catch (err) {
      return {
        success: false,
        action: actionKey,
        entityId,
        message: `Precondition check failed: ${(err as Error).message}`,
        error: 'PRECONDITION_FAILED',
      };
    }
  }

  // 5. STEP 11.8 (Audit Transactionality): Execute with audit.
  //    If `action.transactional === true` AND the resource lives in the
  //    main DB (not store), wrap mutation + audit in `db.$transaction`
  //    so both commit atomically or both roll back. This closes the
  //    "audit gap" risk for CRITICAL operations (payment.refund,
  //    payment.verify) where an audit failure would otherwise leave the
  //    mutation committed with no audit trail (see ADR-003).
  //
  //    For store-domain resources, cross-DB transactions aren't supported
  //    by Prisma (main + store are separate clients) — fall back to the
  //    best-effort `auditMutation` path (KNOWN ARCHITECTURAL LIMITATION,
  //    documented in ADR-003).
  const useTransactional =
    action.transactional === true && config.database !== 'store';

  try {
    const result = useTransactional
      ? await auditMutationTransactional(
          {
            actorId: ctx.userId,
            action: `${resourceKey}.${actionKey}`,
            entityType: config.audit?.entityType || resourceKey,
            entityId,
            reason: ctx.reason || action.label,
            captureSnapshot: false,
            before,
            // database is implied 'main' for transactional path (we only
            // enter this branch when config.database !== 'store').
          },
          async (txClient) => {
            // STEP 11.18 FIX (Race Condition): Re-fetch the entity INSIDE the
            // transaction and re-check the precondition. Without this, two
            // concurrent requests could both read status=PAID outside the tx,
            // both pass the precondition, and both execute the refund.
            // By re-fetching inside the tx (which holds a row lock or at least
            // sees the latest committed state), we detect if another request
            // already changed the status.
            const txModel = (txClient as any)[config.model];
            let txBefore: Record<string, unknown> | null = null;
            try {
              txBefore = await txModel.findUnique({ where: { id: entityId } });
            } catch { /* non-fatal — fall back to stale before */ }

            if (!txBefore) {
              throw new Error('Entity not found (re-checked inside transaction)');
            }

            // Re-check precondition inside the transaction
            if (action.precondition) {
              const txPreconditionResult = action.precondition(txBefore, {
                userId: ctx.userId,
                reason: ctx.reason,
              });
              if (!txPreconditionResult.ok) {
                throw new Error(
                  `PRECONDITION_FAILED_INSIDE_TX: ${txPreconditionResult.message || 'Entity state changed'}`,
                );
              }
            }

            // Tag the FRESH before snapshot with the TRANSACTION client
            txBefore.__model = config.model;
            (txBefore as any).__prismaModel = txModel;
            const handler = actionHandlers.get(actionKey);
            if (handler) {
              return await handler(txBefore, ctx);
            }
            throw new Error(
              `No handler for action "${actionKey}". Configure a handler via registerActionHandler().`,
            );
          },
        )
      : await auditMutation(
          {
            actorId: ctx.userId,
            action: `${resourceKey}.${actionKey}`,
            entityType: config.audit?.entityType || resourceKey,
            entityId,
            reason: ctx.reason || action.label,
            captureSnapshot: false,
            before,
            database: config.database,
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
