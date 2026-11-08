/**
 * HEAVIX — Store Procurement Service Layer (PHASE1-PROCUREMENT-SHIPPING-DEEP)
 *
 * Extracted from src/app/api/admin/store/procurement/* routes. The base
 * ProcurementRequest CRUD stays inline in those routes (T-A-DEEP-STORE
 * scope); this service owns the deeper PurchaseOrder + Approval + Receiving
 * workflow that lives on top of a ProcurementRequest tender.
 *
 * Responsibilities:
 *   - createPurchaseOrder(): create a PO + nested line items for a
 *     procurement tender + audit. Validates procurement exists; optional
 *     supplier; computes totalAmount from items.
 *   - submitPurchaseOrder(): DRAFT → SUBMITTED + audit. Locks the PO from
 *     further item edits (UI policy; data-level enforcement is via the
 *     service refusing createPO on non-DRAFT).
 *   - approvePurchaseOrder(): SUBMITTED → APPROVED + audit. Records
 *     approverId (3-way separation of duty: submitter ≠ approver at the
 *     data layer — the UI policy is enforced elsewhere).
 *   - receivePurchaseOrderItem(): increments PurchaseOrderItem.received
 *     (partial receiving); creates a StockMovement (type=RECEIVE) AND
 *     updates Part.stock snapshot (mirrors adjustStock/createMovement).
 *     When ALL items on the PO are fully received, auto-flips PO status
 *     to RECEIVED + stamps receivedAt + audit.
 *   - cancelPurchaseOrder(): any-state → CANCELLED + reason audit. Idempotent
 *     re-cancel refused (already-CANCELLED PO cannot be cancelled again).
 *   - listPurchaseOrders(): list POs for a procurement with filters.
 *   - getPurchaseOrder(): fetch a single PO with items + supplier context.
 *
 * Audit conventions (mirror store-returns-service.ts):
 *   - Every state transition uses its own action verb (po.create,
 *     po.submit, po.approve, po.receive, po.cancel) so the audit trail
 *     records the business operation, not just the data mutation.
 *   - Update-style audits include both `before` and `after` (so the
 *     state-machine transition is reconstructable from the log alone).
 *   - The receive flow logs 4 audit entries: POItem receive +
 *     StockMovement create + Part.stock side-effect + (conditional) PO
 *     status flip to RECEIVED. Mirrors the multi-audit pattern in
 *     resolveReturn / adjustStock.
 *
 * The route handlers stay thin: parse request, enforce RBAC, call service,
 * map thrown ServiceError → HTTP response. All DB + audit logic lives here.
 */

import { storeDb } from '@/lib/store-db';
import { logAudit } from '@/lib/audit';

// ── Constants ──────────────────────────────────────────────
const ALLOWED_PO_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'RECEIVED',
  'CANCELLED',
] as const;

const ALLOWED_TRACKING_STATUSES = [
  'DISPATCHED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'EXCEPTION',
] as const;

// ── Service error (maps to HTTP status in route handler) ──
export class ProcurementServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ProcurementServiceError';
  }
}

// ── Input shape for createPurchaseOrder items ─────────────
export interface PurchaseOrderItemInput {
  partId: string;
  quantity: number;
  unitPrice: number;
}

// ── Filters for listPurchaseOrders() ──────────────────────
export interface PurchaseOrderFilters {
  procurementId?: string;
  supplierId?: string;
  status?: string;
  limit?: number;
}

// ── Serializer (Date → ISO string for JSON transport) ────
function serialize(po: any) {
  return {
    ...po,
    approvedAt: po.approvedAt?.toISOString?.() ?? null,
    receivedAt: po.receivedAt?.toISOString?.() ?? null,
    createdAt: po.createdAt?.toISOString?.() ?? null,
    updatedAt: po.updatedAt?.toISOString?.() ?? null,
    // items: nested array, each item has its own createdAt.
    items: (po.items ?? []).map((it: any) => ({
      ...it,
      createdAt: it.createdAt?.toISOString?.() ?? null,
    })),
  };
}

