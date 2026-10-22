/**
 * HEAVIX — STEP 15.40 Phase B: Role Shim (display/serialization only)
 *
 * Document: docs/phase3/RBAC-MIGRATION-DESIGN.md §3.1 + addendum §REVISION-3
 * Step: STEP 15.40 Phase B
 *
 * Purpose: Provide a single display-read entry point that returns the
 * "effective role" for a user during the Phase B→D migration window,
 * by consulting the canonical UserRole table first and falling back
 * to the legacy `User.role` column ONLY in the well-defined "EMPTY"
 * case (zero UserRole rows — i.e., un-backfilled user).
 *
 * Precedence (REVISION-3 — "canonical wins"):
 *   1. canonical (UserRole) non-BUYER → return canonical
 *   2. canonical (UserRole) BUYER + status="FOUND" → return "BUYER"
 *      (user has explicit BUYER UserRole — canonical wins)
 *   3. canonical (UserRole) BUYER + status="EMPTY" → consult legacy
 *      `User.role`. If non-BUYER, return legacy (legacy fallback for
 *      un-backfilled users). Else return "BUYER".
 *   4. canonical (UserRole) BUYER + status="DB_ERROR" → return "BUYER"
 *      WITHOUT consulting legacy (DB is down — legacy lookup would
 *      also fail). Prevents stale-legacy display during DB outages.
 *
 * CRITICAL ACCEPTANCE CRITERION (REVISION-7): this file MUST NOT be
 * imported by any authorization-path module. It is display/serialization
 * only. Authorization uses `can()` (permission-based) from
 * src/lib/authorization/index.ts which is RBAC-only and does NOT
 * consult User.role. Verified by tests/security/rbac-phase-b.test.ts
 * test 7 (no-authz-import guard).
 *
 * Signature: getUserRoleWithFallback(userId, user?) => Promise<string>
 *   - userId: the user to look up (null/undefined → "BUYER")
 *   - user?:  optional pre-fetched User object with a `role` field.
 *             If provided, the shim uses `user.role` for the legacy
 *             fallback (saves a DB round-trip when the caller already
 *             has the User row, e.g., from getCurrentUser()).
 *             If omitted, the shim queries `User.role` itself.
 *
 * Never throws. Returns "BUYER" on any unexpected error.
 */

import { db } from "@/lib/db";
import { getUserPrimaryRoleWithStatus } from "@/lib/authorization/user-roles";

/**
 * Resolve the "effective role" for display/serialization purposes.
 *
 * See module header for the full precedence rules.
 *
 * @param userId  The user to look up. Null/undefined → "BUYER".
 * @param user    Optional pre-fetched user object (must have a `role`
 *                field). When supplied, avoids an extra DB round-trip
 *                for the legacy fallback.
 * @returns       A role key string (e.g. "ADMIN", "SELLER", "BUYER").
 *                Never null/undefined. Never throws.
 */
export async function getUserRoleWithFallback(
  userId: string | null | undefined,
  user?: { role?: string | null } | null,
): Promise<string> {
  const { role: canonical, status } = await getUserPrimaryRoleWithStatus(userId);

  // Rule 1: canonical non-BUYER → canonical wins.
  // (status is implicitly "FOUND" here — EMPTY/DB_ERROR always return "BUYER".)
  if (canonical !== "BUYER") return canonical;

  // canonical === "BUYER" — distinguish by status.
  // Rule 4: DB_ERROR → return "BUYER" WITHOUT consulting legacy.
  if (status === "DB_ERROR") return "BUYER";

  // Rule 2: FOUND + BUYER → user has explicit BUYER UserRole.
  // Canonical wins — do NOT consult legacy (no fallback when canonical
  // exists, even if legacy disagrees).
  if (status === "FOUND") return "BUYER";

  // Rule 3: status === "EMPTY" — consult legacy User.role.
  let legacyRole: string | null | undefined;
  if (user && typeof user === "object" && "role" in user) {
    legacyRole = user.role;
  } else if (userId) {
    try {
      const u = await db.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      legacyRole = u?.role ?? null;
    } catch (err) {
      // Legacy lookup failed (DB down). Fail-closed: do NOT return a
      // potentially stale cached value; return BUYER (safest default).
      console.error("[role-shim] legacy User.role lookup failed:", err);
      return "BUYER";
    }
  }

  const r = String(legacyRole ?? "").toUpperCase();
  // If legacy is non-BUYER (e.g. "SELLER", "ADMIN"), fall back to it
  // (un-backfilled user). Otherwise return "BUYER".
  return r && r !== "BUYER" ? r : "BUYER";
}
