/**
 * HEAVIX — PR-SC-00: Row-level Tenant Scoping (BLOCKER-A4 fix)
 * =================================================================
 *
 * The Universal Resource API previously enforced only ACTION-level
 * authorization ("can user X do `.read` on resource Y?") but NOT
 * ROW-level authorization ("can user X access THIS SPECIFIC row?").
 * This let any seller with `listing.read` list/get/patch/delete ANY
 * seller's listings — a cross-tenant data leak (BLOCKER-A4).
 *
 * This module is the PURE-FUNCTION core of the fix. It produces Prisma
 * `where` fragments that the data-adapter merges into every query, and
 * owner-assertion checks that createResource / updateResource use to
 * reject cross-tenant writes. It NEVER reads the DB and NEVER trusts a
 * client-supplied identity — the caller passes the server-authenticated
 * userId + resolved role flags.
 *
 * Fail-closed contract:
 *   - If `config.ownership` is declared and the user is NOT admin and
 *     does NOT hold `moderatePermission`, a tenant `where` is returned.
 *   - If the owner field cannot be resolved, the row is treated as
 *     NOT owned → denied (404 on read, 403 on write). Never exposed.
 *
 * @module admin/tenant-scope
 */

import type { AdminResourceConfig, AdminOwnershipConfig } from './types';

/**
 * Resolved access context for a user against a resource.
 * The caller (route handler) resolves `isAdmin` and `hasModeratePerm`
 * from the authenticated session + RBAC — these are NEVER taken from
 * the request body or query string.
 */
export interface TenantAccessContext {
  /** Server-authenticated user id (from getCurrentUser). null = anonymous. */
  userId: string | null;
  /** True if the user has the ADMIN role (via UserRole, RBAC-only). */
  isAdmin: boolean;
  /** True if the user holds the resource's `ownership.moderatePermission`. */
  hasModeratePerm: boolean;
}

/**
 * Sentinel: when returned, the caller MUST treat the query as matching
 * zero rows (deny-all). Used when an unauthenticated user attempts to
 * access a seller-scoped resource — defense-in-depth even though
 * requireAdmin already returns 401 for anonymous users.
 */
export const DENY_ALL = Symbol('tenant_scope_deny_all');

/**
 * Result of building a tenant where clause.
 *   - `{ where: {} }` → no filter (admin / moderator / non-scoped resource)
 *   - `{ where: { ...tenantFilter } }` → restrict to owned rows
 *   - `{ denyAll: true }` → match zero rows (fail-closed for anon on scoped)
 */
export type TenantWhereResult =
  | { where: Record<string, unknown> }
  | { denyAll: true };

/**
 * Build the Prisma `where` fragment that restricts a query to rows the
 * user is allowed to see, based on the resource's ownership config.
 *
 * Pure function. No DB, no I/O, no side effects.
 *
 * @param config   The resource config (may or may not declare ownership)
 * @param ctx      Server-resolved access context (userId, isAdmin, hasModeratePerm)
 * @returns TenantWhereResult — see type above.
 */
export function buildTenantWhere(
  config: AdminResourceConfig,
  ctx: TenantAccessContext,
): TenantWhereResult {
  const ownership = config.ownership;

  // 1. No ownership declared → resource is NOT seller-scoped.
  //    Preserve current (action-level only) behavior. The action-level
  //    gate (requireAdmin + can) already ran in the route handler.
  if (!ownership) {
    return { where: {} };
  }

  // 2. Ownership declared. Admin sees all rows.
  if (ctx.isAdmin) {
    return { where: {} };
  }

  // 3. Ownership declared. Moderator (with moderatePermission) sees all rows.
  if (ctx.hasModeratePerm) {
    return { where: {} };
  }

  // 4. Ownership declared, non-admin, non-moderator.
  //    If we have no authenticated userId, fail-closed → deny all.
  if (!ctx.userId) {
    return { denyAll: true };
  }

  // 5. Build the owner filter from the ownership config.
  const filter = buildOwnerFilter(ownership, ctx.userId);
  if (!filter) {
    // Misconfigured ownership (neither ownerField nor relation set).
    // Fail-closed rather than expose rows.
    return { denyAll: true };
  }

  return { where: filter };
}

/**
 * Build the Prisma where fragment for a single owner field or a
 * relation-chain. Returns null if the ownership config is invalid
 * (neither ownerField nor relation declared) so the caller can
 * fail-closed.
 */
function buildOwnerFilter(
  ownership: AdminOwnershipConfig,
  userId: string,
): Record<string, unknown> | null {
  // Direct ownership: { sellerId: userId }
  if (ownership.ownerField) {
    return { [ownership.ownerField]: userId };
  }
  // Indirect (relation-based) ownership: { listing: { sellerId: userId } }
  if (ownership.relation) {
    const { field, ownerField } = ownership.relation;
    if (!field || !ownerField) return null;
    return { [field]: { [ownerField]: userId } };
  }
  return null;
}

/**
 * Merge a tenant where fragment into an existing Prisma where clause.
 * Uses AND-semantics: both the existing where AND the tenant filter must
 * hold. Handles the denyAll sentinel by producing an unsatisfiable clause.
 *
 * Pure function.
 */
