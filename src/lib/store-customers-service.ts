/**
 * HEAVIX — Store Customers Service Layer
 *
 * Extracted from src/app/api/admin/store/customers/route.ts (T-A-DEEP-STORE).
 *
 * Customers is a READ-ONLY resource in the admin store API (no POST/PATCH/
 * DELETE handlers — customer records are created implicitly when orders
 * are placed). This service exposes only the list query.
 *
 * Responsibilities:
 *   - listCustomers(): query customers with filters (q, status, limit).
 *
 * The route handler stays thin: parse request, enforce RBAC, call service.
 * Services return RAW Prisma results so routes can use them unchanged as
 * the audit `before`/`after` snapshots (preserves the exact audit JSON
 * shape that existed pre-extraction). For customers (read-only), the
 * route keeps its serialize function for the response.
 */

import { storeDb } from '@/lib/store-db';

// ── Service error (maps to HTTP status in route handler) ──
export class CustomersServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CustomersServiceError';
  }
}

// ── Filters for listCustomers() ──────────────────────────
export interface CustomersFilters {
  q?: string;
  status?: string;
  limit?: number;
}

// ── listCustomers ───────────────────────────────────────
/**
 * List customers with optional filters (q, status, limit).
 * The limit is capped at 200 (admin UI guardrail).
 */
export async function listCustomers(
  filters: CustomersFilters = {},
): Promise<{ items: any[]; total: number }> {
  const { q, status, limit } = filters;
  const cappedLimit = Math.min(200, Number(limit) || 100);

  const where: any = {};
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { phone: { contains: q } },
      { name: { contains: q } },
      { family: { contains: q } },
      { nationalCode: { contains: q } },
    ];
  }

  const [items, total] = await Promise.all([
    storeDb.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: cappedLimit,
      include: { _count: { select: { orders: true } } },
    }),
    storeDb.customer.count({ where }),
  ]);

  return { items, total };
}
