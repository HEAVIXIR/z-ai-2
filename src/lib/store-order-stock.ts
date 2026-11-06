import type { Prisma } from "@/lib/generated/store-client";

export class OrderStockConflictError extends Error {
  constructor() {
    super("موجودی قطعه در همین لحظه تغییر کرده یا کافی نیست");
    this.name = "OrderStockConflictError";
  }
}

/**
 * Decrement a part's stock only while enough units remain.
 *
 * Must be called with the transaction that creates the order and its items,
 * so a stock conflict rolls the entire checkout back. The conditional update
 * is the concurrency guard; the earlier UI/read-time stock check is only a
 * user-friendly preflight and is not authoritative.
 */
export async function decrementOrderStock(
  tx: Prisma.TransactionClient,
  partId: string,
  quantity: number,
): Promise<void> {
  if (!partId || !Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error("مقدار کاهش موجودی نامعتبر است");
  }

  const result = await tx.part.updateMany({
    where: {
      id: partId,
      stock: { gte: quantity },
    },
    data: {
      stock: { decrement: quantity },
      soldCount: { increment: quantity },
    },
  });

  if (result.count !== 1) {
    throw new OrderStockConflictError();
  }
}
