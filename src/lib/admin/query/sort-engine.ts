/**
 * HEAVIX — STEP 06: Sort Engine
 *
 * Translates sort requests into Prisma `orderBy` clauses.
 * Only allows sorting on fields that the resource config
 * declares as sortable.
 */

import type { AdminResourceConfig } from '../types';

// ── Types ──────────────────────────────────────────────────
export interface SortRequest {
  field: string;
  order: 'asc' | 'desc';
}

// ── Build Prisma orderBy from sort request ──────────────────
export function buildOrderBy(
  sort: SortRequest | null | undefined,
  config: AdminResourceConfig,
): Record<string, 'asc' | 'desc'> | undefined {
  if (!sort) {
    // Use default sort from config
    if (config.defaultSort) {
      return { [config.defaultSort.field]: config.defaultSort.order };
    }
    return undefined;
  }

  // Security: check if field is sortable
  const column = config.columns.find(c => c.key === sort.field);
  if (!column?.sortable) {
    // Fallback to default sort
    if (config.defaultSort) {
      return { [config.defaultSort.field]: config.defaultSort.order };
    }
    return undefined;
  }

  return { [sort.field]: sort.order };
}

// ── Parse sort from URL query param ────────────────────────
export function parseSortParam(
  searchParams: URLSearchParams,
  config: AdminResourceConfig,
): SortRequest | null {
  const sortParam = searchParams.get('sort');
  if (!sortParam) return null;

  // Format: "field.desc" or "field.asc"
  const parts = sortParam.split('.');
  if (parts.length !== 2) return null;

  const field = parts[0];
  const order = parts[1] === 'asc' ? 'asc' : 'desc';

  // Validate field is sortable
  const column = config.columns.find(c => c.key === field);
  if (!column?.sortable) return null;

  return { field, order };
}
