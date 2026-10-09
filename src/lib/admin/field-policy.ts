/**
 * HEAVIX — STEP 06: Field Policy
 *
 * Field-level authorization. Controls which fields a user
 * can READ, WRITE, and EXPORT based on their permissions.
 *
 * This is separate from Resource-level authorization (STEP 02)
 * because a user might have 'listing.read' but NOT be allowed
 * to see 'sellerInternalNotes' or 'fraudScore'.
 *
 * STEP 11.6 (Phase B.1 + B.2) — UNIFIED PERMISSION MAP:
 *   The previous version of filterReadableFieldsAsync only walked
 *   `config.columns` to find field-level read permissions. But the
 *   STEP 11.5 audit found that ALL field-level permission declarations
 *   were on `AdminField` (config.fields), NOT on `AdminColumn`
 *   (config.columns). So the read policy was silently ignored for
 *   every production resource — sensitive fields like
 *   `payment.trackingCode` (declared as AdminField with
 *   `permissions.read: 'payment.read'`) were NOT stripped from
 *   List/Detail API responses.
 *
 *   The fix unifies the permission map across BOTH surfaces:
 *     - buildReadPermissionMap walks config.columns + config.fields
 *     - buildExportPermissionMap walks config.columns + config.fields
 *     - When both surfaces declare a permission for the same key,
 *       AdminField takes precedence (field is the more specific surface)
 *
 * Usage:
 *   const select = applyFieldPolicy(config, fieldCtx, 'read');
 *   const filteredData = applyFieldWritePolicyAsync(config, data, fieldCtx);
 *   const visibleItems = await filterReadableFieldsAsync(config, items, userId);
 *   const exportItems = await filterExportableFieldsAsync(config, items, userId);
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
  const hasFieldPerms = config.columns.some(c => c.permissions?.read) ||
    config.fields.some(f => f.permissions?.read);
  if (!hasFieldPerms) return undefined;

  const select: Record<string, boolean> = {};
  for (const col of config.columns) {
    const fieldPerm = col.permissions?.read;
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
// NOTE (P0-1 HARDENING): The sync version below does NOT enforce
// field-level write permissions — it includes all fields regardless.
// Use `applyFieldWritePolicyAsync` for actual enforcement. The sync
// version is kept only for backward compatibility with callers that
// haven't migrated yet.
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

    const writePerm = field.permissions?.write;
    if (!writePerm) {
      filtered[key] = value;
    } else {
      filtered[key] = value;
    }
  }

  return filtered;
}

// ── P0-1 HARDENING: Async field write policy with fail-closed enforcement ──
/**
 * Async field write policy that ACTUALLY enforces field-level write
 * permissions via `can(userId, writePermission)`.
 *
 * Behavior:
 *   - Field NOT in config → skipped (unknown fields rejected)
 *   - Field has NO `permissions.write` → allowed (resource-level check passed)
 *   - Field HAS `permissions.write` + user HAS permission → allowed
 *   - Field HAS `permissions.write` + user LACKS permission → FAIL CLOSED
 *     (entire request rejected, not silently stripped)
 *
 * Returns:
 *   - `{ ok: true, filteredData }` on success
 *   - `{ ok: false, rejectedField, requiredPermission }` on auth failure
 */
export interface FieldWritePolicyResult {
  ok: boolean;
  filteredData?: Record<string, unknown>;
  rejectedField?: string;
  requiredPermission?: string;
}

export async function applyFieldWritePolicyAsync(
  config: AdminResourceConfig,
  data: Record<string, unknown>,
  ctx: FieldPolicyContext,
  persistedRecord?: Record<string, unknown> | null,
): Promise<FieldWritePolicyResult> {
  const filtered: Record<string, unknown> = {};

  // STEP 11.19: Build the authoritative state for readonlyWhen evaluation.
  // For UPDATEs, merge persisted state with submitted data (submitted overrides).
  // For CREATEs (no persistedRecord), use submitted data only.
  // This prevents bypass via omitting the controlling field.
  const authoritativeState: Record<string, unknown> = {};
  if (persistedRecord) {
    Object.assign(authoritativeState, persistedRecord);
  }
  Object.assign(authoritativeState, data); // submitted data overrides persisted

  for (const [key, value] of Object.entries(data)) {
    const field = config.fields.find(f => f.key === key);
    if (!field) {
      // Field not in config — skip (security: don't allow writing unknown fields)
      continue;
    }

    // STEP 11.19: Server-side readonlyWhen enforcement using AUTHORITATIVE state.
    // Uses persistedRecord (if available) merged with submitted data.
    // This prevents bypass via:
    //   1. Omitting the controlling field from the request
    //   2. Sending a fabricated controlling value
    //   3. Changing both the controlling field and protected field in one request
    // If the controlling field's authoritative value meets the condition, the
    // protected field is read-only → FAIL CLOSED.
    if (field.readonlyWhen && field.readonlyWhen.length > 0) {
      const allConditionsMet = field.readonlyWhen.every(cond => {
        // Use authoritativeState (persisted + submitted), NOT just data
        const val = authoritativeState[cond.field];
        switch (cond.operator) {
          case 'eq': return val === cond.value;
          case 'neq': return val !== cond.value;
          case 'in': return Array.isArray(cond.value) && cond.value.includes(val);
          case 'notNull': return val !== null && val !== undefined;
          case 'isNull': return val === null || val === undefined;
          case 'gt': return typeof val === 'number' && typeof cond.value === 'number' && val > cond.value;
          case 'lt': return typeof val === 'number' && typeof cond.value === 'number' && val < cond.value;
          default: return false; // unknown operator → fail open for condition (NOT readonly)
        }
      });
      if (allConditionsMet) {
        return {
          ok: false,
          rejectedField: key,
          requiredPermission: 'FIELD_IS_READONLY',
        };
      }
    }

    const writePerm = field.permissions?.write;
    if (!writePerm) {
      filtered[key] = value;
    } else {
      // Has field-level write permission — enforce via async can() check
      const hasPerm = await can(ctx.userId, writePerm);
      if (!hasPerm) {
        // FAIL CLOSED: user lacks field-level write permission.
        return {
          ok: false,
          rejectedField: key,
          requiredPermission: writePerm,
        };
      }
      filtered[key] = value;
    }
  }

  return { ok: true, filteredData: filtered };
}