// ── createPurchaseOrder ───────────────────────────────────
/**
 * Create a PurchaseOrder (DRAFT) with nested line items for a procurement
 * tender. Validates:
 *   1. procurementId references an existing ProcurementRequest.
 *   2. supplierId (if provided) references an existing Supplier.
 *   3. items is a non-empty array; each item has a valid partId + positive
 *      integer quantity + non-negative unitPrice.
 *   4. No duplicate partId within the same PO (one line per part — the
 *      admin can edit quantity, not stack lines).
 *
 * Computes totalAmount = sum(item.quantity × item.unitPrice).
 *
 * @throws ProcurementServiceError on validation/lookup failure (400/404)
 *         or duplicate partId (409).
 */
export async function createPurchaseOrder(
  procurementId: string,
  supplierId: string | null,
  items: PurchaseOrderItemInput[],
  userId?: string | null,
  options: { notes?: string | null; currency?: string } = {},
): Promise<any> {
  if (!procurementId) {
    throw new ProcurementServiceError(400, 'procurementId الزامی است');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new ProcurementServiceError(400, 'حداقل یک آیتم سفارش الزامی است');
  }

  // Validate item shape + dedupe partIds in parallel with procurement lookup.
  const seenPartIds = new Set<string>();
  const normalizedItems: { partId: string; quantity: number; unitPrice: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || !it.partId) {
      throw new ProcurementServiceError(
        400,
        `آیتم ${i + 1}: partId الزامی است`,
      );
    }
    const qty = Number(it.quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new ProcurementServiceError(
        400,
        `آیتم ${i + 1}: تعداد باید عدد صحیح مثبت باشد`,
      );
    }
    const price = Number(it.unitPrice);
    if (!Number.isFinite(price) || price < 0) {
      throw new ProcurementServiceError(
        400,
        `آیتم ${i + 1}: قیمت واحد نامعتبر است`,
      );
    }
    if (seenPartIds.has(it.partId)) {
      throw new ProcurementServiceError(
        409,
        `قطعه تکراری در آیتم‌ها: ${it.partId} (یک خط به ازای هر قطعه)`,
      );
    }
    seenPartIds.add(it.partId);
    normalizedItems.push({ partId: it.partId, quantity: qty, unitPrice: price });
  }

  // Look up the procurement + supplier + verify all parts exist.
  const [procurement, supplier] = await Promise.all([
    storeDb.procurementRequest.findUnique({ where: { id: procurementId } }),
    supplierId
      ? storeDb.supplier.findUnique({ where: { id: supplierId } })
      : Promise.resolve(null),
  ]);
  if (!procurement) {
    throw new ProcurementServiceError(404, 'مناقصه یافت نشد');
  }
  if (supplierId && !supplier) {
    throw new ProcurementServiceError(404, 'تأمین‌کننده یافت نشد');
  }

  // Verify every partId references an existing Part. SQLite + Prisma doesn't
  // support a batched findUnique for non-id fields; we use findMany + a Set.
  const parts = await storeDb.part.findMany({
    where: { id: { in: normalizedItems.map(i => i.partId) } },
    select: { id: true, name: true, sku: true, priceUsd: true },
  });
  const foundPartIds = new Set(parts.map((p: any) => p.id));
  for (const it of normalizedItems) {
    if (!foundPartIds.has(it.partId)) {
      throw new ProcurementServiceError(
        404,
        `قطعه یافت نشد: ${it.partId}`,
      );
    }
  }

  // Compute totalAmount = Σ (quantity × unitPrice).
  const totalAmount = normalizedItems.reduce(
    (sum, it) => sum + it.quantity * it.unitPrice,
    0,
  );

  // Create the PO + nested items in a single round-trip (Prisma nested write).
  const po = await storeDb.purchaseOrder.create({
    data: {
      procurementId,
      supplierId: supplierId || null,
      status: 'DRAFT',
      totalAmount,
      currency: options.currency || 'USD',
      notes: options.notes || null,
      items: {
        create: normalizedItems.map(it => ({
          partId: it.partId,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
        })),
      },
    },
    include: {
      items: {
        include: {
          part: { select: { id: true, name: true, nameFa: true, sku: true } },
        },
      },
      supplier: { select: { id: true, name: true, nameFa: true } },
      procurement: { select: { id: true, title: true } },
    },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.procurement.po.create',
    entityType: 'PurchaseOrder',
    entityId: po.id,
    after: {
      procurementId,
      supplierId: supplierId || null,
      status: po.status,
      totalAmount: po.totalAmount,
      currency: po.currency,
      notes: po.notes,
      items: normalizedItems,
    },
  });

  return serialize(po);
}

