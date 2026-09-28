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

// ── Get Prisma model accessor from config ───────────────────
function getPrismaModel(config: AdminResourceConfig): any {
  const modelKey = config.model.charAt(0).toLowerCase() + config.model.slice(1);
  const model = (db as any)[modelKey];
  if (!model) {
    throw new Error(`Prisma model "${modelKey}" not found for resource "${config.key}"`);
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
export async function updateResource(
  config: AdminResourceConfig,
  id: string,
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
