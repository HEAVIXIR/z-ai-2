/**
 * HEAVIX — Commerce Service Layer (PHASE-P8-TRANSACTION)
 * ------------------------------------------------------------
 * Extracted business logic for the COMMERCE domain — the deep order
 * + payment + refund workflow that backs the admin store dashboard
 * and the store checkout pipeline.
 *
 * Responsibilities:
 *   - createOrder({ items, customerId, paymentMethod, userId })
 *       Validate items + resolve parts (snapshot prices) + compute
 *       totals (subtotal + shipping + currency conversion) + persist
 *       Order + OrderItems + decrement stock + bump soldCount +
 *       update customer stats. Audited as `store.order.create`.
 *       Mirrors the public POST /api/store/orders flow but is admin-
 *       scoped (the customerId is supplied directly, not via phone).
 *
 *   - processPayment({ orderId, amount, method, userId })
 *       Create a Payment row (status=APPROVED by default for admin
 *       manual entry; PENDING for gateway flows). Auto-flips the
 *       Order.paymentStatus toward PAID when the cumulative approved
 *       amount covers the order total. Audited as
 *       `store.payment.process`.
 *
 *   - refundPayment(paymentId, amount, reason, userId)
 *       Create a NEW Payment row (status=REFUNDED) linked to the
 *       same order + customer; records the originating paymentId in
 *       the note. Recomputes Order.paymentStatus (PARTIAL/REFUNDED).
 *       Audited as `store.payment.refund`.
 *
 *   - getOrderDetail(orderId)
 *       Return order with items + payments + customer + mechanic +
 *       shipment (the rich read behind the admin order detail page).
 *
 * Audit conventions (mirror store-procurement-service.ts):
 *   - Action keys: `store.order.create` | `store.payment.process`
 *     | `store.payment.refund`.
 *   - entityType: `Order` | `Payment`.
 *   - actorType: `ADMIN` for create/process/refund.
 *   - Update-style audits include both `before` and `after`.
 *   - All audits are best-effort (a thrown audit helper NEVER fails
 *     the service mutation).
 *
 * All DB calls go through storeDb (separate SQLite store schema).
 */

import { storeDb } from "@/lib/store-db";
import { logAudit } from "@/lib/audit";
import { getEffectiveRate, usdToIrr } from "@/lib/store-currency";
import { enqueueAuditOutbox } from "@/lib/store-audit-outbox";

// ── Service error (maps to HTTP status in route handler) ──
export class CommerceServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CommerceServiceError';
  }
}

/**
 * Cancel an unpaid, not-yet-dispatched store order and restore the exact
 * checkout stock allocations. All inventory, coupon, order-state and audit
 * writes are committed in one Serializable store transaction.
 *
 * Paid/pending-payment, shipped, returned, or legacy orders without a
 * complete SALE movement ledger fail closed and require their dedicated
 * payment/returns reconciliation flow.
 */
