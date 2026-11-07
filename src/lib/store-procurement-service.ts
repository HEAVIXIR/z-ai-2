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
import { enqueueAuditOutbox } from '@/lib/store-audit-outbox';

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
  if (!procurementId) throw new ProcurementServiceError(400, 'procurementId الزامی است');
  if (!Array.isArray(items) || items.length === 0) {
    throw new ProcurementServiceError(400, 'حداقل یک آیتم سفارش الزامی است');
  }

  const seenPartIds = new Set<string>();
  const normalizedItems: { partId: string; quantity: number; unitPrice: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item.partId !== 'string' || !item.partId.trim()) {
      throw new ProcurementServiceError(400, `آیتم ${i + 1}: partId الزامی است`);
    }
    const quantity = Number(item.quantity);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new ProcurementServiceError(400, `آیتم ${i + 1}: تعداد باید عدد صحیح مثبت باشد`);
    }
    const unitPrice = Number(item.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new ProcurementServiceError(400, `آیتم ${i + 1}: قیمت واحد نامعتبر است`);
    }
    if (seenPartIds.has(item.partId)) {
      throw new ProcurementServiceError(409, `قطعه تکراری در آیتم‌ها: ${item.partId}`);
    }
    seenPartIds.add(item.partId);
    normalizedItems.push({ partId: item.partId, quantity, unitPrice });
  }

  try {
    const po = await storeDb.$transaction(async (tx) => {
      const procurement = await tx.procurementRequest.findUnique({
        where: { id: procurementId },
        select: { id: true, status: true, supplierId: true },
      });
      if (!procurement) throw new ProcurementServiceError(404, 'مناقصه یافت نشد');
      if (procurement.status !== 'AWARDED') {
        throw new ProcurementServiceError(409, 'ایجاد سفارش خرید فقط برای مناقصه واگذارشده مجاز است');
      }
      if (procurement.supplierId && supplierId && procurement.supplierId !== supplierId) {
        throw new ProcurementServiceError(409, 'تأمین‌کننده سفارش با تأمین‌کننده برنده مناقصه مطابقت ندارد');
      }
      const effectiveSupplierId = supplierId || procurement.supplierId || null;
      const [supplier, parts] = await Promise.all([
        effectiveSupplierId
          ? tx.supplier.findUnique({
              where: { id: effectiveSupplierId },
              select: { id: true, active: true },
            })
          : Promise.resolve(null),
        tx.part.findMany({
          where: { id: { in: normalizedItems.map((item) => item.partId) } },
          select: { id: true },
        }),
      ]);
      if (effectiveSupplierId && !supplier) {
        throw new ProcurementServiceError(404, 'تأمین‌کننده یافت نشد');
      }
      if (effectiveSupplierId && supplier && !supplier.active) {
        throw new ProcurementServiceError(409, 'تأمین‌کننده غیرفعال قابل انتخاب برای سفارش خرید نیست');
      }
      const foundPartIds = new Set(parts.map((part) => part.id));
      for (const item of normalizedItems) {
        if (!foundPartIds.has(item.partId)) {
          throw new ProcurementServiceError(404, `قطعه یافت نشد: ${item.partId}`);
        }
      }

      const totalAmount = normalizedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      const created = await tx.purchaseOrder.create({
        data: {
          procurementId,
          supplierId: effectiveSupplierId,
          status: 'DRAFT',
          totalAmount,
          currency: options.currency || 'USD',
          notes: options.notes || null,
          items: { create: normalizedItems },
        },
        include: {
          items: { include: { part: { select: { id: true, name: true, nameFa: true, sku: true } } } },
          supplier: { select: { id: true, name: true, nameFa: true } },
          procurement: { select: { id: true, title: true } },
        },
      });

      await enqueueAuditOutbox(tx, {
        actorId: userId ?? null,
        actorType: 'ADMIN',
        action: 'store.procurement.po.create',
        entityType: 'PurchaseOrder',
        entityId: created.id,
        after: {
          procurementId,
          supplierId: supplierId || null,
          status: created.status,
          totalAmount: created.totalAmount,
          currency: created.currency,
          notes: created.notes,
          items: normalizedItems,
        },
      });
      return created;
    }, { isolationLevel: 'Serializable' });
    return serialize(po);
  } catch (err: any) {
    if (err?.code === 'P2034') {
      throw new ProcurementServiceError(409, 'اطلاعات مناقصه یا سفارش هم‌زمان تغییر کرده است؛ دوباره تلاش کنید');
    }
    throw err;
  }
}

