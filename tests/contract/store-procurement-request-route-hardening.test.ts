import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const route = fs.readFileSync(
  'src/app/api/admin/store/procurement/[id]/route.ts',
  'utf8',
);
const procurementService = fs.readFileSync('src/lib/store-procurement-service.ts', 'utf8');

describe('ProcurementRequest mutation security and lifecycle', () => {
  it('requires CSRF for both PATCH and DELETE mutations', () => {
    const patch = route.slice(route.indexOf('export async function PATCH('), route.indexOf('export async function DELETE('));
    const remove = route.slice(route.indexOf('export async function DELETE('));
    expect(patch).toContain('checkCsrf(req)');
    expect(remove).toContain('checkCsrf(req)');
  });

  it('writes update and delete audit events through the Store transactional outbox', () => {
    expect(route).toContain('enqueueAuditOutbox(tx');
    expect(route).not.toContain('logAudit(');
    expect(route).toContain("isolationLevel: 'Serializable'");
  });

  it('enforces the ordered procurement state machine and an active awarded supplier', () => {
    expect(route).toContain("DRAFT: ['PUBLISHED', 'CANCELLED']");
    expect(route).toContain("PUBLISHED: ['QUOTING', 'CANCELLED']");
    expect(route).toContain("QUOTING: ['AWARDED', 'CANCELLED']");
    expect(route).toContain("AWARDED: ['COMPLETED', 'CANCELLED']");
    expect(route).toContain("if (effectiveStatus === 'AWARDED')");
    expect(route).toContain('!supplier.active');
  });

  it('prevents completion with open purchase orders and deletion with any linked purchase order', () => {
    expect(route).toContain("status: { notIn: ['RECEIVED', 'CANCELLED'] }");
    expect(route).toContain('existing._count.purchaseOrders > 0');
  });

  it('prevents closing a tender while purchase orders remain unresolved', () => {
    expect(route).toContain("body.status === 'COMPLETED' || body.status === 'CANCELLED'");
    expect(route).toContain("status: { notIn: ['RECEIVED', 'CANCELLED'] }");
  });

  it('blocks receiving against a tender that is no longer AWARDED', () => {
    const receive = procurementService.slice(
      procurementService.indexOf('export async function receivePurchaseOrderItem('),
      procurementService.indexOf('export async function cancelPurchaseOrder('),
    );
    expect(receive).toContain('purchaseOrder: {');
    expect(receive).toContain("procurement: { select: { status: true } }");
    expect(receive).toContain("procurement.status !== 'AWARDED'");
  });

  it('uses conditional updates and serializable conflict handling', () => {
    expect(route).toContain('where: { id, status: existing.status }');
    expect(route).toContain("e?.code === 'P2034'");
    expect(route).toContain('{ status: 409 }');
  });
});
