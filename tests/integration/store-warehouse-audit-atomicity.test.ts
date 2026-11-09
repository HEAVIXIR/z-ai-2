import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { storeDb } from '@/lib/store-db';
import { createWarehouse, deleteWarehouse, updateWarehouse } from '@/lib/store-inventory-service';

const suffix = () => String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10);

describe('Store warehouse lifecycle and transactional audit outbox (real PostgreSQL)', () => {
  let warehouseId: string | undefined;

  beforeEach(async () => {
    const tag = suffix();
    const warehouse = await createWarehouse(
      'Warehouse audit ' + tag,
      'WH-AUDIT-' + tag,
      'integration test',
      'warehouse-audit-test',
    );
    warehouseId = warehouse.id;
  });

  afterEach(async () => {
    if (warehouseId) {
      await storeDb.warehouse.deleteMany({ where: { id: warehouseId } });
      await storeDb.auditOutbox.deleteMany({
        where: { payloadJson: { contains: warehouseId } },
      });
      warehouseId = undefined;
    }
  });

  async function eventsForWarehouse() {
    if (!warehouseId) throw new Error('warehouse fixture not initialized');
    return storeDb.auditOutbox.findMany({
      where: { payloadJson: { contains: warehouseId } },
      orderBy: { createdAt: 'asc' },
    });
  }

  it('persists the create audit event in the outbox with the created warehouse', async () => {
    const [warehouse, events] = await Promise.all([
      storeDb.warehouse.findUnique({ where: { id: warehouseId! } }),
      eventsForWarehouse(),
    ]);
    expect(warehouse).not.toBeNull();
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('PENDING');
    expect(JSON.parse(events[0].payloadJson)).toMatchObject({
      action: 'store.warehouse.create',
      entityType: 'Warehouse',
      entityId: warehouseId,
    });
  }, 15000);

  it('records update before/after state in the same Store outbox boundary', async () => {
    if (!warehouseId) throw new Error('warehouse fixture not initialized');
    const updated = await updateWarehouse(
      warehouseId,
      { name: 'Warehouse audit updated', active: false },
      'warehouse-audit-updater',
    );
    expect(updated.name).toBe('Warehouse audit updated');
    expect(updated.active).toBe(false);

    const events = await eventsForWarehouse();
    const updateEvent = events.find((event) =>
      JSON.parse(event.payloadJson).action === 'store.warehouse.update',
    );
    expect(updateEvent).toBeDefined();
    expect(updateEvent!.status).toBe('PENDING');
    expect(JSON.parse(updateEvent!.payloadJson)).toMatchObject({
      action: 'store.warehouse.update',
      entityId: warehouseId,
      before: { active: true },
      after: { active: false, name: 'Warehouse audit updated' },
    });
  }, 15000);

  it('records delete audit before the warehouse disappears from the Store database', async () => {
    if (!warehouseId) throw new Error('warehouse fixture not initialized');
    const id = warehouseId;
    const result = await deleteWarehouse(id, 'warehouse-audit-deleter');
    expect(result).toEqual({ id, deleted: true });

    const [deleted, events] = await Promise.all([
      storeDb.warehouse.findUnique({ where: { id } }),
      storeDb.auditOutbox.findMany({ where: { payloadJson: { contains: id } } }),
    ]);
    expect(deleted).toBeNull();
    expect(events.map((event) => JSON.parse(event.payloadJson).action)).toContain('store.warehouse.delete');
    expect(events.every((event) => event.status === 'PENDING')).toBe(true);
    warehouseId = undefined;
    await storeDb.auditOutbox.deleteMany({ where: { payloadJson: { contains: id } } });
  }, 15000);
});
