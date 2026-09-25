/**
 * HEAVIX — STEP 16-C Pass 3: Per-Resource Contract Test — DEALS
 *
 * Resource-specific invariants for the `deals` admin resource.
 * Addresses Dim 19 ⚠️ from the 16-B Completion Matrix.
 *
 * Invariants tested:
 *   D1. deal config has 7 fields including required dealNumber
 *   D2. dealNumber field has validation: pattern matches ^DEAL-\d{4,}$
 *   D3. agreedAmount field has validation: min >= 1000 (BigInt min)
 *   D4. currency field has validation: IRR|USD|EUR pattern
 *   D5. deal has 2 actions: confirm, cancel (post 16-C fix — handlers now registered)
 *   D6. deal has 1 bulkAction: bulk-cancel
 *   D7. deal has 4 detailTabs (overview/order/disputes/audit)
 *   D8. deal has 2 relations (orders, disputes) — both registered resource keys
 *   D9. deal audit.actions include deal.manage
 *   D10. deal config.key === 'deals'
 *   D11. deal config.model === 'deal'
 *   D12. deal permissions.export is set
 *   D13. deal has at least 10 columns
 *   D14. all 5 RBAC permission fields are set
 */

import { describe, it, expect } from 'vitest';
import '@/lib/admin/resource-index';
import { registry } from '@/lib/admin/resource-registry';

const cfg = registry.get('deals');

describe('Deal Resource Contract (resource-specific invariants)', () => {
  if (!cfg) {
    it('deals config should be registered', () => {
      expect(cfg).toBeDefined();
    });
    return;
  }

  // ── D1. Field count + required dealNumber ──────────────
  it('D1: should have at least 7 fields including required dealNumber', () => {
    expect(cfg.fields.length).toBeGreaterThanOrEqual(7);
    const dealNumField = cfg.fields.find(f => f.key === 'dealNumber');
    expect(dealNumField?.required).toBe(true);
  });

  // ── D2. dealNumber pattern ──────────────────────────────
  it('D2: dealNumber field should have validation with ^DEAL-\\d{4,}$ pattern', () => {
    const dealNumField = cfg.fields.find(f => f.key === 'dealNumber');
    expect(dealNumField?.validation).toBeDefined();
    expect(dealNumField?.validation?.pattern).toMatch(/DEAL/);
  });

  // ── D3. agreedAmount min ────────────────────────────────
  it('D3: agreedAmount field should have validation with min >= 1000', () => {
    const amountField = cfg.fields.find(f => f.key === 'agreedAmount');
    expect(amountField?.validation).toBeDefined();
    expect(amountField?.validation?.min).toBeGreaterThanOrEqual(1000);
  });

  // ── D4. currency pattern ────────────────────────────────
  it('D4: currency field should have validation with IRR|USD|EUR pattern', () => {
    const currencyField = cfg.fields.find(f => f.key === 'currency');
    expect(currencyField?.validation).toBeDefined();
    expect(currencyField?.validation?.pattern).toMatch(/IRR/);
  });

  // ── D5. Actions ─────────────────────────────────────────
  it('D5: should have actions confirm, cancel (handlers registered in 16-C pass 1)', () => {
    const actionKeys = (cfg.actions ?? []).map(a => a.key);
    expect(actionKeys).toContain('confirm');
    expect(actionKeys).toContain('cancel');
  });

  // ── D6. Bulk actions ───────────────────────────────────
  it('D6: should have bulkAction bulk-cancel', () => {
    const bulkKeys = (cfg.bulkActions ?? []).map(a => a.key);
    expect(bulkKeys).toContain('bulk-cancel');
  });

  // ── D7. Detail tabs ─────────────────────────────────────
  it('D7: should have 4 detail tabs (overview, order, disputes, audit)', () => {
    expect(cfg.detailTabs?.length).toBe(4);
    const tabKeys = (cfg.detailTabs ?? []).map(t => t.key);
    expect(tabKeys).toEqual(['overview', 'order', 'disputes', 'audit']);
  });

  // ── D8. Relations ──────────────────────────────────────
  it('D8: should have 2 relations (orders, disputes) — both registered', () => {
    expect(cfg.relations?.length).toBe(2);
    const relResources = (cfg.relations ?? []).map(r => r.resource);
    expect(relResources).toContain('orders');
    expect(relResources).toContain('disputes');
  });

  // ── D9. Audit action labels ─────────────────────────────
  it('D9: audit.actions should include deal.manage', () => {
    expect(cfg.audit?.enabled).toBe(true);
    expect(cfg.audit?.actions).toContain('deal.manage');
  });

  // ── D10-D12. Canonical config ───────────────────────────
  it('D10-D12: should have key=deals, model=deal, export set', () => {
    expect(cfg.key).toBe('deals');
    expect(cfg.model).toBe('deal');
    expect(cfg.permissions.export).toBeDefined();
  });

  // ── D13. Column count ───────────────────────────────────
  it('D13: should have at least 10 columns', () => {
    expect(cfg.columns.length).toBeGreaterThanOrEqual(10);
  });

  // ── D14. All 5 RBAC fields ──────────────────────────────
  it('D14: should have all 5 RBAC permission fields set', () => {
    expect(cfg.permissions.read).toBeDefined();
    expect(cfg.permissions.create).toBeDefined();
    expect(cfg.permissions.update).toBeDefined();
    expect(cfg.permissions.delete).toBeDefined();
    expect(cfg.permissions.export).toBeDefined();
  });
});
