/**
 * HEAVIX — Store Returns Service Layer
 *
 * Extracted from src/app/api/admin/store/returns/route.ts (T-A-DEEP-STORE)
 * and src/app/api/admin/store/returns/[id]/route.ts.
 *
 * Responsibilities:
 *   - createReturn(): create a Return and enqueue its audit event in the same transaction.
 *   - updateReturnStatus(): advance status (REQUESTED → APPROVED →
 *     INSPECTED → RESOLVED | REJECTED) + optionally set inspection/
 *     resolution notes + enqueue an audit event in the same transaction.
 *   - listReturns(): query Returns with filters (orderId, status, limit).
 *
 * T2-DEEP — Returns Deep (ReturnItem + Inspection Workflow):
 *   - addReturnItem(): append a ReturnItem (per-OrderItem line) to a
 *     Return + transactional audit outbox event. Validates that the OrderItem exists and that
 *     quantity <= OrderItem.quantity (over-return refused).
 *   - inspectReturn(): admin records inspection notes + per-item
 *     restockable flags. Sets status=INSPECTED with per-item + parent outbox events. Idempotent
 *     re-inspection is allowed (admin can update flags/notes).
 *   - resolveReturn(): finalizes the return with resolution REFUND |
 *     EXCHANGE | REJECT. For REFUND, computes the refund amount from
 *     the restockable ReturnItem line totals (sum of OrderItem.lineTotal
 *     for the returned quantity) and creates a WalletTransaction
 *     (CREDIT) on the customer's wallet + adjusts Customer.walletBalanceIrr.
 *     Sets status=RESOLVED with refund + wallet + outbox events in one transaction.
 *
 * All Store return mutations and their AuditOutbox events commit together.
 * Outbox delivery to the independent main AuditLog database is at-least-once
 * and idempotent; no cross-database transaction is assumed.
 *
 * The route handlers stay thin: parse request, enforce RBAC, call service,
 * map thrown ServiceError → HTTP response. All DB + audit logic lives here.
 */

import { storeDb } from '@/lib/store-db';
import { enqueueAuditOutbox } from '@/lib/store-audit-outbox';

// ── Constants ──────────────────────────────────────────────
const ALLOWED_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'INSPECTED',
  'RESOLVED',
  'REJECTED',
] as const;

const ALLOWED_RESOLUTIONS = ['REFUND', 'EXCHANGE', 'REJECT'] as const;

// T2-DEEP — allowed ReturnItem.condition values. The condition is the
// customer-stated reason for return on the item (different from the
// top-level Return.reason which is the customer's overall reason text).
const ALLOWED_CONDITIONS = [
  'UNOPENED',
  'DAMAGED',
  'WRONG_ITEM',
  'OTHER',
] as const;

// ── Service error (maps to HTTP status in route handler) ──
export class ReturnsServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ReturnsServiceError';
  }
}

// ── Filters for listReturns() ──────────────────────────────
export interface ReturnsFilters {
  orderId?: string;
  status?: string;
  limit?: number;
}

// ── Optional extra fields for createReturn() ───────────────
export interface CreateReturnOptions {
  status?: string;
  inspection?: string | null;
  resolution?: string | null;
  reference?: string | null;
}

// ── Optional extra fields for updateReturnStatus() ─────────
export interface UpdateReturnOptions {
  reason?: string | null;
}

// ── Serializer (Date → ISO string for JSON transport) ────
function serialize(r: any) {
  return {
    ...r,
    createdAt: r.createdAt?.toISOString?.() ?? null,
    updatedAt: r.updatedAt?.toISOString?.() ?? null,
  };
}

// ── createReturn ──────────────────────────────────────────
/**
 * Create a Return for an order. Default status: REQUESTED.
 *
 * @throws ReturnsServiceError on validation/lookup failure (400/404).
 */
