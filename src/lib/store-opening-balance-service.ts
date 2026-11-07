import { storeDb } from '@/lib/store-db';
import { enqueueAuditOutbox } from '@/lib/store-audit-outbox';
import { InventoryServiceError } from '@/lib/store-inventory-service';

export type OpeningBalanceAllocation = { warehouseId: string; quantity: number };

export async function listOpeningBalanceCandidates() {
  const [parts, warehouses] = await Promise.all([
    storeDb.part.findMany({
      where: {
        active: true,
        stock: { gt: 0 },
        inventoryBalances: { none: {} },
      },
      orderBy: { sku: 'asc' },
      take: 500,
      select: { id: true, name: true, nameFa: true, sku: true, stock: true },
    }),
    storeDb.warehouse.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true },
    }),
  ]);
  return { parts, warehouses };
}

/**
 * Explicitly allocates the existing Part.stock snapshot to active warehouses.
 * Part.stock is deliberately not modified: this operation creates the
 * warehouse representation of the already-existing global stock count.
 */
export async function allocateOpeningBalance(input: {
  partId: string;
  allocations: OpeningBalanceAllocation[];
  reason: string;
  reference?: string | null;
  userId: string;
}) {
  const { partId, allocations, reason, reference, userId } = input;
  if (!partId || !userId || !reason?.trim() || reason.trim().length > 500) {
    throw new InventoryServiceError(400, 'قطعه، کاربر و دلیل معتبر الزامی است');
  }
  if (!Array.isArray(allocations) || allocations.length === 0 || allocations.length > 100) {
    throw new InventoryServiceError(400, 'حداقل یک تخصیص انبار الزامی است');
  }
  const seen = new Set<string>();
  let requestedTotal = 0;
  for (const allocation of allocations) {
    if (!allocation || typeof allocation.warehouseId !== 'string' || !allocation.warehouseId.trim()
      || seen.has(allocation.warehouseId)
      || !Number.isSafeInteger(allocation.quantity) || allocation.quantity <= 0) {
      throw new InventoryServiceError(400, 'شناسه انبارها باید یکتا و تعداد هر تخصیص عدد صحیح مثبت باشد');
    }
    seen.add(allocation.warehouseId);
    requestedTotal += allocation.quantity;
    if (!Number.isSafeInteger(requestedTotal)) {
      throw new InventoryServiceError(400, 'مجموع تخصیص از محدوده عدد صحیح امن خارج است');
    }
  }

  return storeDb.$transaction(async (tx) => {
    // Serialize all canonical stock writers on the Part row first.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Part" WHERE id = ${partId} FOR UPDATE
    `;
    if (locked.length !== 1) throw new InventoryServiceError(404, 'قطعه یافت نشد');

    const part = await tx.part.findUnique({
      where: { id: partId },
      select: { id: true, name: true, nameFa: true, sku: true, stock: true, active: true },
    });
    if (!part) throw new InventoryServiceError(404, 'قطعه یافت نشد');
    if (!part.active || !Number.isSafeInteger(part.stock) || part.stock <= 0) {
      throw new InventoryServiceError(409, 'قطعه فعال با موجودی مثبت برای تخصیص اولیه یافت نشد');
    }

    const existing = await tx.inventoryBalance.count({ where: { partId } });
    if (existing !== 0) {
      throw new InventoryServiceError(409, 'برای این قطعه قبلاً موجودی انبار ثبت شده است؛ تخصیص مجدد مجاز نیست');
    }
    if (requestedTotal !== part.stock) {
      throw new InventoryServiceError(409, `مجموع تخصیص (${requestedTotal}) باید دقیقاً برابر موجودی فعلی قطعه (${part.stock}) باشد`);
    }

    // Lock destination warehouses in stable ID order after the Part lock.
    // This prevents a concurrent deactivation from racing the allocation.
    for (const warehouseId of [...seen].sort()) {
      const lockedWarehouse = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Warehouse"
        WHERE id = ${warehouseId} AND active = true
        FOR SHARE
      `;
      if (lockedWarehouse.length !== 1) {
        throw new InventoryServiceError(409, 'یک یا چند انبار انتخاب‌شده وجود ندارد یا غیرفعال است');
      }
    }
    const warehouses = await tx.warehouse.findMany({
      where: { id: { in: [...seen] }, active: true },
      select: { id: true, name: true, code: true },
    });
    if (warehouses.length !== seen.size) {
      throw new InventoryServiceError(409, 'یک یا چند انبار انتخاب‌شده وجود ندارد یا غیرفعال است');
    }
    const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));

    const createdBalances = [];
    const createdMovements = [];
    let runningBalance = 0;
    for (const allocation of allocations) {
      const warehouse = warehouseById.get(allocation.warehouseId);
      if (!warehouse) throw new InventoryServiceError(409, 'انبار انتخاب‌شده معتبر نیست');
      const balance = await tx.inventoryBalance.create({
        data: {
          partId,
          warehouseId: warehouse.id,
          quantity: allocation.quantity,
          reserved: 0,
        },
      });
      runningBalance += allocation.quantity;
      const movement = await tx.stockMovement.create({
        data: {
          partId,
          warehouseId: warehouse.id,
          type: 'ADJUSTMENT',
          quantity: allocation.quantity,
          balanceAfter: runningBalance,
          reason: reason.trim(),
          reference: reference?.trim() || 'OPENING-BALANCE',
          createdBy: userId,
        },
      });
      await enqueueAuditOutbox(tx, {
        actorId: userId,
        actorType: 'ADMIN',
        action: 'store.inventory.opening_balance.create',
        entityType: 'InventoryBalance',
        entityId: balance.id,
        reason: reason.trim(),
        after: {
          partId,
          warehouseId: warehouse.id,
          quantity: allocation.quantity,
          openingBalance: true,
          reference: reference?.trim() || null,
        },
      });
      await enqueueAuditOutbox(tx, {
        actorId: userId,
        actorType: 'ADMIN',
        action: 'store.inventory.opening_balance.create',
        entityType: 'StockMovement',
        entityId: movement.id,
        reason: reason.trim(),
        after: {
          partId,
          warehouseId: warehouse.id,
          type: 'ADJUSTMENT',
          quantity: allocation.quantity,
          balanceAfter: runningBalance,
          openingBalance: true,
          reference: reference?.trim() || null,
        },
      });
      createdBalances.push(balance);
      createdMovements.push(movement);
    }

    if (runningBalance !== part.stock || createdBalances.length !== allocations.length) {
      throw new InventoryServiceError(500, 'کنترل نهایی تخصیص موجودی ناموفق بود');
    }
    await enqueueAuditOutbox(tx, {
      actorId: userId,
      actorType: 'ADMIN',
      action: 'store.inventory.opening_balance.create',
      entityType: 'Part',
      entityId: partId,
      reason: reason.trim(),
      after: {
        partId,
        partStockUnchanged: part.stock,
        allocatedTotal: runningBalance,
        warehouseIds: allocations.map((item) => item.warehouseId),
        reference: reference?.trim() || null,
      },
    });

    return {
      part: { id: part.id, sku: part.sku, stock: part.stock },
      balances: createdBalances,
      movements: createdMovements,
      allocatedTotal: runningBalance,
    };
  }, { maxWait: 10000, timeout: 30000 });
}
