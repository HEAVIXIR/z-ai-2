/**
 * HEAVIX — STEP 06: Pagination + Search Engine
 */

import type { AdminResourceConfig } from '../types';

// ── Pagination ─────────────────────────────────────────────
export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginationResult {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export function parsePagination(
  searchParams: URLSearchParams,
  config: AdminResourceConfig,
): PaginationParams {
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const maxPageSize = 100;
  const defaultPageSize = config.pageSize ?? 25;
  const pageSize = Math.min(
    maxPageSize,
    Math.max(1, parseInt(searchParams.get('pageSize') ?? String(defaultPageSize), 10)),
  );
  return { page, pageSize };
}

export function buildPagination(params: PaginationParams) {
  const skip = (params.page - 1) * params.pageSize;
  const take = params.pageSize;
  return { skip, take };
}

export function buildPaginationResult(
  params: PaginationParams,
  total: number,
): PaginationResult {
  const totalPages = Math.ceil(total / params.pageSize) || 1;
  return {
    page: params.page,
    pageSize: params.pageSize,
    total,
    totalPages,
    hasPrev: params.page > 1,
    hasNext: params.page < totalPages,
  };
}

// ── Search Engine ──────────────────────────────────────────
export function buildSearchWhere(
  search: string | null,
  config: AdminResourceConfig,
): Record<string, unknown> | undefined {
  if (!search || !config.searchable || !config.searchFields?.length) {
    return undefined;
  }

  // Build OR clause: each search field gets a contains check
  return {
    OR: config.searchFields.map(field => ({
      [field]: { contains: search, mode: 'insensitive' as const },
    })),
  };
}

export function parseSearchParam(searchParams: URLSearchParams): string | null {
  return searchParams.get('search') || null;
}
