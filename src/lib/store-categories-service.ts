/**
 * HEAVIX — Store Categories Service Layer
 *
 * Extracted from src/app/api/admin/store/categories/route.ts and
 * src/app/api/admin/store/categories/[id]/route.ts (T-A-DEEP-STORE).
 *
 * Responsibilities:
 *   - listCategories(): query categories with filters (parentId, q).
 *   - createCategory(): create a category (validates required name+slug,
 *     refuses duplicate slug).
 *   - updateCategory(): update category fields (validates duplicate slug
 *     on rename).
 *   - deleteCategory(): hard delete after existence check.
 *   - getCategory(): fetch a single category by id.
 *
 * The route handlers stay thin: parse request, enforce RBAC, call service,
 * map thrown ServiceError → HTTP response. Audit logging remains in the
 * route handlers — services return RAW Prisma results so routes can use
 * them unchanged as the audit `before`/`after` snapshots (preserves the
 * exact audit JSON shape that existed pre-extraction).
 */

import { storeDb } from '@/lib/store-db';

// ── Service error (maps to HTTP status in route handler) ──
export class CategoriesServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CategoriesServiceError';
  }
}

// ── Filters for listCategories() ─────────────────────────
export interface CategoriesFilters {
  parentId?: string | null;
  q?: string;
}

// ── listCategories ───────────────────────────────────────
/**
 * List categories with optional filters (parentId, q).
 *
 * Special: parentId === "null" → root categories (parentId IS NULL).
 */
export async function listCategories(
  filters: CategoriesFilters = {},
): Promise<{ items: any[]; total: number }> {
  const { parentId, q } = filters;

  const where: any = {};
  if (parentId === 'null') where.parentId = null;
  else if (parentId) where.parentId = parentId;
  if (q) where.name = { contains: q };

  const items = await storeDb.category.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      parent: { select: { id: true, name: true } },
      _count: { select: { parts: true, children: true } },
    },
  });

  return { items, total: items.length };
}

// ── createCategory ───────────────────────────────────────
/**
 * Create a Category. Validates required name+slug, refuses duplicate slug.
 *
 * @throws CategoriesServiceError on validation failure (400) or duplicate
 *         slug (400).
 */
export async function createCategory(
  fields: {
    name: string;
    slug: string;
    icon?: string | null;
    parentId?: string | null;
  },
): Promise<any> {
  const { name, slug, icon, parentId } = fields;

  if (!name || !slug) {
    throw new CategoriesServiceError(
      400,
      'نام و اسلاگ الزامی است',
    );
  }

  const existing = await storeDb.category.findUnique({ where: { slug } });
  if (existing) {
    throw new CategoriesServiceError(400, 'اسلاگ تکراری است');
  }

  const c = await storeDb.category.create({
    data: { name, slug, icon: icon || null, parentId: parentId || null },
    include: {
      parent: { select: { id: true, name: true } },
      _count: { select: { parts: true, children: true } },
    },
  });

  return c;
}

// ── updateCategory ───────────────────────────────────────
/**
 * Update a Category's fields. Validates duplicate slug on rename.
 *
 * Returns `{ existing, category }` so the route can use the pre-update
 * snapshot as the audit `before` (preserves the original audit shape).
 *
 * @throws CategoriesServiceError on lookup failure (404) or duplicate
 *         slug on rename (400).
 */
export async function updateCategory(
  id: string,
  body: any,
): Promise<{ existing: any; category: any }> {
  const existing = await storeDb.category.findUnique({ where: { id } });
  if (!existing) {
    throw new CategoriesServiceError(404, 'یافت نشد');
  }

  if (body.slug && body.slug !== existing.slug) {
    const dup = await storeDb.category.findUnique({ where: { slug: body.slug } });
    if (dup && dup.id !== id) {
      throw new CategoriesServiceError(400, 'اسلاگ تکراری است');
    }
  }

  const data: any = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.slug !== undefined) data.slug = body.slug;
  if (body.icon !== undefined) data.icon = body.icon || null;
  if (body.parentId !== undefined) data.parentId = body.parentId || null;

  const c = await storeDb.category.update({
    where: { id },
    data,
    include: {
      parent: { select: { id: true, name: true } },
      _count: { select: { parts: true, children: true } },
    },
  });

  return { existing, category: c };
}

// ── deleteCategory ───────────────────────────────────────
/**
 * Delete a Category. Hard delete after existence check.
 *
 * Returns `{ existing }` so the route can use the pre-delete snapshot as
 * the audit `before` (preserves the original audit shape).
 *
 * @throws CategoriesServiceError on lookup failure (404).
 */
export async function deleteCategory(
  id: string,
): Promise<{ existing: any; deleted: true }> {
  const existing = await storeDb.category.findUnique({ where: { id } });
  if (!existing) {
    throw new CategoriesServiceError(404, 'یافت نشد');
  }
  await storeDb.category.delete({ where: { id } });
  return { existing, deleted: true as const };
}

// ── getCategory ──────────────────────────────────────────
/**
 * Get a single Category by id (with parent + counts).
 *
 * @throws CategoriesServiceError on lookup failure (404).
 */
export async function getCategory(id: string): Promise<any> {
  const c = await storeDb.category.findUnique({
    where: { id },
    include: {
      parent: { select: { id: true, name: true } },
      _count: { select: { parts: true, children: true } },
    },
  });
  if (!c) {
    throw new CategoriesServiceError(404, 'یافت نشد');
  }
  return c;
}
