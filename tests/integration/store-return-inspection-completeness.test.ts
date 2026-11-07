import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { storeDb } from '@/lib/store-db';
import { inspectReturn } from '@/lib/store-returns-service';

const suffix = () => String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10);

describe('Store return inspection completeness (real PostgreSQL)', () => {
  let categoryId: string | undefined;
  let partId: string | undefined;
  let customerId: string | undefined;
  let orderId: string | undefined;
  let returnId: string | undefined;
  const returnItemIds: string[] = [];

  beforeEach(async () => {
    const tag = suffix();
    const category = await storeDb.category.create({
      data: { name: 'Return inspection ' + tag, slug: 'return-inspection-' + tag },
    });
    categoryId = category.id;
    const part = await storeDb.part.create({
      data: {
        name: 'Return inspection part ' + tag,
        sku: 'RETURN-INSPECTION-' + tag,
        categoryId: category.id,
        priceUsd: 5,
        stock: 0,
      },
    });
    partId = part.id;
    const customer = await storeDb.customer.create({
      data: { phone: '9' + tag.replace(/\D/g, '').slice(-10), name: 'Test', family: 'Return' },
    });
    customerId = customer.id;
    const order = await storeDb.order.create({
      data: {
        orderNumber: 'RET-' + tag,
        customerId: customer.id,
        subtotalUsd: 10,
        totalUsd: 10,
        totalIrr: 500000,
        currencyRateAtOrder: 50000,
        marginPercentAtOrder: 0,
        items: {
          create: [
            { partId: part.id, partNameSnapshot: 'Return item A', quantity: 2, unitPriceUsd: 5, unitPriceIrr: 250000, lineTotalUsd: 10, lineTotalIrr: 500000 },
            { partId: part.id, partNameSnapshot: 'Return item B', quantity: 1, unitPriceUsd: 5, unitPriceIrr: 250000, lineTotalUsd: 5, lineTotalIrr: 250000 },
          ],
        },
      },
      include: { items: true },
    });
    orderId = order.id;
    const ret = await storeDb.return.create({
      data: {
        orderId: order.id,
        reason: 'Inspection test',
        status: 'APPROVED',
        items: {
          create: order.items.map((item) => ({
            orderItemId: item.id,
            quantity: 1,
            reason: 'Inspection test',
            condition: 'UNOPENED',
          })),
        },
      },
      include: { items: true },
    });
    returnId = ret.id;
    returnItemIds.push(...ret.items.map((item) => item.id));
  });

  afterEach(async () => {
    if (returnId) {
      await storeDb.auditOutbox.deleteMany({ where: { payloadJson: { contains: returnId } } });
      await storeDb.returnItem.deleteMany({ where: { returnId } });
      await storeDb.return.deleteMany({ where: { id: returnId } });
      returnId = undefined;
    }
    returnItemIds.length = 0;
    if (orderId) {
      await storeDb.orderItem.deleteMany({ where: { orderId } });
      await storeDb.order.deleteMany({ where: { id: orderId } });
      orderId = undefined;
    }
    if (customerId) {
      await storeDb.customer.deleteMany({ where: { id: customerId } });
      customerId = undefined;
    }
    if (partId) {
      await storeDb.part.deleteMany({ where: { id: partId } });
      partId = undefined;
    }
    if (categoryId) {
      await storeDb.category.deleteMany({ where: { id: categoryId } });
      categoryId = undefined;
    }
  });

  it('rejects a partial inspection without changing status, items, or outbox', async () => {
    if (!returnId || returnItemIds.length !== 2) throw new Error('fixture setup incomplete');
    await expect(inspectReturn(returnId, 'partial', [
      { itemId: returnItemIds[0], restockable: true, condition: 'UNOPENED' },
    ])).rejects.toMatchObject({ status: 409 });

    const [ret, items, events] = await Promise.all([
      storeDb.return.findUnique({ where: { id: returnId } }),
      storeDb.returnItem.findMany({ where: { returnId } }),
      storeDb.auditOutbox.findMany({ where: { payloadJson: { contains: returnId } } }),
    ]);
    expect(ret?.status).toBe('APPROVED');
    expect(items.every((item) => item.restockable === false)).toBe(true);
    expect(events).toHaveLength(0);
  }, 15000);

  it('rejects duplicate and foreign item IDs', async () => {
    if (!returnId || returnItemIds.length !== 2) throw new Error('fixture setup incomplete');
    await expect(inspectReturn(returnId, null, [
      { itemId: returnItemIds[0], restockable: true },
      { itemId: returnItemIds[0], restockable: false },
    ])).rejects.toMatchObject({ status: 400 });

    await expect(inspectReturn(returnId, null, [
      { itemId: returnItemIds[0], restockable: true },
      { itemId: 'foreign-return-item', restockable: false },
    ])).rejects.toMatchObject({ status: 400 });
  }, 15000);

  it('rejects legacy empty-item returns from reaching INSPECTED', async () => {
    if (!returnId || !orderId) throw new Error('fixture setup incomplete');
    const emptyReturn = await storeDb.return.create({
      data: { orderId, reason: 'Legacy empty return', status: 'APPROVED' },
    });
    try {
      await expect(inspectReturn(emptyReturn.id, 'no items', [])).rejects.toMatchObject({ status: 409 });
      const persisted = await storeDb.return.findUnique({ where: { id: emptyReturn.id } });
      expect(persisted?.status).toBe('APPROVED');
    } finally {
      await storeDb.return.deleteMany({ where: { id: emptyReturn.id } });
    }
  }, 15000);

  it('marks INSPECTED only after every item receives one decision and writes item + parent outbox events', async () => {
    if (!returnId || returnItemIds.length !== 2) throw new Error('fixture setup incomplete');
    const result = await inspectReturn(returnId, 'complete inspection', [
      { itemId: returnItemIds[0], restockable: true, condition: 'UNOPENED' },
      { itemId: returnItemIds[1], restockable: false, condition: 'DAMAGED' },
    ]);
    expect(result.status).toBe('INSPECTED');
    const [items, events] = await Promise.all([
      storeDb.returnItem.findMany({ where: { returnId } }),
      storeDb.auditOutbox.findMany({ where: { payloadJson: { contains: returnId } } }),
    ]);
    expect(items).toHaveLength(2);
    expect(items.filter((item) => item.restockable)).toHaveLength(1);
    expect(events).toHaveLength(3);
  }, 15000);

  it('serializes concurrent inspection claims so only one initial transition wins', async () => {
    if (!returnId || returnItemIds.length !== 2) throw new Error('fixture setup incomplete');
    const decisionsA = [
      { itemId: returnItemIds[0], restockable: true },
      { itemId: returnItemIds[1], restockable: false },
    ];
    const decisionsB = [
      { itemId: returnItemIds[0], restockable: false },
      { itemId: returnItemIds[1], restockable: true },
    ];
    const results = await Promise.allSettled([
      inspectReturn(returnId, 'concurrent A', decisionsA),
      inspectReturn(returnId, 'concurrent B', decisionsB),
    ]);
    const successes = results.filter((result) => result.status === 'fulfilled').length;
    expect(successes).toBeGreaterThanOrEqual(1);
    const [ret, items, events] = await Promise.all([
      storeDb.return.findUnique({ where: { id: returnId } }),
      storeDb.returnItem.findMany({ where: { returnId } }),
      storeDb.auditOutbox.findMany({ where: { payloadJson: { contains: returnId } } }),
    ]);
    expect(ret?.status).toBe('INSPECTED');
    expect(items).toHaveLength(2);
    expect(items[0]?.restockable).not.toBe(items[1]?.restockable);
    expect(events).toHaveLength(successes * 3);
  }, 15000);
});
