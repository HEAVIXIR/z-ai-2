import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { storeDb } from '@/lib/store-db';
import { adjustStock, reserveStock, releaseStock } from '@/lib/store-inventory-service';
import { resolveReturn } from '@/lib/store-returns-service';

const suffix = () => String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10);

describe('Store inventory and return atomicity (real PostgreSQL)', () => {
  let categoryId: string | undefined;
  let partId: string | undefined;
  let warehouseId: string | undefined;
  let secondWarehouseId: string | undefined;
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
      const balanceRows = await storeDb.inventoryBalance.findMany({
        where: { partId },
        select: { id: true },
      });
      await storeDb.auditOutbox.deleteMany({
        where: {
          OR: [
            { payloadJson: { contains: partId } },
            ...balanceRows.map((balance) => ({ payloadJson: { contains: balance.id } })),
          ],
        },
      });
      await storeDb.stockMovement.deleteMany({ where: { partId } });
      await storeDb.inventoryBalance.deleteMany({ where: { partId } });
      await storeDb.part.deleteMany({ where: { id: partId } });
      partId = undefined;
    }
    if (secondWarehouseId) {
      await storeDb.warehouse.deleteMany({ where: { id: secondWarehouseId } });
      secondWarehouseId = undefined;
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

  it('keeps RETURN and TRANSFER movements out of the generic one-warehouse adjustment API', async () => {
    if (!partId || !warehouseId) throw new Error('fixture setup incomplete');

    await expect(
      adjustStock(partId, warehouseId, 1, 'RETURN', 'must use return lifecycle'),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      adjustStock(partId, warehouseId, 1, 'TRANSFER', 'must use paired transfer'),
    ).rejects.toMatchObject({ status: 400 });

    const [part, movements] = await Promise.all([
      storeDb.part.findUnique({ where: { id: partId }, select: { stock: true } }),
      storeDb.stockMovement.count({ where: { partId } }),
    ]);
    expect(part?.stock).toBe(10);
    expect(movements).toBe(0);
  }, 15000);

  it('refuses to create a first warehouse balance implicitly from a legacy Part snapshot', async () => {
    if (!partId || !warehouseId) throw new Error('fixture setup incomplete');

    await expect(
      adjustStock(partId, warehouseId, 5, 'RECEIVE', 'must initialize explicitly'),
    ).rejects.toMatchObject({ status: 409 });

    const [part, balanceCount, movementCount, outboxCount] = await Promise.all([
      storeDb.part.findUnique({ where: { id: partId }, select: { stock: true } }),
      storeDb.inventoryBalance.count({ where: { partId } }),
      storeDb.stockMovement.count({ where: { partId } }),
      storeDb.auditOutbox.count({ where: { payloadJson: { contains: partId } } }),
    ]);
    expect(part?.stock).toBe(10);
    expect(balanceCount).toBe(0);
    expect(movementCount).toBe(0);
    expect(outboxCount).toBe(0);
  }, 15000);

  it('does not allow an adjustment to consume reserved warehouse stock', async () => {
    if (!partId || !warehouseId) throw new Error('fixture setup incomplete');

    await storeDb.inventoryBalance.create({
      data: { partId, warehouseId, quantity: 10, reserved: 5, lowStockThreshold: 5 },
    });

    await expect(
      adjustStock(partId, warehouseId, -6, 'SALE', 'reserved quantity guard'),
    ).rejects.toMatchObject({ status: 409 });

    const [part, balance, movementCount, outboxCount] = await Promise.all([
      storeDb.part.findUnique({ where: { id: partId }, select: { stock: true } }),
      storeDb.inventoryBalance.findUnique({
        where: { partId_warehouseId: { partId, warehouseId } },
      }),
      storeDb.stockMovement.count({ where: { partId } }),
      storeDb.auditOutbox.count({ where: { payloadJson: { contains: partId } } }),
    ]);
    expect(part?.stock).toBe(10);
    expect(balance?.quantity).toBe(10);
    expect(balance?.reserved).toBe(5);
    expect(movementCount).toBe(0);
    expect(outboxCount).toBe(0);
  }, 15000);

  it('serializes concurrent receipts across warehouses using the global Part-first lock order', async () => {
    if (!partId || !warehouseId) throw new Error('fixture setup incomplete');
    const secondWarehouse = await storeDb.warehouse.create({
      data: { name: 'Atomicity second warehouse ' + suffix(), code: 'AT2-' + suffix() },
    });
    secondWarehouseId = secondWarehouse.id;
    await storeDb.inventoryBalance.createMany({
      data: [
        { partId, warehouseId, quantity: 5, reserved: 0, lowStockThreshold: 5 },
        { partId, warehouseId: secondWarehouse.id, quantity: 5, reserved: 0, lowStockThreshold: 5 },
      ],
    });

    const outcomes = await Promise.allSettled([
      adjustStock(partId, warehouseId, 3, 'RECEIVE', 'concurrent receipt A'),
      adjustStock(partId, secondWarehouse.id, 2, 'RECEIVE', 'concurrent receipt B'),
    ]);
    expect(outcomes.filter((entry) => entry.status === 'fulfilled')).toHaveLength(2);

    const [part, balances] = await Promise.all([
      storeDb.part.findUnique({ where: { id: partId }, select: { stock: true } }),
      storeDb.inventoryBalance.findMany({ where: { partId } }),
    ]);
    expect(part?.stock).toBe(15);
    expect(balances.reduce((sum, balance) => sum + balance.quantity, 0)).toBe(15);
    expect(balances.find((balance) => balance.warehouseId === warehouseId)?.quantity).toBe(8);
    expect(balances.find((balance) => balance.warehouseId === secondWarehouse.id)?.quantity).toBe(7);
  }, 20000);

  it('serializes concurrent reservations and never reserves more than available stock', async () => {
    if (!partId || !warehouseId) throw new Error('fixture setup incomplete');
    const balance = await storeDb.inventoryBalance.create({
      data: { partId, warehouseId, quantity: 10, reserved: 0, lowStockThreshold: 5 },
    });

    const outcomes = await Promise.allSettled([
      reserveStock(partId, warehouseId, 6),
      reserveStock(partId, warehouseId, 6),
    ]);
    expect(outcomes.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((entry) => entry.status === 'rejected')).toHaveLength(1);

    const [after, outbox] = await Promise.all([
      storeDb.inventoryBalance.findUnique({ where: { id: balance.id } }),
      storeDb.auditOutbox.findMany({ where: { payloadJson: { contains: balance.id } } }),
    ]);
    expect(after?.quantity).toBe(10);
    expect(after?.reserved).toBe(6);
    expect(outbox).toHaveLength(1);
  }, 15000);

  it('serializes concurrent releases and never releases more than the reserved quantity', async () => {
    if (!partId || !warehouseId) throw new Error('fixture setup incomplete');
    const balance = await storeDb.inventoryBalance.create({
      data: { partId, warehouseId, quantity: 10, reserved: 5, lowStockThreshold: 5 },
    });

    const outcomes = await Promise.allSettled([
      releaseStock(partId, warehouseId, 4),
      releaseStock(partId, warehouseId, 4),
    ]);
    expect(outcomes.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((entry) => entry.status === 'rejected')).toHaveLength(1);

    const [after, outbox] = await Promise.all([
      storeDb.inventoryBalance.findUnique({ where: { id: balance.id } }),
      storeDb.auditOutbox.findMany({ where: { payloadJson: { contains: balance.id } } }),
    ]);
    expect(after?.quantity).toBe(10);
    expect(after?.reserved).toBe(1);
    expect(outbox).toHaveLength(1);
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