// ── submitPurchaseOrder ───────────────────────────────────
/**
 * Transition a PO from DRAFT → SUBMITTED. The parent row is locked so
 * submit/approve/cancel/receive transitions cannot race each other.
 */
export async function submitPurchaseOrder(
  id: string,
  userId?: string | null,
): Promise<any> {
  const result = await storeDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${id} FOR UPDATE`;
    const existing = await tx.purchaseOrder.findUnique({ where: { id } });
    if (!existing) {
      throw new ProcurementServiceError(404, 'سفارش خرید یافت نشد');
    }
    if (existing.status !== 'DRAFT') {
      throw new ProcurementServiceError(
        400,
        `سفارش خرید در وضعیت ${existing.status} قرار دارد و قابل ارسال نیست`,
      );
    }

    const po = await tx.purchaseOrder.update({
      where: { id },
      data: { status: 'SUBMITTED' },
      include: {
        items: {
          include: {
            part: { select: { id: true, name: true, nameFa: true, sku: true } },
          },
        },
        supplier: { select: { id: true, name: true, nameFa: true } },
      },
    });
    return { existing, po };
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.procurement.po.submit',
    entityType: 'PurchaseOrder',
    entityId: id,
    before: { status: result.existing.status },
    after: { status: result.po.status },
  });

  return serialize(result.po);
}

// ── approvePurchaseOrder ──────────────────────────────────
/**
 * Transition a PO from SUBMITTED → APPROVED. The parent row is locked so
 * approval cannot race with cancellation or receiving.
 */
export async function approvePurchaseOrder(
  id: string,
  userId?: string | null,
): Promise<any> {
  const result = await storeDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${id} FOR UPDATE`;
    const existing = await tx.purchaseOrder.findUnique({ where: { id } });
    if (!existing) {
      throw new ProcurementServiceError(404, 'سفارش خرید یافت نشد');
    }
    if (existing.status !== 'SUBMITTED') {
      throw new ProcurementServiceError(
        400,
        `سفارش خرید در وضعیت ${existing.status} قرار دارد و قابل تأیید نیست`,
      );
    }

    const po = await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy: userId ?? null,
        approvedAt: new Date(),
      },
      include: {
        items: {
          include: {
            part: { select: { id: true, name: true, nameFa: true, sku: true } },
          },
        },
        supplier: { select: { id: true, name: true, nameFa: true } },
      },
    });
    return { existing, po };
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.procurement.po.approve',
    entityType: 'PurchaseOrder',
    entityId: id,
    before: {
      status: result.existing.status,
      approvedBy: result.existing.approvedBy,
      approvedAt: result.existing.approvedAt,
    },
    after: {
      status: result.po.status,
      approvedBy: result.po.approvedBy,
      approvedAt: result.po.approvedAt,
    },
  });

  return serialize(result.po);
}

// ── receivePurchaseOrderItem ──────────────────────────────
/**
 * Receive a partial or complete PurchaseOrderItem line. A row lock on the
 * parent PO serializes all receiving and terminal-state transitions. The
 * item counter, Part.stock snapshot, movement ledger, and final PO state are
 * committed together; audit events are emitted after commit.
 */
