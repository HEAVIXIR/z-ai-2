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
import { executeAction, type ActionContext } from './action-engine';
import { registry } from './resource-registry';
import { getPrismaModel } from './data-adapter';
import { logAudit } from '@/lib/audit';
import { filterExportableFieldsAsync, buildExportPermissionMap } from './field-policy';
// STEP 11.10 + 11.11: field-level export policy + resource-aware bulk.

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
  // STEP 11.10: pass resourceKey so canBulkAction is RESOURCE-AWARE — looks
  // up config.bulkActions[] for the matching permission key. Without
  // resourceKey, the legacy 6-entry map would be used (which only knows
  // about listing/user/company bulk actions → silent fail-closed for
  // any other resource).
  const canBulk = await canBulkAction(ctx.userId, `bulk-${actionKey}`, resourceKey);
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
  // P4 (Database Ownership Remediation): use store-aware routing.
  const model = getPrismaModel(config);
  const rawItems = await model.findMany({
    where: filters || {},
    take: 5000,
  });
  const items = await filterExportableFieldsAsync(config, rawItems as Record<string, unknown>[], ctx.userId);

  // 4. STEP 11.11 (Causal Export Policy): field-level EXPORT filtering.
  //    filterExportableFieldsAsync walks the unified permission map
  //    (config.columns + config.fields) and strips any field where the
  //    user lacks `permissions.export`. This is CAUSAL: granting the
  //    permission restores the field in export; denying it removes the
  //    field. Same dataset, same user, only permission changes → different
  //    export result. Verified at the HTTP level in STEP 11.11.
  //
  //    If no fields declare `permissions.export`, this is a no-op (fast path).
  const exportableItems = await filterExportableFieldsAsync(
    config,
    items as Record<string, unknown>[],
    ctx.userId,
  );

  // 5. STEP 11.11 (CRITICAL FIX): filter fieldKeys by export-permission map.
  //    Previously, fieldKeys was derived from `exportFields` (visible
  //    columns) BEFORE filterExportableFieldsAsync ran. The filter
  //    stripped keys from ITEMS, but fieldKeys still included them —
  //    relying on JSON.stringify dropping undefined values (fragile,
  //    and BROKEN for CSV where empty string is emitted). The fix:
  //    derive fieldKeys from the EXPORT PERMISSION MAP so denied keys
  //    are also removed from the field key list (and thus from the CSV
  //    header + JSON object shape).
  const deniedExportKeys = new Set<string>();
  const exportPermMap = buildExportPermissionMap(config);
  if (exportPermMap.size > 0) {
    // Re-check each restricted field for this user (some may be allowed,
    // some denied — we only remove the denied ones from fieldKeys).
    await Promise.all(
      Array.from(exportPermMap.entries()).map(async ([key, perm]) => {
        const allowed = await can(ctx.userId, perm);
        if (!allowed) deniedExportKeys.add(key);
      }),
    );
  }
  const filteredExportFields = exportFields.filter(
    c => !deniedExportKeys.has(c.key),
  );

  // 6. Log export audit
  await logAudit({
    actorId: ctx.userId,
    actorType: 'ADMIN',
    action: `${resourceKey}.export`,
    entityType: config.audit?.entityType || resourceKey,
    entityId: null,
    after: {
      format,
      fieldCount: filteredExportFields.length,
      rowCount: exportableItems.length,
    },
    reason: `Exported ${exportableItems.length} ${resourceKey} as ${format}`,
  });

  // 7. Format data
  const fieldKeys = filteredExportFields.map(c => c.key);
  const fieldLabels = filteredExportFields.map(c => c.label);

  if (format === 'json') {
    const json = JSON.stringify(
      exportableItems.map((item: Record<string, unknown>) => {
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
      rowCount: exportableItems.length,
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
  const rows = exportableItems.map((item: Record<string, unknown>) =>
    fieldKeys.map(key => escapeCSV(item[key])).join(','),
  );

  // Add BOM for Excel UTF-8 compatibility
  const csv = '\uFEFF' + header + '\n' + rows.join('\n');

  return {
    format,
    filename: `${resourceKey}-${Date.now()}.csv`,
    data: csv,
    rowCount: exportableItems.length,
    fields: fieldKeys,
  };
}