// ── submitPurchaseOrder ───────────────────────────────────
/**
 * Transition a PO from DRAFT → SUBMITTED. Refuses if the PO is not in DRAFT
 * state (idempotent re-submit blocked).
 *
 * @throws ProcurementServiceError on lookup (404) or state-machine (400).
 */
export async function submitPurchaseOrder(
  id: string,
  userId?: string | null,
): Promise<any> {
  if (!userId || !userId.trim()) {
    throw new ProcurementServiceError(400, 'شناسه کاربر ارسال‌کننده سفارش الزامی است');
  }
  try {
    const po = await storeDb.$transaction(async (tx) => {
      const existing = await tx.purchaseOrder.findUnique({ where: { id } });
      if (!existing) throw new ProcurementServiceError(404, 'سفارش خرید یافت نشد');
      if (existing.status !== 'DRAFT') {
        throw new ProcurementServiceError(409, `سفارش خرید در وضعیت ${existing.status} قرار دارد و قابل ارسال نیست`);
      }
      const changed = await tx.purchaseOrder.updateMany({
        where: { id, status: 'DRAFT' },
        data: { status: 'SUBMITTED', submittedBy: userId },
      });
      if (changed.count !== 1) throw new ProcurementServiceError(409, 'وضعیت سفارش هم‌زمان تغییر کرده است');
      const updated = await tx.purchaseOrder.findUnique({
        where: { id },
        include: {
          items: { include: { part: { select: { id: true, name: true, nameFa: true, sku: true } } } },
          supplier: { select: { id: true, name: true, nameFa: true } },
        },
      });
      if (!updated) throw new ProcurementServiceError(404, 'سفارش خرید پس از ارسال یافت نشد');
      await enqueueAuditOutbox(tx, {
        actorId: userId ?? null, actorType: 'ADMIN',
        action: 'store.procurement.po.submit', entityType: 'PurchaseOrder', entityId: id,
        before: { status: existing.status, submittedBy: existing.submittedBy },
        after: { status: updated.status, submittedBy: updated.submittedBy },
      });
      return updated;
    }, { isolationLevel: 'Serializable' });
    return serialize(po);
  } catch (err: any) {
    if (err?.code === 'P2034') throw new ProcurementServiceError(409, 'ارسال سفارش هم‌زمان تغییر کرده است؛ دوباره بارگذاری کنید');
    throw err;
  }
}

// ── approvePurchaseOrder ──────────────────────────────────
/**
 * Transition a PO from SUBMITTED → APPROVED. Records approverId +
 * approvedAt. Refuses if the PO is not in SUBMITTED state.
 *
 * Separation of duty: at the data layer we record the approver's userId
 * (which may differ from the submitter's); we do NOT hard-refuse same-user
 * approve — that's a UI policy enforced in the admin page, not here.
 *
 * @throws ProcurementServiceError on lookup (404) or state-machine (400).
 */
