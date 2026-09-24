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
