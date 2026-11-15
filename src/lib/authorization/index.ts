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
  try {
    const perms = await getUserPermissions(userId);
    return perms.includes(permission);
  } catch {
    return false;
  }
}

// ── canAny(userId, permissions[]) ──────────────────────────
export async function canAny(
  userId: string | null | undefined,
  permissions: string[],
): Promise<boolean> {
  if (!userId || permissions.length === 0) return false;
  try {
    const perms = await getUserPermissions(userId);
    return permissions.some((p) => perms.includes(p));
  } catch {
    return false;
  }
}

// ── canAll(userId, permissions[]) ──────────────────────────
export async function canAll(
  userId: string | null | undefined,
  permissions: string[],
): Promise<boolean> {
  if (!userId) return false;
  try {
    const perms = await getUserPermissions(userId);
    return permissions.every((p) => perms.includes(p));
  } catch {
    return false;
  }
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
export async function isAdmin(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  try {
    const adminRole = await db.userRole.findFirst({
      // Defense in depth: an assigned ADMIN role is ineffective unless the
      // underlying account is currently active.
      where: { userId, user: { status: 'ACTIVE' }, role: { key: 'ADMIN' } },
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
 * SQL identifier allowlist for canAccessResource.
 *
 * STEP 18.2.7.3.5 (Finding R-1): `resource` (table name) and
 * `options.ownerField` (column name) are interpolated into a raw
 * SQL query via `db.$queryRawUnsafe`. PostgreSQL double-quoting
 * (`"${name}"`) turns the value into a quoted identifier, which
 * provides partial protection, but is NOT sufficient against inputs
 * like `foo"; DROP TABLE x; --` if a caller ever passes unvalidated
 * user input.
 *
 * This allowlist enforces that BOTH identifiers match the PostgreSQL
 * identifier production rule: `^[a-zA-Z_][a-zA-Z0-9_]*$`. Any input
 * that fails the check causes the authorization to FAIL CLOSED
 * (return false) — it never reaches the database.
 *
 * This is defense-in-depth: even though no production caller currently
 * passes user-controlled input to canAccessResource, the function is
 * a PUBLIC exported API, and a future caller must not be able to
 * introduce a SQL injection by accident.
 */
const SQL_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function isValidSqlIdentifier(name: string): boolean {
  return typeof name === 'string' && SQL_IDENTIFIER_PATTERN.test(name);
}

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
 *
 * STEP 18.2.7.3.5: `resource` and `options.ownerField` are validated
 * against a strict SQL-identifier allowlist BEFORE the raw query is
 * constructed. Invalid identifiers cause the function to fail closed
 * (return false) — they never reach the database.
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
  // STEP 18.2.7.3.5 (Finding R-1): Validate SQL identifiers BEFORE
  // constructing the query. Fail closed on any invalid input — never
  // pass a malformed identifier to $queryRawUnsafe.
  if (!isValidSqlIdentifier(resource)) {
    return false;
  }
  if (!options || !isValidSqlIdentifier(options.ownerField)) {
    return false;
  }

  // If user has the moderate permission, they can access any resource
  if (options.moderatePermission && await can(userId, options.moderatePermission)) {
    return true;
  }

  // Otherwise, check if they own the resource.
  // Identifiers are already allowlisted above, so $queryRawUnsafe is safe here.
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
 *
 * STEP 11.6 (Phase B.5 — Resource-aware): The previous version used a
 * hardcoded 6-entry map (BULK_PERMISSION_MAP) that mapped action keys
 * like `bulk-delete` → `listing.delete`. This was WRONG for any resource
 * other than the original 6 — e.g., `bulk-delete` on `users` mapped to
 * `listing.delete` (silent privilege escalation risk if user had
 * `listing.delete` but not `user.delete`).
 *
 * The fix makes canBulkAction RESOURCE-AWARE:
 *   - If `resourceKey` is provided, look up the resource config and find
 *     the matching `bulkActions[]` entry. Use its declared `permission`.
 *   - If `resourceKey` is provided but no matching bulkAction is declared,
 *     FAIL CLOSED (return false). The resource explicitly did NOT
 *     authorize this bulk action.
 *   - If `resourceKey` is omitted (legacy callers), fall back to the
 *     legacy map for backward compatibility. This path is deprecated —
 *     all callers should pass `resourceKey`.
 *
 * Usage (preferred — resource-aware):
 *   await canBulkAction(userId, 'bulk-delete', 'users');
 *   → looks up userConfig.bulkActions, finds 'bulk-delete', returns
 *     can(userId, 'user.delete')
 *
 * Usage (legacy — fallback map):
 *   await canBulkAction(userId, 'bulk-delete');
 *   → looks up BULK_PERMISSION_MAP['bulk-delete'] = 'listing.delete'
 *     → returns can(userId, 'listing.delete')
 */
export async function canBulkAction(
  userId: string | null | undefined,
  action: string,
  resourceKey?: string,
): Promise<boolean> {
  // Resource-aware path (preferred)
  if (resourceKey) {
    try {
      // Lazy-load the registry to avoid circular import at module init.
      // (resource-registry imports from types.ts, which is fine; but the
      // authorization module is imported by many low-level modules.)
      const { registry } = await import('@/lib/admin/resource-registry');
      const config = registry.get(resourceKey);
      if (!config) {
        // Unknown resource — fail closed.
        return false;
      }
      const bulkAction = config.bulkActions?.find(ba => ba.key === action);
      if (!bulkAction) {
        // Resource doesn't declare this bulk action — fail closed.
        // (Previously, the legacy map would fall through to a literal
        // string lookup like `can(userId, 'bulk-delete')` which always
        // returned false because no Permission has that key — same
        // outcome, but explicit fail-closed is clearer.)
        return false;
      }
      return can(userId, bulkAction.permission);
    } catch {
      // Registry lookup failed (e.g., import error) — fail closed.
      return false;
    }
  }

  // Legacy fallback path (deprecated — all callers should pass resourceKey).
  // Kept for backward compatibility with callers that haven't migrated yet.
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
 *
 * STEP 16-C FIX (Class A.1 — Dim 17 singular/plural mismatch):
 * The bulk-export-engine.ts:199 calls `canExport(userId, resourceKey)` with
 * PLURAL resource keys (e.g. 'orders', 'payments', 'companies'), but the
 * previous version of this map only had SINGULAR keys ('listing', 'user',
 * 'order', 'payment', 'audit', 'product', 'brand') → 11 of 18 resources
 * fell through to the `${resource}.read` fallback producing non-existent
 * permission strings like 'orders.read' (only 'order.read' singular exists
 * in PERMISSIONS array) → executeExport threw `Forbidden: export permission
 * required for "{resource}"` at runtime.
 *
 * The fix below covers ALL 18 admin resources with BOTH singular and plural
 * keys, mapping to the canonical permission defined in PERMISSIONS array.
 * For resources that reuse another domain's permissions (parts/machines
 * reuse product.*, offers reuse listing.*, disputes reuse deal.*), we map
 * to the canonical permission of the reused domain.
 */
export async function canExport(
  userId: string | null | undefined,
  resource: string,
): Promise<boolean> {
  const EXPORT_PERMISSIONS: Record<string, string> = {
    // ── Singular form (legacy direct calls) ──
    listing: 'listing.export',
    user: 'user.read',
    order: 'order.read',
    payment: 'payment.read',
    audit: 'audit.read',
    product: 'product.read',
    brand: 'brand.read',
    // ── Plural form (resource keys from bulk-export-engine.ts:199) ──
    listings: 'listing.export',
    brands: 'brand.read',
    users: 'user.read',
    products: 'product.read',
    parts: 'part.read',            // parts has its own perm in 16-C
    orders: 'order.read',
    payments: 'payment.read',
    companies: 'company.read',
    machines: 'machine.read',     // machines has its own perm in 16-C
    reviews: 'review.read',
    deals: 'deal.read',
    rfqs: 'rfq.read',
    offers: 'offer.read',         // offers has its own perm in 16-C
    auctions: 'auction.read',    // auctions has its own perm in 16-C
    inspections: 'inspection.read',  // added in 16-C
    transports: 'transport.read',     // added in 16-C
    disputes: 'dispute.read',         // added in 16-C
    'buy-requests': 'request.read',   // added in 16-C
  };

  const perm = EXPORT_PERMISSIONS[resource] || `${resource}.read`;
  return can(userId, perm);
}

// ── STEP 14.8-B: Legacy shim — hasRole ─────────────────────────
// Older code (e.g. src/lib/ai-policy.ts) imports { hasRole } from
// "@/lib/authorization". The new RBAC model is permission-based, not
// role-based, but during the migration window we provide a shim that
// resolves "role" strings to canonical permission keys.
//
// Legacy signature:  hasRole(userId, roles: string | string[]) → Promise<boolean>
// Returns true if the user has any of the listed "role" keys, where each
// role key maps to a sentinel permission we treat as role membership.
//
// Migration target: replace `hasRole(userId, 'ADMIN')` with
// `can(userId, 'admin.access')` and remove this shim.
const ROLE_PERMISSION_MAP: Record<string, string> = {
  ADMIN: 'admin.access',
  SELLER: 'seller.access',
  BUYER: 'buyer.access',
  MODERATOR: 'moderator.access',
  SUPPORT: 'support.access',
};

export async function hasRole(
  userId: string | null | undefined,
  roles: string | string[],
): Promise<boolean> {
  if (!userId) return false;
  const roleList = Array.isArray(roles) ? roles : [roles];
  for (const r of roleList) {
    const perm = ROLE_PERMISSION_MAP[r] || `${r.toLowerCase()}.access`;
    if (await can(userId, perm)) return true;
  }
  return false;
}
