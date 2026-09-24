/**
 * HEAVIX — STEP 16-C Pass 4: Per-Resource Contract Test — BUY-REQUESTS
 *
 * Note: buy-requests uses a DASH in its key (unique among all 18 resources).
 */

import { describe, it, expect } from 'vitest';
import '@/lib/admin/resource-index';
import { registry } from '@/lib/admin/resource-registry';

const cfg = registry.get('buy-requests');

describe('BuyRequest Resource Contract (resource-specific invariants)', () => {
  if (!cfg) {
    it('buy-requests config should be registered', () => expect(cfg).toBeDefined());
    return;
  }

  it('B1: should have at least 13 fields including required title', () => {
    expect(cfg.fields.length).toBeGreaterThanOrEqual(13);
    expect(cfg.fields.find(f => f.key === 'title')?.required).toBe(true);
  });

  it('B2: title should have validation with minLength >= 3', () => {
    const f = cfg.fields.find(f => f.key === 'title');
    expect(f?.validation?.minLength).toBeGreaterThanOrEqual(3);
  });

  it('B3: budgetMin should have validation with min >= 0', () => {
    const f = cfg.fields.find(f => f.key === 'budgetMin');
    expect(f?.validation?.min).toBeGreaterThanOrEqual(0);
  });

  it('B4: budgetMax should have validation with min >= 0', () => {
    const f = cfg.fields.find(f => f.key === 'budgetMax');
    expect(f?.validation?.min).toBeGreaterThanOrEqual(0);
  });

  it('B5: requesterPhone should have validation with Iranian phone pattern', () => {
    const f = cfg.fields.find(f => f.key === 'requesterPhone');
    expect(f?.validation?.pattern).toMatch(/\^0/);
  });

  it('B6: should have actions verify, close, delete', () => {
    const keys = (cfg.actions ?? []).map(a => a.key);
    expect(keys).toContain('verify');
    expect(keys).toContain('close');
    expect(keys).toContain('delete');
  });

  it('B7: should have key=buy-requests (unique DASH key, not camelCase)', () => {
    expect(cfg.key).toBe('buy-requests');
  });

  it('B8: should have model=buyRequest', () => {
    expect(cfg.model).toBe('buyRequest');
  });

  it('B9: audit should be enabled', () => {
    expect(cfg.audit?.enabled).toBe(true);
  });

  // Documented 16-B gaps
  it('B10: buy-requests has NO detailTabs (documented 16-B gap)', () => {
    expect(cfg.detailTabs).toBeUndefined();
  });

  it('B11: buy-requests has NO relations (documented 16-B gap)', () => {
    expect(cfg.relations).toBeUndefined();
  });

  it('B12: buy-requests has NO bulkActions (documented 16-B gap)', () => {
    expect(cfg.bulkActions).toBeUndefined();
  });

  it('B13: buy-requests permissions.read references request.read (post 16-C fix)', () => {
    expect(cfg.permissions.read).toBe('request.read');
  });

  it('B14: buy-requests has permissions.export set (reuses request.read)', () => {
    // 16-B audit reported buy-requests had NO permissions.export, but actual
    // config DOES set export='request.read'. 16-B error.
    expect(cfg.permissions.export).toBeDefined();
    expect(cfg.permissions.export).toBe('request.read');
  });
});
