import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { storeDb } from '@/lib/store-db';
import { allocateOpeningBalance } from '@/lib/store-opening-balance-service';

const tag = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

describe('Explicit opening balance allocation (real PostgreSQL)', () => {
  let categoryId = '';
  let partId = '';
  let warehouseA = '';
  let warehouseB = '';
  const actorId = 'opening-balance-integration-test';

  beforeEach(async () => {
    const unique = tag();
    const category = await storeDb.category.create({
      data: { name: 'Opening balance ' + unique, slug: 'opening-balance-' + unique },
    });
    categoryId = category.id;
    const part = await storeDb.part.create({
      data: {
        name: 'Opening balance part ' + unique,
        sku: 'OPEN-' + unique,
        categoryId,
        priceUsd: 1,
        stock: 10,
        active: true,
      },
    });
    partId = part.id;
    const [a, b] = await Promise.all([
      storeDb.warehouse.create({ data: { name: 'Opening A ' + unique, code: 'OPA-' + unique } }),
      storeDb.warehouse.create({ data: { name: 'Opening B ' + unique, code: 'OPB-' + unique } }),
    ]);
    warehouseA = a.id;
    warehouseB = b.id;
  });

  afterEach(async () => {
    if (partId) {
      await storeDb.auditOutbox.deleteMany({ where: { payloadJson: { contains: partId } } });
      await storeDb.stockMovement.deleteMany({ where: { partId } });
      await storeDb.inventoryBalance.deleteMany({ where: { partId } });
      await storeDb.part.deleteMany({ where: { id: partId } });
      partId = '';
    }
    if (warehouseA || warehouseB) {
      await storeDb.warehouse.deleteMany({ where: { id: { in: [warehouseA, warehouseB].filter(Boolean) } } });
      warehouseA = '';
      warehouseB = '';
    }
    if (categoryId) {
      await storeDb.category.deleteMany({ where: { id: categoryId } });
      categoryId = '';
    }
  });

  it('allocates the exact existing stock across multiple active warehouses atomically', async () => {
    const result = await allocateOpeningBalance({
      partId,
      userId: actorId,
      reason: 'Physical count approved',
      reference: 'COUNT-001',
      allocations: [
        { warehouseId: warehouseA, quantity: 6 },
        { warehouseId: warehouseB, quantity: 4 },
      ],
    });
    const [part, balances, movements, outbox] = await Promise.all([
      storeDb.part.findUnique({ where: { id: partId }, select: { stock: true } }),
      storeDb.inventoryBalance.findMany({ where: { partId }, orderBy: { warehouseId: 'asc' } }),
      storeDb.stockMovement.findMany({ where: { partId }, orderBy: { createdAt: 'asc' } }),
      storeDb.auditOutbox.count({ where: { payloadJson: { contains: partId } } }),
    ]);
    expect(result.allocatedTotal).toBe(10);
    expect(part?.stock).toBe(10);
    expect(balances.reduce((sum, row) => sum + row.quantity, 0)).toBe(10);
    expect(balances.map((row) => row.quantity).sort((a, b) => a - b)).toEqual([4, 6]);
    expect(movements).toHaveLength(2);
    expect(movements.every((movement) => movement.type === 'ADJUSTMENT')).toBe(true);
    expect(movements.reduce((sum, movement) => sum + movement.quantity, 0)).toBe(10);
    expect(outbox).toBeGreaterThanOrEqual(5);
  }, 20000);

  it('rejects a total mismatch without writing balances, movements or outbox events', async () => {
    await expect(allocateOpeningBalance({
      partId, userId: actorId, reason: 'Mismatch test',
      allocations: [{ warehouseId: warehouseA, quantity: 9 }],
    })).rejects.toMatchObject({ status: 409 });
    const [balances, movements, outbox] = await Promise.all([
      storeDb.inventoryBalance.count({ where: { partId } }),
      storeDb.stockMovement.count({ where: { partId } }),
      storeDb.auditOutbox.count({ where: { payloadJson: { contains: partId } } }),
    ]);
    expect([balances, movements, outbox]).toEqual([0, 0, 0]);
  }, 15000);

  it('rejects duplicate warehouse IDs and non-positive quantities before transaction writes', async () => {
    await expect(allocateOpeningBalance({
      partId, userId: actorId, reason: 'Duplicate warehouse',
      allocations: [
        { warehouseId: warehouseA, quantity: 5 },
        { warehouseId: warehouseA, quantity: 5 },
      ],
    })).rejects.toMatchObject({ status: 400 });
    await expect(allocateOpeningBalance({
      partId, userId: actorId, reason: 'Zero quantity',
      allocations: [{ warehouseId: warehouseA, quantity: 0 }],
    })).rejects.toMatchObject({ status: 400 });
    expect(await storeDb.inventoryBalance.count({ where: { partId } })).toBe(0);
  }, 15000);

  it('rejects inactive warehouses and refuses a second allocation after balances exist', async () => {
    await storeDb.warehouse.update({ where: { id: warehouseB }, data: { active: false } });
    await expect(allocateOpeningBalance({
      partId, userId: actorId, reason: 'Inactive warehouse',
      allocations: [{ warehouseId: warehouseB, quantity: 10 }],
    })).rejects.toMatchObject({ status: 409 });
    await storeDb.warehouse.update({ where: { id: warehouseB }, data: { active: true } });
    await storeDb.inventoryBalance.create({
      data: { partId, warehouseId: warehouseA, quantity: 10, reserved: 0 },
    });
    await expect(allocateOpeningBalance({
      partId, userId: actorId, reason: 'Duplicate allocation',
      allocations: [{ warehouseId: warehouseB, quantity: 10 }],
    })).rejects.toMatchObject({ status: 409 });
    expect(await storeDb.inventoryBalance.count({ where: { partId } })).toBe(1);
  }, 15000);

  it('allows only one concurrent allocation for a Part', async () => {
    const request = (warehouseId: string) => allocateOpeningBalance({
      partId, userId: actorId, reason: 'Concurrent allocation',
      allocations: [{ warehouseId, quantity: 10 }],
    });
    const outcomes = await Promise.allSettled([request(warehouseA), request(warehouseB)]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(await storeDb.inventoryBalance.count({ where: { partId } })).toBe(1);
    expect(await storeDb.stockMovement.count({ where: { partId } })).toBe(1);
  }, 20000);
});