export async function approvePurchaseOrder(
  id: string,
  userId?: string | null,
): Promise<any> {
  if (!userId || !userId.trim()) {
    throw new ProcurementServiceError(400, 'شناسه کاربر تأییدکننده سفارش الزامی است');
  }
  try {
    const po = await storeDb.$transaction(async (tx) => {
      const existing = await tx.purchaseOrder.findUnique({ where: { id } });
      if (!existing) throw new ProcurementServiceError(404, 'سفارش خرید یافت نشد');
      if (existing.status !== 'SUBMITTED') {
        throw new ProcurementServiceError(409, `سفارش خرید در وضعیت ${existing.status} قرار دارد و قابل تأیید نیست`);
      }
      if (existing.submittedBy && existing.submittedBy === userId) {
        throw new ProcurementServiceError(409, 'تأیید سفارش خرید توسط همان کاربری که آن را ارسال کرده مجاز نیست');
      }
      const approvedAt = new Date();
      const changed = await tx.purchaseOrder.updateMany({
        where: { id, status: 'SUBMITTED' },
        data: { status: 'APPROVED', approvedBy: userId ?? null, approvedAt },
      });
      if (changed.count !== 1) throw new ProcurementServiceError(409, 'وضعیت سفارش هم‌زمان تغییر کرده است');
      const updated = await tx.purchaseOrder.findUnique({
        where: { id },
        include: {
          items: { include: { part: { select: { id: true, name: true, nameFa: true, sku: true } } } },
          supplier: { select: { id: true, name: true, nameFa: true } },
        },
      });
      if (!updated) throw new ProcurementServiceError(404, 'سفارش خرید پس از تأیید یافت نشد');
      await enqueueAuditOutbox(tx, {
        actorId: userId ?? null, actorType: 'ADMIN',
        action: 'store.procurement.po.approve', entityType: 'PurchaseOrder', entityId: id,
        before: {
          status: existing.status,
          submittedBy: existing.submittedBy,
          approvedBy: existing.approvedBy,
          approvedAt: existing.approvedAt,
        },
        after: {
          status: updated.status,
          submittedBy: updated.submittedBy,
          approvedBy: updated.approvedBy,
          approvedAt: updated.approvedAt,
        },
      });
      return updated;
    }, { isolationLevel: 'Serializable' });
    return serialize(po);
  } catch (err: any) {
    if (err?.code === 'P2034') throw new ProcurementServiceError(409, 'تأیید سفارش هم‌زمان تغییر کرده است؛ دوباره بارگذاری کنید');
    throw err;
  }
}

// ── receivePurchaseOrderItem ──────────────────────────────
/**
 * Receive `receivedQty` units against a single PurchaseOrderItem line.
 * Supports partial receiving (receivedQty < remaining). Side-effects:
 *   1. Increment PurchaseOrderItem.received (mutation 1).
 *   2. Create a StockMovement (type=RECEIVE, quantity=+receivedQty) on the
 *      related Part — the inventory ledger entry (mutation 2).
 *   3. Update Part.stock snapshot = old stock + receivedQty (mutation 3).
 *   4. If ALL items on the PO are now fully received (received >= quantity),
 *      auto-flip the PO status to RECEIVED + stamp receivedAt (mutation 4,
 *      conditional).
 *
 * Audit trail (4 entries, mirroring the multi-audit pattern in
 * adjustStock + resolveReturn):
 *   a. store.procurement.po.receive on PurchaseOrderItem (primary).
 *   b. store.inventory.movement.create on StockMovement (mirrors
 *      createMovement's primary audit hook).
 *   c. store.part.update on Part (the stock side-effect, mirrors
 *      createMovement's secondary audit).
 *   d. store.procurement.po.receive on PurchaseOrder (conditional, only
 *      when the PO auto-flips to RECEIVED).
 *
 * Refuses:
 *   - POItem not found (404).
 *   - receivedQty not a positive integer (400).
 *   - Over-receive: newReceived > item.quantity (400).
 *   - PO is CANCELLED (400 — cannot receive against a cancelled PO).
 *
 * @throws ProcurementServiceError on validation (400) or lookup (404).
 */