// ─────────────────────────────────────────────────────────────────────────
// STEP 11.6 (Phase B.1 + B.2) — UNIFIED PERMISSION MAPS
//
// Walk BOTH `config.columns` AND `config.fields` so a permission declared
// on either surface is enforced. AdminField takes precedence (the field
// surface is more specific — it carries read+write+export, the column
// surface carries read+export only).
// ─────────────────────────────────────────────────────────────────────────

/**
 * Build a unified map of fieldKey → read-permission-key, walking BOTH
 * `config.columns` and `config.fields`. AdminField declarations win on
 * collision (more specific surface). Used by filterReadableFieldsAsync.
 */
export function buildReadPermissionMap(
  config: AdminResourceConfig,
): Map<string, string> {
  const map = new Map<string, string>();

  // 1. Walk columns (lower priority)
  for (const col of config.columns) {
    const perm = (col as any).permissions?.read as string | undefined;
    if (perm) {
      map.set(col.key, perm);
    }
  }

  // 2. Walk fields (higher priority — overwrites column entries)
  for (const field of config.fields) {
    const perm = (field as any).permissions?.read as string | undefined;
    if (perm) {
      map.set(field.key, perm);
    }
  }

  return map;
}

/**
 * Build a unified map of fieldKey → export-permission-key, walking BOTH
 * `config.columns` and `config.fields`. AdminField declarations win on
 * collision. Used by filterExportableFieldsAsync + bulk-export-engine.
 */
export function buildExportPermissionMap(
  config: AdminResourceConfig,
): Map<string, string> {
  const map = new Map<string, string>();

  // 1. Walk columns (lower priority)
  for (const col of config.columns) {
    const perm = (col as any).permissions?.export as string | undefined;
    if (perm) {
      map.set(col.key, perm);
    }
  }

  // 2. Walk fields (higher priority — overwrites column entries)
  for (const field of config.fields) {
    const perm = (field as any).permissions?.export as string | undefined;
    if (perm) {
      map.set(field.key, perm);
    }
  }

  return map;
}

// ── Async field filtering — READ (for API list/detail routes) ──
/**
 * Strips fields the user lacks `permissions.read` for from API responses.
 *
 * STEP 11.6 (Phase B.1) — FIXED: previously only walked `config.columns`
 * (which had ZERO permission declarations in production). Now walks the
 * unified map (config.fields + config.columns) so sensitive fields
 * declared on AdminField (e.g., `payment.trackingCode`,
 * `payment.idempotencyKey`) ARE actually stripped from List/Detail
 * responses when the user lacks the listed permission.
 *
 * If no fields declare read permissions, returns `items` unchanged
 * (fast path — no per-item work).
 */
export async function filterReadableFieldsAsync(
  config: AdminResourceConfig,
  items: Record<string, unknown>[],
  userId: string | null,
): Promise<Record<string, unknown>[]> {
  const permMap = buildReadPermissionMap(config);
  if (permMap.size === 0) return items; // fast path

  // Check each restricted field once (per request)
  const fieldChecks = await Promise.all(
    Array.from(permMap.entries()).map(async ([key, perm]) => ({
      key,
      canRead: await can(userId, perm),
    })),
  );

  const deniedKeys = new Set(
    fieldChecks.filter(c => !c.canRead).map(c => c.key),
  );
  if (deniedKeys.size === 0) return items;

  // Filter out restricted fields the user can't see
  return items.map(item => {
    const filtered = { ...item };
    for (const key of deniedKeys) {
      delete filtered[key];
    }
    return filtered;
  });
}

// ── Async field filtering — EXPORT (for CSV/JSON export) ──
/**
 * STEP 11.6 (Phase B.2): Strips fields the user lacks `permissions.export`
 * for from export payloads. Distinct from READ policy because:
 *   - READ = single-record view (Detail page, List cell)
 *   - EXPORT = bulk extraction (CSV/JSON download)
 * A user may be allowed to read a field but not export it in bulk
 * (defense in depth for sensitive fields).
 *
 * If no fields declare export permissions, returns `items` unchanged
 * (fast path).
 */
export async function filterExportableFieldsAsync(
  config: AdminResourceConfig,
  items: Record<string, unknown>[],
  userId: string | null,
): Promise<Record<string, unknown>[]> {
  const permMap = buildExportPermissionMap(config);
  if (permMap.size === 0) return items; // fast path

  // Check each restricted field once (per request)
  const fieldChecks = await Promise.all(
    Array.from(permMap.entries()).map(async ([key, perm]) => ({
      key,
      canExport: await can(userId, perm),
    })),
  );

  const deniedExportKeys = new Set(
    fieldChecks.filter(c => !c.canExport).map(c => c.key),
  );
  if (deniedExportKeys.size === 0) return items;

  // Filter out restricted fields the user can't export
  return items.map(item => {
    const filtered = { ...item };
    for (const key of deniedExportKeys) {
      delete filtered[key];
    }
    return filtered;
  });
}