export async function receivePurchaseOrderItem(
  poItemId: string,
  receivedQty: number,
  userId?: string | null,
): Promise<any> {
  if (!poItemId || receivedQty === undefined) {
    throw new ProcurementServiceError(
      400,
      'poItemId و تعداد دریافتی الزامی است',
    );
  }
  const qty = Number(receivedQty);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new ProcurementServiceError(
      400,
      'تعداد دریافتی باید عدد صحیح مثبت باشد',
    );
  }

  const result = await storeDb.$transaction(async (tx) => {
    const itemRef = await tx.purchaseOrderItem.findUnique({
      where: { id: poItemId },
      select: { purchaseOrderId: true },
    });
    if (!itemRef) {
      throw new ProcurementServiceError(404, 'آیتم سفارش خرید یافت نشد');
    }

    // Serialize all lifecycle operations for this PO, including receives
    // on different item lines and cancellation.
    await tx.$queryRaw`SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${itemRef.purchaseOrderId} FOR UPDATE`;

    const poItem = await tx.purchaseOrderItem.findUnique({
      where: { id: poItemId },
      include: {
        purchaseOrder: true,
        part: { select: { id: true, name: true, sku: true, stock: true } },
      },
    });
    if (!poItem) {
      throw new ProcurementServiceError(404, 'آیتم سفارش خرید یافت نشد');
    }
    if (poItem.purchaseOrder.status === 'CANCELLED') {
      throw new ProcurementServiceError(
        400,
        'سفارش خرید لغوشده است و قابل دریافت نیست',
      );
    }

    const newReceived = poItem.received + qty;
    if (newReceived > poItem.quantity) {
      throw new ProcurementServiceError(
        400,
        `دریافت بیش از تعداد سفارش. سفارش: ${poItem.quantity}، دریافت‌شده قبلی: ${poItem.received}، درخواست: ${qty}`,
      );
    }

    const itemChanged = await tx.purchaseOrderItem.updateMany({
      where: { id: poItemId, received: poItem.received },
      data: { received: newReceived },
    });
    if (itemChanged.count !== 1) {
      throw new ProcurementServiceError(
        409,
        'مقدار دریافتی هم‌زمان تغییر کرده است؛ عملیات را دوباره انجام دهید',
      );
    }

    const updatedItem = await tx.purchaseOrderItem.findUnique({
      where: { id: poItemId },
    });
    if (!updatedItem) {
      throw new ProcurementServiceError(404, 'آیتم سفارش خرید یافت نشد');
    }

    const partChanged = await tx.part.updateMany({
      where: { id: poItem.part.id },
      data: { stock: { increment: qty } },
    });
    if (partChanged.count !== 1) {
      throw new ProcurementServiceError(404, 'قطعه یافت نشد');
    }
    const afterPart = await tx.part.findUnique({
      where: { id: poItem.part.id },
      select: { id: true, name: true, sku: true, stock: true },
    });
    if (!afterPart) {
      throw new ProcurementServiceError(404, 'قطعه یافت نشد');
    }

    const balanceAfter = afterPart.stock;
    const movement = await tx.stockMovement.create({
      data: {
        partId: poItem.part.id,
        type: 'RECEIVE',
        quantity: qty,
        balanceAfter,
        reason: `دریافت سفارش خرید ${poItem.purchaseOrder.id}`,
        reference: poItem.purchaseOrder.id,
        createdBy: userId ?? null,
      },
    });

    const allItems = await tx.purchaseOrderItem.findMany({
      where: { purchaseOrderId: poItem.purchaseOrderId },
    });
    const allReceived = allItems.every((item) => item.received >= item.quantity);
    let poUpdate: any = null;
    if (allReceived && poItem.purchaseOrder.status !== 'RECEIVED') {
      poUpdate = await tx.purchaseOrder.update({
        where: { id: poItem.purchaseOrderId },
        data: { status: 'RECEIVED', receivedAt: new Date() },
      });
    }

    return {
      beforeItem: poItem,
      updatedItem,
      movement,
      beforeStock: afterPart.stock - qty,
      afterPart,
      balanceAfter,
      allReceived,
      poUpdate,
    };
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.procurement.po.receive',
    entityType: 'PurchaseOrderItem',
    entityId: poItemId,
    before: {
      received: result.beforeItem.received,
      quantity: result.beforeItem.quantity,
    },
    after: {
      received: result.updatedItem.received,
      quantity: result.updatedItem.quantity,
    },
  });
  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.inventory.movement.create',
    entityType: 'StockMovement',
    entityId: result.movement.id,
    after: {
      partId: result.beforeItem.part.id,
      type: 'RECEIVE',
      quantity: qty,
      balanceAfter: result.balanceAfter,
      reference: result.beforeItem.purchaseOrder.id,
    },
  });
  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.part.update',
    entityType: 'Part',
    entityId: result.beforeItem.part.id,
    before: { stock: result.beforeStock },
    after: { stock: result.afterPart.stock },
  });
  if (result.poUpdate) {
    await logAudit({
      actorId: userId ?? null,
      actorType: 'ADMIN',
      action: 'store.procurement.po.receive',
      entityType: 'PurchaseOrder',
      entityId: result.beforeItem.purchaseOrderId,
      before: {
        status: result.beforeItem.purchaseOrder.status,
        receivedAt: result.beforeItem.purchaseOrder.receivedAt,
      },
      after: {
        status: result.poUpdate.status,
        receivedAt: result.poUpdate.receivedAt,
      },
    });
  }

  return {
    item: serialize({ ...result.updatedItem, part: result.afterPart }),
    movement: serialize(result.movement),
    part: result.afterPart,
    purchaseOrder: result.poUpdate ? serialize(result.poUpdate) : null,
    allReceived: result.allReceived,
  };
}

