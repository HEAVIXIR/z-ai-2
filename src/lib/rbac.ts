/**
 * HEAVIX — RBAC helpers (P0-5)
 *
 * STEP 02: RBAC Hardened — legacy User.role fallback REMOVED.
 * All admin access now requires UserRole entries.
 *
 * The new authorization module at src/lib/authorization/ is the
 * canonical source for permission checks. This file delegates
 * to the new module for backward compatibility of imports.
 *
 * Migration guide for existing code:
 *   OLD: import { isAdmin } from '@/lib/rbac';
 *   NEW: import { isAdmin, requirePermission } from '@/lib/authorization';
 */

// Re-export everything from the new authorization module
export {
  can,
  canAny,
  canAll,
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  isAdmin,
  canAccessResource,
  canBulkAction,
  canExport,
  AuthorizationError,
} from '@/lib/authorization';

// Keep these for backward compat
export { getUserPermissions, ForbiddenError } from '@/lib/rbac-legacy';

// ── STEP 14.8-B: Legacy import shims ────────────────────────────
// Older code imports { hasPermission } from "@/lib/rbac" — this is
// the synchronous-looking async equivalent of the new can() function.
// Re-export can under the legacy name so legacy @ts-nocheck files
// continue to import cleanly during the migration window.
//
// Signature:  hasPermission(userId, permissionKey) → Promise<boolean>
// Identical to:  can(userId, permissionKey)
//
// Migration target: replace `hasPermission` imports with `can` from
// "@/lib/authorization" and remove this shim once all callers migrate.
import { can as _can } from '@/lib/authorization';
export const hasPermission = _can;