export async function createReturn(
  orderId: string,
  reason: string,
  userId?: string | null,
  options: CreateReturnOptions = {},
): Promise<any> {
  if (!orderId || !reason) {
    throw new ReturnsServiceError(400, 'سفارش و دلیل مرجوعی الزامی است');
  }

  // New returns must enter the workflow as REQUESTED. Inspection and
  // resolution are dedicated state-machine actions; accepting them here
  // would let callers bypass the refund/inspection lifecycle.
  if (options.status && options.status !== 'REQUESTED') {
    throw new ReturnsServiceError(400, 'مرجوعی جدید باید با وضعیت REQUESTED ایجاد شود');
  }
  if (options.inspection || options.resolution) {
    throw new ReturnsServiceError(400, 'کارشناسی و حل‌وفصل فقط از مسیرهای اختصاصی مجاز هستند');
  }
  const initialStatus = 'REQUESTED';

  const ret = await storeDb.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new ReturnsServiceError(404, 'سفارش یافت نشد');
    }

    const created = await tx.return.create({
      data: {
        orderId,
        reason,
        status: initialStatus,
        inspection: options.inspection || null,
        resolution: options.resolution || null,
        createdBy: userId ?? null,
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            customer: {
              select: { id: true, name: true, family: true, phone: true },
            },
          },
        },
      },
    });

    await enqueueAuditOutbox(tx, {
      actorId: userId ?? null,
      actorType: 'ADMIN',
      action: 'store.return.create',
      entityType: 'Return',
      entityId: created.id,
      after: {
        orderId,
        reason,
        status: initialStatus,
        inspection: created.inspection,
        resolution: created.resolution,
        reference: options.reference || null,
      },
    });

    return created;
  });

  return serialize(ret);
}

// ── updateReturnStatus ────────────────────────────────────
/**
 * Update a Return's status, inspection, and/or resolution notes.
 *
 * Status flow: REQUESTED → APPROVED → INSPECTED → RESOLVED | REJECTED.
 *
 * @throws ReturnsServiceError on lookup failure (404) or invalid
 *         status/resolution (400).
 */
export async function updateReturnStatus(
  id: string,
  status?: string,
  inspection?: string | null,
  resolution?: string | null,
  userId?: string | null,
  options: UpdateReturnOptions = {},
): Promise<any> {
  const ret = await storeDb.$transaction(async (tx) => {
    const existing = await tx.return.findUnique({ where: { id } });
    if (!existing) {
      throw new ReturnsServiceError(404, 'مرجوعی یافت نشد');
    }

    const data: any = {};
    if (existing.status === 'RESOLVED' || existing.status === 'REJECTED') {
      throw new ReturnsServiceError(409, 'مرجوعی نهایی شده و قابل ویرایش نیست');
    }
    if (status !== undefined) {
      if (!ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])) {
        throw new ReturnsServiceError(400, 'وضعیت نامعتبر');
      }
      if (status !== existing.status && status !== 'APPROVED') {
        throw new ReturnsServiceError(400, 'کارشناسی و حل‌وفصل باید از مسیرهای اختصاصی انجام شوند');
      }
      if (status === 'APPROVED' && existing.status !== 'REQUESTED' && existing.status !== 'APPROVED') {
        throw new ReturnsServiceError(409, 'فقط مرجوعی REQUESTED قابل تأیید است');
      }
      data.status = status;
    }
    if (inspection !== undefined || resolution !== undefined) {
      throw new ReturnsServiceError(400, 'یادداشت کارشناسی و نتیجه نهایی فقط از مسیرهای اختصاصی مجاز هستند');
    }
    if (options.reason !== undefined) {
      data.reason = options.reason || existing.reason;
    }

    if (Object.keys(data).length === 0) {
      throw new ReturnsServiceError(400, 'هیچ تغییری برای ثبت ارسال نشده است');
    }

    const updated = await tx.return.update({
      where: { id },
      data,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            customer: {
              select: { id: true, name: true, family: true, phone: true },
            },
          },
        },
      },
    });

    await enqueueAuditOutbox(tx, {
      actorId: userId ?? null,
      actorType: 'ADMIN',
      action: 'store.return.update',
      entityType: 'Return',
      entityId: updated.id,
      before: {
        status: existing.status,
        inspection: existing.inspection,
        resolution: existing.resolution,
        reason: existing.reason,
      },
      after: {
        status: updated.status,
        inspection: updated.inspection,
        resolution: updated.resolution,
        reason: updated.reason,
      },
    });

    return updated;
  }, { isolationLevel: 'Serializable' });

  return serialize(ret);
}