export async function cancelStoreOrder(orderId: string, actorId: string): Promise<any> {
  try {
    return await storeDb.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: { select: { id: true, partId: true, quantity: true } },
          payments: { select: { id: true, status: true } },
          shipment: { select: { status: true } },
          returns: { select: { id: true, status: true } },
        },
      });
      if (!order) throw new CommerceServiceError(404, "سفارش یافت نشد");
      if (order.status === "CANCELLED") throw new CommerceServiceError(409, "سفارش قبلاً لغو شده است");
      if (!["PENDING", "CONFIRMED", "PROCESSING"].includes(order.status)) {
        throw new CommerceServiceError(409, "لغو فقط پیش از ارسال سفارش مجاز است");
      }
      if (order.paymentStatus !== "UNPAID" || order.payments.some((p: any) => p.status !== "REJECTED")) {
        throw new CommerceServiceError(409, "سفارش دارای پرداخت یا فیش در جریان است؛ ابتدا وضعیت مالی را تعیین تکلیف کنید");
      }
      if (order.shipment && order.shipment.status !== "PENDING") {
        throw new CommerceServiceError(409, "برای سفارش ارسال‌شده یا در حال ارسال، از گردش مرجوعی استفاده کنید");
      }
      if (order.returns.length > 0) {
        throw new CommerceServiceError(409, "برای سفارش دارای پرونده مرجوعی، لغو مستقیم مجاز نیست");
      }

      const movements = await tx.stockMovement.findMany({
        where: { reference: orderId, type: "SALE" },
        orderBy: [{ partId: "asc" }, { warehouseId: "asc" }, { id: "asc" }],
      });
      const expected = new Map<string, number>();
      for (const item of order.items) {
        expected.set(item.partId, (expected.get(item.partId) ?? 0) + item.quantity);
      }
      const consumed = new Map<string, number>();
      for (const movement of movements) {
        if (!Number.isSafeInteger(movement.quantity) || movement.quantity >= 0) {
          throw new CommerceServiceError(409, "دفتر گردش خروج موجودی سفارش ناسازگار است");
        }
        consumed.set(movement.partId, (consumed.get(movement.partId) ?? 0) + Math.abs(movement.quantity));
      }
      if (expected.size !== consumed.size || [...expected].some(([partId, qty]) => consumed.get(partId) !== qty)) {
        throw new CommerceServiceError(409, "گردش خروج موجودی سفارش ناقص یا ناسازگار است؛ لغو خودکار متوقف شد");
      }

      const grouped = new Map<string, { partId: string; warehouseId: string | null; quantity: number }>();
      for (const movement of movements) {
        const key = movement.partId + "::" + (movement.warehouseId ?? "LEGACY");
        const row = grouped.get(key) ?? { partId: movement.partId, warehouseId: movement.warehouseId, quantity: 0 };
        row.quantity += Math.abs(movement.quantity);
        grouped.set(key, row);
      }

      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: order.status, paymentStatus: "UNPAID" },
        data: { status: "CANCELLED" },
      });
      if (claimed.count !== 1) throw new CommerceServiceError(409, "وضعیت سفارش هم‌زمان تغییر کرده است");

      for (const allocation of grouped.values()) {
        const part = await tx.part.findUnique({
          where: { id: allocation.partId },
          select: { id: true, stock: true, soldCount: true },
        });
        if (!part || part.soldCount < allocation.quantity) {
          throw new CommerceServiceError(409, "موجودی یا شمارنده فروش قطعه با دفتر سفارش سازگار نیست");
        }

        if (allocation.warehouseId) {
          const balances = await tx.inventoryBalance.findMany({
            where: { partId: allocation.partId },
            select: { id: true, warehouseId: true, quantity: true, reserved: true },
          });
          const total = balances.reduce((sum: number, row: any) => sum + row.quantity, 0);
          if (total !== part.stock) {
            throw new CommerceServiceError(409, "موجودی کل و انبارها همگام نیست؛ لغو متوقف شد");
          }
          const balance = balances.find((row: any) => row.warehouseId === allocation.warehouseId);
          if (!balance || balance.reserved > balance.quantity) {
            throw new CommerceServiceError(409, "ردیف موجودی انبار مبدأ قابل بازیابی نیست");
          }
          const changedBalance = await tx.inventoryBalance.updateMany({
            where: { id: balance.id, quantity: balance.quantity, reserved: balance.reserved },
            data: { quantity: { increment: allocation.quantity } },
          });
          if (changedBalance.count !== 1) throw new CommerceServiceError(409, "موجودی انبار هم‌زمان تغییر کرده است");
        } else {
          const existingBalances = await tx.inventoryBalance.count({ where: { partId: allocation.partId } });
          if (existingBalances > 0) {
            throw new CommerceServiceError(409, "ردیف خروج قدیمی با موجودی انبار فعلی قابل تطبیق نیست");
          }
        }

        const changedPart = await tx.part.updateMany({
          where: { id: allocation.partId, stock: part.stock, soldCount: { gte: allocation.quantity } },
          data: {
            stock: { increment: allocation.quantity },
            soldCount: { decrement: allocation.quantity },
          },
        });
        if (changedPart.count !== 1) throw new CommerceServiceError(409, "موجودی قطعه هم‌زمان تغییر کرده است");

        const movement = await tx.stockMovement.create({
          data: {
            partId: allocation.partId,
            warehouseId: allocation.warehouseId,
            type: "ADJUSTMENT",
            quantity: allocation.quantity,
            balanceAfter: part.stock + allocation.quantity,
            reason: "Order cancellation — restore original checkout allocation",
            reference: orderId,
            createdBy: actorId,
          },
        });
        await enqueueAuditOutbox(tx, {
          actorId,
          actorType: "ADMIN",
          action: "store.inventory.order_cancel_restore",
          entityType: "StockMovement",
          entityId: movement.id,
          after: { orderId, partId: allocation.partId, warehouseId: allocation.warehouseId, quantity: allocation.quantity, balanceAfter: part.stock + allocation.quantity },
        });
      }

      if (order.couponCode) {
        const couponClaim = await tx.coupon.updateMany({
          where: { code: order.couponCode, usedCount: { gt: 0 } },
          data: { usedCount: { decrement: 1 } },
        });
        if (couponClaim.count !== 1) {
          throw new CommerceServiceError(409, "مصرف کوپن با سفارش همگام نیست؛ لغو متوقف شد");
        }
      }

      const cancelled = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          customer: { select: { id: true, name: true, family: true, phone: true } },
          items: true,
          payments: true,
        },
      });
      if (!cancelled) throw new CommerceServiceError(404, "سفارش پس از لغو یافت نشد");
      await enqueueAuditOutbox(tx, {
        actorId,
        actorType: "ADMIN",
        action: "store.order.cancel",
        entityType: "Order",
        entityId: orderId,
        before: { status: order.status, paymentStatus: order.paymentStatus },
        after: { status: "CANCELLED", restoredAllocations: [...grouped.values()] },
      });
      return cancelled;
    }, { isolationLevel: "Serializable" });
  } catch (error: any) {
    if (error?.code === "P2034") throw new CommerceServiceError(409, "سفارش یا موجودی هم‌زمان تغییر کرده است؛ وضعیت را دوباره بررسی کنید");
    throw error;
  }
}

