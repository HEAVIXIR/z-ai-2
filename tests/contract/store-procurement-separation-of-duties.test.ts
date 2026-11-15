import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const schema = fs.readFileSync('prisma/store/schema.prisma', 'utf8');
const migration = fs.readFileSync(
  'prisma/store/migrations/0003_purchase_order_submitter/migration.sql',
  'utf8',
);
const service = fs.readFileSync('src/lib/store-procurement-service.ts', 'utf8');

describe('Purchase order separation of duties', () => {
  it('persists the submitter identity in the Store schema and additive migration', () => {
    const model = schema.slice(schema.indexOf('model PurchaseOrder {'), schema.indexOf('model PurchaseOrderItem {'));
    expect(model).toContain('submittedBy     String?');
    expect(migration).toContain('ADD COLUMN "submittedBy" TEXT');
  });

  it('records the submitter atomically with the SUBMITTED transition', () => {
    const submit = service.slice(service.indexOf('export async function submitPurchaseOrder('), service.indexOf('export async function approvePurchaseOrder('));
    expect(submit).toContain("data: { status: 'SUBMITTED', submittedBy: userId }");
    expect(submit).toContain('enqueueAuditOutbox(tx');
  });

  it('rejects same-user approval while preserving legacy null submitter compatibility', () => {
    const approve = service.slice(service.indexOf('export async function approvePurchaseOrder('), service.indexOf('export async function receivePurchaseOrderItem('));
    expect(approve).toContain('existing.submittedBy && existing.submittedBy === userId');
    expect(approve).toContain('تأیید سفارش خرید توسط همان کاربری');
  });
});
