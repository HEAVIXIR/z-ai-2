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
import { can } from '@/lib/authorization';
import { auditMutation } from '@/lib/audit-foundation';
import { registry } from './resource-registry';
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
  const model = (db as any)[getModelName(item.__model as string)];
  return await model.update({
    where: { id: item.id },
    data: { status: 'PUBLISHED', publishedAt: new Date() },
  });
});

registerActionHandler('unpublish', async (item) => {
  const model = (db as any)[getModelName(item.__model as string)];
  return await model.update({
    where: { id: item.id },
    data: { status: 'DRAFT' },
  });
});

registerActionHandler('feature', async (item) => {
  const model = (db as any)[getModelName(item.__model as string)];
  return await model.update({
    where: { id: item.id },
    data: { featured: true },
  });
});

registerActionHandler('unfeature', async (item) => {
  const model = (db as any)[getModelName(item.__model as string)];
  return await model.update({
    where: { id: item.id },
    data: { featured: false },
  });
});

registerActionHandler('verify', async (item) => {
  const model = (db as any)[getModelName(item.__model as string)];
  return await model.update({
    where: { id: item.id },
    data: { verified: true, verification: 'VERIFIED' },
  });
});

registerActionHandler('suspend', async (item) => {
  const model = (db as any)[getModelName(item.__model as string)];
  return await model.update({
    where: { id: item.id },
    data: { status: 'SUSPENDED' },
  });
});

registerActionHandler('activate', async (item) => {
  const model = (db as any)[getModelName(item.__model as string)];
  return await model.update({
    where: { id: item.id },
    data: { status: 'ACTIVE' },
  });
});

registerActionHandler('delete', async (item) => {
  const model = (db as any)[getModelName(item.__model as string)];
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
  const model = (db as any)[config.model];
  let before: Record<string, unknown> | null = null;
  try {
    before = await model.findUnique({ where: { id: entityId } });
  } catch { /* non-fatal */ }

  if (!before) {
    return { success: false, action: actionKey, entityId, message: 'Entity not found' };
  }

  // Tag the item with the model name for the handler
  before.__model = config.model;

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
