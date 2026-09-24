/**
 * HEAVIX — STEP 16-C Pass 4: Per-Resource Contract Test — OFFERS
 *
 * Resource-specific invariants for the `offers` admin resource.
 * Note: offers had 5 ❌ in 16-B (missing detailTabs/relations/bulkActions).
 */

import { describe, it, expect } from 'vitest';
import '@/lib/admin/resource-index';
import { registry } from '@/lib/admin/resource-registry';

const cfg = registry.get('offers');

describe('Offer Resource Contract (resource-specific invariants)', () => {
  if (!cfg) {
    it('offers config should be registered', () => expect(cfg).toBeDefined());
    return;
  }

  it('O1: should have at least 8 fields including required offerAmount', () => {
    expect(cfg.fields.length).toBeGreaterThanOrEqual(8);
    expect(cfg.fields.find(f => f.key === 'offerAmount')?.required).toBe(true);
  });

  it('O2: offerAmount should have validation with min >= 0', () => {
    const f = cfg.fields.find(f => f.key === 'offerAmount');
    expect(f?.validation?.min).toBeGreaterThanOrEqual(0);
  });

  it('O3: counterAmount should have validation with min >= 0', () => {
    const f = cfg.fields.find(f => f.key === 'counterAmount');
    expect(f?.validation?.min).toBeGreaterThanOrEqual(0);
  });

  it('O4: buyerPhone should have validation with Iranian phone pattern', () => {
    const f = cfg.fields.find(f => f.key === 'buyerPhone');
    expect(f?.validation?.pattern).toMatch(/\^0/);
  });

  it('O5: buyerPhone should have field-level permissions', () => {
    const f = cfg.fields.find(f => f.key === 'buyerPhone');
    expect(f?.permissions?.read).toBeDefined();
    expect(f?.permissions?.write).toBeDefined();
  });

  it('O6: buyerEmail should have field-level permissions', () => {
    const f = cfg.fields.find(f => f.key === 'buyerEmail');
    expect(f?.permissions?.read).toBeDefined();
    expect(f?.permissions?.write).toBeDefined();
  });

  it('O7: should have actions accept, reject', () => {
    const keys = (cfg.actions ?? []).map(a => a.key);
    expect(keys).toContain('accept');
    expect(keys).toContain('reject');
  });

  it('O8: audit should be enabled', () => {
    expect(cfg.audit?.enabled).toBe(true);
  });

  it('O9: should have key=offers, model=listingOffer', () => {
    expect(cfg.key).toBe('offers');
    expect(cfg.model).toBe('listingOffer');
  });

  // 16-C pass 7 — ADDED missing config sections
  it('O10: offers now has detailTabs (16-C pass 7 added)', () => {
    expect(cfg.detailTabs).toBeDefined();
    expect(cfg.detailTabs?.length).toBeGreaterThanOrEqual(2);
  });

  it('O11: offers now has relations (16-C pass 7 added)', () => {
    expect(cfg.relations).toBeDefined();
    expect(cfg.relations?.length).toBeGreaterThanOrEqual(1);
  });

  it('O12: offers now has bulkActions (16-C pass 7 added)', () => {
    expect(cfg.bulkActions).toBeDefined();
    expect(cfg.bulkActions?.length).toBeGreaterThanOrEqual(2);
    const keys = (cfg.bulkActions ?? []).map(a => a.key);
    expect(keys).toContain('bulk-accept');
    expect(keys).toContain('bulk-reject');
  });

  it('O13: offers has permissions.export set (reuses listing.read, post 16-C audit correction)', () => {
    expect(cfg.permissions.export).toBeDefined();
    expect(cfg.permissions.export).toBe('listing.read');
  });
});
