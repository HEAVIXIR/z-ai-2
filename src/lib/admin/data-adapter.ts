/**
 * HEAVIX — STEP 06: Resource Data Adapter
 *
 * Connects the Resource Registry to Prisma models.
 * Provides a uniform interface for CRUD operations on any
 * registered resource, with:
 *   - Permission checks (STEP 02 RBAC)
 *   - Field-level authorization (Field Policy)
 *   - Audit logging (STEP 04)
 *
 * This is the ONLY layer that touches the database for
 * Universal Resource operations.
 */

import { db } from '@/lib/db';
import { storeDb } from '@/lib/store-db';
import type { AdminResourceConfig } from './types';
import { buildPrismaQuery, buildCountQuery, type AdminQueryParams } from './query/query-builder';
import { applyFieldPolicy, applyFieldWritePolicyAsync, type FieldPolicyContext } from './field-policy';
import {
  buildTenantWhere,
  mergeTenantWhere,
  assertCreateOwner,
  checkRowOwnership,
  type TenantAccessContext,
  type TenantWhereResult,
} from './tenant-scope';

// ── Types ──────────────────────────────────────────────────
export interface ListResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── P1 STORE-AWARENESS: Get Prisma client based on config.database ──
/**
 * Returns the correct Prisma client for this resource.
 * - config.database === 'store' → storeDb (store-schema.prisma)
 * - config.database === 'main' or undefined → db (main schema.prisma)
 *
 * This eliminates the need for resources to route via dedicated API
 * routes just to access the right database. Universal Resource Engine
 * CRUD now works for both main and store schema resources.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPrismaClient(config: AdminResourceConfig): any {
  return config.database === 'store' ? storeDb : db;
}

// ── Get Prisma model accessor from config ───────────────────
// P4 (Database Ownership Remediation): EXPORTED so that action-engine.ts
// and bulk-export-engine.ts use the SAME store-aware routing as the
// data-adapter. Previously those engines used `(db as any)[config.model]`
// which silently failed for store-domain resources (inventory, warehouses,
// returns, etc.) because the model only exists in storeDb, not main db.
export function getPrismaModel(config: AdminResourceConfig): any {
  const modelKey = config.model.charAt(0).toLowerCase() + config.model.slice(1);
  const client = getPrismaClient(config);
  const model = (client as any)[modelKey];
  if (!model) {
    const schema = config.database === 'store' ? 'store-schema' : 'main schema';
    throw new Error(`Prisma model "${modelKey}" not found in ${schema} for resource "${config.key}"`);
  }
  return model;
}

// ── List (with query params + field policy) ────────────────
// PR-SC-00: `tenantCtx` enforces row-level ownership. When provided and
// the resource declares `ownership`, the query where is merged with a
// tenant filter so non-admin / non-moderator users only see their own rows.
export async function listResources<T = Record<string, unknown>>(
  config: AdminResourceConfig,
  params: AdminQueryParams,
  fieldCtx?: FieldPolicyContext,
  tenantCtx?: TenantAccessContext,
): Promise<ListResult<T>> {
  const model = getPrismaModel(config);
  const prismaQuery = buildPrismaQuery(params, config);
  const countWhere = buildCountQuery(params, config);

  // PR-SC-00: merge tenant filter into both the list query and the count query.
  let tenantResult: TenantWhereResult = { where: {} };
  if (tenantCtx) {
    tenantResult = buildTenantWhere(config, tenantCtx);
  }
  const listWhere = mergeTenantWhere(prismaQuery.where as Record<string, unknown> | undefined, tenantResult);
  const totalWhere = mergeTenantWhere(countWhere as Record<string, unknown> | undefined, tenantResult);

  // Determine which fields to select (based on field policy)
  const select = fieldCtx ? applyFieldPolicy(config, fieldCtx, 'read') : undefined;

  const [items, total] = await Promise.all([
    model.findMany({
      ...prismaQuery,
      where: listWhere,
      ...(select ? { select } : {}),
    }),
    model.count({ where: totalWhere }),
  ]);

  const totalPages = Math.ceil(total / params.pagination.pageSize) || 1;

  return {
    items: items as T[],
    total,
    page: params.pagination.page,
    pageSize: params.pagination.pageSize,
    totalPages,
  };
}

// ── Get single resource ────────────────────────────────────
// PR-SC-00: when `tenantCtx` is provided and the resource declares
// ownership, findUnique is replaced with findFirst scoped by the tenant
// filter — so a non-owner gets a 404 (not the row). Admin / moderator
// bypass the filter (buildTenantWhere returns `{}`).
export async function getResource<T = Record<string, unknown>>(
  config: AdminResourceConfig,
  id: string,
  fieldCtx?: FieldPolicyContext,
  tenantCtx?: TenantAccessContext,
): Promise<T | null> {
  const model = getPrismaModel(config);
  const select = fieldCtx ? applyFieldPolicy(config, fieldCtx, 'read') : undefined;

  // No tenant context → original findUnique path (preserves existing callers).
  if (!tenantCtx) {
    const item = await model.findUnique({
      where: { id },
      ...(select ? { select } : {}),
    });
    return item as T | null;
  }

  // PR-SC-00: tenant-scoped path. Use findFirst with the merged where so
  // non-owners get null (→ 404 in the route handler).
  const tenantResult = buildTenantWhere(config, tenantCtx);
  const where = mergeTenantWhere({ id }, tenantResult);
  const item = await model.findFirst({
    where,
    ...(select ? { select } : {}),
  });
  return item as T | null;
}

// ── Create resource (with field policy enforcement) ────────
// P0-1 HARDENING: Uses applyFieldWritePolicyAsync for fail-closed
// field-level write authorization. If the caller provides fieldCtx,
// fields with `permissions.write` are checked via `can(userId, perm)`.
// Users lacking field-level write permission cause the ENTIRE request
// to be rejected (fail-closed), not silently stripped.
//
// PR-SC-00: when `tenantCtx` is provided and the resource declares
// ownership, assertCreateOwner rejects cross-tenant creates (a seller
// trying to set another seller's id as the owner). If the payload omits
// the owner field, it is injected from the authenticated userId.
export async function createResource(
  config: AdminResourceConfig,
  data: Record<string, unknown>,
  fieldCtx?: FieldPolicyContext,
  tenantCtx?: TenantAccessContext,
): Promise<Record<string, unknown>> {
  const model = getPrismaModel(config);

  // Apply field write policy (async, fail-closed if user lacks field-level write permission)
  let filteredData = data;
  if (fieldCtx) {
    const policy = await applyFieldWritePolicyAsync(config, data, fieldCtx);
    if (!policy.ok) {
      const err = new Error(
        `Forbidden: field "${policy.rejectedField}" requires "${policy.requiredPermission}" permission`,
      ) as Error & { statusCode: number; rejectedField: string; requiredPermission: string };
      err.statusCode = 403;
      (err as any).rejectedField = policy.rejectedField;
      (err as any).requiredPermission = policy.requiredPermission;
      throw err;
    }
    filteredData = policy.filteredData!;
  }

  // PR-SC-00: enforce owner on create.
  if (tenantCtx) {
    const ownerCheck = assertCreateOwner(config, tenantCtx, filteredData);
    if (!ownerCheck.ok) {
      const err = new Error(ownerCheck.error) as Error & { statusCode: number };
      err.statusCode = 403;
      throw err;
    }
    // Inject the authenticated userId as the owner if the payload omitted it
    // (direct ownership only; relation-based ownership is verified by the
    // caller via a separate lookup, documented in tenant-scope.ts).
    if (ownerCheck.injectOwner && ownerCheck.injectOwner !== '__relation__') {
      filteredData = { ...filteredData, [ownerCheck.injectOwner]: tenantCtx.userId };
    }
  }

  const item = await model.create({ data: filteredData });
  return item;
}

// ── Update resource (with field policy enforcement) ────────
// P0-1 HARDENING: Same fail-closed field write policy as createResource.
// STEP 11.22: The read-evaluate-update sequence is now wrapped in a
// db.$transaction for main-DB resources. This closes the TOCTOU race
// condition where a record could change between the read (for
// readonlyWhen evaluation) and the write. For store-DB resources,
// cross-DB transactions aren't supported — we fall back to the
// non-transactional path (KNOWN LIMITATION, same as audit).
//
// PR-SC-00: when `tenantCtx` is provided and the resource declares
// ownership, the tenant filter is applied to the persisted-record load
// (SELECT FOR UPDATE for main-DB; findUnique for store-DB). A non-owner
// gets a 404-style "Record not found" error — the row is never exposed
// and the update never runs.
export async function updateResource(
  config: AdminResourceConfig,
  id: string,
  data: Record<string, unknown>,
  fieldCtx?: FieldPolicyContext,
  tenantCtx?: TenantAccessContext,
): Promise<Record<string, unknown>> {
  const model = getPrismaModel(config);

  // For store-DB resources, use non-transactional path (cross-DB limitation)
  if (config.database === 'store') {
    return updateResourceNonTransactional(config, model, id, data, fieldCtx, tenantCtx);
  }

  // STEP 11.23: For main-DB resources, wrap read+evaluate+update in a
  // transaction with SELECT FOR UPDATE row locking. This closes the TOCTOU
  // race condition: under PostgreSQL's default Read Committed isolation,
  // a plain findUnique does NOT lock the row — another transaction could
  // modify it between our read and write. Using $queryRaw with
  // 'SELECT ... FOR UPDATE' acquires a row-level lock that blocks concurrent
  // writes until our transaction commits or rolls back.
  return await db.$transaction(async (tx) => {
    const txModel = (tx as any)[config.model];

    // PR-SC-00: build the tenant filter for the persisted-record load.
    // A non-owner must get "not found" so the row is never updated.
    const tenantResult = tenantCtx ? buildTenantWhere(config, tenantCtx) : { where: {} as Record<string, unknown> };
    const denyAll = 'denyAll' in tenantResult;
    const tenantWhere = 'where' in tenantResult ? tenantResult.where : {};

    // STEP 11.23: Use SELECT FOR UPDATE to lock the row for the duration
    // of this transaction. This prevents a concurrent request from
    // modifying the controlling field between our policy evaluation
    // and our write.
    //
    // We use $queryRaw because Prisma's findUnique does not support
    // FOR UPDATE. The table name is derived from the model name
    // (Prisma uses the model name as-is for the table name by default).
    const tableName = config.model.charAt(0).toUpperCase() + config.model.slice(1);
    let persistedRecord: Record<string, unknown> | null = null;
    if (denyAll) {
      // Tenant filter is deny-all → treat as not found (fail-closed).
      persistedRecord = null;
    } else {
      try {
        // PR-SC-00: if the tenant filter is non-empty, we cannot use a raw
        // SELECT * WHERE id=$1 (it would ignore the tenant filter). Instead,
        // load via Prisma findFirst with the merged where, then re-lock via
        // a SELECT FOR UPDATE keyed on the confirmed id. This two-step keeps
        // the row lock while respecting the tenant boundary.
        if (Object.keys(tenantWhere).length > 0) {
          const locked = await txModel.findFirst({ where: { id, ...tenantWhere }, select: { id: true } });
          if (!locked) {
            persistedRecord = null;
          } else {
            const rows = await tx.$queryRaw`
              SELECT * FROM "${tableName}" WHERE "id" = ${id} FOR UPDATE
            ` as Record<string, unknown>[];
            persistedRecord = rows.length > 0 ? rows[0] : null;
          }
        } else {
          const rows = await tx.$queryRaw`
            SELECT * FROM "${tableName}" WHERE "id" = ${id} FOR UPDATE
          ` as Record<string, unknown>[];
          persistedRecord = rows.length > 0 ? rows[0] : null;
        }
      } catch (err) {
        throw new Error(
          `Failed to load persisted record (FOR UPDATE): ${(err as Error).message}`,
        );
      }
    }
    if (!persistedRecord) {
      const err = new Error(`Record not found: ${config.key}/${id} — cannot evaluate field policy`) as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }

    // PR-SC-00: defense-in-depth — re-check row ownership on the loaded row.
    if (tenantCtx) {
      const ownCheck = checkRowOwnership(config, tenantCtx, persistedRecord);
      if (!ownCheck.allowed) {
        const err = new Error(`Record not found: ${config.key}/${id}`) as Error & { statusCode: number };
        err.statusCode = 404;
        throw err;
      }
    }

    // Apply field write policy (readonlyWhen evaluated against locked persisted state)
    let filteredData = data;
    if (fieldCtx) {
      const policy = await applyFieldWritePolicyAsync(config, data, fieldCtx, persistedRecord);
      if (!policy.ok) {
        const err = new Error(
          `Forbidden: field "${policy.rejectedField}" requires "${policy.requiredPermission}" permission`,
        ) as Error & { statusCode: number; rejectedField: string; requiredPermission: string };
        err.statusCode = 403;
        (err as any).rejectedField = policy.rejectedField;
        (err as any).requiredPermission = policy.requiredPermission;
        throw err;
      }
      filteredData = policy.filteredData!;
    }

    // PR-SC-00: prevent a non-admin from re-assigning the owner field to
    // another user via the update payload. If the resource has a direct
    // ownerField and the payload tries to change it to a different userId,
    // reject (fail-closed).
    if (tenantCtx && config.ownership?.ownerField && !tenantCtx.isAdmin && !tenantCtx.hasModeratePerm) {
      const ownerField = config.ownership.ownerField;
      const newOwner = filteredData[ownerField];
      if (newOwner !== undefined && newOwner !== null && String(newOwner) !== tenantCtx.userId) {
        const err = new Error(
          `Forbidden: cannot reassign ownership field "${ownerField}" to another user`,
        ) as Error & { statusCode: number };
        err.statusCode = 403;
        throw err;
      }
    }

    // Perform the update INSIDE the same transaction (row is still locked)
    const item = await txModel.update({ where: { id }, data: filteredData });
    return item;
  });
}

// Non-transactional update path for store-DB resources (cross-DB limitation)
async function updateResourceNonTransactional(
  config: AdminResourceConfig,
  model: ReturnType<typeof getPrismaModel>,
  id: string,
  data: Record<string, unknown>,
  fieldCtx?: FieldPolicyContext,
  tenantCtx?: TenantAccessContext,
): Promise<Record<string, unknown>> {
  // PR-SC-00: load with tenant filter (fail-closed for non-owners).
  const tenantResult = tenantCtx ? buildTenantWhere(config, tenantCtx) : { where: {} as Record<string, unknown> };
  const denyAll = 'denyAll' in tenantResult;
  const tenantWhere = 'denyAll' in tenantResult ? {} : tenantResult.where;

  // Load persisted record (fail-closed)
  let persistedRecord: Record<string, unknown> | null = null;
  try {
    if (denyAll) {
      persistedRecord = null;
    } else if (Object.keys(tenantWhere).length > 0) {
      persistedRecord = await model.findFirst({ where: { id, ...tenantWhere } }) as Record<string, unknown> | null;
    } else {
      persistedRecord = await model.findUnique({ where: { id } }) as Record<string, unknown> | null;
    }
  } catch (err) {
    throw new Error(
      `Failed to load persisted record: ${(err as Error).message}`,
    );
  }
  if (!persistedRecord) {
    const err = new Error(`Record not found: ${config.key}/${id}`) as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  // PR-SC-00: defense-in-depth ownership re-check.
  if (tenantCtx) {
    const ownCheck = checkRowOwnership(config, tenantCtx, persistedRecord);
    if (!ownCheck.allowed) {
      const err = new Error(`Record not found: ${config.key}/${id}`) as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }
  }

  let filteredData = data;
  if (fieldCtx) {
    const policy = await applyFieldWritePolicyAsync(config, data, fieldCtx, persistedRecord);
    if (!policy.ok) {
      const err = new Error(
        `Forbidden: field "${policy.rejectedField}" requires "${policy.requiredPermission}" permission`,
      ) as Error & { statusCode: number; rejectedField: string; requiredPermission: string };
      err.statusCode = 403;
      (err as any).rejectedField = policy.rejectedField;
      (err as any).requiredPermission = policy.requiredPermission;
      throw err;
    }
    filteredData = policy.filteredData!;
  }

  // PR-SC-00: prevent ownership reassignment.
  if (tenantCtx && config.ownership?.ownerField && !tenantCtx.isAdmin && !tenantCtx.hasModeratePerm) {
    const ownerField = config.ownership.ownerField;
    const newOwner = filteredData[ownerField];
    if (newOwner !== undefined && newOwner !== null && String(newOwner) !== tenantCtx.userId) {
      const err = new Error(
        `Forbidden: cannot reassign ownership field "${ownerField}" to another user`,
      ) as Error & { statusCode: number };
      err.statusCode = 403;
      throw err;
    }
  }

  return await model.update({ where: { id }, data: filteredData });
}

// ── Delete resource (soft or hard) ────────────────────────
// PR-SC-00: when `tenantCtx` is provided and the resource declares
// ownership, the row is loaded with the tenant filter first. A non-owner
// gets a 404 (row never deleted). Admin / moderator bypass.
export async function deleteResource(
  config: AdminResourceConfig,
  id: string,
  tenantCtx?: TenantAccessContext,
): Promise<boolean> {
  const model = getPrismaModel(config);

  // PR-SC-00: verify ownership before delete.
  if (tenantCtx) {
    const tenantResult = buildTenantWhere(config, tenantCtx);
    if ('denyAll' in tenantResult) {
      const err = new Error(`Record not found: ${config.key}/${id}`) as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }
    const where = mergeTenantWhere({ id }, tenantResult);
    const existing = await model.findFirst({ where, select: { id: true } });
    if (!existing) {
      const err = new Error(`Record not found: ${config.key}/${id}`) as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }
  }

  // Check if this resource supports soft delete
  if (config.columns.some(c => c.key === 'deletedAt')) {
    // Soft delete
    await model.update({ where: { id }, data: { deletedAt: new Date() } });
  } else {
    // Hard delete
    await model.delete({ where: { id } });
  }

  return true;
}
