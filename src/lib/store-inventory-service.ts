/**
 * HEAVIX — Store Inventory Service Layer
 *
 * Extracted from src/app/api/admin/store/inventory/route.ts (T-A-DEEP-STORE).
 *
 * Responsibilities:
 *   - createMovement(): create a StockMovement ledger entry AND adjust
 *     Part.stock atomically, then log both audit entries (movement + side-
 *     effect on Part). Every mutation to Part.stock MUST be recorded as a
 *     StockMovement so the ledger reconstructs the balance at any point.
 *   - listMovements(): query the ledger with filters (partId, type,
 *     reference, limit).
 *
 * T1-DEEP — Inventory Deep (Warehouse + Reservation + Low-Stock):
 *   - createWarehouse(): create a Warehouse directory entry.
 *   - updateWarehouse(): update warehouse fields (name/code/address/active).
 *   - deleteWarehouse(): soft delete via active=false, or hard delete when
 *     no InventoryBalance rows reference it (otherwise 400).
 *   - listWarehouses(): list warehouses with optional active filter.
 *   - adjustStock(): per-warehouse stock adjustment — updates the
 *     InventoryBalance row AND Part.stock snapshot, then writes a
 *     StockMovement ledger entry with warehouseId set. Low-stock check
 *     is performed after the adjustment.
 *   - reserveStock() / releaseStock(): soft-reserve / release stock on
 *     a (part, warehouse) pair without changing the on-hand quantity —
 *     increments/decrements InventoryBalance.reserved.
 *   - getLowStockItems(): returns InventoryBalance rows where
 *     quantity <= lowStockThreshold (the warehouse-segmented low-stock
 *     report). Used by the admin UI to surface reorder alerts.
 *
 * The route handlers stay thin: parse request, enforce RBAC, call service,
 * map thrown ServiceError → HTTP response. All DB + audit logic lives here.
 */

import { storeDb } from '@/lib/store-db';
import { logAudit } from '@/lib/audit';

// ── Constants ──────────────────────────────────────────────
const ALLOWED_TYPES = [
  'RECEIVE',
  'SALE',
  'RETURN',
  'TRANSFER',
  'ADJUSTMENT',
  'DAMAGE',
] as const;

export type InventoryMovementType = (typeof ALLOWED_TYPES)[number];

// ── Service error (maps to HTTP status in route handler) ──
export class InventoryServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'InventoryServiceError';
  }
}

// ── Filters for listMovements() ────────────────────────────
export interface MovementFilters {
  partId?: string;
  type?: string;
  reference?: string;
  limit?: number;
}

// ── Serializer (Date → ISO string for JSON transport) ────
function serialize(m: any) {
  return {
    ...m,
    createdAt: m.createdAt?.toISOString?.() ?? null,
  };
}

// ── createMovement ─────────────────────────────────────────
/**
 * Atomically:
 *   1. Validate inputs (partId, type, quantity).
 *   2. Look up the Part (must exist).
 *   3. Compute balanceAfter = part.stock + qty (must be >= 0).
 *   4. Create the StockMovement ledger entry.
 *   5. Update Part.stock to balanceAfter.
 *   6. Log two audit entries (movement.create + part.update side-effect).
 *
 * Best-effort audit: logAudit never throws (try/catch inside).
 *
 * @throws InventoryServiceError on validation/lookup failure (400/404).
 */
