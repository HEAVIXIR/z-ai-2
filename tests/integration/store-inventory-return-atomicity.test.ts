import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { storeDb } from '@/lib/store-db';
import { adjustStock } from '@/lib/store-inventory-service';
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
  });

  it('allows only one concurrent refund resolution and credits the wallet exactly once', async () => {
    if (!partId) throw new Error('fixture setup incomplete');
    const tag = suffix();
    const customer = await storeDb.customer.create({
      data: {
        phone: '+1999' + tag.replace(/[^0-9]/g, '').slice(-8).padStart(8, '0'),
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
  });
});
