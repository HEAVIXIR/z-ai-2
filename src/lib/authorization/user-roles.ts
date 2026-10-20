/**
 * HEAVIX — Phase A: Additive RBAC Role Helper
 *
 * Document: docs/phase3/RBAC-MIGRATION-DESIGN.md §2.1
 * Step: STEP 14.95 Phase A (owner-authorized, additive only)
 *
 * Purpose: A single, fail-closed read helper for the UserRole join
 * table. All Phase B/D consumers will import from here once the
 * migration proceeds. In Phase A, this file is ADDITIVE — no
 * existing call sites are modified.
 *
 * Fail-closed contract:
 *   - null/undefined userId → "BUYER" (safest default)
 *   - zero UserRole rows   → "BUYER"
 *   - DB query throws      → "BUYER" + console.error log
 *   - unknown role key     → sorted last, never escalates
 *
 * Authorization decisions: this helper is for DISPLAY only.
 * Authorization must use can() (permission-based) from
 * src/lib/authorization/index.ts, which is already RBAC-only
 * and does NOT consult User.role. This helper does NOT grant
 * or deny any permission — it only reads role keys for UI.
 *
 * Role precedence (highest → lowest):
 *   ADMIN > SELLER > BUYER > MODERATOR > SUPPORT
 *
 * This ordering matches prisma/seed-rbac.ts which seeds exactly
 * these 5 role keys with nameFa/nameEn labels.
 */

import { db } from "@/lib/db";

// Static precedence — do NOT rely on row insertion order.
// Verified against prisma/seed-rbac.ts (lines 29-55):
//   ADMIN, SELLER, BUYER, MODERATOR, SUPPORT
const ROLE_PRECEDENCE = ["ADMIN", "SELLER", "BUYER", "MODERATOR", "SUPPORT"] as const;

/**
 * Returns the primary role key for a user, read from the UserRole
 * join table (NOT the User.role column).
 *
 * "Primary" = the first UserRole row, ordered by ROLE_PRECEDENCE.
 *
 * FAIL-CLOSED: if the user has zero UserRole rows, or if the DB
 * query throws, or if userId is null/undefined, returns "BUYER"
 * (the safest default — Buyers have the fewest permissions).
 *
 * @param userId  The user to look up. Null/undefined → "BUYER".
 * @returns       A role key string (e.g. "ADMIN", "SELLER", "BUYER").
 *                Never returns null/undefined. Never throws.
 */
export async function getUserPrimaryRole(
  userId: string | null | undefined,
): Promise<string> {
  if (!userId) return "BUYER";
  try {
    const rows = await db.userRole.findMany({
      where: { userId },
      select: { role: { select: { key: true } } },
    });
    if (rows.length === 0) return "BUYER"; // fail-closed
    const keys = rows.map((r) => r.role.key);
    // Pick highest-precedence role present
    for (const k of ROLE_PRECEDENCE) {
      if (keys.includes(k)) return k;
    }
    // Unknown role key — return the first one (never escalate)
    return keys[0] ?? "BUYER";
  } catch (err) {
    console.error("[user-roles] getUserPrimaryRole failed:", err);
    return "BUYER"; // fail-closed on DB error
  }
}

/**
 * Returns ALL role keys for a user, read from the UserRole join
 * table. Returns an empty array on null userId or DB error.
 *
 * Use this for UI badges / multi-role display. Authorization
 * decisions should use `can()` (permission-based) rather than
 * this function.
 *
 * @param userId  The user to look up. Null/undefined → [].
 * @returns       An array of role key strings, sorted by
 *                ROLE_PRECEDENCE (unknown keys go last).
 *                Never returns null/undefined. Never throws.
 */
export async function getUserRoleKeys(
  userId: string | null | undefined,
): Promise<string[]> {
  if (!userId) return [];
  try {
    const rows = await db.userRole.findMany({
      where: { userId },
      select: { role: { select: { key: true } } },
    });
    const keys = rows.map((r) => r.role.key);
    // Sort by precedence (unknown keys go last, alphabetically)
    return keys.sort((a, b) => {
      const ai = ROLE_PRECEDENCE.indexOf(a as (typeof ROLE_PRECEDENCE)[number]);
      const bi = ROLE_PRECEDENCE.indexOf(b as (typeof ROLE_PRECEDENCE)[number]);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  } catch (err) {
    console.error("[user-roles] getUserRoleKeys failed:", err);
    return []; // fail-closed on DB error
  }
}

/**
 * Returns human-readable role labels for a user, read from the
 * UserRole join + Role.nameFa field. Ordered by ROLE_PRECEDENCE.
 *
 * Returns ["خریدار"] (BUYER label in Persian) on null userId,
 * DB error, or empty UserRole list — same fail-closed contract
 * as getUserPrimaryRole().
 *
 * @param userId  The user to look up. Null/undefined → ["خریدار"].
 * @returns       An array of role label strings (Persian names).
 *                Never returns null/undefined. Never throws.
 */
export async function getUserRoleLabels(
  userId: string | null | undefined,
): Promise<string[]> {
  if (!userId) return ["خریدار"]; // BUYER label (Fa)
  try {
    const rows = await db.userRole.findMany({
      where: { userId },
      select: { role: { select: { key: true, nameFa: true, nameEn: true } } },
    });
    if (rows.length === 0) return ["خریدار"];
    // Sort by precedence (unknown keys go last)
    const sorted = rows.sort((a, b) => {
      const ai = ROLE_PRECEDENCE.indexOf(a.role.key as (typeof ROLE_PRECEDENCE)[number]);
      const bi = ROLE_PRECEDENCE.indexOf(b.role.key as (typeof ROLE_PRECEDENCE)[number]);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    return sorted.map((r) => r.role.nameFa || r.role.key);
  } catch (err) {
    console.error("[user-roles] getUserRoleLabels failed:", err);
    return ["خریدار"]; // fail-closed on DB error
  }
}