// ── Order status vocab (mirrors the existing /api/store/orders flow) ──
export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
] as const;
export const PAYMENT_STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'REFUNDED'] as const;
export const PAYMENT_METHODS = ['CARD', 'WALLET', 'CASH', 'GATEWAY'] as const;

// ── Serializer (Floats → strings for JSON transport) ─────
function serializeOrder(o: any) {
  return {
    ...o,
    subtotalUsd: o.subtotalUsd?.toString?.() ?? String(o.subtotalUsd ?? 0),
    shippingUsd: o.shippingUsd?.toString?.() ?? String(o.shippingUsd ?? 0),
    discountIrr: o.discountIrr?.toString?.() ?? String(o.discountIrr ?? 0),
    totalUsd: o.totalUsd?.toString?.() ?? String(o.totalUsd ?? 0),
    totalIrr: o.totalIrr?.toString?.() ?? String(o.totalIrr ?? 0),
    currencyRateAtOrder: o.currencyRateAtOrder?.toString?.() ?? String(o.currencyRateAtOrder ?? 0),
    marginPercentAtOrder: o.marginPercentAtOrder?.toString?.() ?? String(o.marginPercentAtOrder ?? 0),
    createdAt: o.createdAt?.toISOString?.() ?? null,
    updatedAt: o.updatedAt?.toISOString?.() ?? null,
    items: (o.items ?? []).map((it: any) => ({
      ...it,
      unitPriceUsd: it.unitPriceUsd?.toString?.() ?? String(it.unitPriceUsd ?? 0),
      unitPriceIrr: it.unitPriceIrr?.toString?.() ?? String(it.unitPriceIrr ?? 0),
      lineTotalUsd: it.lineTotalUsd?.toString?.() ?? String(it.lineTotalUsd ?? 0),
      lineTotalIrr: it.lineTotalIrr?.toString?.() ?? String(it.lineTotalIrr ?? 0),
    })),
    payments: (o.payments ?? []).map((p: any) => ({
      ...p,
      amountIrr: p.amountIrr?.toString?.() ?? String(p.amountIrr ?? 0),
      amountUsd: p.amountUsd?.toString?.() ?? String(p.amountUsd ?? 0),
      createdAt: p.createdAt?.toISOString?.() ?? null,
      reviewedAt: p.reviewedAt?.toISOString?.() ?? null,
    })),
  };
}

