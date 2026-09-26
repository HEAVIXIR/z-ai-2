/**
 * HEAVIX — Store Returns Service Layer
 *
 * Extracted from src/app/api/admin/store/returns/route.ts (T-A-DEEP-STORE)
 * and src/app/api/admin/store/returns/[id]/route.ts.
 *
 * Responsibilities:
 *   - createReturn(): create a Return for an order + log audit.
 *   - updateReturnStatus(): advance status (REQUESTED → APPROVED →
 *     INSPECTED → RESOLVED | REJECTED) + optionally set inspection/
 *     resolution notes + log audit.
 *   - listReturns(): query Returns with filters (orderId, status, limit).
 *
 * T2-DEEP — Returns Deep (ReturnItem + Inspection Workflow):
 *   - addReturnItem(): append a ReturnItem (per-OrderItem line) to a
 *     Return + log audit. Validates that the OrderItem exists and that
 *     quantity <= OrderItem.quantity (over-return refused).
 *   - inspectReturn(): admin records inspection notes + per-item
 *     restockable flags. Sets status=INSPECTED. Logs audit. Idempotent
 *     re-inspection is allowed (admin can update flags/notes).
 *   - resolveReturn(): finalizes the return with resolution REFUND |
 *     EXCHANGE | REJECT. For REFUND, computes the refund amount from
 *     the restockable ReturnItem line totals (sum of OrderItem.lineTotal
 *     for the returned quantity) and creates a WalletTransaction
 *     (CREDIT) on the customer's wallet + adjusts Customer.walletBalanceIrr.
 *     Sets status=RESOLVED. Logs audit (with refundAmountIrr if REFUND).
 *
 * The route handlers stay thin: parse request, enforce RBAC, call service,
 * map thrown ServiceError → HTTP response. All DB + audit logic lives here.
 */

