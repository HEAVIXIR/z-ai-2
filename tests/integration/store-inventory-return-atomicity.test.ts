import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { storeDb } from '@/lib/store-db';
import { adjustStock, createMovement, reserveStock, releaseStock } from '@/lib/store-inventory-service';
import { resolveReturn } from '@/lib/store-returns-service';

const suffix = () => String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10);

describe('Store inventory and return atomicity (real PostgreSQL)', () => {
  let categoryId: string | undefined;
  let partId: string | undefined;
  let warehouseId: string | undefined;
  let customerId: string | undefined;
  let orderId: string | undefined;
  let orderItemId: string | undefined;
  let returnId: string | undefined;

  beforeEach(async () => {
    const tag = suffix();
    const category = await storeDb.category.create({
      data: { name: 'Atomicity ' + tag, slug: 'atomicity-' + tag },
    });
    categoryId = category.id;

    const part = await storeDb.part.create({
      data: {
        name: 'Atomicity part ' + tag,
        sku: 'ATOMIC-' + tag,
        categoryId: category.id,
        priceUsd: 1,
        stock: 10,
      },
    });
    partId = part.id;

    const warehouse = await storeDb.warehouse.create({
      data: { name: 'Atomicity warehouse ' + tag, code: 'AT-' + tag },
    });
    warehouseId = warehouse.id;
  });

  afterEach(async () => {
    if (returnId) {
      await storeDb.return.deleteMany({ where: { id: returnId } });
      returnId = undefined;
    }
    if (orderItemId) {
      await storeDb.orderItem.deleteMany({ where: { id: orderItemId } });
      orderItemId = undefined;
    }
    if (orderId) {
      await storeDb.order.deleteMany({ where: { id: orderId } });
      orderId = undefined;
    }
    if (customerId) {
      await storeDb.walletTransaction.deleteMany({ where: { customerId } });
      await storeDb.customer.deleteMany({ where: { id: customerId } });
      customerId = undefined;
    }
    if (partId) {
      await storeDb.stockMovement.deleteMany({ where: { partId } });
      await storeDb.inventoryBalance.deleteMany({ where: { partId } });
      await storeDb.part.deleteMany({ where: { id: partId } });
      partId = undefined;
    }
    if (warehouseId) {
      await storeDb.warehouse.deleteMany({ where: { id: warehouseId } });
      warehouseId = undefined;
    }
    if (categoryId) {
      await storeDb.category.deleteMany({ where: { id: categoryId } });
      categoryId = undefined;
    }
  });

  it('never reduces on-hand quantity below already-reserved stock', async () => {
    if (!partId || !warehouseId) throw new Error('fixture setup incomplete');

    await storeDb.inventoryBalance.create({
      data: {
        partId,
        warehouseId,
        quantity: 10,
        reserved: 8,
        lowStockThreshold: 5,
      },
    });

    await expect(
      adjustStock(partId, warehouseId, -3, 'SALE', 'reserved stock protection'),
    ).rejects.toThrow(/رزروهای فعال/);

    const [afterRejected, partAfterRejected, rejectedMovements] = await Promise.all([
      storeDb.inventoryBalance.findUnique({
        where: { partId_warehouseId: { partId, warehouseId } },
      }),
      storeDb.part.findUnique({ where: { id: partId }, select: { stock: true } }),
      storeDb.stockMovement.count({ where: { partId, warehouseId } }),
    ]);
    expect(afterRejected?.quantity).toBe(10);
    expect(afterRejected?.reserved).toBe(8);
    expect(partAfterRejected?.stock).toBe(10);
    expect(rejectedMovements).toBe(0);

    await adjustStock(partId, warehouseId, -2, 'SALE', 'consume unreserved stock');

    const [afterAllowed, partAfterAllowed, movements] = await Promise.all([
      storeDb.inventoryBalance.findUnique({
        where: { partId_warehouseId: { partId, warehouseId } },
      }),
      storeDb.part.findUnique({ where: { id: partId }, select: { stock: true } }),
      storeDb.stockMovement.findMany({ where: { partId, warehouseId } }),
    ]);
    expect(afterAllowed?.quantity).toBe(8);
    expect(afterAllowed?.reserved).toBe(8);
    expect(partAfterAllowed?.stock).toBe(8);
    expect(movements).toHaveLength(1);
    expect(movements[0]?.balanceAfter).toBe(8);
  }, 15000);

  it('serializes competing stock decrements and keeps balance, snapshot, and ledger consistent', async () => {
    if (!partId || !warehouseId) throw new Error('fixture setup incomplete');

    await storeDb.inventoryBalance.create({
      data: {
        partId,
        warehouseId,
        quantity: 10,
        reserved: 0,
        lowStockThreshold: 5,
      },
    });

    const outcomes = await Promise.allSettled([
      adjustStock(partId, warehouseId, -6, 'SALE', 'concurrency test'),
      adjustStock(partId, warehouseId, -6, 'SALE', 'concurrency test'),
    ]);

    expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((x) => x.status === 'rejected')).toHaveLength(1);

    const [balance, part, movementCount] = await Promise.all([
      storeDb.inventoryBalance.findUnique({
        where: { partId_warehouseId: { partId, warehouseId } },
      }),
      storeDb.part.findUnique({ where: { id: partId }, select: { stock: true } }),
      storeDb.stockMovement.count({ where: { partId, warehouseId } }),
    ]);

    expect(balance?.quantity).toBe(4);
    expect(part?.stock).toBe(4);
    expect(movementCount).toBe(1);
  }, 15000);

  it('rolls back Part.stock when the legacy movement ledger insert fails', async () => {
    if (!partId) throw new Error('fixture setup incomplete');

    const identifier = suffix().replace(/[^a-zA-Z0-9]/g, '');
    const functionName = `heavix_test_reject_stock_movement_${identifier}`;
    const triggerName = `heavix_test_reject_stock_movement_${identifier}`;

    try {
      await storeDb.$executeRawUnsafe(
        "CREATE OR REPLACE FUNCTION \"" + functionName + "\"() RETURNS trigger LANGUAGE plpgsql AS $heavix$ BEGIN RAISE EXCEPTION 'intentional inventory atomicity test failure'; END; $heavix$",
      );
      await storeDb.$executeRawUnsafe(
        `CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`,
      );

      await expect(
        createMovement(partId, 'RECEIVE', 3, 'forced ledger failure'),
      ).rejects.toThrow(/intentional inventory atomicity test failure/);

      const [part, movements] = await Promise.all([
        storeDb.part.findUnique({ where: { id: partId }, select: { stock: true } }),
        storeDb.stockMovement.count({ where: { partId } }),
      ]);
      expect(part?.stock).toBe(10);
      expect(movements).toBe(0);
    } finally {
      await storeDb.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS "${triggerName}" ON "StockMovement"`,
      );
      await storeDb.$executeRawUnsafe(
        `DROP FUNCTION IF EXISTS "${functionName}"()`,
      );
    }
  }, 15000);

  it('serializes competing legacy movement decrements and keeps Part.stock and ledger consistent', async () => {
    if (!partId) throw new Error('fixture setup incomplete');

    const outcomes = await Promise.allSettled([
      createMovement(partId, 'SALE', -6, 'legacy concurrency test'),
      createMovement(partId, 'SALE', -6, 'legacy concurrency test'),
    ]);

    expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((x) => x.status === 'rejected')).toHaveLength(1);

    const [part, movements] = await Promise.all([
      storeDb.part.findUnique({ where: { id: partId }, select: { stock: true } }),
      storeDb.stockMovement.findMany({ where: { partId } }),
    ]);
    expect(part?.stock).toBe(4);
    expect(movements).toHaveLength(1);
    expect(movements[0]?.quantity).toBe(-6);
    expect(movements[0]?.balanceAfter).toBe(4);
  }, 15000);

  it('allows only one competing reservation against the same balance snapshot', async () => {
    if (!partId || !warehouseId) throw new Error('fixture setup incomplete');

    await storeDb.inventoryBalance.create({
      data: {
        partId,
        warehouseId,
        quantity: 10,
        reserved: 0,
        lowStockThreshold: 5,
      },
    });

    const outcomes = await Promise.allSettled([
      reserveStock(partId, warehouseId, 7, 'test-user', 'reservation concurrency test'),
      reserveStock(partId, warehouseId, 7, 'test-user', 'reservation concurrency test'),
    ]);

    expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((x) => x.status === 'rejected')).toHaveLength(1);

    const balance = await storeDb.inventoryBalance.findUnique({
      where: { partId_warehouseId: { partId, warehouseId } },
    });
    expect(balance?.quantity).toBe(10);
    expect(balance?.reserved).toBe(7);
  }, 15000);

  it('allows only one competing release and never drives reserved stock below zero', async () => {
    if (!partId || !warehouseId) throw new Error('fixture setup incomplete');

    await storeDb.inventoryBalance.create({
      data: {
        partId,
        warehouseId,
        quantity: 10,
        reserved: 10,
        lowStockThreshold: 5,
      },
    });

    const outcomes = await Promise.allSettled([
      releaseStock(partId, warehouseId, 7, 'test-user', 'release concurrency test'),
      releaseStock(partId, warehouseId, 7, 'test-user', 'release concurrency test'),
    ]);

    expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((x) => x.status === 'rejected')).toHaveLength(1);

    const balance = await storeDb.inventoryBalance.findUnique({
      where: { partId_warehouseId: { partId, warehouseId } },
    });
    expect(balance?.quantity).toBe(10);
    expect(balance?.reserved).toBe(3);
  }, 15000);

  it('allows only one concurrent refund resolution and credits the wallet exactly once', async () => {
    if (!partId) throw new Error('fixture setup incomplete');
    const tag = suffix();
    const customer = await storeDb.customer.create({
      data: {
        phone: '+1999' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0'),
        name: 'Atomicity',
        family: 'Test',
        walletBalanceIrr: 0,
      },
    });
    customerId = customer.id;

    const order = await storeDb.order.create({
      data: {
        orderNumber: 'ATOMIC-ORDER-' + tag,
        customerId: customer.id,
        subtotalUsd: 10,
        totalUsd: 10,
        totalIrr: 1000,
        currencyRateAtOrder: 100,
        marginPercentAtOrder: 0,
      },
    });
    orderId = order.id;

    const orderItem = await storeDb.orderItem.create({
      data: {
        orderId: order.id,
        partId,
        partNameSnapshot: 'Atomicity part',
        quantity: 2,
        unitPriceUsd: 5,
        unitPriceIrr: 500,
        lineTotalUsd: 10,
        lineTotalIrr: 1000,
      },
    });
    orderItemId = orderItem.id;

    const ret = await storeDb.return.create({
      data: { orderId: order.id, reason: 'concurrency test', status: 'INSPECTED' },
    });
    returnId = ret.id;

    await storeDb.returnItem.create({
      data: {
        returnId: ret.id,
        orderItemId: orderItem.id,
        quantity: 1,
        condition: 'UNOPENED',
        restockable: true,
      },
    });

    const outcomes = await Promise.allSettled([
      resolveReturn(ret.id, 'REFUND'),
      resolveReturn(ret.id, 'REFUND'),
    ]);

    expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((x) => x.status === 'rejected')).toHaveLength(1);

    const [resolved, wallet, transactions] = await Promise.all([
      storeDb.return.findUnique({ where: { id: ret.id }, select: { status: true, resolution: true } }),
      storeDb.customer.findUnique({ where: { id: customer.id }, select: { walletBalanceIrr: true } }),
      storeDb.walletTransaction.findMany({ where: { customerId: customer.id, type: 'CREDIT' } }),
    ]);

    expect(resolved?.status).toBe('RESOLVED');
    expect(resolved?.resolution).toBe('REFUND');
    expect(wallet?.walletBalanceIrr).toBe(500);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.amount).toBe(500);
  }, 15000);
});