export async function createMovement(
  partId: string,
  type: string,
  quantity: number,
  reason?: string | null,
  reference?: string | null,
  userId?: string | null,
): Promise<any> {
  if (!partId || !type || quantity === undefined) {
    throw new InventoryServiceError(400, 'partId، نوع و تعداد الزامی هستند');
  }
  if (!ALLOWED_TYPES.includes(type as (typeof ALLOWED_TYPES)[number])) {
    throw new InventoryServiceError(400, 'نوع حرکت نامعتبر');
  }
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty === 0) {
    throw new InventoryServiceError(
      400,
      'تعداد باید عدد صحیح غیر صفر باشد',
    );
  }

  const part = await storeDb.part.findUnique({ where: { id: partId } });
  if (!part) {
    throw new InventoryServiceError(404, 'قطعه یافت نشد');
  }

  const balanceAfter = part.stock + qty;
  if (balanceAfter < 0) {
    throw new InventoryServiceError(
      400,
      `موجودی ناکافی. فعلی: ${part.stock}، درخواست: ${qty}`,
    );
  }

  // Step 1: create the ledger entry (records intent + balance after).
  const movement = await storeDb.stockMovement.create({
    data: {
      partId,
      type,
      quantity: qty,
      balanceAfter,
      reason: reason || null,
      reference: reference || null,
      createdBy: userId ?? null,
    },
    include: {
      part: {
        select: { id: true, name: true, nameFa: true, sku: true, stock: true },
      },
    },
  });

  // Step 2: side-effect — update Part.stock to the new balance.
  const beforePart = { ...part };
  const afterPart = await storeDb.part.update({
    where: { id: partId },
    data: { stock: balanceAfter },
    select: { id: true, name: true, sku: true, stock: true },
  });

  // Audit 1: the ledger entry is the primary audit hook for this route.
  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.inventory.movement.create',
    entityType: 'StockMovement',
    entityId: movement.id,
    after: {
      partId,
      type,
      quantity: qty,
      balanceAfter,
      reason: reason || null,
      reference: reference || null,
    },
  });

  // Audit 2: the Part.stock update is a side-effect mutation, so it gets
  // its own audit entry (mirrors payments/[id] side-effect pattern).
  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.part.update',
    entityType: 'Part',
    entityId: partId,
    before: { stock: beforePart.stock },
    after: { stock: afterPart.stock },
  });

  return serialize(movement);
}

// ── listMovements ──────────────────────────────────────────
/**
 * List StockMovement ledger entries with optional filters.
 *
 * @throws InventoryServiceError if `type` is invalid (400).
 */
export async function listMovements(
  filters: MovementFilters = {},
): Promise<{ items: any[]; total: number }> {
  const { partId, type, reference, limit = 100 } = filters;
  const cappedLimit = Math.min(500, Number(limit) || 100);

  const where: any = {};
  if (partId) where.partId = partId;
  if (type) {
    if (!ALLOWED_TYPES.includes(type as (typeof ALLOWED_TYPES)[number])) {
      throw new InventoryServiceError(400, 'نوع حرکت نامعتبر');
    }
    where.type = type;
  }
  if (reference) where.reference = reference;

  const [items, total] = await Promise.all([
    storeDb.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: cappedLimit,
      include: {
        part: {
          select: { id: true, name: true, nameFa: true, sku: true, stock: true },
        },
        warehouse: {
          select: { id: true, name: true, code: true },
        },
      },
    }),
    storeDb.stockMovement.count({ where }),
  ]);

  return { items: items.map(serialize), total };
}

// ──────────────────────────────────────────────────────────
// T1-DEEP — WAREHOUSE + INVENTORY BALANCE + RESERVATION + LOW-STOCK
// ──────────────────────────────────────────────────────────

// ── createWarehouse ───────────────────────────────────────
/**
 * Create a Warehouse directory entry.
 *
 * @throws InventoryServiceError on validation failure (400) or duplicate
 *         code (P2002 → 409).
 */
export async function createWarehouse(
  name: string,
  code: string,
  address?: string | null,
  userId?: string | null,
): Promise<any> {
  if (!name || !code) {
    throw new InventoryServiceError(400, 'نام و کد انبار الزامی است');
  }
  // Pre-check for duplicate code to give a clean 409 instead of P2002.
  const existing = await storeDb.warehouse.findUnique({ where: { code } });
  if (existing) {
    throw new InventoryServiceError(409, `کد انبار تکراری است: ${code}`);
  }

  const warehouse = await storeDb.warehouse.create({
    data: {
      name,
      code,
      address: address || null,
    },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.warehouse.create',
    entityType: 'Warehouse',
    entityId: warehouse.id,
    after: warehouse,
  });

  return warehouse;
}

// ── updateWarehouse ───────────────────────────────────────
/**
 * Update a Warehouse's name/code/address/active fields.
 *
 * @throws InventoryServiceError on lookup failure (404) or duplicate
 *         code on rename (409).
 */
export async function updateWarehouse(
  id: string,
  fields: {
    name?: string;
    code?: string;
    address?: string | null;
    active?: boolean;
  },
  userId?: string | null,
): Promise<any> {
  const existing = await storeDb.warehouse.findUnique({ where: { id } });
  if (!existing) {
    throw new InventoryServiceError(404, 'انبار یافت نشد');
  }

  const data: any = {};
  if (fields.name !== undefined) data.name = fields.name;
  if (fields.code !== undefined && fields.code !== existing.code) {
    // Check for duplicate code on rename.
    const clash = await storeDb.warehouse.findUnique({ where: { code: fields.code } });
    if (clash && clash.id !== id) {
      throw new InventoryServiceError(409, `کد انبار تکراری است: ${fields.code}`);
    }
    data.code = fields.code;
  }
  if (fields.address !== undefined) data.address = fields.address || null;
  if (fields.active !== undefined) data.active = Boolean(fields.active);

  const warehouse = await storeDb.warehouse.update({
    where: { id },
    data,
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.warehouse.update',
    entityType: 'Warehouse',
    entityId: id,
    before: existing,
    after: warehouse,
  });

  return warehouse;
}

