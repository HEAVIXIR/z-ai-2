/**
 * HEAVIX — Store Car Models Service Layer
 *
 * Extracted from src/app/api/admin/store/car-models/route.ts and
 * src/app/api/admin/store/car-models/[id]/route.ts (T-A-DEEP-STORE).
 *
 * Responsibilities:
 *   - listCarModels(): query car models with filters (q, type, brand).
 *   - createCarModel(): create a car model (validates required fields).
 *   - updateCarModel(): update car model fields.
 *   - deleteCarModel(): hard delete after existence check.
 *   - getCarModel(): fetch a single car model by id.
 *
 * The route handlers stay thin: parse request, enforce RBAC, call service,
 * map thrown ServiceError → HTTP response. Audit logging remains in the
 * route handlers — services return RAW Prisma results so routes can use
 * them unchanged as the audit `before`/`after` snapshots (preserves the
 * exact audit JSON shape that existed pre-extraction).
 */

import { storeDb } from '@/lib/store-db';

// ── Service error (maps to HTTP status in route handler) ──
export class CarModelsServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CarModelsServiceError';
  }
}

// ── Filters for listCarModels() ───────────────────────────
export interface CarModelsFilters {
  q?: string;
  type?: string;
  brand?: string;
}

// ── listCarModels ─────────────────────────────────────────
/**
 * List car models with optional filters (q, type, brand).
 */
export async function listCarModels(
  filters: CarModelsFilters = {},
): Promise<{ items: any[]; total: number }> {
  const { q, type, brand } = filters;

  const where: any = {};
  if (type) where.type = type;
  if (brand) where.brand = brand;
  if (q) where.OR = [{ brand: { contains: q } }, { model: { contains: q } }];

  const items = await storeDb.carModel.findMany({
    where,
    orderBy: [{ brand: 'asc' }, { model: 'asc' }],
    include: { _count: { select: { parts: true } } },
  });

  return { items, total: items.length };
}

// ── createCarModel ───────────────────────────────────────
/**
 * Create a CarModel. Validates required fields (brand, model, yearFrom, yearTo).
 *
 * @throws CarModelsServiceError on validation failure (400).
 */
export async function createCarModel(
  fields: {
    brand: string;
    model: string;
    yearFrom: number | string;
    yearTo: number | string;
    type?: string;
  },
): Promise<any> {
  const { brand, model, yearFrom, yearTo, type } = fields;

  if (!brand || !model || !yearFrom || !yearTo) {
    throw new CarModelsServiceError(
      400,
      'برند، مدل و سال شروع/پایان الزامی است',
    );
  }

  const c = await storeDb.carModel.create({
    data: {
      brand,
      model,
      yearFrom: Number(yearFrom),
      yearTo: Number(yearTo),
      type: type || 'PASSENGER',
    },
    include: { _count: { select: { parts: true } } },
  });

  return c;
}

// ── updateCarModel ───────────────────────────────────────
/**
 * Update a CarModel's fields.
 *
 * Returns `{ existing, carModel }` so the route can use the pre-update
 * snapshot as the audit `before` (preserves the original audit shape).
 *
 * @throws CarModelsServiceError on lookup failure (404).
 */
export async function updateCarModel(
  id: string,
  body: any,
): Promise<{ existing: any; carModel: any }> {
  const existing = await storeDb.carModel.findUnique({ where: { id } });
  if (!existing) {
    throw new CarModelsServiceError(404, 'یافت نشد');
  }

  const data: any = {};
  if (body.brand !== undefined) data.brand = body.brand;
  if (body.model !== undefined) data.model = body.model;
  if (body.yearFrom !== undefined) data.yearFrom = Number(body.yearFrom);
  if (body.yearTo !== undefined) data.yearTo = Number(body.yearTo);
  if (body.type !== undefined) data.type = body.type;

  const c = await storeDb.carModel.update({
    where: { id },
    data,
    include: { _count: { select: { parts: true } } },
  });

  return { existing, carModel: c };
}

// ── deleteCarModel ───────────────────────────────────────
/**
 * Delete a CarModel. Hard delete after existence check.
 *
 * Returns `{ existing }` so the route can use the pre-delete snapshot as
 * the audit `before` (preserves the original audit shape).
 *
 * @throws CarModelsServiceError on lookup failure (404).
 */
export async function deleteCarModel(
  id: string,
): Promise<{ existing: any; deleted: true }> {
  const existing = await storeDb.carModel.findUnique({ where: { id } });
  if (!existing) {
    throw new CarModelsServiceError(404, 'یافت نشد');
  }
  await storeDb.carModel.delete({ where: { id } });
  return { existing, deleted: true as const };
}

// ── getCarModel ──────────────────────────────────────────
/**
 * Get a single CarModel by id (with part count).
 *
 * @throws CarModelsServiceError on lookup failure (404).
 */
export async function getCarModel(id: string): Promise<any> {
  const c = await storeDb.carModel.findUnique({
    where: { id },
    include: { _count: { select: { parts: true } } },
  });
  if (!c) {
    throw new CarModelsServiceError(404, 'یافت نشد');
  }
  return c;
}
