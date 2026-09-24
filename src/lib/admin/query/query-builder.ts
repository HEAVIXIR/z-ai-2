/**
 * HEAVIX — STEP 06: Query Builder
 *
 * Combines filter + sort + pagination + search engines into a
 * single Prisma query object. This is the entry point for the
 * Universal Data Access Layer.
 *
 * Security: only uses fields declared in the resource config.
 * No arbitrary queries from frontend.
 */

import type { AdminResourceConfig } from '../types';
import { buildWhereClause, parseFilterParams, type FilterRequest } from './filter-engine';
import { buildOrderBy, parseSortParam, type SortRequest } from './sort-engine';
import {
  parsePagination, buildPagination, parseSearchParam, buildSearchWhere,
  type PaginationParams,
} from './pagination-search';

// ── Types ──────────────────────────────────────────────────
export interface AdminQueryParams {
  filters: FilterRequest[];
  sort: SortRequest | null;
  pagination: PaginationParams;
  search: string | null;
}

export interface PrismaQuery {
  where: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  skip: number;
  take: number;
}

// ── Parse from URL search params ───────────────────────────
export function parseQueryParams(
  searchParams: URLSearchParams,
  config: AdminResourceConfig,
): AdminQueryParams {
  return {
    filters: parseFilterParams(searchParams, config),
    sort: parseSortParam(searchParams, config),
    pagination: parsePagination(searchParams, config),
    search: parseSearchParam(searchParams),
  };
}

// ── Build Prisma query ─────────────────────────────────────
export function buildPrismaQuery(
  params: AdminQueryParams,
  config: AdminResourceConfig,
): PrismaQuery {
  // Build where clause from filters
  const filterWhere = buildWhereClause(params.filters, config);

  // Build search where clause
  const searchWhere = buildSearchWhere(params.search, config);

  // Combine filter + search (AND)
  const where: Record<string, unknown> = { ...filterWhere };
  if (searchWhere) {
    // Merge search as additional AND condition
    if (where.OR) {
      // If filter already has OR, wrap everything in AND
      where.AND = [searchWhere];
    } else {
      Object.assign(where, searchWhere);
    }
  }

  // Build sort
  const orderBy = buildOrderBy(params.sort, config);

  // Build pagination
  const { skip, take } = buildPagination(params.pagination);

  return { where, orderBy, skip, take };
}

// ── Build count query (same where, no skip/take) ───────────
export function buildCountQuery(params: AdminQueryParams, config: AdminResourceConfig) {
  const filterWhere = buildWhereClause(params.filters, config);
  const searchWhere = buildSearchWhere(params.search, config);
  const where: Record<string, unknown> = { ...filterWhere };
  if (searchWhere) {
    if (where.OR) {
      where.AND = [searchWhere];
    } else {
      Object.assign(where, searchWhere);
    }
  }
  return where;
}