function serializePayment(p: any) {
  return {
    ...p,
    amountIrr: p.amountIrr?.toString?.() ?? String(p.amountIrr ?? 0),
    amountUsd: p.amountUsd?.toString?.() ?? String(p.amountUsd ?? 0),
    createdAt: p.createdAt?.toISOString?.() ?? null,
    updatedAt: p.updatedAt?.toISOString?.() ?? null,
    reviewedAt: p.reviewedAt?.toISOString?.() ?? null,
  };
}

// ── Helper: generate a unique order number (mirrors /api/store/orders) ──
function genOrderNumber(): string {
  const t = Date.now().toString(36).toUpperCase().slice(-6);
  const r = Math.random().toString(36).toUpperCase().slice(2, 5);
  return `HV-${t}${r}`;
}

// ── Helper: compute the Order.paymentStatus given the cumulative
// approved payment amount vs the order total. Pure function so
// processPayment + refundPayment share the same logic.
function computePaymentStatus(
  orderTotalIrr: number,
  approvedPaymentsIrr: number,
  hasRefund: boolean,
): 'UNPAID' | 'PARTIAL' | 'PAID' | 'REFUNDED' {
  if (hasRefund && approvedPaymentsIrr <= 0) return 'REFUNDED';
  if (approvedPaymentsIrr <= 0) return 'UNPAID';
  if (approvedPaymentsIrr >= orderTotalIrr) return hasRefund ? 'REFUNDED' : 'PAID';
  return 'PARTIAL';
}

// ── createOrder ───────────────────────────────────────────
/**
 * Create an Order (admin-scoped). Validates:
 *   - customerId references an existing Customer
 *   - items is a non-empty array of { partId, quantity }
 *   - each part exists + has sufficient stock
 *
 * Computes totals (subtotal + flat $2 shipping + USD→Toman
 * conversion at the effective rate). Snapshots part name + prices
 * on each OrderItem (immune to later Part.priceUsd edits).
 *
 * Side-effects (all inside a $transaction so they're atomic):
 *   - decrement Part.stock + increment Part.soldCount
 *   - bump Customer.totalOrders + totalSpentIrr
 *
 * Audited as `store.order.create`.
 *
 * @throws CommerceServiceError on validation/lookup failure (400/404).
 */
