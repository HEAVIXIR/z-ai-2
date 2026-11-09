import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { storeDb } from '@/lib/store-db';
import { adjustStock, reserveStock, releaseStock, createMovement, allocateInitialStock, transferStock } from '@/lib/store-inventory-service';
import { addReturnItem, inspectReturn, resolveReturn } from '@/lib/store-returns-service';

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
    const fixtureReturnIds = [returnId, ...additionalReturnIds].filter(Boolean) as string[];
    if (fixtureReturnIds.length > 0) {
      await storeDb.auditOutbox.deleteMany({
        where: {
          OR: fixtureReturnIds.map((id) => ({ payloadJson: { contains: id } })),
        },
      });
    }
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

  it('moves available stock atomically with paired ledger movements and one audit event', async () => {
    if (!partId || !warehouseId) throw new Error('fixture setup incomplete');
    const destination = await storeDb.warehouse.create({
      data: { name: 'Transfer destination ' + suffix(), code: 'TR-DST-' + suffix() },
    });
    secondWarehouseId = destination.id;
    await storeDb.inventoryBalance.create({
      data: { partId, warehouseId, quantity: 10, reserved: 2, lowStockThreshold: 5 },
    });

    const result = await transferStock(
      partId,
      warehouseId,
      destination.id,
      5,
      'verified inter-warehouse relocation',
      'inventory-admin',
    );

    expect(result.transferReference).toMatch(/^TRF-/);
    expect(result.part.stock).toBe(10);
    expect(result.sourceBalance.quantity).toBe(5);
    expect(result.sourceBalance.reserved).toBe(2);
    expect(result.destinationBalance.quantity).toBe(5);
    expect(result.destinationBalance.reserved).toBe(0);

    const [part, balances, movements, events] = await Promise.all([
      storeDb.part.findUnique({ where: { id: partId }, select: { stock: true } }),
      storeDb.inventoryBalance.findMany({ where: { partId } }),
      storeDb.stockMovement.findMany({
        where: { partId, reference: result.transferReference, type: 'TRANSFER' },
        orderBy: { quantity: 'asc' },
      }),
      storeDb.auditOutbox.findMany({
        where: { payloadJson: { contains: result.transferReference } },
      }),
    ]);

    expect(part?.stock).toBe(10);
    expect(balances.reduce((sum, balance) => sum + balance.quantity, 0)).toBe(10);
    expect(movements).toHaveLength(2);
    expect(movements.map((movement) => movement.quantity)).toEqual([-5, 5]);
    expect(movements.map((movement) => movement.warehouseId).sort()).toEqual([warehouseId, destination.id].sort());
    expect(movements.every((movement) => movement.balanceAfter === 10)).toBe(true);
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].payloadJson).action).toBe('store.inventory.transfer');
  }, 20000);

  it('serializes competing transfers and never moves reserved or oversold stock', async () => {
    if (!partId || !warehouseId) throw new Error('fixture setup incomplete');
    const destination = await storeDb.warehouse.create({
      data: { name: 'Concurrent transfer destination ' + suffix(), code: 'TR-C-' + suffix() },
    });
    secondWarehouseId = destination.id;
    await storeDb.inventoryBalance.create({
      data: { partId, warehouseId, quantity: 10, reserved: 0, lowStockThreshold: 5 },
    });

    const outcomes = await Promise.allSettled([
      transferStock(partId, warehouseId, destination.id, 6, 'concurrent transfer A', 'inventory-admin'),
      transferStock(partId, warehouseId, destination.id, 6, 'concurrent transfer B', 'inventory-admin'),
    ]);
    expect(outcomes.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((entry) => entry.status === 'rejected')).toHaveLength(1);

    const [part, balances, movements, events] = await Promise.all([
      storeDb.part.findUnique({ where: { id: partId }, select: { stock: true } }),
      storeDb.inventoryBalance.findMany({ where: { partId } }),
      storeDb.stockMovement.findMany({ where: { partId, type: 'TRANSFER' } }),
      storeDb.auditOutbox.findMany({ where: { payloadJson: { contains: partId } } }),
    ]);
    expect(part?.stock).toBe(10);
    expect(balances.reduce((sum, balance) => sum + balance.quantity, 0)).toBe(10);
    expect(balances.find((balance) => balance.warehouseId === warehouseId)?.quantity).toBe(4);
    expect(balances.find((balance) => balance.warehouseId === destination.id)?.quantity).toBe(6);
    expect(movements).toHaveLength(2);
    expect(events.filter((event) => JSON.parse(event.payloadJson).action === 'store.inventory.transfer')).toHaveLength(1);
  }, 20000);

  it('rolls back destination balance creation when source availability or warehouse state is invalid', async () => {
    if (!partId || !warehouseId) throw new Error('fixture setup incomplete');
    const destination = await storeDb.warehouse.create({
      data: { name: 'Invalid transfer destination ' + suffix(), code: 'TR-I-' + suffix() },
    });
    secondWarehouseId = destination.id;
    await storeDb.inventoryBalance.create({
      data: { partId, warehouseId, quantity: 10, reserved: 5, lowStockThreshold: 5 },
    });

    await expect(
      transferStock(partId, warehouseId, warehouseId, 1, 'same warehouse must be rejected', 'inventory-admin'),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      transferStock(partId, warehouseId, destination.id, 6, 'cannot transfer reserved stock', 'inventory-admin'),
    ).rejects.toMatchObject({ status: 409 });
    expect(await storeDb.inventoryBalance.count({ where: { partId } })).toBe(1);
    expect(await storeDb.stockMovement.count({ where: { partId } })).toBe(0);
    expect(await storeDb.auditOutbox.count({ where: { payloadJson: { contains: partId } } })).toBe(0);

    await storeDb.warehouse.update({ where: { id: destination.id }, data: { active: false } });
    await expect(
      transferStock(partId, warehouseId, destination.id, 1, 'inactive destination', 'inventory-admin'),
    ).rejects.toMatchObject({ status: 409 });
    expect(await storeDb.inventoryBalance.count({ where: { partId } })).toBe(1);
  }, 20000);

  it('rejects the deprecated Part-only movement API without changing inventory', async () => {
    if (!partId) throw new Error('fixture setup incomplete');
    await expect(
      createMovement(partId, 'ADJUSTMENT', 2, 'legacy path must be disabled'),
    ).rejects.toMatchObject({ status: 409 });

    const [part, movements, balances] = await Promise.all([
      storeDb.part.findUnique({ where: { id: partId }, select: { stock: true } }),
      storeDb.stockMovement.count({ where: { partId } }),
      storeDb.inventoryBalance.count({ where: { partId } }),
    ]);
    expect(part?.stock).toBe(10);
    expect(movements).toBe(0);
    expect(balances).toBe(0);
  }, 15000);

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

  it('explicitly allocates a legacy Part snapshot once, without changing total stock', async () => {
    if (!partId || !warehouseId) throw new Error('fixture setup incomplete');

    const result = await allocateInitialStock(
      partId,
      warehouseId,
      'opening balance verified against physical count',
      'inventory-admin',
    );
    expect(result.balance.quantity).toBe(10);
    expect(result.balance.reserved).toBe(0);

    const [part, balance, movements, events] = await Promise.all([
      storeDb.part.findUnique({ where: { id: partId }, select: { stock: true } }),
      storeDb.inventoryBalance.findUnique({ where: { partId_warehouseId: { partId, warehouseId } } }),
      storeDb.stockMovement.count({ where: { partId } }),
      storeDb.auditOutbox.findMany({ where: { payloadJson: { contains: partId } } }),
    ]);
    expect(part?.stock).toBe(10);
    expect(balance?.quantity).toBe(10);
    expect(movements).toBe(0);
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].payloadJson).action).toBe('store.inventory.initial_allocation');

    await expect(
      allocateInitialStock(partId, warehouseId, 'duplicate allocation attempt', 'inventory-admin'),
    ).rejects.toMatchObject({ status: 409 });
    expect(await storeDb.inventoryBalance.count({ where: { partId } })).toBe(1);
  }, 15000);

  it('refuses opening-balance allocation into an inactive warehouse', async () => {
    if (!partId || !warehouseId) throw new Error('fixture setup incomplete');
    await storeDb.warehouse.update({ where: { id: warehouseId }, data: { active: false } });
    await expect(
      allocateInitialStock(partId, warehouseId, 'inactive warehouse test', 'inventory-admin'),
    ).rejects.toMatchObject({ status: 409 });
    expect(await storeDb.inventoryBalance.count({ where: { partId } })).toBe(0);
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

  it('blocks new reservations in inactive warehouses but still allows release of existing reservations', async () => {
    if (!partId || !warehouseId) throw new Error('fixture setup incomplete');
    const balance = await storeDb.inventoryBalance.create({
      data: { partId, warehouseId, quantity: 10, reserved: 2, lowStockThreshold: 5 },
    });
    await storeDb.warehouse.update({ where: { id: warehouseId }, data: { active: false } });

    await expect(reserveStock(partId, warehouseId, 1)).rejects.toMatchObject({ status: 409 });
    const unchanged = await storeDb.inventoryBalance.findUnique({ where: { id: balance.id } });
    expect(unchanged?.reserved).toBe(2);

    const released = await releaseStock(partId, warehouseId, 1);
    expect(released.reserved).toBe(1);
    const events = await storeDb.auditOutbox.findMany({
      where: { payloadJson: { contains: balance.id } },
    });
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].payloadJson).action).toBe('store.inventory.release');
  }, 15000);

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

    if (!warehouseId) throw new Error('fixture setup incomplete');
    await storeDb.inventoryBalance.create({
      data: { partId, warehouseId, quantity: 10, reserved: 0, lowStockThreshold: 5 },
    });

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
      resolveReturn(ret.id, 'REFUND', null, warehouseId),
      resolveReturn(ret.id, 'REFUND', null, warehouseId),
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
    const [part, balance, movements] = await Promise.all([
      storeDb.part.findUnique({ where: { id: partId }, select: { stock: true } }),
      storeDb.inventoryBalance.findUnique({ where: { partId_warehouseId: { partId, warehouseId } } }),
      storeDb.stockMovement.findMany({ where: { partId, reference: ret.id, type: 'RETURN' } }),
    ]);
    expect(part?.stock).toBe(11);
    expect(balance?.quantity).toBe(11);
    expect(movements).toHaveLength(1);
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

  it('restocks accepted return items into the explicitly selected warehouse atomically', async () => {
    if (!partId || !warehouseId) throw new Error('fixture setup incomplete');
    await storeDb.inventoryBalance.create({
      data: { partId, warehouseId, quantity: 10, reserved: 2, lowStockThreshold: 5 },
    });
    const tag = suffix();
    const customer = await storeDb.customer.create({
      data: {
        phone: '+1555' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0'),
        name: 'Restock',
        family: 'Atomicity',
        walletBalanceIrr: 0,
      },
    });
    customerId = customer.id;
    const order = await storeDb.order.create({
      data: {
        orderNumber: 'RESTOCK-RETURN-' + tag,
        customerId: customer.id,
        subtotalUsd: 5,
        totalUsd: 5,
        totalIrr: 500,
        currencyRateAtOrder: 100,
        marginPercentAtOrder: 0,
      },
    });
    orderId = order.id;
    const orderItem = await storeDb.orderItem.create({
      data: {
        orderId: order.id,
        partId,
        partNameSnapshot: 'Restockable part',
        quantity: 2,
        unitPriceUsd: 2.5,
        unitPriceIrr: 250,
        lineTotalUsd: 5,
        lineTotalIrr: 500,
      },
    });
    orderItemId = orderItem.id;
    const ret = await storeDb.return.create({
      data: { orderId: order.id, reason: 'accepted return', status: 'INSPECTED' },
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

    const resolved = await resolveReturn(ret.id, 'REFUND', null, warehouseId);
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.restockedMovements).toHaveLength(1);

    const [part, balance, movement] = await Promise.all([
      storeDb.part.findUnique({ where: { id: partId }, select: { stock: true } }),
      storeDb.inventoryBalance.findUnique({
        where: { partId_warehouseId: { partId, warehouseId } },
      }),
      storeDb.stockMovement.findMany({
        where: { partId, reference: ret.id, type: 'RETURN' },
      }),
    ]);
    // Outbox payloads identify Part and InventoryBalance events by their own
    // entity IDs; only the StockMovement/Return/Wallet events repeat returnId.
    const outbox = await storeDb.auditOutbox.findMany({
      where: {
        OR: [
          { payloadJson: { contains: ret.id } },
          { payloadJson: { contains: customer.id } },
          { payloadJson: { contains: partId } },
          ...(balance ? [{ payloadJson: { contains: balance.id } }] : []),
        ],
      },
    });
    expect(part?.stock).toBe(11);
    expect(balance?.quantity).toBe(11);
    expect(balance?.reserved).toBe(2);
    expect(movement).toHaveLength(1);
    expect(movement[0].quantity).toBe(1);
    expect(movement[0].balanceAfter).toBe(11);
    expect(movement[0].warehouseId).toBe(warehouseId);
    // Capture IDs before assertions so failed tests still clean their fixtures.
    outboxIds = outbox.map((event) => event.id);
    // Assert entity coverage directly so a missing event is visible in the diff.
    const outboxEntities = outbox.map((event) => JSON.parse(event.payloadJson).entityType).sort();
    expect(outboxEntities).toEqual([
      'Customer',
      'InventoryBalance',
      'Part',
      'Return',
      'StockMovement',
      'WalletTransaction',
    ]);
  }, 15000);

  it('refuses restockable resolution without a destination warehouse and rolls back all effects', async () => {
    if (!partId) throw new Error('fixture setup incomplete');
    const tag = suffix();
    const customer = await storeDb.customer.create({
      data: {
        phone: '+1444' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0'),
        name: 'NoWarehouse',
        family: 'Atomicity',
        walletBalanceIrr: 0,
      },
    });
    customerId = customer.id;
    const order = await storeDb.order.create({
      data: {
        orderNumber: 'NO-WAREHOUSE-RETURN-' + tag,
        customerId: customer.id,
        subtotalUsd: 5,
        totalUsd: 5,
        totalIrr: 500,
        currencyRateAtOrder: 100,
        marginPercentAtOrder: 0,
      },
    });
    orderId = order.id;
    const orderItem = await storeDb.orderItem.create({
      data: {
        orderId: order.id,
        partId,
        partNameSnapshot: 'Restockable part without warehouse',
        quantity: 2,
        unitPriceUsd: 2.5,
        unitPriceIrr: 250,
        lineTotalUsd: 5,
        lineTotalIrr: 500,
      },
    });
    orderItemId = orderItem.id;
    const ret = await storeDb.return.create({
      data: { orderId: order.id, reason: 'missing warehouse selection', status: 'INSPECTED' },
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

    await expect(resolveReturn(ret.id, 'REFUND')).rejects.toThrow('انبار مقصد را صریحاً انتخاب کنید');
    const [savedReturn, part, wallet, movements, events] = await Promise.all([
      storeDb.return.findUnique({ where: { id: ret.id }, select: { status: true } }),
      storeDb.part.findUnique({ where: { id: partId }, select: { stock: true } }),
      storeDb.customer.findUnique({ where: { id: customer.id }, select: { walletBalanceIrr: true } }),
      storeDb.stockMovement.count({ where: { partId, reference: ret.id } }),
      storeDb.auditOutbox.count({ where: { payloadJson: { contains: ret.id } } }),
    ]);
    expect(savedReturn?.status).toBe('INSPECTED');
    expect(part?.stock).toBe(10);
    expect(wallet?.walletBalanceIrr).toBe(0);
    expect(movements).toBe(0);
    expect(events).toBe(0);
  }, 15000);

  it('does not increase inventory for non-restockable returned items', async () => {
    if (!partId) throw new Error('fixture setup incomplete');
    const tag = suffix();
    const customer = await storeDb.customer.create({
      data: {
        phone: '+1333' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0'),
        name: 'Damaged',
        family: 'NonRestockable',
        walletBalanceIrr: 0,
      },
    });
    customerId = customer.id;
    const order = await storeDb.order.create({
      data: {
        orderNumber: 'NON-RESTOCKABLE-' + tag,
        customerId: customer.id,
        subtotalUsd: 5,
        totalUsd: 5,
        totalIrr: 500,
        currencyRateAtOrder: 100,
        marginPercentAtOrder: 0,
      },
    });
    orderId = order.id;
    const orderItem = await storeDb.orderItem.create({
      data: {
        orderId: order.id,
        partId,
        partNameSnapshot: 'Damaged returned part',
        quantity: 1,
        unitPriceUsd: 5,
        unitPriceIrr: 500,
        lineTotalUsd: 5,
        lineTotalIrr: 500,
      },
    });
    orderItemId = orderItem.id;
    const ret = await storeDb.return.create({
      data: { orderId: order.id, reason: 'damaged item', status: 'INSPECTED' },
    });
    returnId = ret.id;
    await storeDb.returnItem.create({
      data: {
        returnId: ret.id,
        orderItemId: orderItem.id,
        quantity: 1,
        condition: 'DAMAGED',
        restockable: false,
      },
    });

    const resolved = await resolveReturn(ret.id, 'REFUND');
    expect(resolved.status).toBe('RESOLVED');
    const [part, balances, movements] = await Promise.all([
      storeDb.part.findUnique({ where: { id: partId }, select: { stock: true } }),
      storeDb.inventoryBalance.findMany({ where: { partId } }),
      storeDb.stockMovement.findMany({ where: { partId, reference: ret.id, type: 'RETURN' } }),
    ]);
    expect(part?.stock).toBe(10);
    expect(balances).toHaveLength(0);
    expect(movements).toHaveLength(0);
  }, 15000);

  it('fails closed when warehouse balances do not reconcile to Part.stock', async () => {
    if (!partId || !warehouseId) throw new Error('fixture setup incomplete');
    await storeDb.inventoryBalance.create({
      data: { partId, warehouseId, quantity: 9, reserved: 0, lowStockThreshold: 5 },
    });
    const tag = suffix();
    const customer = await storeDb.customer.create({
      data: {
        phone: '+1222' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0'),
        name: 'Mismatch',
        family: 'Reconciliation',
        walletBalanceIrr: 0,
      },
    });
    customerId = customer.id;
    const order = await storeDb.order.create({
      data: {
        orderNumber: 'MISMATCH-RETURN-' + tag,
        customerId: customer.id,
        subtotalUsd: 5,
        totalUsd: 5,
        totalIrr: 500,
        currencyRateAtOrder: 100,
        marginPercentAtOrder: 0,
      },
    });
    orderId = order.id;
    const orderItem = await storeDb.orderItem.create({
      data: {
        orderId: order.id,
        partId,
        partNameSnapshot: 'Mismatched inventory part',
        quantity: 1,
        unitPriceUsd: 5,
        unitPriceIrr: 500,
        lineTotalUsd: 5,
        lineTotalIrr: 500,
      },
    });
    orderItemId = orderItem.id;
    const ret = await storeDb.return.create({
      data: { orderId: order.id, reason: 'inventory mismatch', status: 'INSPECTED' },
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

    await expect(resolveReturn(ret.id, 'REFUND', null, warehouseId)).rejects.toThrow('موجودی کل قطعه با مجموع موجودی انبارها برابر نیست');
    const [savedReturn, part, balance, wallet, movements] = await Promise.all([
      storeDb.return.findUnique({ where: { id: ret.id }, select: { status: true } }),
      storeDb.part.findUnique({ where: { id: partId }, select: { stock: true } }),
      storeDb.inventoryBalance.findUnique({ where: { partId_warehouseId: { partId, warehouseId } } }),
      storeDb.customer.findUnique({ where: { id: customer.id }, select: { walletBalanceIrr: true } }),
      storeDb.stockMovement.count({ where: { partId, reference: ret.id } }),
    ]);
    expect(savedReturn?.status).toBe('INSPECTED');
    expect(part?.stock).toBe(10);
    expect(balance?.quantity).toBe(9);
    expect(wallet?.walletBalanceIrr).toBe(0);
    expect(movements).toBe(0);
  }, 15000);


  it('marks an explicitly rejected return as REJECTED rather than RESOLVED', async () => {
    const tag = suffix();
    const customer = await storeDb.customer.create({
      data: {
        phone: '+1999' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0'),
        name: 'Rejected',
        family: 'Lifecycle',
        walletBalanceIrr: 0,
      },
    });
    customerId = customer.id;
    const order = await storeDb.order.create({
      data: {
        orderNumber: 'REJECT-STATUS-' + tag,
        customerId: customer.id,
        subtotalUsd: 0,
        totalUsd: 0,
        totalIrr: 0,
        currencyRateAtOrder: 100,
        marginPercentAtOrder: 0,
      },
    });
    orderId = order.id;
    const ret = await storeDb.return.create({
      data: { orderId: order.id, reason: 'rejection lifecycle test', status: 'INSPECTED' },
    });
    returnId = ret.id;

    const resolved = await resolveReturn(ret.id, 'REJECT');
    const saved = await storeDb.return.findUnique({
      where: { id: ret.id },
      select: { status: true, resolution: true },
    });

    expect(resolved.status).toBe('REJECTED');
    expect(saved?.status).toBe('REJECTED');
    expect(saved?.resolution).toBe('REJECT');
  }, 15000);

});
