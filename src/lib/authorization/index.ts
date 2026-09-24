/**
 * HEAVIX — STEP 02: Authorization Service
 *
 * Central authorization layer for all HEAVIX admin/mutation operations.
 * Replaces scattered `if (user.role === 'ADMIN')` checks with
 * a single, auditable, permission-based system.
 *
 * Usage in API routes:
 *   import { requirePermission, requireAnyPermission } from '@/lib/authorization';
 *   await requirePermission(userId, 'listing.publish');
 *   await requireAnyPermission(userId, ['store.read', 'store.manage']);
 *
 * Usage in server components (for UI visibility):
 *   import { can } from '@/lib/authorization';
 *   const canEdit = await can(userId, 'listing.update');
 */

import { db } from '@/lib/db';
import { getUserPermissions } from '@/lib/rbac-legacy';

// ── Error ──────────────────────────────────────────────────
export class AuthorizationError extends Error {
  readonly statusCode = 403;
  constructor(
    public permission: string,
    message?: string,
  ) {
    super(message || `Permission denied: requires "${permission}"`);
    this.name = 'AuthorizationError';
  }
}

// ── Core: can(userId, permission) ──────────────────────────
/**
 * Check if a user has a specific permission.
 * Resolves through: User → UserRole → Role → RolePermission → Permission.key
 *
 * NOTE: This does NOT fall back to User.role (legacy).
 *       All users MUST have UserRole entries for admin access.
 */
export async function can(
  userId: string | null | undefined,
  permission: string,
): Promise<boolean> {
  if (!userId) return false;
  const perms = await getUserPermissions(userId);
  return perms.includes(permission);
}

// ── canAny(userId, permissions[]) ──────────────────────────
export async function canAny(
  userId: string | null | undefined,
  permissions: string[],
): Promise<boolean> {
  if (!userId || permissions.length === 0) return false;
  const perms = await getUserPermissions(userId);
  return permissions.some((p) => perms.includes(p));
}

// ── canAll(userId, permissions[]) ──────────────────────────
export async function canAll(
  userId: string | null | undefined,
  permissions: string[],
): Promise<boolean> {
  if (!userId) return false;
  const perms = await getUserPermissions(userId);
  return permissions.every((p) => perms.includes(p));
}

// ── requirePermission(userId, permission) ──────────────────
/**
 * Throws AuthorizationError (HTTP 403) if the user lacks the permission.
 * Use in API routes / server actions:
 *
 *   await requirePermission(user.id, 'listing.publish');
 */
export async function requirePermission(
  userId: string | null | undefined,
  permission: string,
): Promise<void> {
  const ok = await can(userId, permission);
  if (!ok) {
    throw new AuthorizationError(permission);
  }
}

// ── requireAnyPermission(userId, permissions[]) ────────────
/**
 * Throws if the user has NONE of the given permissions.
 */
export async function requireAnyPermission(
  userId: string | null | undefined,
  permissions: string[],
): Promise<void> {
  const ok = await canAny(userId, permissions);
  if (!ok) {
    throw new AuthorizationError(
      permissions.join(' | '),
      `Permission denied: requires any of [${permissions.join(', ')}]`,
    );
  }
}

// ── requireAllPermissions(userId, permissions[]) ──────────
/**
 * Throws if the user lacks ANY of the given permissions.
 */
export async function requireAllPermissions(
  userId: string | null | undefined,
  permissions: string[],
): Promise<void> {
  const ok = await canAll(userId, permissions);
  if (!ok) {
    const missing = permissions.filter(async (p) => !(await can(userId, p)));
    throw new AuthorizationError(
      permissions.join(' + '),
      `Permission denied: requires all of [${permissions.join(', ')}]`,
    );
  }
}

// ── isAdmin(userId) — RBAC-only, no legacy fallback ────────
/**
 * Checks if the user has the ADMIN role via UserRole.
 *
 * STEP 02: This is the hardened version — NO legacy User.role fallback.
 * If the user doesn't have a UserRole entry with role.key='ADMIN',
 * they are NOT an admin, period.
 *
 * To migrate existing users: assign them UserRole entries via
 * `bunx tsx prisma/seed-user-roles.ts`.
 */
export async function isAdmin(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const adminRole = await db.userRole.findFirst({
      where: { userId, role: { key: 'ADMIN' } },
      select: { id: true },
    });
    return Boolean(adminRole);
  } catch (err) {
    console.error('[authorization] isAdmin failed:', err);
    return false;
  }
}

// ── Resource Policy ─────────────────────────────────────────
/**
 * Object-level authorization: check if user can access a specific resource.
 *
 * Example: user can only edit their own listings (unless they have
 * listing.moderate permission).
 *
 *   const allowed = await canAccessResource(userId, 'listing', listingId, {
 *     ownerField: 'sellerId',
 *     moderatePermission: 'listing.moderate',
 *   });
 */
export async function canAccessResource(
  userId: string,
  resource: string,
  resourceId: string,
  options: {
    ownerField: string;
    moderatePermission?: string;
  },
): Promise<boolean> {
  // If user has the moderate permission, they can access any resource
  if (options.moderatePermission && await can(userId, options.moderatePermission)) {
    return true;
  }

  // Otherwise, check if they own the resource
  try {
    const row = await db.$queryRawUnsafe(
      `SELECT "${options.ownerField}" as owner_id FROM "${resource}" WHERE id = $1`,
      resourceId,
    ) as { owner_id: string }[];
    return row.length > 0 && row[0].owner_id === userId;
  } catch {
    return false;
  }
}

// ── Bulk Action Authorization ─────────────────────────────
/**
 * Check if user can perform a bulk action.
 * Bulk actions require BOTH:
 *   1. The specific action permission (e.g., 'listing.delete')
 *   2. No hidden escalation (e.g., can't bulk-delete if only has listing.read)
 */
export async function canBulkAction(
  userId: string,
  action: string,
): Promise<boolean> {
  // Map bulk actions to required permissions
  const BULK_PERMISSION_MAP: Record<string, string> = {
    'bulk-delete': 'listing.delete',
    'bulk-publish': 'listing.publish',
    'bulk-suspend': 'user.suspend',
    'bulk-verify': 'company.verify',
    'bulk-archive': 'listing.update',
    'bulk-export': 'listing.export',
  };

  const requiredPermission = BULK_PERMISSION_MAP[action] || action;
  return can(userId, requiredPermission);
}

// ── Export Authorization ───────────────────────────────────
/**
 * Export permissions are separate from read permissions.
 * Reading a single record ≠ exporting thousands of records.
 */
export async function canExport(
  userId: string,
  resource: string,
): Promise<boolean> {
  const EXPORT_PERMISSIONS: Record<string, string> = {
    listing: 'listing.export',
    user: 'user.read', // user.export not yet defined — use user.read for now
    order: 'order.read',
    payment: 'payment.read',
    audit: 'audit.read',
    product: 'product.read',
    brand: 'brand.read',
  };

  const perm = EXPORT_PERMISSIONS[resource] || `${resource}.read`;
  return can(userId, perm);
}
