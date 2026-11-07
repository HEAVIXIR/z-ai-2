import type { Prisma } from "@/lib/generated/store-client";
import { enqueueAuditOutbox } from "@/lib/store-audit-outbox";

export class OrderStockConflictError extends Error {
  constructor(message = "موجودی قطعه در همین لحظه تغییر کرده یا کافی نیست") {
    super(message);
    this.name = "OrderStockConflictError";
  }
}

/**
 * Consume stock inside the same transaction that creates the order.
 *
 * If warehouse balances exist, they are authoritative for available stock:
 * consume only from active warehouses and never consume reserved units.
 * Legacy parts without warehouse balances continue to use Part.stock only.
 * All stock ledger and audit-outbox rows are committed atomically.
 */
export async function decrementOrderStock(
  tx: Prisma.TransactionClient,
  partId: string,
  quantity: number,
  orderId: string,
  userId?: string | null,
): Promise<void> {
  if (!partId || !orderId || !Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error("مقدار کاهش موجودی نامعتبر است");
  }

  // Serialize checkout against opening-balance allocation and every
  // canonical inventory writer before observing the Part or warehouse rows.
  const lockedParts = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Part" WHERE id = ${partId} FOR UPDATE
  `;
  if (lockedParts.length !== 1) {
    throw new OrderStockConflictError("قطعه دیگر در دسترس نیست");
  }
  const part = await tx.part.findUnique({
    where: { id: partId },
    select: { id: true, stock: true },
  });
  if (!part) {
    throw new OrderStockConflictError("قطعه دیگر در دسترس نیست");
  }

  const balances = await tx.inventoryBalance.findMany({
    where: { partId },
    include: { warehouse: { select: { active: true } } },
    orderBy: [{ warehouseId: "asc" }, { id: "asc" }],
  });

  const allocations: Array<{ warehouseId: string | null; quantity: number }> = [];

  if (balances.length > 0) {
    const totalWarehouseQuantity = balances.reduce((sum, balance) => sum + balance.quantity, 0);
    if (totalWarehouseQuantity !== part.stock) {
      throw new OrderStockConflictError("موجودی کل و موجودی انبارها همگام نیست؛ ابتدا مغایرت‌گیری انجام شود");
    }

    const availableTotal = balances.reduce((sum, balance) => {
      if (!balance.warehouse.active || balance.reserved > balance.quantity) return sum;
      return sum + (balance.quantity - balance.reserved);
    }, 0);
    if (availableTotal < quantity) {
      throw new OrderStockConflictError("موجودی قابل فروش در انبارهای فعال کافی نیست");
    }

    let remaining = quantity;
    for (const balance of balances) {
      if (remaining === 0) break;
      if (!balance.warehouse.active || balance.reserved > balance.quantity) continue;

      const available = balance.quantity - balance.reserved;
      const take = Math.min(available, remaining);
      if (take <= 0) continue;

      allocations.push({ warehouseId: balance.warehouseId, quantity: take });
      remaining -= take;
    }

    if (remaining !== 0) {
      throw new OrderStockConflictError("تخصیص موجودی انبار کامل نشد");
    }
  } else {
    // Backward-compatible path for parts that have not been assigned to a
    // warehouse yet. The Part.stock compare-and-swap still prevents oversell.
    allocations.push({ warehouseId: null, quantity });
  }

  if (part.stock < quantity) {
    throw new OrderStockConflictError();
  }

  // Global inventory lock order: claim the Part snapshot first, then
  // claim its warehouse balances in deterministic warehouseId order.
  const partChanged = await tx.part.updateMany({
    where: { id: partId, stock: part.stock },
    data: {
      stock: { decrement: quantity },
      soldCount: { increment: quantity },
    },
  });
  if (partChanged.count !== 1) {
    throw new OrderStockConflictError();
  }

  const updatedPart = await tx.part.findUnique({
    where: { id: partId },
    select: { stock: true },
  });
  if (!updatedPart) {
    throw new OrderStockConflictError("قطعه پس از ثبت سفارش یافت نشد");
  }

  const stockBeforeThisOrder = updatedPart.stock + quantity;
  let consumedSoFar = 0;
  for (const allocation of allocations) {
    if (allocation.warehouseId) {
      const sourceBalance = balances.find((balance) => balance.warehouseId === allocation.warehouseId);
      if (!sourceBalance) {
        throw new OrderStockConflictError("ردیف موجودی انبار برای تخصیص سفارش یافت نشد");
      }
      const changed = await tx.inventoryBalance.updateMany({
        where: {
          id: sourceBalance.id,
          quantity: sourceBalance.quantity,
          reserved: sourceBalance.reserved,
        },
        data: { quantity: { decrement: allocation.quantity } },
      });
      if (changed.count !== 1) {
        throw new OrderStockConflictError("موجودی انبار هم‌زمان تغییر کرده است؛ سبد خرید را به‌روزرسانی کنید");
      }
    }
    consumedSoFar += allocation.quantity;
    const movement = await tx.stockMovement.create({
      data: {
        partId,
        type: "SALE",
        quantity: -allocation.quantity,
        balanceAfter: stockBeforeThisOrder - consumedSoFar,
        reason: "Store checkout",
        reference: orderId,
        createdBy: userId ?? null,
        warehouseId: allocation.warehouseId,
      },
    });

    await enqueueAuditOutbox(tx, {
      actorId: userId ?? null,
      actorType: "USER",
      action: "store.inventory.checkout",
      entityType: "StockMovement",
      entityId: movement.id,
      after: {
        orderId,
        partId,
        warehouseId: allocation.warehouseId,
        quantity: -allocation.quantity,
        balanceAfter: updatedPart.stock,
      },
    });
  }

  await enqueueAuditOutbox(tx, {
    actorId: userId ?? null,
    actorType: "USER",
    action: "store.part.stock.checkout",
    entityType: "Part",
    entityId: partId,
    before: { stock: part.stock },
    after: { stock: updatedPart.stock },
    reason: orderId,
  });
}
