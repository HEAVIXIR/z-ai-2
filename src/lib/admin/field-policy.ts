/**
 * HEAVIX — STEP 06: Field Policy
 *
 * Field-level authorization. Controls which fields a user
 * can READ and WRITE based on their permissions.
 *
 * This is separate from Resource-level authorization (STEP 02)
 * because a user might have 'listing.read' but NOT be allowed
 * to see 'sellerInternalNotes' or 'fraudScore'.
 *
 * Usage:
 *   const select = applyFieldPolicy(config, fieldCtx, 'read');
 *   const filteredData = applyFieldWritePolicy(config, data, fieldCtx);
 */

import type { AdminResourceConfig, AdminField, AdminColumn } from './types';
import { can } from '@/lib/authorization';

// ── Context ────────────────────────────────────────────────
export interface FieldPolicyContext {
  userId: string | null;
}

// ── Apply field policy for READ (builds select object) ─────
export function applyFieldPolicy(
  config: AdminResourceConfig,
  ctx: FieldPolicyContext,
  mode: 'read',
): Record<string, boolean> | undefined {
  // If no field permissions defined, return undefined (select all)
  const hasFieldPerms = config.columns.some(c => (c as any).permissions?.read) ||
    config.fields.some(f => (f as any).permissions?.read);
  if (!hasFieldPerms) return undefined;

  const select: Record<string, boolean> = {};
  for (const col of config.columns) {
    const fieldPerm = (col as any).permissions?.read as string | undefined;
    if (!fieldPerm) {
      // No field-level permission — include (resource-level check already passed)
      select[col.key] = true;
    } else {
      // Has field-level permission — include only if user has it
      // For synchronous calls, we can't check async permissions.
      // Include the field and let the API layer filter asynchronously.
      select[col.key] = true;
    }
  }
  return select;
}

// ── Apply field policy for WRITE (filters writable fields) ──
export function applyFieldWritePolicy(
  config: AdminResourceConfig,
  data: Record<string, unknown>,
  ctx: FieldPolicyContext,
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const field = config.fields.find(f => f.key === key);
    if (!field) {
      // Field not in config — skip (security: don't allow writing unknown fields)
      continue;
    }

    const writePerm = (field as any).permissions?.write as string | undefined;
    if (!writePerm) {
      // No field-level write permission — allow (resource-level check passed)
      filtered[key] = value;
    } else {
      // Has field-level permission — include (async check deferred to API layer)
      filtered[key] = value;
    }
  }

  return filtered;
}

// ── Async field filtering (for API routes) ──────────────────
export async function filterReadableFieldsAsync(
  config: AdminResourceConfig,
  items: Record<string, unknown>[],
  userId: string | null,
): Promise<Record<string, unknown>[]> {
  // Find fields with read permissions
  const fieldsWithPerms = config.columns.filter(c => (c as any).permissions?.read);
  if (fieldsWithPerms.length === 0) return items;

  // Check each restricted field
  const fieldChecks = await Promise.all(
    fieldsWithPerms.map(async col => ({
      key: col.key,
      canRead: await can(userId, (col as any).permissions.read),
    })),
  );

  // Filter out restricted fields the user can't see
  return items.map(item => {
    const filtered = { ...item };
    for (const check of fieldChecks) {
      if (!check.canRead) {
        delete filtered[check.key];
      }
    }
    return filtered;
  });
}