export async function receivePurchaseOrderItem(
  poItemId: string,
  receivedQty: number,
  warehouseId: string,
  userId: string | null | undefined,
  procurementId: string,
  purchaseOrderId: string,
): Promise<any> {
  if (
    typeof poItemId !== 'string' || !poItemId.trim() ||
    typeof warehouseId !== 'string' || !warehouseId.trim() ||
    typeof procurementId !== 'string' || !procurementId.trim() ||
    typeof purchaseOrderId !== 'string' || !purchaseOrderId.trim() ||
    !Number.isSafeInteger(receivedQty) || receivedQty <= 0
  ) {
    throw new ProcurementServiceError(
      400,
      'شناسه قلم، شناسه سفارش، شناسه مناقصه، تعداد صحیح مثبت و انبار مقصد الزامی است',
    );
  }
  const qty = receivedQty;
  if (!Number.isSafeInteger(qty) || qty <= 0) {
    throw new ProcurementServiceError(
      400,
      'تعداد دریافتی باید عدد صحیح مثبت باشد',
    );
  }

  try {
    const result = await storeDb.$transaction(async (tx) => {
      const poItem = await tx.purchaseOrderItem.findUnique({
        where: { id: poItemId },
        include: {
          purchaseOrder: true,
          part: { select: { id: true, name: true, sku: true, stock: true, lowStockThreshold: true } },
        },
      });
      if (!poItem || poItem.purchaseOrderId !== purchaseOrderId || poItem.purchaseOrder.procurementId !== procurementId) {
        throw new ProcurementServiceError(404, 'آیتم سفارش خرید در این مسیر یافت نشد');
      }
      if (poItem.purchaseOrder.status === 'CANCELLED' || poItem.purchaseOrder.status === 'RECEIVED') {
        throw new ProcurementServiceError(409, 'سفارش خرید لغوشده یا تکمیل‌شده قابل دریافت نیست');
      }
      if (poItem.purchaseOrder.status !== 'APPROVED') {
        throw new ProcurementServiceError(409, 'دریافت کالا فقط پس از تأیید سفارش خرید مجاز است');
      }

      const newReceived = poItem.received + qty;
      if (newReceived > poItem.quantity) {
        throw new ProcurementServiceError(
          409,
          `دریافت بیش از تعداد سفارش. سفارش: ${poItem.quantity}، دریافت‌شده قبلی: ${poItem.received}، درخواست: ${qty}`,
        );
      }

      const part = await tx.part.findUnique({
        where: { id: poItem.partId },
        select: { id: true, name: true, sku: true, stock: true, lowStockThreshold: true },
      });
      if (!part) {
        throw new ProcurementServiceError(404, 'قطعه سفارش خرید یافت نشد');
      }
      const warehouse = await tx.warehouse.findUnique({
        where: { id: warehouseId },
        select: { id: true, name: true, active: true },
      });
      if (!warehouse || !warehouse.active) {
        throw new ProcurementServiceError(409, 'انبار مقصد وجود ندارد یا غیرفعال است');
      }

      const balances = await tx.inventoryBalance.findMany({
        where: { partId: part.id },
        select: { id: true, warehouseId: true, quantity: true, reserved: true },
        orderBy: [{ warehouseId: 'asc' }, { id: 'asc' }],
      });
      if (balances.length === 0) {
        throw new ProcurementServiceError(
          409,
          'موجودی اولیه این قطعه هنوز به انبار تخصیص نیافته است؛ ابتدا موجودی اولیه را در انبار مشخص ثبت کنید',
        );
      }
      const warehouseTotal = balances.reduce((sum, balance) => sum + balance.quantity, 0);
      if (warehouseTotal !== part.stock) {
        throw new ProcurementServiceError(
          409,
          'موجودی کل قطعه با مجموع موجودی انبارها برابر نیست؛ ابتدا مغایرت‌گیری انجام شود',
        );
      }
      const targetBalance = balances.find((balance) => balance.warehouseId === warehouseId);
      if (!targetBalance) {
        throw new ProcurementServiceError(
          409,
          'برای قطعه در انبار مقصد ردیف موجودی وجود ندارد؛ ابتدا موجودی اولیه انبار را ثبت کنید',
        );
      }

      // CAS on the PO line prevents concurrent partial receipts from
      // exceeding the ordered quantity. Serializable isolation below also
      // protects the aggregate PO completion decision.
      const itemChanged = await tx.purchaseOrderItem.updateMany({
        where: {
          id: poItemId,
          received: poItem.received,
          quantity: { gte: newReceived },
        },
        data: { received: { increment: qty } },
      });
      if (itemChanged.count !== 1) {
        throw new ProcurementServiceError(
          409,
          'مقدار دریافتی این قلم هم‌زمان تغییر کرده است؛ صفحه را تازه‌سازی کنید',
        );
      }
      const updatedItem = await tx.purchaseOrderItem.findUnique({
        where: { id: poItemId },
      });
      if (!updatedItem) {
        throw new ProcurementServiceError(404, 'آیتم سفارش خرید پس از دریافت یافت نشد');
      }

      // Global inventory lock order: Part first, then InventoryBalance.
      // Both increments and the ledger/outbox writes remain in this transaction.
      const afterPart = await tx.part.update({
        where: { id: part.id },
        data: { stock: { increment: qty } },
        select: { id: true, name: true, sku: true, stock: true },
      });
      const afterBalance = await tx.inventoryBalance.update({
        where: { id: targetBalance.id },
        data: { quantity: { increment: qty } },
      });

      const movement = await tx.stockMovement.create({
        data: {
          partId: part.id,
          warehouseId,
          type: 'RECEIVE',
          quantity: qty,
          balanceAfter: afterPart.stock,
          reason: `دریافت سفارش خرید ${poItem.purchaseOrder.id}`,
          reference: poItem.purchaseOrder.id,
          createdBy: userId ?? null,
        },
      });

      await enqueueAuditOutbox(tx, {
        actorId: userId ?? null,
        actorType: 'ADMIN',
        action: 'store.procurement.po.receive',
        entityType: 'PurchaseOrderItem',
        entityId: poItemId,
        before: { received: poItem.received, quantity: poItem.quantity },
        after: { received: updatedItem.received, quantity: updatedItem.quantity, warehouseId },
      });
      await enqueueAuditOutbox(tx, {
        actorId: userId ?? null,
        actorType: 'ADMIN',
        action: 'store.inventory.movement.create',
        entityType: 'StockMovement',
        entityId: movement.id,
        after: { partId: part.id, warehouseId, type: 'RECEIVE', quantity: qty, balanceAfter: afterPart.stock, reference: poItem.purchaseOrder.id },
      });
      await enqueueAuditOutbox(tx, {
        actorId: userId ?? null,
        actorType: 'ADMIN',
        action: 'store.part.update',
        entityType: 'Part',
        entityId: part.id,
        before: { stock: part.stock },
        after: { stock: afterPart.stock },
      });
      await enqueueAuditOutbox(tx, {
        actorId: userId ?? null,
        actorType: 'ADMIN',
        action: 'store.inventory.balance.update',
        entityType: 'InventoryBalance',
        entityId: afterBalance.id,
        before: { partId: part.id, quantity: targetBalance.quantity, reserved: targetBalance.reserved, warehouseId },
        after: { partId: part.id, quantity: afterBalance.quantity, reserved: afterBalance.reserved, warehouseId },
      });

      const allItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: poItem.purchaseOrderId },
        select: { quantity: true, received: true },
      });
      const allReceived = allItems.length > 0 && allItems.every((item) => item.received >= item.quantity);
      let poUpdate: any = null;
      if (allReceived) {
        const changed = await tx.purchaseOrder.updateMany({
          where: { id: poItem.purchaseOrderId, status: 'APPROVED' },
          data: { status: 'RECEIVED', receivedAt: new Date() },
        });
        if (changed.count === 1) {
          poUpdate = await tx.purchaseOrder.findUnique({ where: { id: poItem.purchaseOrderId } });
          if (!poUpdate) throw new ProcurementServiceError(404, 'سفارش خرید پس از تکمیل یافت نشد');
          await enqueueAuditOutbox(tx, {
            actorId: userId ?? null,
            actorType: 'ADMIN',
            action: 'store.procurement.po.receive',
            entityType: 'PurchaseOrder',
            entityId: poItem.purchaseOrderId,
            before: { status: poItem.purchaseOrder.status, receivedAt: poItem.purchaseOrder.receivedAt },
            after: { status: poUpdate.status, receivedAt: poUpdate.receivedAt },
          });
        } else {
          throw new ProcurementServiceError(409, 'وضعیت سفارش خرید هم‌زمان تغییر کرده است');
        }
      }

      return { updatedItem, movement, afterPart, poUpdate, allReceived };
    }, { isolationLevel: 'Serializable' });

    return {
      item: serialize({ ...result.updatedItem, part: result.afterPart }),
      movement: serialize(result.movement),
      part: result.afterPart,
      purchaseOrder: result.poUpdate ? serialize(result.poUpdate) : null,
      allReceived: result.allReceived,
    };
  } catch (err: any) {
    if (err?.code === 'P2034') {
      throw new ProcurementServiceError(409, 'دریافت سفارش خرید هم‌زمان تغییر کرده است؛ اطلاعات را تازه‌سازی و دوباره تلاش کنید');
    }
    throw err;
  }
}