// ── listReturns ───────────────────────────────────────────
/**
 * List Returns with optional filters.
 *
 * @throws ReturnsServiceError if `status` is invalid (400).
 */
export async function listReturns(
  filters: ReturnsFilters = {},
): Promise<{ items: any[]; total: number }> {
  const { orderId, status, limit = 100 } = filters;
  const cappedLimit = Math.min(500, Number(limit) || 100);

  const where: any = {};
  if (orderId) where.orderId = orderId;
  if (status) {
    if (!ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])) {
      throw new ReturnsServiceError(400, 'وضعیت نامعتبر');
    }
    where.status = status;
  }

  const [items, total] = await Promise.all([
    storeDb.return.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: cappedLimit,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            customer: {
              select: { id: true, name: true, family: true, phone: true },
            },
          },
        },
        // T2-DEEP — include per-line items in the list view so the admin
        // can see how many items are part of each return without a second
        // round-trip per row.
        items: {
          include: {
            orderItem: {
              select: {
                id: true,
                partNameSnapshot: true,
                quantity: true,
                lineTotalIrr: true,
              },
            },
          },
        },
      },
    }),
    storeDb.return.count({ where }),
  ]);

  return { items: items.map(serialize), total };
}

// ──────────────────────────────────────────────────────────
// T2-DEEP — RETURN ITEMS + INSPECTION + RESOLUTION
// ──────────────────────────────────────────────────────────

// ── ItemCondition type (re-exported for the API route) ──
export type ReturnItemCondition = (typeof ALLOWED_CONDITIONS)[number];

// ── ItemConditions shape for inspectReturn() ──
//   itemId → { restockable: boolean, condition?: string }
//   Only items in the map are updated; others keep their existing flags.
export interface ItemConditionInput {
  itemId: string;
  restockable: boolean;
  condition?: string;
}

// ── addReturnItem ─────────────────────────────────────────
/**
 * Append a ReturnItem (per-OrderItem line) to a Return.
 *
 * Validates:
 *   1. The Return exists.
 *   2. The OrderItem exists and belongs to the same Order.
 *   3. quantity is a positive integer.
 *   4. (Optional) condition is one of ALLOWED_CONDITIONS.
 *   5. No existing ReturnItem for this (returnId, orderItemId) pair —
 *      an item is added once per return; quantity can be edited via
 *      a separate edit flow (out of scope for T2-DEEP).
 *
 * @throws ReturnsServiceError on validation/lookup failure (400/404)
 *         or duplicate item (409).
 */