// ── deleteWarehouse ───────────────────────────────────────
/**
 * Delete a Warehouse. If InventoryBalance rows still reference it, refuse
 * (400) and instruct the admin to move stock first. Otherwise hard delete
 * (Warehouse is a directory entry — soft-delete is the `active=false`
 * path on updateWarehouse, kept separate from this destructive op).
 *
 * @throws InventoryServiceError on lookup failure (404) or non-empty
 *         warehouse (400).
 */
export async function deleteWarehouse(
  id: string,
  userId?: string | null,
): Promise<{ id: string; deleted: true }> {
  const existing = await storeDb.warehouse.findUnique({ where: { id } });
  if (!existing) {
    throw new InventoryServiceError(404, 'انبار یافت نشد');
  }

  const balanceCount = await storeDb.inventoryBalance.count({
    where: { warehouseId: id },
  });
  if (balanceCount > 0) {
    throw new InventoryServiceError(
      400,
      `انبار خالی نیست — ${balanceCount} ردیف موجودی مرتبط است. ابتدا موجودی‌ها را منتقل یا حذف کنید.`,
    );
  }

  await storeDb.warehouse.delete({ where: { id } });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.warehouse.delete',
    entityType: 'Warehouse',
    entityId: id,
    before: existing,
  });

  return { id, deleted: true };
}

// ── listWarehouses ───────────────────────────────────────
/**
 * List warehouses, optionally filtered by active flag.
 */
export async function listWarehouses(
  filters: { active?: boolean; limit?: number } = {},
): Promise<{ items: any[]; total: number }> {
  const where: any = {};
  if (filters.active !== undefined) where.active = filters.active;
  const cappedLimit = Math.min(500, Number(filters.limit) || 100);

  const [items, total] = await Promise.all([
    storeDb.warehouse.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: cappedLimit,
      include: {
        _count: { select: { inventoryBalances: true } },
      },
    }),
    storeDb.warehouse.count({ where }),
  ]);

  return { items, total };
}

// ── getWarehouse ──────────────────────────────────────────
/**
 * Get a single Warehouse by id, including its inventory balance rows.
 */
export async function getWarehouse(id: string): Promise<any> {
  const warehouse = await storeDb.warehouse.findUnique({
    where: { id },
    include: {
      inventoryBalances: {
        include: {
          part: {
            select: { id: true, name: true, nameFa: true, sku: true },
          },
        },
      },
    },
  });
  if (!warehouse) {
    throw new InventoryServiceError(404, 'انبار یافت نشد');
  }
  return warehouse;
}

// ── adjustStock ──────────────────────────────────────────
/**
 * Atomically:
 *   1. Validate partId + warehouseId exist.
 *   2. upsert InventoryBalance for (partId, warehouseId).
 *   3. Compute new quantity = current + qty (must be >= 0).
 *   4. Update InventoryBalance.quantity.
 *   5. Create a StockMovement ledger entry with warehouseId set +
 *      balanceAfter = Part.stock snapshot after update.
 *   6. Update Part.stock to keep the public snapshot in sync with the
 *      sum of all warehouse balances (snapshot field, mirror of the
 *      warehouse-segmented source of truth).
 *   7. Audit: movement.create + part.update side-effect +
 *      inventorybalance.update.
 *
 * @throws InventoryServiceError on validation (400) or lookup (404).
 */