export async function createOrder(params: {
  items: Array<{ partId: string; quantity: number }>;
  customerId: string;
  paymentMethod?: string | null;
  userId?: string | null;
  shippingAddress?: string | null;
  notes?: string | null;
  mechanicId?: string | null;
  couponCode?: string | null;
}): Promise<any> {
  const {
    items,
    customerId,
    paymentMethod = null,
    userId = null,
    shippingAddress = null,
    notes = null,
    mechanicId = null,
    couponCode = null,
  } = params;

  if (!customerId) {
    throw new CommerceServiceError(400, 'customerId الزامی است');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new CommerceServiceError(400, 'حداقل یک آیتم سفارش الزامی است');
  }

  // Normalize + validate item shape.
  const normalizedItems: { partId: string; quantity: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || !it.partId) {
      throw new CommerceServiceError(400, `آیتم ${i + 1}: partId الزامی است`);
    }
    const qty = Number(it.quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new CommerceServiceError(
        400,
        `آیتم ${i + 1}: تعداد باید عدد صحیح مثبت باشد`,
      );
    }
    normalizedItems.push({ partId: String(it.partId), quantity: qty });
  }

  // Verify the customer exists.
  const customer = await storeDb.customer.findUnique({
    where: { id: customerId },
    select: { id: true, phone: true, name: true, family: true },
  });
  if (!customer) {
    throw new CommerceServiceError(404, 'مشتری یافت نشد');
  }

  // Verify the mechanic (optional).
  if (mechanicId) {
    const m = await storeDb.mechanic.findUnique({
      where: { id: mechanicId },
      select: { id: true },
    });
    if (!m) {
      throw new CommerceServiceError(404, 'مکانیک یافت نشد');
    }
  }

  // Resolve parts (active only) — snapshot prices.
  const partIds = normalizedItems.map((i) => i.partId);
  const parts = await storeDb.part.findMany({
    where: { id: { in: partIds }, active: true },
  });
  if (parts.length !== partIds.length) {
    throw new CommerceServiceError(
      400,
      'برخی قطعات یافت نشد یا غیرفعال هستند',
    );
  }
  // Stock check.
  for (const it of normalizedItems) {
    const p: any = parts.find((pp: any) => pp.id === it.partId);
    if (!p) continue;
    if ((p.stock ?? 0) < it.quantity) {
      throw new CommerceServiceError(
        400,
        `موجودی قطعه «${p.nameFa || p.name}» کافی نیست`,
      );
    }
  }

  // Effective rate + shipping flat fee.
  const eff = await getEffectiveRate();
  const shippingUsd = 2;

  let subtotalUsd = 0;
  let subtotalIrr = 0;
  const orderItemsData: any[] = [];
  for (const it of normalizedItems) {
    const part: any = parts.find((p: any) => p.id === it.partId);
    if (!part) continue;
    const unitPriceUsd = part.priceUsd;
    const unitPriceIrr = usdToIrr(unitPriceUsd, eff);
    const lineTotalUsd = unitPriceUsd * it.quantity;
    const lineTotalIrr = unitPriceIrr * it.quantity;
    subtotalUsd += lineTotalUsd;
    subtotalIrr += lineTotalIrr;
    orderItemsData.push({
      partId: part.id,
      partNameSnapshot: part.nameFa || part.name,
      quantity: it.quantity,
      unitPriceUsd,
      unitPriceIrr,
      lineTotalUsd,
      lineTotalIrr,
    });
  }

  // Coupon validation (best-effort — mirrors /api/store/orders).
  let discountIrr = 0;
  let appliedCouponCode: string | null = null;
  if (couponCode) {
    const coupon = await storeDb.coupon.findUnique({
      where: { code: couponCode.toUpperCase() },
    });
    if (coupon && coupon.active) {
      const expired = coupon.expiresAt && new Date(coupon.expiresAt) < new Date();
      const limitReached = coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit;
      const meetsMin = subtotalIrr >= (coupon.minOrderIrr || 0);
      if (!expired && !limitReached && meetsMin) {
        appliedCouponCode = coupon.code;
        discountIrr =
          coupon.type === 'PERCENT'
            ? Math.round((subtotalIrr * coupon.value) / 100)
            : Math.round(coupon.value);
        discountIrr = Math.min(discountIrr, subtotalIrr);
      }
    }
  }

  const totalUsd = subtotalUsd + shippingUsd;
  const totalIrr = Math.max(
    0,
    subtotalIrr +
      Math.round(shippingUsd * eff.rate * (1 + (eff.marginPercent || 0) / 100)) -
      discountIrr,
  );

  // Persist the order + side-effects in a transaction.
  const orderNumber = genOrderNumber();
  const order = await storeDb.$transaction(async (tx: any) => {
    const o = await tx.order.create({
      data: {
        orderNumber,
        customerId: customer.id,
        userId: userId ?? null,
        mechanicId: mechanicId || null,
        status: 'PENDING',
        subtotalUsd,
        shippingUsd,
        discountIrr,
        totalUsd,
        totalIrr,
        currencyRateAtOrder: eff.rate,
        marginPercentAtOrder: eff.marginPercent,
        couponCode: appliedCouponCode,
        shippingAddress: shippingAddress ?? null,
        notes: notes ?? null,
        paymentStatus: 'UNPAID',
        items: { create: orderItemsData },
      },
      include: {
        items: true,
      },
    });

    // Decrement stock + bump soldCount.
    for (const it of orderItemsData) {
      await tx.part.update({
        where: { id: it.partId },
        data: {
          stock: { decrement: it.quantity },
          soldCount: { increment: it.quantity },
        },
      });
    }

    // Bump coupon usage.
    if (appliedCouponCode) {
      await tx.coupon.update({
        where: { code: appliedCouponCode },
        data: { usedCount: { increment: 1 } },
      });
    }

    // Update customer stats.
    await tx.customer.update({
      where: { id: customer.id },
      data: {
        totalOrders: { increment: 1 },
        totalSpentIrr: { increment: totalIrr },
      },
    });

    return o;
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.order.create',
    entityType: 'Order',
    entityId: order.id,
    after: {
      orderNumber,
      customerId: customer.id,
      paymentMethod,
      status: 'PENDING',
      subtotalUsd,
      shippingUsd,
      discountIrr,
      totalUsd,
      totalIrr,
      itemCount: orderItemsData.length,
    },
    reason: `ایجاد سفارش ${orderNumber} برای ${customer.name} ${customer.family}`,
  });

  return serializeOrder(order);
}