export async function addReturnItem(
  returnId: string,
  orderItemId: string,
  quantity: number,
  reason: string | null,
  condition: string | null,
  userId?: string | null,
): Promise<any> {
  if (!returnId || !orderItemId || quantity === undefined) {
    throw new ReturnsServiceError(400, 'returnId، orderItemId و تعداد الزامی است');
  }
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new ReturnsServiceError(400, 'تعداد باید عدد صحیح مثبت باشد');
  }
  if (
    condition &&
    !ALLOWED_CONDITIONS.includes(condition as (typeof ALLOWED_CONDITIONS)[number])
  ) {
    throw new ReturnsServiceError(400, 'وضعیت قطعه نامعتبر است (UNOPENED | DAMAGED | WRONG_ITEM | OTHER)');
  }

  try {
    return await storeDb.$transaction(async (tx) => {
      const [ret, orderItem] = await Promise.all([
        tx.return.findUnique({ where: { id: returnId } }),
        tx.orderItem.findUnique({ where: { id: orderItemId } }),
      ]);
      if (!ret) {
        throw new ReturnsServiceError(404, 'مرجوعی یافت نشد');
      }
      if (!orderItem) {
        throw new ReturnsServiceError(404, 'آیتم سفارش یافت نشد');
      }
      if (orderItem.orderId !== ret.orderId) {
        throw new ReturnsServiceError(400, 'آیتم سفارش به سفارش مرجوعی تعلق ندارد');
      }
      if (ret.status !== 'REQUESTED' && ret.status !== 'APPROVED') {
        throw new ReturnsServiceError(409, 'افزودن آیتم فقط پیش از کارشناسی و حل‌وفصل مرجوعی مجاز است');
      }

      // Count every non-rejected return for this purchased line, not just
      // the current Return. Serializable isolation makes concurrent inserts
      // conflict rather than allowing two returns to consume the same units.
      const priorReturnItems = await tx.returnItem.findMany({
        where: { orderItemId },
        select: {
          quantity: true,
          return: { select: { status: true } },
        },
      });
      const alreadyReturned = priorReturnItems.reduce(
        (total: number, line: any) =>
          total + (line.return.status === 'REJECTED' ? 0 : line.quantity),
        0,
      );
      if (alreadyReturned + qty > orderItem.quantity) {
        throw new ReturnsServiceError(
          409,
          `سقف مرجوعی این قلم سفارش تکمیل می‌شود. خرید: ${orderItem.quantity}، قبلاً ثبت‌شده: ${alreadyReturned}، درخواست: ${qty}`,
        );
      }

      const existing = await tx.returnItem.findFirst({
        where: { returnId, orderItemId },
      });
      if (existing) {
        throw new ReturnsServiceError(409, 'این آیتم قبلاً به مرجوعی افزوده شده است');
      }

      const item = await tx.returnItem.create({
        data: {
          returnId,
          orderItemId,
          quantity: qty,
          reason: reason || null,
          condition: condition || null,
          restockable: false,
        },
        include: {
          orderItem: {
            select: {
              id: true,
              partNameSnapshot: true,
              quantity: true,
              lineTotalIrr: true,
            },
          },
        },
      });

      await enqueueAuditOutbox(tx, {
        actorId: userId ?? null,
        actorType: 'ADMIN',
        action: 'store.return.item.add',
        entityType: 'ReturnItem',
        entityId: item.id,
        after: {
          returnId,
          orderItemId,
          quantity: qty,
          reason: item.reason,
          condition: item.condition,
          restockable: item.restockable,
        },
      });

      return item;
    }, { isolationLevel: 'Serializable' });
  } catch (err: any) {
    if (err?.code === 'P2034') {
      throw new ReturnsServiceError(409, 'مرجوعی هم‌زمان تغییر کرده است؛ درخواست را دوباره بررسی کنید');
    }
    throw err;
  }
}

// ── inspectReturn ─────────────────────────────────────────
/**
 * Admin records inspection notes + per-item restockable flags.
 *
 *   1. Look up the Return (must exist; status must be APPROVED or
 *      INSPECTED — idempotent re-inspection allowed).
 *   2. Set Return.inspection = inspectionNotes (overrides existing notes).
 *   3. Set Return.status = INSPECTED.
 *   4. For each entry in itemConditions: update ReturnItem.restockable
 *      (and optionally condition). Items not in the map are left untouched.
 *
 * Refuses if status is REQUESTED (must approve first) or RESOLVED/REJECTED
 * (terminal states — cannot re-inspect).
 *
 * @throws ReturnsServiceError on lookup (404), state-machine violation (400),
 *         or invalid itemCondition item (400/404).
 */
