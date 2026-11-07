import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const procurementCollection = fs.readFileSync('src/app/api/admin/store/procurement/route.ts', 'utf8');
const supplierCollection = fs.readFileSync('src/app/api/admin/store/suppliers/route.ts', 'utf8');
const supplierItem = fs.readFileSync('src/app/api/admin/store/suppliers/[id]/route.ts', 'utf8');
const resourceConfigs = fs.readFileSync('src/lib/admin/resources/store-domain-resources.ts', 'utf8');

describe('Procurement and supplier mutation safety', () => {
  it('creates procurement requests with CSRF protection and atomic Store outbox audit', () => {
    const post = procurementCollection.slice(procurementCollection.indexOf('export async function POST('));
    expect(post).toContain('checkCsrf(req)');
    expect(post).toContain('storeDb.$transaction');
    expect(post).toContain('enqueueAuditOutbox(tx');
    expect(post).toContain("isolationLevel: 'Serializable'");
    expect(post).not.toContain('logAudit(');
    expect(post).toContain("status: 'DRAFT'");
  });

  it('creates suppliers with CSRF protection and atomic Store outbox audit', () => {
    const post = supplierCollection.slice(supplierCollection.indexOf('export async function POST('));
    expect(post).toContain('checkCsrf(req)');
    expect(post).toContain('storeDb.$transaction');
    expect(post).toContain('enqueueAuditOutbox(tx');
    expect(post).not.toContain('logAudit(');
  });

  it('protects supplier PATCH and DELETE with CSRF, CAS, and transactional audit', () => {
    const patch = supplierItem.slice(supplierItem.indexOf('export async function PATCH('), supplierItem.indexOf('export async function DELETE('));
    const remove = supplierItem.slice(supplierItem.indexOf('export async function DELETE('));
    expect(patch).toContain('checkCsrf(req)');
    expect(patch).toContain('updatedAt: existing.updatedAt');
    expect(patch).toContain('enqueueAuditOutbox(tx');
    expect(remove).toContain('checkCsrf(req)');
    expect(remove).toContain('updatedAt: existing.updatedAt');
    expect(remove).toContain('enqueueAuditOutbox(tx');
  });

  it('keeps procurement and supplier read-only in the Universal Resource Engine', () => {
    const procurement = resourceConfigs.slice(
      resourceConfigs.indexOf('export const procurementConfig: AdminResourceConfig = {'),
      resourceConfigs.indexOf('// ── 5. Customers'),
    );
    const suppliers = resourceConfigs.slice(
      resourceConfigs.indexOf('export const suppliersConfig: AdminResourceConfig = {'),
      resourceConfigs.indexOf('// ── 8. Car Models'),
    );
    for (const block of [procurement, suppliers]) {
      expect(block).not.toMatch(/\\n\\s*create:\\s*'/);
      expect(block).not.toMatch(/\\n\\s*update:\\s*'/);
      expect(block).not.toMatch(/\\n\\s*delete:\\s*'/);
    }
    expect(procurement).not.toContain("key: 'bulk-publish'");
    expect(suppliers).not.toContain("key: 'bulk-activate'");
    expect(suppliers).not.toContain("key: 'bulk-deactivate'");
  });

  it('prevents deleting suppliers referenced by procurement or purchase orders', () => {
    expect(supplierItem).toContain('existing._count.procurements > 0');
    expect(supplierItem).toContain('existing._count.purchaseOrders > 0');
  });
});
