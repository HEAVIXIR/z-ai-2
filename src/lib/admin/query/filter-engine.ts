/**
 * HEAVIX — STEP 06: Filter Engine
 *
 * Translates frontend filter requests into Prisma `where` clauses.
 * Only allows filtering on fields that the resource config declares
 * as filterable — no arbitrary queries from frontend.
 *
 * Operators: eq, neq, contains, startsWith, endsWith,
 *            gt, gte, lt, lte, between, in, notIn, isNull, isNotNull
 */

import type { AdminResourceConfig, AdminColumn } from '../types';

// ── Types ──────────────────────────────────────────────────
export interface FilterRequest {
  field: string;
  operator: FilterOperator;
  value?: unknown;
}

export type FilterOperator =
  | 'eq' | 'neq' | 'contains' | 'startsWith' | 'endsWith'
  | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'in' | 'notIn'
  | 'isNull' | 'isNotNull';

// ── Build Prisma where clause from filter requests ─────────
export function buildWhereClause(
  filters: FilterRequest[],
  config: AdminResourceConfig,
): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  for (const filter of filters) {
    // Security: check if this field is filterable in the resource config
    const column = config.columns.find(c => c.key === filter.field);
    const isFilterable = column?.filterable ||
      config.filters?.some(f => f.key === filter.field);

    if (!isFilterable) {
      // Skip non-filterable fields silently (security: don't error, just ignore)
      continue;
    }

    const { field, operator, value } = filter;

    switch (operator) {
      case 'eq':
        where[field] = value;
        break;
      case 'neq':
        where[field] = { not: value };
        break;
      case 'contains':
        where[field] = { contains: value, mode: 'insensitive' };
        break;
      case 'startsWith':
        where[field] = { startsWith: value, mode: 'insensitive' };
        break;
      case 'endsWith':
        where[field] = { endsWith: value, mode: 'insensitive' };
        break;
      case 'gt':
        where[field] = { gt: value };
        break;
      case 'gte':
        where[field] = { gte: value };
        break;
      case 'lt':
        where[field] = { lt: value };
        break;
      case 'lte':
        where[field] = { lte: value };
        break;
      case 'between':
        if (Array.isArray(value) && value.length === 2) {
          where[field] = { gte: value[0], lte: value[1] };
        }
        break;
      case 'in':
        if (Array.isArray(value)) {
          where[field] = { in: value };
        }
        break;
      case 'notIn':
        if (Array.isArray(value)) {
          where[field] = { notIn: value };
        }
        break;
      case 'isNull':
        where[field] = null;
        break;
      case 'isNotNull':
        where[field] = { not: null };
        break;
    }
  }

  return where;
}

// ── Parse filter query params from URL ──────────────────────
export function parseFilterParams(
  searchParams: URLSearchParams,
  config: AdminResourceConfig,
): FilterRequest[] {
  const filters: FilterRequest[] = [];

  // Parse filter[field]=value or filter[field]=op:value
  for (const [key, value] of searchParams.entries()) {
    if (key.startsWith('filter.')) {
      const field = key.slice(7); // remove "filter."
      const [op, val] = value.includes(':') ? value.split(':', 2) : ['eq', value];
      filters.push({ field, operator: op as FilterOperator, value: val });
    }
  }

  // Also parse resource-specific filter keys (e.g., status=PUBLISHED)
  if (config.filters) {
    for (const filterDef of config.filters) {
      const val = searchParams.get(filterDef.key);
      if (val !== null && val !== '') {
        filters.push({ field: filterDef.key, operator: 'eq', value: val });
      }
    }
  }

  return filters;
}