export async function inspectReturn(
  returnId: string,
  inspectionNotes: string | null,
  itemConditions: ItemConditionInput[],
  userId?: string | null,
): Promise<any> {
  try {
    const ret = await storeDb.$transaction(async (tx) => {
      const existing = await tx.return.findUnique({
        where: { id: returnId },
        include: { items: true },
      });
      if (!existing) {
        throw new ReturnsServiceError(404, 'مرجوعی یافت نشد');
      }
      if (existing.status === 'REQUESTED') {
        throw new ReturnsServiceError(400, 'ابتدا مرجوعی را تأیید کنید (status = APPROVED)');
      }
      if (existing.status === 'RESOLVED' || existing.status === 'REJECTED') {
        throw new ReturnsServiceError(
          400,
          `مرجوعی در وضعیت نهایی (${existing.status}) قرار دارد و قابل کارشناسی مجدد نیست`,
        );
      }

      const itemIds = new Set(existing.items.map((item: any) => item.id));
      for (const itemCondition of itemConditions) {
        if (!itemIds.has(itemCondition.itemId)) {
          throw new ReturnsServiceError(400, `آیتم کارشناسی به این مرجوعی تعلق ندارد: ${itemCondition.itemId}`);
        }
        if (
          itemCondition.condition &&
          !ALLOWED_CONDITIONS.includes(itemCondition.condition as (typeof ALLOWED_CONDITIONS)[number])
        ) {
          throw new ReturnsServiceError(400, 'وضعیت قطعه نامعتبر است');
        }
      }

      // Claim/lock the parent lifecycle row before touching child items.
      // Serializable isolation plus this conditional update prevents an
      // inspection from racing a concurrent INSPECTED -> RESOLVED transition.
      const claimed = await tx.return.updateMany({
        where: { id: returnId, status: existing.status },
        data: {
          inspection: inspectionNotes || null,
          status: 'INSPECTED',
        },
      });
      if (claimed.count !== 1) {
        throw new ReturnsServiceError(409, 'وضعیت مرجوعی هم‌زمان تغییر کرده است');
      }

      const beforeItems = existing.items.map((item: any) => ({
        id: item.id,
        restockable: item.restockable,
        condition: item.condition,
      }));

      for (const itemCondition of itemConditions) {
        const beforeItem = existing.items.find((item: any) => item.id === itemCondition.itemId);
        const updated = await tx.returnItem.update({
          where: { id: itemCondition.itemId },
          data: {
            restockable: Boolean(itemCondition.restockable),
            ...(itemCondition.condition ? { condition: itemCondition.condition } : {}),
          },
        });
        await enqueueAuditOutbox(tx, {
          actorId: userId ?? null,
          actorType: 'ADMIN',
          action: 'store.return.inspect',
          entityType: 'ReturnItem',
          entityId: itemCondition.itemId,
          before: beforeItem
            ? { returnId, restockable: beforeItem.restockable, condition: beforeItem.condition }
            : { returnId },
          after: {
            returnId,
            restockable: updated.restockable,
            condition: updated.condition,
          },
        });
      }

      const updatedReturn = await tx.return.findUnique({
        where: { id: returnId },
        include: {
          items: {
            include: {
              orderItem: {
                select: {
                  id: true,
                  partNameSnapshot: true,
                  quantity: true,
                  lineTotalIrr: true,
                },
              },
            },
          },
        },
      });
      if (!updatedReturn) {
        throw new ReturnsServiceError(404, 'مرجوعی پس از کارشناسی یافت نشد');
      }

      await enqueueAuditOutbox(tx, {
        actorId: userId ?? null,
        actorType: 'ADMIN',
        action: 'store.return.inspect',
        entityType: 'Return',
        entityId: returnId,
        before: {
          status: existing.status,
          inspection: existing.inspection,
          items: beforeItems,
        },
        after: {
          status: updatedReturn.status,
          inspection: updatedReturn.inspection,
          items: (updatedReturn.items as any[]).map((item: any) => ({
            id: item.id,
            restockable: item.restockable,
            condition: item.condition,
          })),
        },
      });

      return updatedReturn;
    }, { isolationLevel: 'Serializable' });

    return serialize(ret);
  } catch (err: any) {
    if (err?.code === 'P2034') {
      throw new ReturnsServiceError(409, 'مرجوعی هم‌زمان تغییر کرده است؛ وضعیت را دوباره بارگذاری کنید');
    }
    throw err;
  }
}

// ── resolveReturn ─────────────────────────────────────────
/**
 * Finalize the Return with resolution REFUND | EXCHANGE | REJECT.
 *
 *   1. Look up the Return with items + order + customer.
 *   2. Refuse if status is REQUESTED (must approve + inspect first).
 *      For REFUND specifically, status MUST be INSPECTED — we need the
 *      restockable flags to compute the refund amount.
 *   3. Set Return.resolution = resolution + Return.status = RESOLVED.
 *   4. For REFUND resolution:
 *      a. Compute refundAmountIrr = sum of ReturnItem.lineTotalIrr ×
 *         (item.quantity / orderItem.quantity) for items where
 *         restockable=true. (Non-restockable items are NOT refunded —
 *         they're damaged/unsellable.)
 *         Edge case: if no items have restockable=true, refundAmountIrr=0.
 *         Legacy returns with zero items → refundAmountIrr=0 (admin can
 *         manually adjust via the wallet route if needed).
 *      b. Create a WalletTransaction (type=CREDIT, amount=refundAmountIrr)
 *         on the customer's wallet.
 *      c. Increment Customer.walletBalanceIrr by refundAmountIrr.
 *   5. Log audit with refundAmountIrr in the `after` field when REFUND.
 *
 * @throws ReturnsServiceError on lookup (404), state-machine (400),
 *         invalid resolution (400).
 */