// ── cancelPurchaseOrder ───────────────────────────────────
/**
 * Transition a PO to CANCELLED. The parent row lock serializes cancellation
 * against submit, approval, and receiving; terminal states remain protected.
 */
export async function cancelPurchaseOrder(
  id: string,
  reason: string | null,
  userId?: string | null,
): Promise<any> {
  const result = await storeDb.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "PurchaseOrder" WHERE "id" = ${id} FOR UPDATE`;
    const existing = await tx.purchaseOrder.findUnique({ where: { id } });
    if (!existing) {
      throw new ProcurementServiceError(404, 'سفارش خرید یافت نشد');
    }
    if (existing.status === 'CANCELLED') {
      throw new ProcurementServiceError(
        400,
        'سفارش خرید قبلاً لغو شده است',
      );
    }
    if (existing.status === 'RECEIVED') {
      throw new ProcurementServiceError(
        400,
        'سفارش خرید تحویل‌شده قابل لغو نیست',
      );
    }

    const po = await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        notes: reason ? `CANCELLED: ${reason}` : existing.notes,
      },
      include: {
        items: {
          include: {
            part: { select: { id: true, name: true, nameFa: true, sku: true } },
          },
        },
        supplier: { select: { id: true, name: true, nameFa: true } },
      },
    });
    return { existing, po };
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.procurement.po.cancel',
    entityType: 'PurchaseOrder',
    entityId: id,
    before: { status: result.existing.status },
    after: { status: result.po.status, reason: reason || null },
    reason: reason ?? null,
  });

  return serialize(result.po);
}

// ── listPurchaseOrders ────────────────────────────────────
/**
 * List PurchaseOrders with optional filters. Default ordering: newest first.
 *
 * @throws ProcurementServiceError if `status` is invalid (400).
 */
export async function listPurchaseOrders(
  filters: PurchaseOrderFilters = {},
): Promise<{ items: any[]; total: number }> {
  const { procurementId, supplierId, status, limit = 100 } = filters;
  const cappedLimit = Math.min(500, Number(limit) || 100);

  const where: any = {};
  if (procurementId) where.procurementId = procurementId;
  if (supplierId) where.supplierId = supplierId;
  if (status) {
    if (!ALLOWED_PO_STATUSES.includes(status as (typeof ALLOWED_PO_STATUSES)[number])) {
      throw new ProcurementServiceError(400, 'وضعیت سفارش خرید نامعتبر');
    }
    where.status = status;
  }

  const [items, total] = await Promise.all([
    storeDb.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: cappedLimit,
      include: {
        items: {
          include: {
            part: { select: { id: true, name: true, nameFa: true, sku: true } },
          },
        },
        supplier: { select: { id: true, name: true, nameFa: true } },
        procurement: { select: { id: true, title: true } },
      },
    }),
    storeDb.purchaseOrder.count({ where }),
  ]);

  return { items: items.map(serialize), total };
}

// ── getPurchaseOrder ─────────────────────────────────────
/**
 * Fetch a single PurchaseOrder by id, with items + supplier + procurement
 * context.
 *
 * @throws ProcurementServiceError on lookup failure (404).
 */
export async function getPurchaseOrder(id: string): Promise<any> {
  const po = await storeDb.purchaseOrder.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          part: { select: { id: true, name: true, nameFa: true, sku: true } },
        },
      },
      supplier: { select: { id: true, name: true, nameFa: true } },
      procurement: { select: { id: true, title: true } },
    },
  });
  if (!po) {
    throw new ProcurementServiceError(404, 'سفارش خرید یافت نشد');
  }
  return serialize(po);
}

// Re-export for the receive route's response validation.
export const PROCUREMENTS_PO_STATUSES = ALLOWED_PO_STATUSES;
export const PROCUREMENTS_TRACKING_STATUSES = ALLOWED_TRACKING_STATUSES;
