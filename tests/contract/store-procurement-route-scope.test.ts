import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const route = fs.readFileSync(
  'src/app/api/admin/store/procurement/[id]/purchase-orders/[poId]/route.ts',
  'utf8',
);

describe('purchase-order nested route scope', () => {
  it('does not expose a purchase order through a different procurement parent in GET', () => {
    expect(route).toContain('const { id: procurementId, poId } = await params;');
    expect(route).toContain('if (po.procurementId !== procurementId)');
  });

  it('does not mutate a purchase order through a different procurement parent in PATCH', () => {
    expect(route).toContain('if (existing.procurementId !== procurementId)');
    expect(route).toContain('const existing = await getPurchaseOrder(poId);');
  });

  it('keeps the nested lifecycle behind procurement RBAC and CSRF checks', () => {
    expect(route).toContain("requirePermission(user.id, 'procurement.read')");
    expect(route).toContain("requirePermission(user.id, 'procurement.manage')");
    expect(route).toContain('checkCsrf(req)');
  });
});