// ── cancelPurchaseOrder ───────────────────────────────────
/**
 * Transition a PO to CANCELLED. Refuses if the PO is already in a terminal
 * state (RECEIVED or CANCELLED) — cancelling a fully-received PO is a
 * data-integrity violation; cancelling an already-cancelled PO is a no-op
 * (idempotent block).
 *
 * @throws ProcurementServiceError on lookup (404) or state-machine (400).
 */
export async function cancelPurchaseOrder(
  id: string,
  reason: string | null,
  userId?: string | null,
): Promise<any> {
  try {
    const po = await storeDb.$transaction(async (tx) => {
      const existing = await tx.purchaseOrder.findUnique({ where: { id } });
      if (!existing) throw new ProcurementServiceError(404, 'سفارش خرید یافت نشد');
      if (existing.status === 'CANCELLED') throw new ProcurementServiceError(409, 'سفارش خرید قبلاً لغو شده است');
      if (existing.status === 'RECEIVED') throw new ProcurementServiceError(409, 'سفارش خرید تحویل‌شده قابل لغو نیست');
      if (!['DRAFT', 'SUBMITTED', 'APPROVED'].includes(existing.status)) {
        throw new ProcurementServiceError(409, 'وضعیت سفارش برای لغو معتبر نیست');
      }
      const changed = await tx.purchaseOrder.updateMany({
        where: { id, status: existing.status },
        data: { status: 'CANCELLED', notes: reason ? `CANCELLED: ${reason}` : existing.notes },
      });
      if (changed.count !== 1) throw new ProcurementServiceError(409, 'وضعیت سفارش هم‌زمان تغییر کرده یا قابل لغو نیست');
      const updated = await tx.purchaseOrder.findUnique({
        where: { id },
        include: {
          items: { include: { part: { select: { id: true, name: true, nameFa: true, sku: true } } } },
          supplier: { select: { id: true, name: true, nameFa: true } },
        },
      });
      if (!updated) throw new ProcurementServiceError(404, 'سفارش خرید پس از لغو یافت نشد');
      await enqueueAuditOutbox(tx, {
        actorId: userId ?? null, actorType: 'ADMIN',
        action: 'store.procurement.po.cancel', entityType: 'PurchaseOrder', entityId: id,
        before: { status: existing.status },
        after: { status: updated.status, reason: reason || null },
        reason: reason ?? null,
      });
      return updated;
    }, { isolationLevel: 'Serializable' });
    return serialize(po);
  } catch (err: any) {
    if (err?.code === 'P2034') throw new ProcurementServiceError(409, 'لغو سفارش هم‌زمان تغییر کرده است؛ دوباره بارگذاری کنید');
    throw err;
  }
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
