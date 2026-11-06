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
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
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

      const changed = await tx.inventoryBalance.updateMany({
        where: {
          id: balance.id,
          quantity: balance.quantity,
          reserved: balance.reserved,
        },
        data: { quantity: { decrement: take } },
      });
      if (changed.count !== 1) {
        throw new OrderStockConflictError("موجودی انبار هم‌زمان تغییر کرده است؛ سبد خرید را به‌روزرسانی کنید");
      }

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

  const partChanged = await tx.part.updateMany({
    where: { id: partId, stock: { gte: quantity } },
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

  for (const allocation of allocations) {
    const movement = await tx.stockMovement.create({
      data: {
        partId,
        type: "SALE",
        quantity: -allocation.quantity,
        balanceAfter: updatedPart.stock,
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
