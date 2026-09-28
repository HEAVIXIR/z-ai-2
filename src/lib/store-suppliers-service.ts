/**
 * HEAVIX — Store Suppliers Service Layer
 *
 * Extracted from src/app/api/admin/store/suppliers/route.ts and
 * src/app/api/admin/store/suppliers/[id]/route.ts (T-A-DEEP-STORE).
 *
 * Responsibilities:
 *   - listSuppliers(): query suppliers with filters (q, active).
 *   - createSupplier(): create a supplier (validates required name).
 *   - updateSupplier(): update supplier fields.
 *   - deleteSupplier(): hard delete after existence check.
 *   - getSupplier(): fetch a single supplier by id.
 *
 * The route handlers stay thin: parse request, enforce RBAC, call service,
 * map thrown ServiceError → HTTP response. Audit logging remains in the
 * route handlers — services return RAW Prisma results so routes can use
 * them unchanged as the audit `before`/`after` snapshots (preserves the
 * exact audit JSON shape that existed pre-extraction).
 */

import { storeDb } from '@/lib/store-db';

// ── Service error (maps to HTTP status in route handler) ──
export class SuppliersServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'SuppliersServiceError';
  }
}

// ── Filters for listSuppliers() ───────────────────────────
export interface SuppliersFilters {
  q?: string;
  active?: boolean;
}

// ── listSuppliers ─────────────────────────────────────────
/**
 * List suppliers with optional filters (q, active).
 */
export async function listSuppliers(
  filters: SuppliersFilters = {},
): Promise<{ items: any[]; total: number }> {
  const { q, active } = filters;

  const where: any = {};
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { nameFa: { contains: q } },
      { phone: { contains: q } },
      { email: { contains: q } },
    ];
  }
  if (active === true) where.active = true;
  if (active === false) where.active = false;

  const items = await storeDb.supplier.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return { items, total: items.length };
}

// ── createSupplier ───────────────────────────────────────
/**
 * Create a Supplier. Validates required name.
 *
 * @throws SuppliersServiceError on validation failure (400).
 */
export async function createSupplier(
  fields: {
    name: string;
    nameFa?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    active?: boolean;
  },
): Promise<any> {
  const { name, nameFa, phone, email, address, active } = fields;

  if (!name) {
    throw new SuppliersServiceError(
      400,
      'نام تأمین‌کننده الزامی است',
    );
  }

  const s = await storeDb.supplier.create({
    data: {
      name,
      nameFa: nameFa || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      active: typeof active === 'boolean' ? active : true,
    },
  });

  return s;
}

// ── updateSupplier ───────────────────────────────────────
/**
 * Update a Supplier's fields.
 *
 * Returns `{ existing, supplier }` so the route can use the pre-update
 * snapshot as the audit `before` (preserves the original audit shape).
 *
 * @throws SuppliersServiceError on lookup failure (404).
 */
export async function updateSupplier(
  id: string,
  body: any,
): Promise<{ existing: any; supplier: any }> {
  const existing = await storeDb.supplier.findUnique({ where: { id } });
  if (!existing) {
    throw new SuppliersServiceError(404, 'یافت نشد');
  }

  const data: any = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.nameFa !== undefined) data.nameFa = body.nameFa || null;
  if (body.phone !== undefined) data.phone = body.phone || null;
  if (body.email !== undefined) data.email = body.email || null;
  if (body.address !== undefined) data.address = body.address || null;
  if (body.active !== undefined) data.active = Boolean(body.active);

  const s = await storeDb.supplier.update({
    where: { id },
    data,
  });

  return { existing, supplier: s };
}

// ── deleteSupplier ───────────────────────────────────────
/**
 * Delete a Supplier. Hard delete after existence check.
 *
 * Returns `{ existing }` so the route can use the pre-delete snapshot as
 * the audit `before` (preserves the original audit shape).
 *
 * @throws SuppliersServiceError on lookup failure (404).
 */
export async function deleteSupplier(
  id: string,
): Promise<{ existing: any; deleted: true }> {
  const existing = await storeDb.supplier.findUnique({ where: { id } });
  if (!existing) {
    throw new SuppliersServiceError(404, 'یافت نشد');
  }
  await storeDb.supplier.delete({ where: { id } });
  return { existing, deleted: true as const };
}

// ── getSupplier ──────────────────────────────────────────
/**
 * Get a single Supplier by id.
 *
 * @throws SuppliersServiceError on lookup failure (404).
 */
export async function getSupplier(id: string): Promise<any> {
  const s = await storeDb.supplier.findUnique({ where: { id } });
  if (!s) {
    throw new SuppliersServiceError(404, 'یافت نشد');
  }
  return s;
}
