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
export async function listResources<T = Record<string, unknown>>(
  config: AdminResourceConfig,
  params: AdminQueryParams,
  fieldCtx?: FieldPolicyContext,
): Promise<ListResult<T>> {
  const model = getPrismaModel(config);
  const prismaQuery = buildPrismaQuery(params, config);
  const countWhere = buildCountQuery(params, config);

  // Determine which fields to select (based on field policy)
  const select = fieldCtx ? applyFieldPolicy(config, fieldCtx, 'read') : undefined;

  const [items, total] = await Promise.all([
    model.findMany({
      ...prismaQuery,
      ...(select ? { select } : {}),
    }),
    model.count({ where: countWhere }),
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
export async function getResource<T = Record<string, unknown>>(
  config: AdminResourceConfig,
  id: string,
  fieldCtx?: FieldPolicyContext,
): Promise<T | null> {
  const model = getPrismaModel(config);
  const select = fieldCtx ? applyFieldPolicy(config, fieldCtx, 'read') : undefined;

  const item = await model.findUnique({
    where: { id },
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
export async function createResource(
  config: AdminResourceConfig,
  data: Record<string, unknown>,
  fieldCtx?: FieldPolicyContext,
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

  const item = await model.create({ data: filteredData });
  return item;
}

// ── Update resource (with field policy enforcement) ────────
// P0-1 HARDENING: Same fail-closed field write policy as createResource.
// STEP 11.19: For updates, load the PERSISTED record before evaluating
// readonlyWhen conditions. Previously, conditions were evaluated against
// the submitted data only — a user could omit the controlling field and
// bypass the rule. Now we merge persisted state with submitted data for
// condition evaluation.
export async function updateResource(
  config: AdminResourceConfig,
  id: string,
  data: Record<string, unknown>,
  fieldCtx?: FieldPolicyContext,
): Promise<Record<string, unknown>> {
  const model = getPrismaModel(config);

  // STEP 11.19: Load persisted record for readonlyWhen evaluation
  let persistedRecord: Record<string, unknown> | null = null;
  try {
    persistedRecord = await model.findUnique({ where: { id } }) as Record<string, unknown> | null;
  } catch { /* non-fatal */ }

  // Apply field write policy (async, fail-closed if user lacks field-level write permission)
  let filteredData = data;
  if (fieldCtx) {
    // STEP 11.19: Pass persistedRecord so readonlyWhen can evaluate against
    // authoritative server state, not client-submitted data.
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

  const item = await model.update({ where: { id }, data: filteredData });
  return item;
}

// ── Delete resource (soft or hard) ────────────────────────
export async function deleteResource(
  config: AdminResourceConfig,
  id: string,
): Promise<boolean> {
  const model = getPrismaModel(config);

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
