import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { storeDb } from '@/lib/store-db';
import { adjustStock } from '@/lib/store-inventory-service';
import { inspectReturn, resolveReturn } from '@/lib/store-returns-service';

const suffix = () => String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10);

describe('Store inventory and return atomicity (real PostgreSQL)', () => {
  let categoryId: string | undefined;
  let partId: string | undefined;
  let warehouseId: string | undefined;
  let customerId: string | undefined;
  let orderId: string | undefined;
  let orderItemId: string | undefined;
  let returnId: string | undefined;
  let outboxIds: string[] = [];
  let additionalReturnIds: string[] = [];

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
    if (outboxIds.length > 0) {
      await storeDb.auditOutbox.deleteMany({ where: { id: { in: outboxIds } } });
      outboxIds = [];
    }
    if (returnId || additionalReturnIds.length > 0) {
      await storeDb.return.deleteMany({ where: { id: { in: [returnId, ...additionalReturnIds].filter(Boolean) as string[] } } });
      returnId = undefined;
      additionalReturnIds = [];
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

  it('commits inspection status, item flags, and all audit outbox rows together', async () => {
    if (!partId) throw new Error('fixture setup incomplete');
    const tag = suffix();
    const customer = await storeDb.customer.create({
      data: {
        phone: '+1888' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0'),
        name: 'Inspection',
        family: 'Atomicity',
        walletBalanceIrr: 0,
      },
    });
    customerId = customer.id;

    const order = await storeDb.order.create({
      data: {
        orderNumber: 'INSPECT-ORDER-' + tag,
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
        partNameSnapshot: 'Inspection part',
        quantity: 2,
        unitPriceUsd: 5,
        unitPriceIrr: 500,
        lineTotalUsd: 10,
        lineTotalIrr: 1000,
      },
    });
    orderItemId = orderItem.id;

    const ret = await storeDb.return.create({
      data: { orderId: order.id, reason: 'inspection transaction test', status: 'APPROVED' },
    });
    returnId = ret.id;

    const item = await storeDb.returnItem.create({
      data: {
        returnId: ret.id,
        orderItemId: orderItem.id,
        quantity: 1,
        condition: 'UNOPENED',
        restockable: false,
      },
    });

    const result = await inspectReturn(ret.id, 'inspection complete', [{
      itemId: item.id,
      restockable: true,
      condition: 'UNOPENED',
    }]);

    expect(result.status).toBe('INSPECTED');
    expect(result.inspection).toBe('inspection complete');
    expect(result.items[0].restockable).toBe(true);

    const events = await storeDb.auditOutbox.findMany({
      where: { payloadJson: { contains: ret.id } },
      select: { id: true, payloadJson: true, status: true },
    });
    outboxIds = events.map((event: any) => event.id);
    expect(events).toHaveLength(2);
    expect(events.every((event: any) => event.status === 'PENDING')).toBe(true);
    const payloads = events.map((event: any) => JSON.parse(event.payloadJson));
    expect(payloads.map((payload: any) => payload.entityType).sort()).toEqual(['Return', 'ReturnItem']);
    expect(payloads.every((payload: any) => payload.action === 'store.return.inspect')).toBe(true);
  }, 15000);

  it('enforces the cumulative purchased-quantity cap across concurrent returns', async () => {
    if (!partId) throw new Error('fixture setup incomplete');
    const tag = suffix();
    const customer = await storeDb.customer.create({
      data: {
        phone: '+1777' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0'),
        name: 'Cumulative',
        family: 'Return',
        walletBalanceIrr: 0,
      },
    });
    customerId = customer.id;
    const order = await storeDb.order.create({
      data: {
        orderNumber: 'CUMULATIVE-RETURN-' + tag,
        customerId: customer.id,
        subtotalUsd: 15,
        totalUsd: 15,
        totalIrr: 1500,
        currencyRateAtOrder: 100,
        marginPercentAtOrder: 0,
      },
    });
    orderId = order.id;
    const orderItem = await storeDb.orderItem.create({
      data: {
        orderId: order.id,
        partId,
        partNameSnapshot: 'Cumulative return part',
        quantity: 3,
        unitPriceUsd: 5,
        unitPriceIrr: 500,
        lineTotalUsd: 15,
        lineTotalIrr: 1500,
      },
    });
    orderItemId = orderItem.id;
    const returns = await Promise.all([
      storeDb.return.create({ data: { orderId: order.id, reason: 'first request', status: 'REQUESTED' } }),
      storeDb.return.create({ data: { orderId: order.id, reason: 'second request', status: 'REQUESTED' } }),
    ]);
    returnId = returns[0].id;
    additionalReturnIds = [returns[1].id];

    const outcomes = await Promise.allSettled([
      addReturnItem(returns[0].id, orderItem.id, 2, null, null),
      addReturnItem(returns[1].id, orderItem.id, 2, null, null),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    const lines = await storeDb.returnItem.findMany({
      where: { orderItemId: orderItem.id },
      select: { quantity: true },
    });
    expect(lines.reduce((total, line) => total + line.quantity, 0)).toBe(2);

    const events = await storeDb.auditOutbox.findMany({
      where: { payloadJson: { contains: returns[0].id } },
      select: { id: true },
    });
    const secondEvents = await storeDb.auditOutbox.findMany({
      where: { payloadJson: { contains: returns[1].id } },
      select: { id: true },
    });
    outboxIds = [...events, ...secondEvents].map((event) => event.id);
    expect(outboxIds).toHaveLength(1);
  }, 15000);

  it('does not count rejected return lines against the cumulative allowance', async () => {
    if (!partId) throw new Error('fixture setup incomplete');
    const tag = suffix();
    const customer = await storeDb.customer.create({
      data: {
        phone: '+1666' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0'),
        name: 'Rejected',
        family: 'Allowance',
        walletBalanceIrr: 0,
      },
    });
    customerId = customer.id;
    const order = await storeDb.order.create({
      data: {
        orderNumber: 'REJECTED-RETURN-' + tag,
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
        partNameSnapshot: 'Rejected allowance part',
        quantity: 2,
        unitPriceUsd: 5,
        unitPriceIrr: 500,
        lineTotalUsd: 10,
        lineTotalIrr: 1000,
      },
    });
    orderItemId = orderItem.id;
    const [rejected, active] = await Promise.all([
      storeDb.return.create({ data: { orderId: order.id, reason: 'rejected', status: 'REJECTED' } }),
      storeDb.return.create({ data: { orderId: order.id, reason: 'active', status: 'REQUESTED' } }),
    ]);
    returnId = rejected.id;
    additionalReturnIds = [active.id];
    await storeDb.returnItem.create({
      data: { returnId: rejected.id, orderItemId: orderItem.id, quantity: 2, restockable: false },
    });
    const item = await addReturnItem(active.id, orderItem.id, 2, null, null);
    expect(item.quantity).toBe(2);
  }, 15000);

});
