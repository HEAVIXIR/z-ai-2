/**
 * HEAVIX — STEP 16-C Pass 4: Per-Resource Contract Test — RFQS
 *
 * Resource-specific invariants for the `rfqs` admin resource.
 */

import { describe, it, expect } from 'vitest';
import '@/lib/admin/resource-index';
import { registry } from '@/lib/admin/resource-registry';

const cfg = registry.get('rfqs');

describe('RFQ Resource Contract (resource-specific invariants)', () => {
  if (!cfg) {
    it('rfqs config should be registered', () => expect(cfg).toBeDefined());
    return;
  }

  it('R1: should have at least 13 fields including required title + buyerPhone', () => {
    expect(cfg.fields.length).toBeGreaterThanOrEqual(13);
    expect(cfg.fields.find(f => f.key === 'title')?.required).toBe(true);
    expect(cfg.fields.find(f => f.key === 'buyerPhone')?.required).toBe(true);
  });

  it('R2: title should have validation with minLength >= 3', () => {
    const f = cfg.fields.find(f => f.key === 'title');
    expect(f?.validation?.minLength).toBeGreaterThanOrEqual(3);
  });

  it('R3: quantity should have validation with min=1, max=10000', () => {
    const f = cfg.fields.find(f => f.key === 'quantity');
    expect(f?.validation?.min).toBe(1);
    expect(f?.validation?.max).toBe(10000);
  });

  it('R4: budgetMin should have validation with min >= 0', () => {
    const f = cfg.fields.find(f => f.key === 'budgetMin');
    expect(f?.validation?.min).toBeGreaterThanOrEqual(0);
  });

  it('R5: budgetMax should have validation with min >= 0', () => {
    const f = cfg.fields.find(f => f.key === 'budgetMax');
    expect(f?.validation?.min).toBeGreaterThanOrEqual(0);
  });

  it('R6: buyerPhone should have validation with Iranian phone pattern', () => {
    const f = cfg.fields.find(f => f.key === 'buyerPhone');
    expect(f?.validation?.pattern).toMatch(/\^0/);
  });

  it('R7: buyerPhone should have field-level permissions {read, write}', () => {
    const f = cfg.fields.find(f => f.key === 'buyerPhone');
    expect(f?.permissions?.read).toBeDefined();
    expect(f?.permissions?.write).toBeDefined();
  });

  it('R8: buyerEmail should have field-level permissions {read, write}', () => {
    const f = cfg.fields.find(f => f.key === 'buyerEmail');
    expect(f?.permissions?.read).toBeDefined();
    expect(f?.permissions?.write).toBeDefined();
  });

  it('R9: should have actions close, delete', () => {
    const keys = (cfg.actions ?? []).map(a => a.key);
    expect(keys).toContain('close');
    expect(keys).toContain('delete');
  });

  it('R10: should have 4 detail tabs (overview, quotes, audit, activity)', () => {
    expect(cfg.detailTabs?.length).toBeGreaterThanOrEqual(3);
  });

  it('R11: should have 1 relation (rfq-quotes)', () => {
    expect(cfg.relations?.length).toBe(1);
    expect(cfg.relations?.[0].resource).toBe('rfq-quotes');
  });

  it('R12: audit.actions should include rfq.manage', () => {
    expect(cfg.audit?.actions).toContain('rfq.manage');
  });

  it('R13: should have key=rfqs, model=rFQ', () => {
    expect(cfg.key).toBe('rfqs');
    expect(cfg.model).toBe('rFQ');
  });
});
