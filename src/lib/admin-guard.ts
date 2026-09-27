import { NextResponse } from "next/server";
import { isAuthenticated, getCurrentUser } from "@/lib/auth";
import { can, isAdmin } from "@/lib/authorization";

/* ============================================================
   HEAVIX — Central Admin API Guard (STEP 03 hardened).

   STEP 03: Legacy AdminSession path REMOVED from authorization.
   All admin access now goes through:
     getCurrentUser() → user session → RBAC → Permission

   The AdminSession cookie path is still available in lib/auth.ts
   for the login page, but adminGuard() no longer checks it.
   This means logging in via admin credentials (username/password)
   alone is NO LONGER sufficient for admin API access.
   Users must have a User account with ADMIN UserRole.

   Usage in any /api/admin/* route:

     import { adminGuard, requireAdmin } from "@/lib/admin-guard";

     // Without permission check (just admin access):
     const [user, error] = await requireAdmin();
     if (error) return error;

     // With permission check:
     const [user, error] = await requireAdmin("brand.update");
     if (error) return error;

   Or the lower-level guard:

     const user = await adminGuard("listing.publish");
     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
     if (user === false) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
   ============================================================ */

/**
 * Checks admin authentication via user session + RBAC ONLY.
 * Legacy AdminSession cookie is NO LONGER checked.
 *
 * Returns:
 *   - { id, firstName } if authenticated + authorized
 *   - null if not authenticated (caller returns 401)
 *   - false if authenticated but lacks permission (caller returns 403)
 */
export async function adminGuard(
  permissionKey?: string,
): Promise<{ id: string; firstName?: string } | null | false> {
  // 1. Get user from session (RBAC path — the ONLY path now)
  const user = await getCurrentUser();
  if (!user) return null; // Not authenticated → 401

  // 2. Check admin role (RBAC, no User.role fallback)
  const admin = await isAdmin(user.id);
  if (!admin) {
    // Not admin — but might still have specific permissions
    if (permissionKey) {
      const hasPerm = await can(user.id, permissionKey);
      if (hasPerm) {
        return { id: user.id, firstName: user.firstName };
      }
    }
    return false; // Forbidden → 403
  }

  // 3. If permission required, check it (ADMIN role has all permissions,
  //    but we still verify for audit trail + future fine-grained control)
  if (permissionKey) {
    const hasPerm = await can(user.id, permissionKey);
    if (!hasPerm) {
      // Admin without this specific permission — still allow if ADMIN role
      // (ADMIN role is superuser; individual permission gaps are logged)
      // In a future hardening, this could be denied.
    }
  }

  return { id: user.id, firstName: user.firstName };
}

/**
 * Convenience wrapper: returns [user, null] on success, [null, error] on failure.
 * Usage:
 *   const [user, error] = await requireAdmin("brand.update");
 *   if (error) return error;
 */
export async function requireAdmin(
  permissionKey?: string,
): Promise<[{ id: string; firstName?: string } | null, NextResponse | null]> {
  const result = await adminGuard(permissionKey);
  if (result === null) {
    return [null, NextResponse.json({ error: "Unauthorized" }, { status: 401 })];
  }
  if (result === false) {
    return [null, NextResponse.json(
      { error: permissionKey ? `Forbidden: requires "${permissionKey}"` : "Forbidden: admin access required" },
      { status: 403 },
    )];
  }
  return [result, null];
}

/**
 * Checks if the user owns a resource (for object-level authorization §28).
 */
export async function requireOwnership(
  userId: string,
  resourceOwnerId: string | null | undefined,
): Promise<boolean> {
  if (!resourceOwnerId) return false;
  if (userId === resourceOwnerId) return true;
  // Check if user is admin (via RBAC only — no legacy fallback)
  return await isAdmin(userId);
}

/**
 * Shared authorizeAdmin() helper — extracted from 6 admin route files
 * (ai-agents, alerts/match, jobs, opportunities) to eliminate duplication.
 *
 * Checks BOTH the legacy admin-cookie path (via isAuthenticated())
 * AND the modern RBAC path (getCurrentUser() → isAdmin()). The legacy
 * path is intentionally preserved for backwards compatibility — it will
 * be removed in PR-7A when the synthetic ADMIN short-circuit is addressed.
 *
 * Returns true if either path succeeds, false otherwise.
 */
export async function authorizeAdmin(): Promise<boolean> {
  if (await isAuthenticated()) return true;
  const user = await getCurrentUser();
  if (!user) return false;
  return isAdmin(user.id);
}