// ── processPayment ────────────────────────────────────────
/**
 * Create a Payment for an Order. Validates the order exists + has
 * outstanding balance (no over-payment). Auto-flips the Order
 * .paymentStatus based on the cumulative approved amount:
 *   0 < approved < total  → PARTIAL
 *   approved >= total     → PAID
 *
 * For admin manual entry, status defaults to APPROVED. For gateway
 * flows (method=GATEWAY) the status is PENDING until the callback
 * verifies; the caller can override via `status`.
 *
 * Audited as `store.payment.process`.
 *
 * @throws CommerceServiceError on lookup (404) / validation (400).
 */
export async function processPayment(params: {
  orderId: string;
  amount: number; // IRR
  method: string;
  userId?: string | null;
  status?: string | null; // override (default: APPROVED)
  referenceCode?: string | null;
  receiptImageUrl?: string | null;
  payerName?: string | null;
  payerCard?: string | null;
  note?: string | null;
  gateway?: string | null;
  authority?: string | null;
  refId?: string | null;
  gatewayUrl?: string | null;
}): Promise<any> {
  const {
    orderId,
    amount,
    method,
    userId = null,
    status = 'APPROVED',
    referenceCode = null,
    receiptImageUrl = null,
    payerName = null,
    payerCard = null,
    note = null,
    gateway = null,
    authority = null,
    refId = null,
    gatewayUrl = null,
  } = params;

  if (!orderId) {
    throw new CommerceServiceError(400, 'orderId الزامی است');
  }
  const amtIrr = Number(amount);
  if (!Number.isFinite(amtIrr) || amtIrr <= 0) {
    throw new CommerceServiceError(400, 'مبلغ پرداخت نامعتبر است');
  }
  if (!PAYMENT_METHODS.includes(method as any)) {
    throw new CommerceServiceError(
      400,
      `روش پرداخت باید یکی از ${PAYMENT_METHODS.join('، ')} باشد`,
    );
  }
  const finalStatus = status || 'APPROVED';

  // Look up the order + existing approved payments.
  const order = await storeDb.order.findUnique({
    where: { id: orderId },
    include: {
      payments: { where: { status: 'APPROVED' } },
      customer: { select: { id: true, phone: true, name: true, family: true } },
    },
  });
  if (!order) {
    throw new CommerceServiceError(404, 'سفارش یافت نشد');
  }

  const approvedSoFar = order.payments.reduce(
    (s: number, p: any) => s + Number(p.amountIrr ?? 0),
    0,
  );
  const remaining = order.totalIrr - approvedSoFar;
  if (amtIrr > remaining + 1) {
    // 1 IRR tolerance for rounding
    throw new CommerceServiceError(
      400,
      `مبلغ پرداخت (${amtIrr}) بیشتر از مانده‌ی سفارش (${remaining}) است`,
    );
  }

  // Compute USD equivalent at the order's snapshot rate (so the Payment
  // row records a price-stable USD amount).
  const amountUsd =
    order.currencyRateAtOrder > 0
      ? Number((amtIrr / (order.currencyRateAtOrder * (1 + (order.marginPercentAtOrder || 0) / 100))).toFixed(2))
      : 0;

  const payment = await storeDb.payment.create({
    data: {
      orderId: order.id,
      customerId: order.customerId,
      amountIrr: amtIrr,
      amountUsd,
      method,
      status: finalStatus,
      referenceCode,
      receiptImageUrl,
      payerName: payerName || `${order.customer?.name ?? ''} ${order.customer?.family ?? ''}`.trim() || null,
      payerCard,
      note,
      gateway,
      authority,
      refId,
      gatewayUrl,
      reviewedById: userId ?? null,
      reviewedAt: finalStatus === 'APPROVED' ? new Date() : null,
    },
  });

  // Re-compute the order paymentStatus based on all approved payments
  // INCLUDING the new one (if approved).
  const allPayments = await storeDb.payment.findMany({
    where: { orderId: order.id, status: 'APPROVED' },
    select: { amountIrr: true, status: true },
  });
  const approvedTotal = allPayments.reduce(
    (s: number, p: any) => s + Number(p.amountIrr ?? 0),
    0,
  );
  const newPayStatus = computePaymentStatus(
    Number(order.totalIrr),
    approvedTotal,
    false,
  );
  if (newPayStatus !== order.paymentStatus) {
    await storeDb.order.update({
      where: { id: order.id },
      data: { paymentStatus: newPayStatus },
    });
  }

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.payment.process',
    entityType: 'Payment',
    entityId: payment.id,
    after: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      amountIrr: amtIrr,
      amountUsd,
      method,
      status: finalStatus,
      referenceCode,
      newOrderPaymentStatus: newPayStatus,
    },
    reason: `ثبت پرداخت ${amtIrr} تومان برای سفارش ${order.orderNumber}`,
  });

  return serializePayment(payment);
}

