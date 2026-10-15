import { getCurrentUser } from "@/lib/auth";
import { isAdmin as rbacIsAdmin } from "@/lib/authorization";

/**
 * HEAVIX store — auth bridge.
 *
 * The store has its OWN Postgres database (STORE_DATABASE_URL, separate
 * from the main HEAVIX database at DATABASE_URL), but per the user
 * requirement it shares
 * HEAVIX's single sign-on system: "we have ONE login system for all
 * HEAVIX sections including the store". Regular HEAVIX users act as
 * buyers in the store; admins can additionally edit the catalog.
 *
 * This module reads the HEAVIX user session cookie (via `getCurrentUser`
 * from `@/lib/auth`) and returns a normalized user shape that the store
 * API routes / components can consume. It does NOT touch the store DB —
 * it only bridges the HEAVIX user into the store context.
 *
 * STEP 12.84 P0 SECURITY FIX:
 * `isStoreAdmin()` now uses canonical RBAC (`isAdmin()` from
 * `@/lib/authorization`) which checks the UserRole table for the ADMIN
 * role. Previously it called `isAuthenticated()` which only checked if
 * a session existed — allowing ANY logged-in user to be treated as
 * admin. This was a P0 access control bypass.
 */

export interface StoreUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  role: string;
  status: string;
  /** Convenience: true if the HEAVIX user has the ADMIN role (RBAC). */
  isAdmin: boolean;
  /** Full display name "firstName lastName". */
  fullName: string;
}

/**
 * Returns the currently-logged-in HEAVIX user (or null).
 * Reads the `heavix-user` session cookie via the main auth module.
 */
export async function getStoreUser(): Promise<StoreUser | null> {
  try {
    const user = await getCurrentUser();
    if (!user) return null;
    const firstName = user.firstName || "";
    const lastName = user.lastName || "";
    return {
      id: user.id,
      firstName,
      lastName,
      email: user.email,
      mobile: user.mobile,
      role: user.role || "BUYER",
      status: user.status,
      isAdmin: false,
      fullName: `${firstName} ${lastName}`.trim() || user.email,
    };
  } catch {
    return null;
  }
}

/**
 * Returns true if the current request carries a HEAVIX admin session
 * AND the user has the ADMIN role in the RBAC system.
 *
 * STEP 12.84 P0 FIX: Previously called `isAuthenticated()` which only
 * checked session existence — ANY logged-in user was treated as admin.
 * Now uses `isAdmin()` from `@/lib/authorization` which checks the
 * UserRole table for the ADMIN role. Fails closed on any error.
 */
export async function isStoreAdmin(): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    if (!user) return false;
    return await rbacIsAdmin(user.id);
  } catch {
    return false;
  }
}

/**
 * Returns the store user, but with `isAdmin` populated. Use this in
 * store routes that need to differentiate admin (full access to all
 * orders) from a regular user (only their own orders).
 *
 * STEP 12.84 P0 FIX: Removed synthetic admin identity. Admin access
 * now requires BOTH a valid session AND the ADMIN role in RBAC.
 * No synthetic admin shape is returned — if there's no user, there's
 * no admin, period.
 */
export async function getStoreUserWithRole(): Promise<StoreUser | null> {
  const user = await getStoreUser();
  if (!user) return null;
  const admin = await isStoreAdmin();
  return { ...user, isAdmin: admin };
}
