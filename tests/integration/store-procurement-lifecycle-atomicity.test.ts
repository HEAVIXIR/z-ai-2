import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { storeDb } from '@/lib/store-db';
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseOrder,
  submitPurchaseOrder,
} from '@/lib/store-procurement-service';

const suffix = () => String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10);

describe('Store purchase-order lifecycle and audit atomicity (real PostgreSQL)', () => {
  let categoryId: string | undefined;
  let partId: string | undefined;
  let procurementId: string | undefined;
  const supplierFixtureIds: string[] = [];
  const poIds: string[] = [];

  beforeEach(async () => {
    const tag = suffix();
    const category = await storeDb.category.create({
      data: { name: 'PO lifecycle ' + tag, slug: 'po-lifecycle-' + tag },
    });
    categoryId = category.id;
    const part = await storeDb.part.create({
      data: {
        name: 'PO lifecycle part ' + tag,
        sku: 'PO-LIFECYCLE-' + tag,
        categoryId: category.id,
        priceUsd: 12,
        stock: 0,
      },
    });
    partId = part.id;
    const procurement = await storeDb.procurementRequest.create({
      data: { title: 'PO lifecycle ' + tag, quantity: 2, status: 'AWARDED' },
    });
    procurementId = procurement.id;
  });

  afterEach(async () => {
    if (poIds.length) {
      await storeDb.auditOutbox.deleteMany({
        where: { OR: poIds.map((id) => ({ payloadJson: { contains: id } })) },
      });
      await storeDb.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: { in: poIds } } });
      await storeDb.purchaseOrder.deleteMany({ where: { id: { in: poIds } } });
      poIds.length = 0;
    }
    if (procurementId) {
      await storeDb.procurementRequest.deleteMany({ where: { id: procurementId } });
      procurementId = undefined;
    }
    if (supplierFixtureIds.length) {
      await storeDb.supplier.deleteMany({ where: { id: { in: supplierFixtureIds } } });
      supplierFixtureIds.length = 0;
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

  it('rejects purchase orders before award and rejects inactive suppliers', async () => {
    if (!procurementId || !partId) throw new Error('fixture setup incomplete');

    await storeDb.procurementRequest.update({
      where: { id: procurementId },
      data: { status: 'QUOTING' },
    });
    await expect(
      createPurchaseOrder(procurementId, null, [{ partId, quantity: 1, unitPrice: 12 }]),
    ).rejects.toMatchObject({ status: 409 });

    await storeDb.procurementRequest.update({
      where: { id: procurementId },
      data: { status: 'AWARDED' },
    });
    const supplier = await storeDb.supplier.create({
      data: { name: 'Inactive supplier ' + suffix(), active: false },
    });
    supplierFixtureIds.push(supplier.id);
    await expect(
      createPurchaseOrder(procurementId, supplier.id, [{ partId, quantity: 1, unitPrice: 12 }]),
    ).rejects.toMatchObject({ status: 409 });

    const orders = await storeDb.purchaseOrder.findMany({ where: { procurementId } });
    expect(orders).toHaveLength(0);
  }, 15000);

  it('inherits the awarded supplier and rejects a different supplier on the purchase order', async () => {
    if (!procurementId || !partId) throw new Error('fixture setup incomplete');
    const awardedSupplier = await storeDb.supplier.create({
      data: { name: 'Awarded supplier ' + suffix(), active: true },
    });
    const otherSupplier = await storeDb.supplier.create({
      data: { name: 'Other supplier ' + suffix(), active: true },
    });
    supplierFixtureIds.push(awardedSupplier.id, otherSupplier.id);
    await storeDb.procurementRequest.update({
      where: { id: procurementId },
      data: { supplierId: awardedSupplier.id },
    });

    const created = await createPurchaseOrder(
      procurementId,
      null,
      [{ partId, quantity: 1, unitPrice: 12 }],
    );
    poIds.push(created.id);
    expect(created.supplierId).toBe(awardedSupplier.id);

    await expect(
      createPurchaseOrder(procurementId, otherSupplier.id, [{ partId, quantity: 1, unitPrice: 12 }]),
    ).rejects.toMatchObject({ status: 409 });
  }, 15000);

  it('blocks approval by the same identity that submitted the purchase order', async () => {
    if (!procurementId || !partId) throw new Error('fixture setup incomplete');
    const created = await createPurchaseOrder(procurementId, null, [{ partId, quantity: 1, unitPrice: 12 }]);
    poIds.push(created.id);
    const submitted = await submitPurchaseOrder(created.id, 'same-admin');
    expect(submitted.submittedBy).toBe('same-admin');

    await expect(
      approvePurchaseOrder(created.id, 'same-admin'),
    ).rejects.toMatchObject({ status: 409 });

    const unchanged = await storeDb.purchaseOrder.findUnique({ where: { id: created.id } });
    expect(unchanged?.status).toBe('SUBMITTED');
    expect(unchanged?.approvedBy).toBeNull();

    const approved = await approvePurchaseOrder(created.id, 'different-admin');
    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedBy).toBe('different-admin');
    expect(approved.submittedBy).toBe('same-admin');
  }, 15000);

  it('creates, submits, approves, and cancels with one outbox event per committed transition', async () => {
    if (!procurementId || !partId) throw new Error('fixture setup incomplete');
    const created = await createPurchaseOrder(procurementId, null, [{ partId, quantity: 2, unitPrice: 12 }], 'admin-test');
    poIds.push(created.id);
    expect(created.status).toBe('DRAFT');

    const submitted = await submitPurchaseOrder(created.id, 'admin-submit');
    expect(submitted.status).toBe('SUBMITTED');
    const approved = await approvePurchaseOrder(created.id, 'admin-approve');
    expect(approved.status).toBe('APPROVED');
    const cancelled = await cancelPurchaseOrder(created.id, 'test cancellation', 'admin-cancel');
    expect(cancelled.status).toBe('CANCELLED');

    const events = await storeDb.auditOutbox.findMany({
      where: { payloadJson: { contains: created.id } },
    });
    const actions = events.map((event) => JSON.parse(event.payloadJson).action).sort();
    expect(actions).toEqual([
      'store.procurement.po.approve',
      'store.procurement.po.cancel',
      'store.procurement.po.create',
      'store.procurement.po.submit',
    ]);
    expect(events).toHaveLength(4);
  }, 20000);

  it('allows only one concurrent DRAFT to SUBMITTED claim and emits one audit event', async () => {
    if (!procurementId || !partId) throw new Error('fixture setup incomplete');
    const created = await createPurchaseOrder(procurementId, null, [{ partId, quantity: 1, unitPrice: 12 }]);
    poIds.push(created.id);

    const results = await Promise.allSettled([
      submitPurchaseOrder(created.id, 'admin-a'),
      submitPurchaseOrder(created.id, 'admin-b'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const [po, events] = await Promise.all([
      storeDb.purchaseOrder.findUnique({ where: { id: created.id } }),
      storeDb.auditOutbox.findMany({ where: { payloadJson: { contains: created.id } } }),
    ]);
    expect(po?.status).toBe('SUBMITTED');
    expect(events.map((event) => JSON.parse(event.payloadJson).action).sort()).toEqual([
      'store.procurement.po.create',
      'store.procurement.po.submit',
    ]);
  }, 20000);
});
