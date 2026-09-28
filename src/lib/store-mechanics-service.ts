/**
 * HEAVIX — Store Mechanics Service Layer
 *
 * Extracted from src/app/api/admin/store/mechanics/route.ts and
 * src/app/api/admin/store/mechanics/[id]/route.ts (T-A-DEEP-STORE).
 *
 * Responsibilities:
 *   - listMechanics(): query mechanics with filters (q, status, verified).
 *   - createMechanic(): create a mechanic (validates required fields +
 *     duplicate phone check).
 *   - updateMechanic(): update mechanic fields (validates duplicate phone
 *     on rename).
 *   - deleteMechanic(): hard delete after existence check.
 *   - getMechanic(): fetch a single mechanic by id.
 *
 * The route handlers stay thin: parse request, enforce RBAC, call service,
 * map thrown ServiceError → HTTP response. Audit logging remains in the
 * route handlers — services return RAW Prisma results so routes can use
 * them unchanged as the audit `before`/`after` snapshots (preserves the
 * exact audit JSON shape that existed pre-extraction).
 */

import { storeDb } from '@/lib/store-db';

// ── Service error (maps to HTTP status in route handler) ──
export class MechanicsServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'MechanicsServiceError';
  }
}

// ── Filters for listMechanics() ───────────────────────────
export interface MechanicsFilters {
  q?: string;
  status?: string;
  verified?: boolean;
}

// ── listMechanics ──────────────────────────────────────────
/**
 * List mechanics with optional filters (q, status, verified).
 *
 * @throws MechanicsServiceError never (returns empty result on no match).
 */
export async function listMechanics(
  filters: MechanicsFilters = {},
): Promise<{ items: any[]; total: number }> {
  const { q, status, verified } = filters;

  const where: any = {};
  if (status) where.status = status;
  if (verified === true) where.verified = true;
  if (verified === false) where.verified = false;
  if (q) {
    where.OR = [
      { phone: { contains: q } },
      { name: { contains: q } },
      { family: { contains: q } },
      { shopName: { contains: q } },
      { specialty: { contains: q } },
      { city: { contains: q } },
    ];
  }

  const [items, total] = await Promise.all([
    storeDb.mechanic.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { orders: true } } },
    }),
    storeDb.mechanic.count({ where }),
  ]);

  return { items, total };
}

// ── createMechanic ───────────────────────────────────────
/**
 * Create a Mechanic. Validates required fields and refuses duplicate phones.
 *
 * @throws MechanicsServiceError on validation failure (400) or duplicate
 *         phone (400).
 */
export async function createMechanic(
  fields: {
    phone: string;
    name: string;
    family: string;
    shopName?: string | null;
    specialty?: string | null;
    city?: string | null;
    address?: string | null;
    verified?: boolean;
    status?: string;
    rating?: number;
    notes?: string | null;
  },
): Promise<any> {
  const { phone, name, family, shopName, specialty, city, address, verified, status, rating, notes } = fields;

  if (!phone || !name || !family) {
    throw new MechanicsServiceError(
      400,
      'تلفن، نام و نام خانوادگی الزامی است',
    );
  }

  const existing = await storeDb.mechanic.findUnique({ where: { phone } });
  if (existing) {
    throw new MechanicsServiceError(400, 'تلفن تکراری است');
  }

  const m = await storeDb.mechanic.create({
    data: {
      phone,
      name,
      family,
      shopName: shopName || null,
      specialty: specialty || null,
      city: city || null,
      address: address || null,
      verified: verified === true,
      status: status || 'ACTIVE',
      rating: Number(rating) || 0,
      notes: notes || null,
    },
    include: { _count: { select: { orders: true } } },
  });

  return m;
}

// ── updateMechanic ───────────────────────────────────────
/**
 * Update a Mechanic's fields. Validates duplicate phone on rename.
 *
 * Returns `{ existing, mechanic }` so the route can use the pre-update
 * snapshot as the audit `before` (preserves the original audit shape).
 *
 * @throws MechanicsServiceError on lookup failure (404) or duplicate
 *         phone on rename (400).
 */
export async function updateMechanic(
  id: string,
  body: any,
): Promise<{ existing: any; mechanic: any }> {
  const existing = await storeDb.mechanic.findUnique({ where: { id } });
  if (!existing) {
    throw new MechanicsServiceError(404, 'یافت نشد');
  }

  if (body.phone && body.phone !== existing.phone) {
    const dup = await storeDb.mechanic.findUnique({ where: { phone: body.phone } });
    if (dup && dup.id !== id) {
      throw new MechanicsServiceError(400, 'تلفن تکراری است');
    }
  }

  const data: any = {};
  for (const k of ['phone', 'name', 'family', 'shopName', 'specialty', 'city', 'address', 'status', 'notes']) {
    if (body[k] !== undefined) data[k] = body[k] || null;
  }
  if (body.verified !== undefined) data.verified = !!body.verified;
  if (body.rating !== undefined) data.rating = Number(body.rating) || 0;

  const m = await storeDb.mechanic.update({
    where: { id },
    data,
    include: { _count: { select: { orders: true } } },
  });

  return { existing, mechanic: m };
}

// ── deleteMechanic ───────────────────────────────────────
/**
 * Delete a Mechanic. Hard delete after existence check.
 *
 * Returns `{ existing }` so the route can use the pre-delete snapshot as
 * the audit `before` (preserves the original audit shape).
 *
 * @throws MechanicsServiceError on lookup failure (404).
 */
export async function deleteMechanic(
  id: string,
): Promise<{ existing: any; deleted: true }> {
  const existing = await storeDb.mechanic.findUnique({ where: { id } });
  if (!existing) {
    throw new MechanicsServiceError(404, 'یافت نشد');
  }
  await storeDb.mechanic.delete({ where: { id } });
  return { existing, deleted: true as const };
}

// ── getMechanic ──────────────────────────────────────────
/**
 * Get a single Mechanic by id (with order count).
 *
 * @throws MechanicsServiceError on lookup failure (404).
 */
export async function getMechanic(id: string): Promise<any> {
  const m = await storeDb.mechanic.findUnique({
    where: { id },
    include: { _count: { select: { orders: true } } },
  });
  if (!m) {
    throw new MechanicsServiceError(404, 'یافت نشد');
  }
  return m;
}
