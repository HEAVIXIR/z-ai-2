import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { storeDb } from '@/lib/store-db';
import { receivePurchaseOrderItem } from '@/lib/store-procurement-service';

const suffix = () => String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10);

describe('Store procurement receiving atomicity (real PostgreSQL)', () => {
  let categoryId: string | undefined;
  let partId: string | undefined;
  let warehouseId: string | undefined;
  let procurementId: string | undefined;
  let purchaseOrderId: string | undefined;
  let poItemId: string | undefined;

  beforeEach(async () => {
    const tag = suffix();
    const category = await storeDb.category.create({
      data: { name: 'Receiving ' + tag, slug: 'receiving-' + tag },
    });
    categoryId = category.id;

    const part = await storeDb.part.create({
      data: {
        name: 'Receiving part ' + tag,
        sku: 'RECEIVE-' + tag,
        categoryId: category.id,
        priceUsd: 1,
        stock: 10,
      },
    });
    partId = part.id;

    const warehouse = await storeDb.warehouse.create({
      data: { name: 'Receiving warehouse ' + tag, code: 'RCV-' + tag },
    });
    warehouseId = warehouse.id;

    await storeDb.inventoryBalance.create({
      data: {
        partId: part.id,
        warehouseId: warehouse.id,
        quantity: 10,
        reserved: 0,
        lowStockThreshold: 5,
      },
    });

    const procurement = await storeDb.procurementRequest.create({
      data: { title: 'Receiving test ' + tag, quantity: 3, status: 'AWARDED' },
    });
    procurementId = procurement.id;

    const po = await storeDb.purchaseOrder.create({
      data: {
        procurementId: procurement.id,
        status: 'APPROVED',
        items: {
          create: {
            partId: part.id,
            quantity: 5,
            unitPrice: 1,
            received: 0,
          },
        },
      },
      include: { items: true },
    });
    purchaseOrderId = po.id;
    poItemId = po.items[0]?.id;
  });

  afterEach(async () => {
    if (partId || poItemId || purchaseOrderId) {
      await storeDb.auditOutbox.deleteMany({
        where: {
          OR: [
            ...(partId ? [{ payloadJson: { contains: partId } }] : []),
            ...(poItemId ? [{ payloadJson: { contains: poItemId } }] : []),
            ...(purchaseOrderId ? [{ payloadJson: { contains: purchaseOrderId } }] : []),
          ],
        },
      });
    }
    if (poItemId) {
      await storeDb.purchaseOrderItem.deleteMany({ where: { id: poItemId } });
      poItemId = undefined;
    }
    if (purchaseOrderId) {
      await storeDb.purchaseOrder.deleteMany({ where: { id: purchaseOrderId } });
      purchaseOrderId = undefined;
    }
    if (procurementId) {
      await storeDb.procurementRequest.deleteMany({ where: { id: procurementId } });
      procurementId = undefined;
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

  it('receives into the explicit warehouse and atomically updates PO, balance, Part, ledger, and outbox', async () => {
    if (!poItemId || !warehouseId || !partId || !purchaseOrderId) {
      throw new Error('fixture setup incomplete');
    }

    const result = await receivePurchaseOrderItem(poItemId, 5, warehouseId);

    const [item, po, part, balance, movements, outbox] = await Promise.all([
      storeDb.purchaseOrderItem.findUnique({ where: { id: poItemId } }),
      storeDb.purchaseOrder.findUnique({ where: { id: purchaseOrderId } }),
      storeDb.part.findUnique({ where: { id: partId }, select: { stock: true } }),
      storeDb.inventoryBalance.findUnique({
        where: { partId_warehouseId: { partId, warehouseId } },
      }),
      storeDb.stockMovement.findMany({ where: { partId, reference: purchaseOrderId, type: 'RECEIVE' } }),
      storeDb.auditOutbox.findMany({
        where: {
          OR: [
            { payloadJson: { contains: partId } },
            { payloadJson: { contains: poItemId } },
            { payloadJson: { contains: purchaseOrderId } },
          ],
        },
      }),
    ]);

    expect(result.allReceived).toBe(true);
    expect(item?.received).toBe(5);
    expect(po?.status).toBe('RECEIVED');
    expect(balance?.quantity).toBe(15);
    expect(part?.stock).toBe(15);
    expect(movements).toHaveLength(1);
    expect(movements[0]?.warehouseId).toBe(warehouseId);
    expect(movements[0]?.balanceAfter).toBe(15);
    expect(outbox).toHaveLength(5);
  }, 15000);

  it('allows only one concurrent receipt that would exceed the remaining PO quantity', async () => {
    if (!poItemId || !warehouseId || !partId) throw new Error('fixture setup incomplete');

    const outcomes = await Promise.allSettled([
      receivePurchaseOrderItem(poItemId, 4, warehouseId),
      receivePurchaseOrderItem(poItemId, 4, warehouseId),
    ]);

    expect(outcomes.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((entry) => entry.status === 'rejected')).toHaveLength(1);

    const [item, part, balance, movements] = await Promise.all([
      storeDb.purchaseOrderItem.findUnique({ where: { id: poItemId } }),
      storeDb.part.findUnique({ where: { id: partId }, select: { stock: true } }),
      storeDb.inventoryBalance.findUnique({
        where: { partId_warehouseId: { partId, warehouseId } },
      }),
      storeDb.stockMovement.findMany({ where: { partId, type: 'RECEIVE' } }),
    ]);

    expect(item?.received).toBe(4);
    expect(part?.stock).toBe(14);
    expect(balance?.quantity).toBe(14);
    expect(movements).toHaveLength(1);
  }, 15000);

  it('fails closed when no warehouse balance exists and does not create partial receiving side effects', async () => {
    if (!poItemId || !warehouseId || !partId) throw new Error('fixture setup incomplete');

    await storeDb.inventoryBalance.deleteMany({ where: { partId } });

    await expect(
      receivePurchaseOrderItem(poItemId, 1, warehouseId),
    ).rejects.toMatchObject({ status: 409 });

    const [item, part, movementCount] = await Promise.all([
      storeDb.purchaseOrderItem.findUnique({ where: { id: poItemId } }),
      storeDb.part.findUnique({ where: { id: partId }, select: { stock: true } }),
      storeDb.stockMovement.count({ where: { partId } }),
    ]);

    expect(item?.received).toBe(0);
    expect(part?.stock).toBe(10);
    expect(movementCount).toBe(0);
  }, 15000);
});
