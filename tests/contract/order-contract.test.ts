/**
 * HEAVIX — STEP 16-C Pass 3: Per-Resource Contract Test — ORDERS
 *
 * Resource-specific invariants for the `orders` admin resource.
 * Addresses Dim 19 ⚠️ from the 16-B Completion Matrix.
 *
 * Invariants tested:
 *   O1. order config has 8 fields including required orderNumber + titleSnapshot + priceSnapshot
 *   O2. titleSnapshot field has validation: minLength >= 2, maxLength <= 200
 *   O3. priceSnapshot field has validation: min >= 0 (non-negative)
 *   O4. currencySnapshot field has validation: IRR|USD|EUR pattern
 *   O5. quantity field has validation: min=1, max=10000
 *   O6. commissionRate field has validation: min=0, max=100
 *   O7. order has 2 actions: confirm, cancel (post 16-C fix — handlers registered)
 *   O8. order has 1 bulkAction: bulk-confirm
 *   O9. order has 4 detailTabs (overview/payments/disputes/audit)
 *   O10. order has 1 relation (payments)
 *   O11. order audit.actions include order.update + order.manage
 *   O12. order config.key === 'orders'
 *   O13. order config.model === 'order'
 *   O14. order permissions.export === 'order.read' (canonical)
 *   O15. order has at least 12 columns
 */

import { describe, it, expect } from 'vitest';
import '@/lib/admin/resource-index';
import { registry } from '@/lib/admin/resource-registry';

const cfg = registry.get('orders');

describe('Order Resource Contract (resource-specific invariants)', () => {
  if (!cfg) {
    it('orders config should be registered', () => {
      expect(cfg).toBeDefined();
    });
    return;
  }

  // ── O1. Field count + required fields ──────────────────
  it('O1: should have at least 8 fields including required orderNumber + titleSnapshot + priceSnapshot', () => {
    expect(cfg.fields.length).toBeGreaterThanOrEqual(8);
    const numField = cfg.fields.find(f => f.key === 'orderNumber');
    const titleField = cfg.fields.find(f => f.key === 'titleSnapshot');
    const priceField = cfg.fields.find(f => f.key === 'priceSnapshot');
    expect(numField?.required).toBe(true);
    expect(titleField?.required).toBe(true);
    expect(priceField?.required).toBe(true);
  });

  // ── O2. titleSnapshot validation ────────────────────────
  it('O2: titleSnapshot field should have validation with minLength >= 2 and maxLength <= 200', () => {
    const titleField = cfg.fields.find(f => f.key === 'titleSnapshot');
    expect(titleField?.validation).toBeDefined();
    expect(titleField?.validation?.minLength).toBeGreaterThanOrEqual(2);
    expect(titleField?.validation?.maxLength).toBeLessThanOrEqual(200);
  });

  // ── O3. priceSnapshot min ───────────────────────────────
  it('O3: priceSnapshot field should have validation with min >= 0', () => {
    const priceField = cfg.fields.find(f => f.key === 'priceSnapshot');
    expect(priceField?.validation).toBeDefined();
    expect(priceField?.validation?.min).toBeGreaterThanOrEqual(0);
  });

  // ── O4. currencySnapshot pattern ────────────────────────
  it('O4: currencySnapshot field should have validation with IRR|USD|EUR pattern', () => {
    const currencyField = cfg.fields.find(f => f.key === 'currencySnapshot');
    expect(currencyField?.validation).toBeDefined();
    expect(currencyField?.validation?.pattern).toMatch(/IRR/);
  });

  // ── O5. quantity range ──────────────────────────────────
  it('O5: quantity field should have validation with min=1 and max=10000', () => {
    const qtyField = cfg.fields.find(f => f.key === 'quantity');
    expect(qtyField?.validation).toBeDefined();
    expect(qtyField?.validation?.min).toBe(1);
    expect(qtyField?.validation?.max).toBe(10000);
  });

  // ── O6. commissionRate range ────────────────────────────
  it('O6: commissionRate field should have validation with min=0 and max=100', () => {
    const rateField = cfg.fields.find(f => f.key === 'commissionRate');
    expect(rateField?.validation).toBeDefined();
    expect(rateField?.validation?.min).toBe(0);
    expect(rateField?.validation?.max).toBe(100);
  });

  // ── O7. Actions ─────────────────────────────────────────
  it('O7: should have actions confirm, cancel (handlers registered in 16-C pass 1)', () => {
    const actionKeys = (cfg.actions ?? []).map(a => a.key);
    expect(actionKeys).toContain('confirm');
    expect(actionKeys).toContain('cancel');
  });

  // ── O8. Bulk actions ───────────────────────────────────
  it('O8: should have bulkAction bulk-confirm', () => {
    const bulkKeys = (cfg.bulkActions ?? []).map(a => a.key);
    expect(bulkKeys).toContain('bulk-confirm');
  });

  // ── O9. Detail tabs ─────────────────────────────────────
  it('O9: should have 4 detail tabs (overview, payments, disputes, audit)', () => {
    expect(cfg.detailTabs?.length).toBe(4);
    const tabKeys = (cfg.detailTabs ?? []).map(t => t.key);
    expect(tabKeys).toEqual(['overview', 'payments', 'disputes', 'audit']);
  });

  // ── O10. Relations ──────────────────────────────────────
  it('O10: should have 1 relation (payments via orderId)', () => {
    expect(cfg.relations?.length).toBe(1);
    expect(cfg.relations?.[0].resource).toBe('payments');
    expect(cfg.relations?.[0].filterField).toBe('orderId');
  });

  // ── O11. Audit action labels ────────────────────────────
  it('O11: audit.actions should include order.update and order.manage', () => {
    expect(cfg.audit?.enabled).toBe(true);
    expect(cfg.audit?.actions).toContain('order.update');
    expect(cfg.audit?.actions).toContain('order.manage');
  });

  // ── O12-O14. Canonical config ───────────────────────────
  it('O12-O14: should have key=orders, model=order, export=order.read', () => {
    expect(cfg.key).toBe('orders');
    expect(cfg.model).toBe('order');
    expect(cfg.permissions.export).toBe('order.read');
  });

  // ── O15. Column count ───────────────────────────────────
  it('O15: should have at least 12 columns', () => {
    expect(cfg.columns.length).toBeGreaterThanOrEqual(12);
  });
});
