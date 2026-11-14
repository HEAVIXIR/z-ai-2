import { db } from "@/lib/db";
import {
  isCompanyMembershipRoleKey,
  type CompanyMembershipRoleKey,
} from "@/lib/identity/standard";

/**
 * Resolve an ACTIVE membership for one exact company and user.
 * Always scope the query by both IDs; never authorize from User.companyId,
 * a client-supplied role, or a platform-level role.
 *
 * Returns null for missing, invited, suspended, removed, or malformed roles.
 */
export async function getActiveCompanyMembership(
  userId: string,
  companyId: string,
) {
  if (!userId || !companyId) return null;

  const membership = await db.companyMembership.findUnique({
    where: {
      companyId_userId: { companyId, userId },
    },
    select: {
      id: true,
      companyId: true,
      userId: true,
      roleKey: true,
      status: true,
      isPrimary: true,
    },
  });

  if (!membership || membership.status !== "ACTIVE") return null;
  if (!isCompanyMembershipRoleKey(membership.roleKey)) return null;

  return membership;
}

/**
 * Fail-closed role gate for company-scoped operations.
 * Call this on the server for every read/write that addresses a company.
 */
export async function hasCompanyRole(
  userId: string,
  companyId: string,
  allowedRoles: readonly CompanyMembershipRoleKey[],
): Promise<boolean> {
  if (!allowedRoles.length) return false;

  const membership = await getActiveCompanyMembership(userId, companyId);
  return membership !== null && allowedRoles.includes(membership.roleKey);
}