// ── refundPayment ─────────────────────────────────────────
/**
 * Create a refund Payment row (status=REFUNDED) linked to the same
 * order + customer. Records the originating paymentId in the note +
 * the reason. Recomputes the Order.paymentStatus (PARTIAL/REFUNDED).
 *
 * Audited as `store.payment.refund`.
 *
 * @throws CommerceServiceError on lookup (404) / validation (400).
 */
export async function refundPayment(
  paymentId: string,
  amount: number,
  reason?: string | null,
  userId?: string | null,
): Promise<any> {
  if (!paymentId) throw new CommerceServiceError(400, 'paymentId الزامی است');
  const amtIrr = Number(amount);
  if (!Number.isSafeInteger(amtIrr) || amtIrr <= 0) {
    throw new CommerceServiceError(400, 'مبلغ بازگردانی باید عدد صحیح مثبت و امن به ریال باشد');
  }

  try {
    return await storeDb.$transaction(async (tx) => {
      const original = await tx.payment.findUnique({
        where: { id: paymentId },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              totalIrr: true,
              paymentStatus: true,
              customerId: true,
              currencyRateAtOrder: true,
              marginPercentAtOrder: true,
            },
          },
        },
      });
      if (!original) throw new CommerceServiceError(404, 'پرداخت یافت نشد');
      if (original.status !== 'APPROVED') {
        throw new CommerceServiceError(409, `پرداخت در وضعیت ${original.status} قرار دارد و قابل بازگردانی نیست`);
      }
      // No provider-side refund adapter is configured here. Never mark a
      // gateway payment REFUNDED locally while the external provider still
      // holds the funds.
      if (original.method === 'GATEWAY' || original.gateway) {
        throw new CommerceServiceError(409, 'بازپرداخت درگاه تا اتصال و تأیید API بازپرداخت ارائه‌دهنده غیرفعال است');
      }
      if (!Number.isSafeInteger(Number(original.amountIrr)) || Number(original.amountIrr) <= 0) {
        throw new CommerceServiceError(409, 'مبلغ پرداخت اصلی در دفتر مالی معتبر نیست');
      }

      // Touch the source payment with a compare-and-swap so concurrent
      // partial refunds serialize on the same original ledger row.
      const claimed = await tx.payment.updateMany({
        where: { id: paymentId, status: 'APPROVED', updatedAt: original.updatedAt },
        data: { updatedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new CommerceServiceError(409, 'پرداخت هم‌زمان تغییر کرده است؛ دوباره تلاش کنید');
      }

      const priorRefunds = await tx.payment.findMany({
        where: {
          orderId: original.orderId,
          status: 'REFUNDED',
          OR: [
            { note: { startsWith: `refund-of-payment:${paymentId};` } },
            { note: { startsWith: `refund of ${paymentId}` } },
          ],
        },
        select: { amountIrr: true },
      });
      const alreadyRefunded = priorRefunds.reduce((sum: number, row: any) => sum + Number(row.amountIrr ?? 0), 0);
      if (!Number.isSafeInteger(alreadyRefunded) || alreadyRefunded + amtIrr > Number(original.amountIrr)) {
        throw new CommerceServiceError(409, 'مجموع بازپرداخت‌های قبلی و جدید از مبلغ پرداخت اصلی بیشتر می‌شود');
      }

      const amountUsd = original.order.currencyRateAtOrder > 0
        ? Number((amtIrr / (original.order.currencyRateAtOrder *
            (1 + (original.order.marginPercentAtOrder || 0) / 100))).toFixed(2))
        : 0;
      const refundPaymentRow = await tx.payment.create({
        data: {
          orderId: original.orderId,
          customerId: original.customerId,
          amountIrr: amtIrr,
          amountUsd,
          method: original.method,
          status: 'REFUNDED',
          referenceCode: original.referenceCode,
          receiptImageUrl: null,
          payerName: original.payerName,
          payerCard: original.payerCard,
          note: `refund-of-payment:${paymentId}; ${reason ? reason.slice(0, 400) : 'refund'}`,
          gateway: null,
          authority: null,
          refId: null,
          gatewayUrl: null,
          reviewedById: userId ?? null,
          reviewedAt: new Date(),
        },
      });

      const allPayments = await tx.payment.findMany({
        where: { orderId: original.orderId },
        select: { amountIrr: true, status: true },
      });
      const approvedTotal = allPayments
        .filter((p: any) => p.status === 'APPROVED')
        .reduce((sum: number, p: any) => sum + Number(p.amountIrr ?? 0), 0);
      const refundedTotal = allPayments
        .filter((p: any) => p.status === 'REFUNDED')
        .reduce((sum: number, p: any) => sum + Number(p.amountIrr ?? 0), 0);
      const netApproved = approvedTotal - refundedTotal;
      const newPayStatus = computePaymentStatus(Number(original.order.totalIrr), netApproved, refundedTotal > 0);
      await tx.order.update({
        where: { id: original.orderId },
        data: { paymentStatus: newPayStatus },
      });

      await enqueueAuditOutbox(tx, {
        actorId: userId ?? null,
        actorType: 'ADMIN',
        action: 'store.payment.refund',
        entityType: 'Payment',
        entityId: refundPaymentRow.id,
        before: {
          originalPaymentId: paymentId,
          originalAmount: Number(original.amountIrr),
          alreadyRefundedIrr: alreadyRefunded,
          originalStatus: original.status,
        },
        after: {
          orderId: original.orderId,
          orderNumber: original.order.orderNumber,
          refundAmountIrr: amtIrr,
          refundAmountUsd: amountUsd,
          reason: reason?.slice(0, 400) ?? null,
          newOrderPaymentStatus: newPayStatus,
        },
      });
      return serializePayment(refundPaymentRow);
    }, { isolationLevel: 'Serializable' });
  } catch (error: any) {
    if (error?.code === 'P2034') {
      throw new CommerceServiceError(409, 'پرداخت هم‌زمان بازپرداخت شده است؛ وضعیت دفتر مالی را دوباره بررسی کنید');
    }
    throw error;
  }
}

// ── getOrderDetail ────────────────────────────────────────
/**
 * Return the full Order detail with items + payments + customer +
 * mechanic + shipment context. Backs the admin order detail page.
 *
 * @throws CommerceServiceError(404) when the order doesn't exist.
 */
export async function getOrderDetail(orderId: string): Promise<any> {
  if (!orderId) {
    throw new CommerceServiceError(400, 'orderId الزامی است');
  }
  const order = await storeDb.order.findUnique({
    where: { id: orderId },
    include: {
      customer: {
        select: { id: true, name: true, family: true, phone: true, address: true },
      },
      mechanic: {
        select: { id: true, name: true, family: true, shopName: true, phone: true },
      },
      items: {
        include: {
          part: { select: { id: true, name: true, nameFa: true, sku: true } },
        },
      },
      payments: { orderBy: { createdAt: 'desc' } },
      shipment: true,
    },
  });
  if (!order) {
    throw new CommerceServiceError(404, 'سفارش یافت نشد');
  }
  return serializeOrder(order);
}