export async function resolveReturn(
  returnId: string,
  resolution: string,
  userId?: string | null,
  warehouseId?: string | null,
): Promise<any> {
  if (!resolution) {
    throw new ReturnsServiceError(400, 'نوع تصمیم الزامی است');
  }
  if (
    !ALLOWED_RESOLUTIONS.includes(
      resolution as (typeof ALLOWED_RESOLUTIONS)[number],
    )
  ) {
    throw new ReturnsServiceError(
      400,
      'نوع تصمیم نامعتبر (REFUND | EXCHANGE | REJECT)',
    );
  }

  // The status claim, refund ledger entry, wallet increment, and resolution
  // commit together. The conditional status update is the idempotency guard:
  // concurrent resolve requests can only claim an INSPECTED return once.
  const result = await storeDb.$transaction(async (tx) => {
    const existing = await tx.return.findUnique({
      where: { id: returnId },
      include: {
        items: {
          include: {
            orderItem: {
              select: {
                id: true,
                partId: true,
                quantity: true,
                lineTotalIrr: true,
                lineTotalUsd: true,
              },
            },
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            customerId: true,
            customer: {
              select: { id: true, name: true, family: true, phone: true },
            },
          },
        },
      },
    });
    if (!existing) {
      throw new ReturnsServiceError(404, 'مرجوعی یافت نشد');
    }
    if (existing.status === 'REQUESTED' || existing.status === 'APPROVED') {
      throw new ReturnsServiceError(
        400,
        'ابتدا مرجوعی را کارشناسی کنید (status = INSPECTED)',
      );
    }
    if (existing.status === 'RESOLVED') {
      throw new ReturnsServiceError(400, 'مرجوعی قبلاً حل‌وفصل شده است');
    }
    if (existing.status === 'REJECTED') {
      throw new ReturnsServiceError(400, 'مرجوعی رد شده است و قابل حل‌وفصل نیست');
    }
    if (existing.status !== 'INSPECTED') {
      throw new ReturnsServiceError(400, 'وضعیت مرجوعی برای حل‌وفصل معتبر نیست');
    }

    let refundAmountIrr = 0;
    if (resolution === 'REFUND') {
      for (const item of existing.items as any[]) {
        if (!item.restockable) continue;
        const oi = item.orderItem;
        if (!oi || oi.quantity <= 0) continue;
        const fraction = item.quantity / oi.quantity;
        refundAmountIrr += (oi.lineTotalIrr ?? 0) * fraction;
      }
      refundAmountIrr = Math.round(refundAmountIrr * 100) / 100;
    }

    // A physically accepted return must be received into an explicit,
    // active warehouse. Never silently select a warehouse or turn a legacy
    // Part.stock-only record into a partial warehouse ledger.
    const restockItems = resolution === 'REJECT'
      ? []
      : (existing.items as any[]).filter((item) => item.restockable);
    if (restockItems.length > 0 && !warehouseId) {
      throw new ReturnsServiceError(409, 'برای بازگرداندن کالای قابل فروش، انبار مقصد را صریحاً انتخاب کنید');
    }

    const restockedMovements: any[] = [];
    for (const item of restockItems) {
      const partId = item.orderItem?.partId;
      const qty = Number(item.quantity);
      if (!partId || !Number.isInteger(qty) || qty <= 0) {
        throw new ReturnsServiceError(409, 'اطلاعات قلم مرجوعی برای ورود به انبار معتبر نیست');
      }
      const [part, warehouse, balances] = await Promise.all([
        tx.part.findUnique({ where: { id: partId }, select: { id: true, stock: true } }),
        tx.warehouse.findUnique({ where: { id: warehouseId! }, select: { id: true, active: true } }),
        tx.inventoryBalance.findMany({ where: { partId }, select: { id: true, warehouseId: true, quantity: true, reserved: true } }),
      ]);
      if (!part) throw new ReturnsServiceError(404, 'قطعه مرجوعی در کاتالوگ یافت نشد');
      if (!warehouse || !warehouse.active) {
        throw new ReturnsServiceError(409, 'انبار مقصد وجود ندارد یا غیرفعال است');
      }
      if (balances.length === 0) {
        throw new ReturnsServiceError(409, 'این قطعه هنوز به موجودی انبارها منتقل نشده است؛ ابتدا موجودی اولیه را در انبار ثبت کنید');
      }
      const warehouseTotal = balances.reduce((sum, balance) => sum + balance.quantity, 0);
      if (warehouseTotal !== part.stock) {
        throw new ReturnsServiceError(409, 'موجودی کل قطعه با مجموع موجودی انبارها برابر نیست؛ ابتدا مغایرت موجودی را رفع کنید');
      }
      const targetBalance = balances.find((balance) => balance.warehouseId === warehouseId);
      if (!targetBalance) {
        throw new ReturnsServiceError(409, 'برای قطعه در انبار مقصد ردیف موجودی وجود ندارد؛ ابتدا موجودی اولیه انبار را ثبت کنید');
      }

      const changedBalance = await tx.inventoryBalance.updateMany({
        where: { id: targetBalance.id },
        data: { quantity: { increment: qty } },
      });
      if (changedBalance.count !== 1) {
        throw new ReturnsServiceError(409, 'موجودی انبار هنگام ثبت مرجوعی تغییر کرده است؛ دوباره تلاش کنید');
      }
      const changedPart = await tx.part.updateMany({
        where: { id: partId },
        data: { stock: { increment: qty } },
      });
      if (changedPart.count !== 1) {
        throw new ReturnsServiceError(409, 'نمای موجودی قطعه هنگام ثبت مرجوعی تغییر کرده است؛ دوباره تلاش کنید');
      }

      const [afterPart, afterBalance] = await Promise.all([
        tx.part.findUnique({ where: { id: partId }, select: { id: true, stock: true } }),
        tx.inventoryBalance.findUnique({ where: { id: targetBalance.id } }),
      ]);
      if (!afterPart || !afterBalance) {
        throw new ReturnsServiceError(500, 'ثبت موجودی مرجوعی کامل نشد');
      }
      const movement = await tx.stockMovement.create({
        data: {
          partId,
          warehouseId,
          type: 'RETURN',
          quantity: qty,
          balanceAfter: afterPart.stock,
          reason: 'Restock from resolved return',
          reference: returnId,
          createdBy: userId ?? null,
        },
      });
      await enqueueAuditOutbox(tx, {
        actorId: userId ?? null,
        actorType: 'ADMIN',
        action: 'store.inventory.return.restock',
        entityType: 'StockMovement',
        entityId: movement.id,
        after: { returnId, partId, warehouseId, quantity: qty, balanceAfter: afterPart.stock },
      });
      await enqueueAuditOutbox(tx, {
        actorId: userId ?? null,
        actorType: 'ADMIN',
        action: 'store.inventory.return.restock',
        entityType: 'Part',
        entityId: partId,
        before: { stock: part.stock },
        after: { stock: afterPart.stock },
      });
      await enqueueAuditOutbox(tx, {
        actorId: userId ?? null,
        actorType: 'ADMIN',
        action: 'store.inventory.return.restock',
        entityType: 'InventoryBalance',
        entityId: afterBalance.id,
        before: { quantity: targetBalance.quantity, reserved: targetBalance.reserved },
        after: { quantity: afterBalance.quantity, reserved: afterBalance.reserved },
      });
      restockedMovements.push(movement);
    }

    // Claim the transition before financial side effects. The conditional
    // status update is the idempotency guard for concurrent resolution.
    const claimed = await tx.return.updateMany({
      where: { id: returnId, status: 'INSPECTED' },
      data: { status: 'RESOLVED', resolution },
    });
    if (claimed.count !== 1) {
      throw new ReturnsServiceError(400, 'مرجوعی هم‌زمان تغییر کرده یا قبلاً حل‌وفصل شده است');
    }

    const customerId = existing.order?.customerId;
    let walletTxn: any = null;
    let beforeWalletBalance: number | null = null;
    let afterWalletBalance: number | null = null;

    if (resolution === 'REFUND' && customerId && refundAmountIrr > 0) {
      const beforeCustomer = await tx.customer.findUnique({
        where: { id: customerId },
        select: { walletBalanceIrr: true },
      });
      if (!beforeCustomer) {
        throw new ReturnsServiceError(404, 'مشتری سفارش یافت نشد');
      }
      beforeWalletBalance = beforeCustomer.walletBalanceIrr;

      walletTxn = await tx.walletTransaction.create({
        data: {
          customerId,
          amount: refundAmountIrr,
          type: 'CREDIT',
          description: 'بازگشت وجه مرجوعی ' + returnId + ' — سفارش ' + (existing.order?.orderNumber ?? ''),
        },
      });
      const afterCustomer = await tx.customer.update({
        where: { id: customerId },
        data: { walletBalanceIrr: { increment: refundAmountIrr } },
        select: { id: true, walletBalanceIrr: true },
      });
      afterWalletBalance = afterCustomer.walletBalanceIrr;
    }

    const ret = await tx.return.findUnique({
      where: { id: returnId },
      include: {
        items: {
          include: {
            orderItem: {
              select: {
                id: true,
                partNameSnapshot: true,
                quantity: true,
                lineTotalIrr: true,
              },
            },
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            customer: {
              select: { id: true, name: true, family: true, phone: true },
            },
          },
        },
      },
    });
    if (!ret) {
      throw new ReturnsServiceError(404, 'مرجوعی پس از حل‌وفصل یافت نشد');
    }

    // STEP 15.95+ — Transactional Audit Outbox. Audit events for the
    // financial state change (Customer wallet), Return status transition,
    // and WalletTransaction creation are written to the AuditOutbox INSIDE
    // the same storeDb transaction. The replay worker (drainAuditOutbox)
    // delivers them to the main AuditLog table with retry + dedup. This
    // guarantees the audit invariant: a committed refund always has a
    // corresponding audit event, even if the main DB is unavailable at
    // commit time.
    if (customerId && walletTxn) {
      await enqueueAuditOutbox(tx, {
        actorId: userId ?? null,
        actorType: 'ADMIN',
        action: 'store.return.resolve',
        entityType: 'Customer',
        entityId: customerId,
        before: { walletBalanceIrr: beforeWalletBalance },
        after: { walletBalanceIrr: afterWalletBalance },
      });
    }
    await enqueueAuditOutbox(tx, {
      actorId: userId ?? null,
      actorType: 'ADMIN',
      action: 'store.return.resolve',
      entityType: 'Return',
      entityId: returnId,
      before: {
        status: existing.status,
        resolution: existing.resolution,
      },
      after: {
        status: ret.status,
        resolution: ret.resolution,
        refundAmountIrr: resolution === 'REFUND' ? refundAmountIrr : null,
        walletTxnId: walletTxn?.id ?? null,
      },
    });
    if (walletTxn) {
      await enqueueAuditOutbox(tx, {
        actorId: userId ?? null,
        actorType: 'ADMIN',
        action: 'store.return.resolve',
        entityType: 'WalletTransaction',
        entityId: walletTxn.id,
        after: {
          returnId,
          customerId: customerId ?? null,
          amount: refundAmountIrr,
          type: 'CREDIT',
        },
      });
    }

    return {
      existing,
      ret,
      refundAmountIrr,
      walletTxn,
      customerId,
      beforeWalletBalance,
      afterWalletBalance,
      restockedMovements,
    };
  });

  // STEP 15.95+: audit events are now delivered via the Transactional Outbox
  // (enqueued inside the storeDb transaction above). No post-commit logAudit
  // calls remain — the audit invariant is now atomic for the refund flow.

  return serialize({
    ...result.ret,
    refundAmountIrr: resolution === 'REFUND' ? result.refundAmountIrr : null,
    walletTxnId: result.walletTxn?.id ?? null,
    restockedMovements: result.restockedMovements,
  });
}