import { storeDb } from '@/lib/store-db';
import { logAudit } from '@/lib/audit';

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
    throw new ReturnsServiceError(
      400,
      'سفارش و دلیل مرجوعی الزامی است',
    );
  }

  const order = await storeDb.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw new ReturnsServiceError(404, 'سفارش یافت نشد');
  }

  const initialStatus =
    options.status && ALLOWED_STATUSES.includes(options.status as (typeof ALLOWED_STATUSES)[number])
      ? options.status
      : 'REQUESTED';

  const ret = await storeDb.return.create({
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

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.return.create',
    entityType: 'Return',
    entityId: ret.id,
    after: {
      orderId,
      reason,
      status: initialStatus,
      inspection: ret.inspection,
      resolution: ret.resolution,
      reference: options.reference || null,
    },
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
  const existing = await storeDb.return.findUnique({ where: { id } });
  if (!existing) {
    throw new ReturnsServiceError(404, 'مرجوعی یافت نشد');
  }

  const data: any = {};
  if (status !== undefined) {
    if (!ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])) {
      throw new ReturnsServiceError(400, 'وضعیت نامعتبر');
    }
    data.status = status;
  }
  if (inspection !== undefined) {
    data.inspection = inspection || null;
  }
  if (resolution !== undefined) {
    if (resolution && !ALLOWED_RESOLUTIONS.includes(resolution as (typeof ALLOWED_RESOLUTIONS)[number])) {
      throw new ReturnsServiceError(400, 'نوع تصمیم نامعتبر');
    }
    data.resolution = resolution || null;
  }
  if (options.reason !== undefined) {
    data.reason = options.reason || existing.reason;
  }

  const ret = await storeDb.return.update({
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

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.return.update',
    entityType: 'Return',
    entityId: ret.id,
    before: existing,
    after: ret,
  });

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
    throw new ReturnsServiceError(
      400,
      'returnId، orderItemId و تعداد الزامی است',
    );
  }
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new ReturnsServiceError(
      400,
      'تعداد باید عدد صحیح مثبت باشد',
    );
  }
  if (
    condition &&
    !ALLOWED_CONDITIONS.includes(condition as (typeof ALLOWED_CONDITIONS)[number])
  ) {
    throw new ReturnsServiceError(
      400,
      'وضعیت قطعه نامعتبر است (UNOPENED | DAMAGED | WRONG_ITEM | OTHER)',
    );
  }

  // Look up the Return + OrderItem in parallel.
  const [ret, orderItem] = await Promise.all([
    storeDb.return.findUnique({ where: { id: returnId } }),
    storeDb.orderItem.findUnique({ where: { id: orderItemId } }),
  ]);
  if (!ret) {
    throw new ReturnsServiceError(404, 'مرجوعی یافت نشد');
  }
  if (!orderItem) {
    throw new ReturnsServiceError(404, 'آیتم سفارش یافت نشد');
  }
  if (orderItem.orderId !== ret.orderId) {
    throw new ReturnsServiceError(
      400,
      'آیتم سفارش به سفارش مرجوعی تعلق ندارد',
    );
  }

  // Over-return check: returned qty cannot exceed ordered qty.
  if (qty > orderItem.quantity) {
    throw new ReturnsServiceError(
      400,
      `تعداد مرجوعی بیش از تعداد سفارش است. سفارش: ${orderItem.quantity}، درخواست: ${qty}`,
    );
  }

  // Duplicate item check (one ReturnItem per orderItemId per Return).
  const existing = await storeDb.returnItem.findFirst({
    where: { returnId, orderItemId },
  });
  if (existing) {
    throw new ReturnsServiceError(
      409,
      'این آیتم قبلاً به مرجوعی افزوده شده است',
    );
  }

  const item = await storeDb.returnItem.create({
    data: {
      returnId,
      orderItemId,
      quantity: qty,
      reason: reason || null,
      condition: condition || null,
      restockable: false, // default: not restockable until inspected
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

  await logAudit({
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
  const existing = await storeDb.return.findUnique({
    where: { id: returnId },
    include: { items: true },
  });
  if (!existing) {
    throw new ReturnsServiceError(404, 'مرجوعی یافت نشد');
  }

  // State-machine: REQUESTED → APPROVED → INSPECTED (this) → RESOLVED.
  // Reject terminal states + early states.
  if (existing.status === 'REQUESTED') {
    throw new ReturnsServiceError(
      400,
      'ابتدا مرجوعی را تأیید کنید (status = APPROVED)',
    );
  }
  if (existing.status === 'RESOLVED' || existing.status === 'REJECTED') {
    throw new ReturnsServiceError(
      400,
      `مرجوعی در وضعیت نهایی (${existing.status}) قرار دارد و قابل کارشناسی مجدد نیست`,
    );
  }
  // status === 'APPROVED' or 'INSPECTED' → proceed.

  // Validate itemConditions: every itemId must reference an existing
  // ReturnItem of this Return.
  const itemIds = new Set(existing.items.map((i: any) => i.id));
  for (const ic of itemConditions) {
    if (!itemIds.has(ic.itemId)) {
      throw new ReturnsServiceError(
        400,
        `آیتم کارشناسی به این مرجوعی تعلق ندارد: ${ic.itemId}`,
      );
    }
    if (ic.condition) {
      if (
        !ALLOWED_CONDITIONS.includes(
          ic.condition as (typeof ALLOWED_CONDITIONS)[number],
        )
      ) {
        throw new ReturnsServiceError(
          400,
          'وضعیت قطعه نامعتبر است',
        );
      }
    }
  }

  // Update the Return + each touched ReturnItem. Wrapping in a tx would
  // be ideal; for now we sequence updates — partial failure would leave
  // the status unchanged (audit trail still records intent). The audit
  // is written AFTER all updates.
  const beforeItems = existing.items.map((i: any) => ({ ...i }));

  // Update each touched item. Each update gets its own audit entry so
  // the per-item restockable flip is independently traceable.
  for (const ic of itemConditions) {
    const beforeItem = existing.items.find((i: any) => i.id === ic.itemId);
    const updated = await storeDb.returnItem.update({
      where: { id: ic.itemId },
      data: {
        restockable: Boolean(ic.restockable),
        ...(ic.condition ? { condition: ic.condition } : {}),
      },
    });
    await logAudit({
      actorId: userId ?? null,
      actorType: 'ADMIN',
      action: 'store.return.inspect',
      entityType: 'ReturnItem',
      entityId: ic.itemId,
      before: beforeItem
        ? { restockable: beforeItem.restockable, condition: beforeItem.condition }
        : null,
      after: {
        restockable: updated.restockable,
        condition: updated.condition,
      },
    });
  }

  const before = { ...existing };
  const ret = await storeDb.return.update({
    where: { id: returnId },
    data: {
      inspection: inspectionNotes || null,
      status: 'INSPECTED',
    },
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

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.return.inspect',
    entityType: 'Return',
    entityId: returnId,
    before: {
      status: before.status,
      inspection: before.inspection,
      items: beforeItems.map((i: any) => ({
        id: i.id,
        restockable: i.restockable,
        condition: i.condition,
      })),
    },
    after: {
      status: ret.status,
      inspection: ret.inspection,
      items: (ret.items as any[]).map((i: any) => ({
        id: i.id,
        restockable: i.restockable,
        condition: i.condition,
      })),
    },
  });

  return serialize(ret);
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

  const existing = await storeDb.return.findUnique({
    where: { id: returnId },
    include: {
      items: {
        include: {
          orderItem: {
            select: {
              id: true,
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

  // State-machine: must be INSPECTED (or already RESOLVED for idempotent
  // re-resolve — but only with the same resolution). For T2-DEEP, refuse
  // re-resolve to keep the flow simple.
  if (existing.status === 'REQUESTED' || existing.status === 'APPROVED') {
    throw new ReturnsServiceError(
      400,
      'ابتدا مرجوعی را کارشناسی کنید (status = INSPECTED)',
    );
  }
  if (existing.status === 'RESOLVED') {
    throw new ReturnsServiceError(
      400,
      'مرجوعی قبلاً حل‌وفصل شده است',
    );
  }
  if (existing.status === 'REJECTED') {
    throw new ReturnsServiceError(
      400,
      'مرجوعی رد شده است و قابل حل‌وفصل نیست',
    );
  }
  // status === 'INSPECTED' → proceed.

  // For REFUND: compute refundAmountIrr from restockable items.
  let refundAmountIrr = 0;
  let walletTxnId: string | null = null;
  if (resolution === 'REFUND') {
    for (const item of existing.items as any[]) {
      if (!item.restockable) continue;
      const oi = item.orderItem;
      if (!oi || oi.quantity <= 0) continue;
      // Proportional refund: lineTotal × (returnedQty / orderedQty).
      // lineTotalIrr already represents the FULL line total for the
      // ordered quantity, so we scale by the returned fraction.
      const fraction = item.quantity / oi.quantity;
      const lineRefund = (oi.lineTotalIrr ?? 0) * fraction;
      refundAmountIrr += lineRefund;
    }
    refundAmountIrr = Math.round(refundAmountIrr * 100) / 100;

    // Create the wallet transaction + adjust the customer's balance.
    // We do this AFTER updating the Return so the audit trail records
    // both the resolution and the refund side-effect.
    const customerId = existing.order?.customerId;
    if (customerId && refundAmountIrr > 0) {
      const txn = await storeDb.walletTransaction.create({
        data: {
          customerId,
          amount: refundAmountIrr,
          type: 'CREDIT',
          description: `بازگشت وجه مرجوعی ${returnId} — سفارش ${existing.order?.orderNumber ?? ''}`,
        },
      });
      walletTxnId = txn.id;
      const beforeCustomer = await storeDb.customer.findUnique({
        where: { id: customerId },
        select: { walletBalanceIrr: true },
      });
      const afterCustomer = await storeDb.customer.update({
        where: { id: customerId },
        data: { walletBalanceIrr: { increment: refundAmountIrr } },
        select: { id: true, walletBalanceIrr: true },
      });
      // Side-effect audit: Customer.walletBalanceIrr changed by refund.
      await logAudit({
        actorId: userId ?? null,
        actorType: 'ADMIN',
        action: 'store.return.resolve',
        entityType: 'Customer',
        entityId: customerId,
        before: {
          walletBalanceIrr: beforeCustomer?.walletBalanceIrr ?? null,
        },
        after: {
          walletBalanceIrr: afterCustomer.walletBalanceIrr,
        },
      });
    }
  }

  const before = { ...existing };
  const ret = await storeDb.return.update({
    where: { id: returnId },
    data: {
      status: 'RESOLVED',
      resolution,
    },
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

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.return.resolve',
    entityType: 'Return',
    entityId: returnId,
    before: {
      status: before.status,
      resolution: before.resolution,
    },
    after: {
      status: ret.status,
      resolution: ret.resolution,
      refundAmountIrr: resolution === 'REFUND' ? refundAmountIrr : null,
      walletTxnId,
    },
  });

  // If we created a wallet transaction, audit it as a side-effect
  // (mirrors the payments/[id] order.update side-effect pattern).
  if (walletTxnId) {
    await logAudit({
      actorId: userId ?? null,
      actorType: 'ADMIN',
      action: 'store.return.resolve',
      entityType: 'WalletTransaction',
      entityId: walletTxnId,
      after: {
        returnId,
        customerId: existing.order?.customerId ?? null,
        amount: refundAmountIrr,
        type: 'CREDIT',
      },
    });
  }

  return serialize({
    ...ret,
    refundAmountIrr: resolution === 'REFUND' ? refundAmountIrr : null,
    walletTxnId,
  });
}
