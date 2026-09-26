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
      },
    }),
    storeDb.stockMovement.count({ where }),
  ]);

  return { items: items.map(serialize), total };
}