export function mergeTenantWhere(
  existingWhere: Record<string, unknown> | undefined,
  tenant: TenantWhereResult,
): Record<string, unknown> {
  if ('denyAll' in tenant) {
    // Unsatisfiable: id must equal a value that can never exist.
    // Using a never-matching id is safer than `1=0` raw SQL because it
    // keeps the query shape stable across DBs.
    return { id: '__tenant_scope_deny_all__' };
  }
  if (!tenant.where || Object.keys(tenant.where).length === 0) {
    return existingWhere ?? {};
  }
  if (!existingWhere || Object.keys(existingWhere).length === 0) {
    return { ...tenant.where };
  }
  // Both present → AND them. Preserve any existing AND array.
  if (Array.isArray(existingWhere.AND)) {
    return { ...existingWhere, AND: [...existingWhere.AND, tenant.where] };
  }
  return { AND: [existingWhere, tenant.where] };
}

/**
 * Assert that a CREATE payload's owner field matches the authenticated
 * user (or the user is admin/moderator). Prevents a seller from creating
 * a record that claims another seller as its owner.
 *
 * @returns `{ ok: true }` if allowed; `{ ok: false, error }` if denied.
 *
 * Rules:
 *   - No ownership config → always ok (resource is not seller-scoped;
 *     action-level permission already checked).
 *   - Admin or moderator → ok (can create on behalf of anyone).
 *   - Otherwise: if the payload sets the ownerField to a value, it MUST
 *     equal the authenticated userId. If the payload omits the ownerField,
 *     the caller (data-adapter) should inject userId before create —
 *     this function returns `ok: true` with `injectOwner` hint.
 */
export function assertCreateOwner(
  config: AdminResourceConfig,
  ctx: TenantAccessContext,
  payload: Record<string, unknown>,
): { ok: true; injectOwner?: string } | { ok: false; error: string } {
  const ownership = config.ownership;
  if (!ownership) return { ok: true };

  if (ctx.isAdmin || ctx.hasModeratePerm) return { ok: true };
  if (!ctx.userId) return { ok: false, error: 'Authentication required to create a seller-scoped resource' };

  // Direct ownership: check payload's ownerField if present.
  if (ownership.ownerField) {
    const supplied = payload[ownership.ownerField];
    if (supplied === undefined || supplied === null) {
      // Caller should inject the authenticated userId as the owner.
      return { ok: true, injectOwner: ownership.ownerField };
    }
    if (String(supplied) !== ctx.userId) {
      return {
        ok: false,
        error: `Forbidden: cannot create a record owned by another user (field "${ownership.ownerField}")`,
      };
    }
    return { ok: true };
  }

  // Relation-based ownership (e.g. Lead.listing.sellerId): the create
  // path must verify the related record belongs to the user. That
  // requires a DB lookup which the data-adapter performs separately
  // (assertRelationOwned). Here we only fail-closed if the relation
  // foreign-key field is missing from the payload — the adapter cannot
  // resolve ownership without it. The FK field is `${relation.field}Id`
  // (Prisma convention: relation "listing" → scalar FK "listingId").
  if (ownership.relation) {
    const relField = ownership.relation.field;
    const fkField = `${relField}Id`;
    if (payload[fkField] === undefined && payload[relField] === undefined) {
      return {
        ok: false,
        error: `Forbidden: relation field "${fkField}" (or "${relField}") is required so ownership can be verified`,
      };
    }
    return { ok: true, injectOwner: '__relation__' };
  }

  return { ok: false, error: 'Misconfigured ownership (no ownerField or relation)' };
}

/**
 * Result of an ownership check on an existing row (for GET/PATCH/DELETE).
 * The data-adapter calls this after loading the row (or as part of the
 * query) to decide whether the user may proceed.
 */
export type OwnershipCheck =
  | { allowed: true }
  | { allowed: false; reason: 'not_found' | 'not_owner' | 'deny_all' };

/**
 * Check whether a loaded row belongs to the user (direct ownership).
 * For relation-based ownership, the caller must load the related row's
 * ownerField and pass it via `resolvedOwner`.
 *
 * Pure function (operates on the already-loaded row).
 */
export function checkRowOwnership(
  config: AdminResourceConfig,
  ctx: TenantAccessContext,
  row: Record<string, unknown> | null,
  resolvedOwner?: string | null,
): OwnershipCheck {
  const ownership = config.ownership;
  if (!ownership) return { allowed: true }; // not seller-scoped
  if (!row) return { allowed: false, reason: 'not_found' };
  if (ctx.isAdmin) return { allowed: true };
  if (ctx.hasModeratePerm) return { allowed: true };
  if (!ctx.userId) return { allowed: false, reason: 'deny_all' };

  // Direct ownership
  if (ownership.ownerField) {
    const ownerId = row[ownership.ownerField];
    if (ownerId === undefined || ownerId === null) {
      // Owner field is null → unowned row. Fail-closed: deny.
      return { allowed: false, reason: 'not_owner' };
    }
    if (String(ownerId) !== ctx.userId) {
      return { allowed: false, reason: 'not_owner' };
    }
    return { allowed: true };
  }

  // Relation-based ownership: caller must resolve the related owner.
  if (ownership.relation) {
    if (resolvedOwner === undefined) {
      // Caller did not resolve — fail-closed.
      return { allowed: false, reason: 'not_owner' };
    }
    if (resolvedOwner === null) {
      return { allowed: false, reason: 'not_owner' };
    }
    if (String(resolvedOwner) !== ctx.userId) {
      return { allowed: false, reason: 'not_owner' };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: 'not_owner' };
}
