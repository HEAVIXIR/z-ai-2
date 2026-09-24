/**
 * HEAVIX — STEP 09: Bulk Action Engine
 *
 * Handles bulk operations (publish 500 listings, suspend 20 users, etc.)
 * with V2.2 compliance:
 *
 *   Permission → Selection validation → Precondition (per item) →
 *   Confirmation → Transaction (batch) → Partial failure handling →
 *   Audit (per item) → Result summary
 *
 * For large batches (>100), the operation runs in chunks to avoid
 * timeout. Each item is audited individually.
 *
 * Partial failure: if 480/500 succeed and 20 fail, the result
 * includes success count, failure count, and per-item failure reasons.
 */

import { can, canBulkAction } from '@/lib/authorization';
import { executeAction, type ActionResult, type ActionContext } from './action-engine';
import { registry } from './resource-registry';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/audit';

// ── Types ──────────────────────────────────────────────────
export interface BulkActionResult {
  action: string;
  resourceKey: string;
  total: number;
  succeeded: number;
  failed: number;
  results: BulkItemResult[];
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
}

export interface BulkItemResult {
  id: string;
  success: boolean;
  message?: string;
  error?: string;
}

export interface BulkActionParams {
  resourceKey: string;
  actionKey: string;
  ids: string[];
  ctx: ActionContext;
}

// ── Configuration ──────────────────────────────────────────
const BATCH_SIZE = 50; // items per batch (to avoid timeout)
const MAX_ITEMS = 10000; // safety limit

// ── Execute bulk action ────────────────────────────────────
export async function executeBulkAction(
  params: BulkActionParams,
): Promise<BulkActionResult> {
  const { resourceKey, actionKey, ids, ctx } = params;
  const startedAt = new Date();

  const config = registry.get(resourceKey);
  if (!config) {
    return {
      action: actionKey,
      resourceKey,
      total: ids.length,
      succeeded: 0,
      failed: ids.length,
      results: ids.map(id => ({ id, success: false, error: 'Resource not found' })),
      startedAt,
      completedAt: new Date(),
      durationMs: 0,
    };
  }

  // 1. Check bulk permission
  const canBulk = await canBulkAction(ctx.userId, `bulk-${actionKey}`);
  const actionConfig = config.actions?.find(a => a.key === actionKey);
  const hasPerm = actionConfig ? await can(ctx.userId, actionConfig.permission) : false;

  if (!canBulk && !hasPerm) {
    return {
      action: actionKey,
      resourceKey,
      total: ids.length,
      succeeded: 0,
      failed: ids.length,
      results: ids.map(id => ({ id, success: false, error: 'Forbidden' })),
      startedAt,
      completedAt: new Date(),
      durationMs: 0,
    };
  }

  // 2. Safety limit
  const items = ids.slice(0, MAX_ITEMS);

  // 3. Process in batches
  const results: BulkItemResult[] = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    // Process each item in the batch
    const batchResults = await Promise.allSettled(
      batch.map(async (id) => {
        const result = await executeAction(resourceKey, id, actionKey, ctx);
        return {
          id,
          success: result.success,
          message: result.message,
          error: result.error,
        } as BulkItemResult;
      }),
    );

    for (const r of batchResults) {
      if (r.status === 'fulfilled') {
        results.push(r.value);
        if (r.value.success) succeeded++;
        else failed++;
      } else {
        results.push({
          id: 'unknown',
          success: false,
          error: r.reason?.message || 'Unexpected error',
        });
        failed++;
      }
    }
  }

  // 4. Log bulk action audit entry (summary)
  await logAudit({
    actorId: ctx.userId,
    actorType: 'ADMIN',
    action: `${resourceKey}.bulk.${actionKey}`,
    entityType: config.audit?.entityType || resourceKey,
    entityId: null,
    after: {
      total: items.length,
      succeeded,
      failed,
      ids: items,
    },
    reason: ctx.reason || `Bulk ${actionKey} on ${items.length} items`,
  });

  const completedAt = new Date();

  return {
    action: actionKey,
    resourceKey,
    total: items.length,
    succeeded,
    failed,
    results,
    startedAt,
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
  };
}

// ── Export Engine ──────────────────────────────────────────
/**
 * Export is separate from read (different risk level).
 * Uses the canExport() function from the authorization module.
 */

export interface ExportParams {
  resourceKey: string;
  format: 'csv' | 'json';
  fields?: string[]; // if null, export all visible fields
  filters?: Record<string, unknown>;
  ctx: { userId: string | null };
}

export interface ExportResult {
  format: string;
  filename: string;
  data: string;
  rowCount: number;
  fields: string[];
}

export async function executeExport(params: ExportParams): Promise<ExportResult> {
  const { resourceKey, format, fields, filters, ctx } = params;
  const config = registry.get(resourceKey);

  if (!config) {
    throw new Error(`Resource "${resourceKey}" not found`);
  }

  // 1. Check export permission
  const { canExport } = await import('@/lib/authorization');
  const canDoExport = await canExport(ctx.userId, resourceKey);
  if (!canDoExport) {
    throw new Error(`Forbidden: export permission required for "${resourceKey}"`);
  }

  // 2. Determine fields to export
  const exportFields = fields?.length
    ? config.columns.filter(c => fields.includes(c.key))
    : config.columns.filter(c => c.visible !== false);

  // 3. Query data (no pagination — export all matching records)
  const model = (db as any)[config.model];
  const items = await model.findMany({
    where: filters || {},
    take: 5000, // safety limit
  });

  // 4. Log export audit
  await logAudit({
    actorId: ctx.userId,
    actorType: 'ADMIN',
    action: `${resourceKey}.export`,
    entityType: config.audit?.entityType || resourceKey,
    entityId: null,
    after: {
      format,
      fieldCount: exportFields.length,
      rowCount: items.length,
    },
    reason: `Exported ${items.length} ${resourceKey} as ${format}`,
  });

  // 5. Format data
  const fieldKeys = exportFields.map(c => c.key);
  const fieldLabels = exportFields.map(c => c.label);

  if (format === 'json') {
    const json = JSON.stringify(
      items.map((item: Record<string, unknown>) => {
        const filtered: Record<string, unknown> = {};
        for (const key of fieldKeys) {
          filtered[key] = item[key];
        }
        return filtered;
      }),
      null,
      2,
    );
    return {
      format,
      filename: `${resourceKey}-${Date.now()}.json`,
      data: json,
      rowCount: items.length,
      fields: fieldKeys,
    };
  }

  // CSV format
  const escapeCSV = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const header = fieldLabels.map(escapeCSV).join(',');
  const rows = items.map((item: Record<string, unknown>) =>
    fieldKeys.map(key => escapeCSV(item[key])).join(','),
  );

  // Add BOM for Excel UTF-8 compatibility
  const csv = '\uFEFF' + header + '\n' + rows.join('\n');

  return {
    format,
    filename: `${resourceKey}-${Date.now()}.csv`,
    data: csv,
    rowCount: items.length,
    fields: fieldKeys,
  };
}