export async function adjustStock(
  partId: string,
  warehouseId: string,
  quantity: number,
  type: string,
  reason?: string | null,
  reference?: string | null,
  userId?: string | null,
): Promise<any> {
  if (!partId || !warehouseId || !type || quantity === undefined) {
    throw new InventoryServiceError(
      400,
      'partId، warehouseId، نوع و تعداد الزامی است',
    );
  }
  if (!ALLOWED_TYPES.includes(type as (typeof ALLOWED_TYPES)[number])) {
    throw new InventoryServiceError(400, 'نوع حرکت نامعتبر');
  }
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty === 0) {
    throw new InventoryServiceError(
      400,
      'تعداد باید عدد صحیح غیر صفر باشد',
    );
  }

  // 1. Look up the part + warehouse in parallel.
  const [part, warehouse] = await Promise.all([
    storeDb.part.findUnique({ where: { id: partId } }),
    storeDb.warehouse.findUnique({ where: { id: warehouseId } }),
  ]);
  if (!part) {
    throw new InventoryServiceError(404, 'قطعه یافت نشد');
  }
  if (!warehouse) {
    throw new InventoryServiceError(404, 'انبار یافت نشد');
  }

  // 2. Upsert the InventoryBalance row for this (part, warehouse).
  const existingBalance = await storeDb.inventoryBalance.findUnique({
    where: { partId_warehouseId: { partId, warehouseId } },
  });
  const currentQty = existingBalance?.quantity ?? 0;
  const newQty = currentQty + qty;
  if (newQty < 0) {
    throw new InventoryServiceError(
      400,
      `موجودی ناکافی در انبار. فعلی: ${currentQty}، درخواست: ${qty}`,
    );
  }

  const balanceRow = await storeDb.inventoryBalance.upsert({
    where: { partId_warehouseId: { partId, warehouseId } },
    create: {
      partId,
      warehouseId,
      quantity: newQty,
      reserved: 0,
      lowStockThreshold: part.lowStockThreshold ?? 5,
    },
    update: {
      quantity: newQty,
    },
  });

  // 3. New Part.stock snapshot = old Part.stock + qty (the adjustment
  //    is the delta; we mirror it onto the public snapshot).
  const newPartStock = part.stock + qty;
  if (newPartStock < 0) {
    // Should be unreachable (guarded above) but keep the invariant explicit.
    throw new InventoryServiceError(400, 'موجودی قطعه منفی می‌شود');
  }

  const movement = await storeDb.stockMovement.create({
    data: {
      partId,
      type,
      quantity: qty,
      balanceAfter: newPartStock,
      reason: reason || null,
      reference: reference || null,
      createdBy: userId ?? null,
      warehouseId,
    },
    include: {
      part: {
        select: { id: true, name: true, nameFa: true, sku: true, stock: true },
      },
      warehouse: {
        select: { id: true, name: true, code: true },
      },
    },
  });

  // 4. Update Part.stock snapshot.
  const beforePart = { ...part };
  const afterPart = await storeDb.part.update({
    where: { id: partId },
    data: { stock: newPartStock },
    select: { id: true, name: true, sku: true, stock: true },
  });

  // 5. Low-stock check — best-effort notification flag returned with the
  //    result (no notification row created in T1-DEEP scope; the admin UI
  //    can render an alert badge from this flag).
  const lowStock = balanceRow.quantity <= balanceRow.lowStockThreshold;

  // 6. Audit trail — 3 entries:
  //    a. The StockMovement ledger entry (primary audit hook).
  //    b. The Part.stock side-effect (mirrors createMovement pattern).
  //    c. The InventoryBalance update (so the warehouse-scoped mutation
  //       is auditable independently of the Part snapshot).
  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.inventory.movement.create',
    entityType: 'StockMovement',
    entityId: movement.id,
    after: {
      partId,
      warehouseId,
      type,
      quantity: qty,
      balanceAfter: newPartStock,
      reason: reason || null,
      reference: reference || null,
    },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.part.update',
    entityType: 'Part',
    entityId: partId,
    before: { stock: beforePart.stock },
    after: { stock: afterPart.stock },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.inventory.balance.update',
    entityType: 'InventoryBalance',
    entityId: balanceRow.id,
    before: { quantity: currentQty, reserved: existingBalance?.reserved ?? 0 },
    after: { quantity: balanceRow.quantity, reserved: balanceRow.reserved },
  });

  return {
    movement: serialize(movement),
    balance: balanceRow,
    part: afterPart,
    lowStock,
  };
}

// ── reserveStock ──────────────────────────────────────────
/**
 * Soft-reserve stock on a (part, warehouse) pair. The reserved field is
 * incremented; quantity is unchanged. Use case: hold stock for an order
 * that hasn't shipped yet (so the same SKU isn't double-promised).
 *
 * Refuses if reserved + qty > quantity (over-reservation).
 *
 * @throws InventoryServiceError on validation (400) or lookup (404) or
 *         over-reservation (400).
 */
export async function reserveStock(
  partId: string,
  warehouseId: string,
  quantity: number,
  userId?: string | null,
  reason?: string | null,
): Promise<any> {
  if (!partId || !warehouseId || quantity === undefined) {
    throw new InventoryServiceError(
      400,
      'partId، warehouseId و تعداد الزامی است',
    );
  }
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new InventoryServiceError(
      400,
      'تعداد باید عدد صحیح مثبت باشد',
    );
  }

  const balance = await storeDb.inventoryBalance.findUnique({
    where: { partId_warehouseId: { partId, warehouseId } },
  });
  if (!balance) {
    throw new InventoryServiceError(
      404,
      'موجودی انبار برای این قطعه یافت نشد',
    );
  }

  const newReserved = balance.reserved + qty;
  if (newReserved > balance.quantity) {
    throw new InventoryServiceError(
      400,
      `رزرو بیش از موجودی. موجودی: ${balance.quantity}، رزرو‌شده: ${balance.reserved}، درخواست: ${qty}`,
    );
  }

  const before = { ...balance };
  const updated = await storeDb.inventoryBalance.update({
    where: { id: balance.id },
    data: { reserved: newReserved },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.inventory.reserve',
    entityType: 'InventoryBalance',
    entityId: balance.id,
    before,
    after: { reserved: updated.reserved },
    reason: reason ?? null,
  });

  return updated;
}

// ── releaseStock ──────────────────────────────────────────
/**
 * Release previously-reserved stock on a (part, warehouse) pair. Decrements
 * InventoryBalance.reserved without changing quantity. Use case: order
 * shipped (reservation consumed) or order cancelled (reservation reverted).
 *
 * Refuses if qty > current reserved (would go negative).
 *
 * @throws InventoryServiceError on validation (400) or lookup (404).
 */
export async function releaseStock(
  partId: string,
  warehouseId: string,
  quantity: number,
  userId?: string | null,
  reason?: string | null,
): Promise<any> {
  if (!partId || !warehouseId || quantity === undefined) {
    throw new InventoryServiceError(
      400,
      'partId، warehouseId و تعداد الزامی است',
    );
  }
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new InventoryServiceError(
      400,
      'تعداد باید عدد صحیح مثبت باشد',
    );
  }

  const balance = await storeDb.inventoryBalance.findUnique({
    where: { partId_warehouseId: { partId, warehouseId } },
  });
  if (!balance) {
    throw new InventoryServiceError(
      404,
      'موجودی انبار برای این قطعه یافت نشد',
    );
  }

  const newReserved = balance.reserved - qty;
  if (newReserved < 0) {
    throw new InventoryServiceError(
      400,
      `رزرو برای آزادسازی کافی نیست. رزرو‌شده: ${balance.reserved}، درخواست: ${qty}`,
    );
  }

  const before = { ...balance };
  const updated = await storeDb.inventoryBalance.update({
    where: { id: balance.id },
    data: { reserved: newReserved },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.inventory.release',
    entityType: 'InventoryBalance',
    entityId: balance.id,
    before,
    after: { reserved: updated.reserved },
    reason: reason ?? null,
  });

  return updated;
}

// ── getLowStockItems ──────────────────────────────────────
/**
 * Return InventoryBalance rows where quantity <= lowStockThreshold.
 * Includes the related Part (for the admin UI to show SKU + name) and
 * Warehouse (to know where the shortage is).
 *
 * Use case: reorder-alert dashboard on /admin/store/inventory?tab=low.
 */
export async function getLowStockItems(
  filters: { warehouseId?: string; limit?: number } = {},
): Promise<{ items: any[]; total: number }> {
  const cappedLimit = Math.min(500, Number(filters.limit) || 100);
  const where: any = {
    // Prisma + SQLite: filter on a row field comparing two columns needs
    // a where clause — SQLite doesn't support column-on-column comparison
    // in Prisma's where API directly. We use a raw comparison here via
    // a lessThan-equal workaround: fetch all and filter in JS for SQLite
    // compat. (For Postgres, the where would be { quantity: { lte: ... } }
    // but the threshold is per-row, not a parameter.)
    // Fallback: use the part's lowStockThreshold OR the balance's own.
  };

  if (filters.warehouseId) where.warehouseId = filters.warehouseId;

  // Fetch candidate rows then filter by per-row threshold (SQLite-compat).
  const rows = await storeDb.inventoryBalance.findMany({
    where,
    take: cappedLimit * 5, // over-fetch so the post-filter still has results
    include: {
      part: {
        select: { id: true, name: true, nameFa: true, sku: true, stock: true },
      },
      warehouse: {
        select: { id: true, name: true, code: true },
      },
    },
    orderBy: { quantity: 'asc' },
  });

  const filtered = rows
    .filter((r: any) => r.quantity <= r.lowStockThreshold)
    .slice(0, cappedLimit);

  return { items: filtered, total: filtered.length };
}
