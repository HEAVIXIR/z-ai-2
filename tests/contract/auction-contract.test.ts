/**
 * HEAVIX — STEP 16-C Pass 4: Per-Resource Contract Test — AUCTIONS
 */

import { describe, it, expect } from 'vitest';
import '@/lib/admin/resource-index';
import { registry } from '@/lib/admin/resource-registry';

const cfg = registry.get('auctions');

describe('Auction Resource Contract (resource-specific invariants)', () => {
  if (!cfg) {
    it('auctions config should be registered', () => expect(cfg).toBeDefined());
    return;
  }

  it('A1: should have at least 8 fields including required title + startPrice', () => {
    expect(cfg.fields.length).toBeGreaterThanOrEqual(8);
    expect(cfg.fields.find(f => f.key === 'title')?.required).toBe(true);
    expect(cfg.fields.find(f => f.key === 'startPrice')?.required).toBe(true);
  });

  it('A2: title should have validation with minLength >= 3', () => {
    const f = cfg.fields.find(f => f.key === 'title');
    expect(f?.validation?.minLength).toBeGreaterThanOrEqual(3);
  });

  it('A3: startPrice should have validation with min >= 1000', () => {
    const f = cfg.fields.find(f => f.key === 'startPrice');
    expect(f?.validation?.min).toBeGreaterThanOrEqual(1000);
  });

  it('A4: reservePrice should have validation with min >= 1000', () => {
    const f = cfg.fields.find(f => f.key === 'reservePrice');
    expect(f?.validation?.min).toBeGreaterThanOrEqual(1000);
  });

  it('A5: minIncrement should have validation with min >= 100', () => {
    const f = cfg.fields.find(f => f.key === 'minIncrement');
    expect(f?.validation?.min).toBeGreaterThanOrEqual(100);
  });

  it('A6: should have actions start, end, cancel (post 16-C fix — handlers registered)', () => {
    const keys = (cfg.actions ?? []).map(a => a.key);
    expect(keys).toContain('start');
    expect(keys).toContain('end');
    expect(keys).toContain('cancel');
  });

  it('A7: should have 3 detail tabs (overview, bids, audit)', () => {
    expect(cfg.detailTabs?.length).toBeGreaterThanOrEqual(3);
  });

  it('A8: should have 1 relation (auction-bids)', () => {
    expect(cfg.relations?.length).toBe(1);
    expect(cfg.relations?.[0].resource).toBe('auction-bids');
  });

  it('A9: audit.actions should include auction.manage', () => {
    expect(cfg.audit?.actions).toContain('auction.manage');
  });

  it('A10: should have key=auctions, model=auction', () => {
    expect(cfg.key).toBe('auctions');
    expect(cfg.model).toBe('auction');
  });

  // Documented 16-B gaps
  it('A11: auctions has NO bulkActions (documented 16-B gap)', () => {
    expect(cfg.bulkActions).toBeUndefined();
  });

  it('A12: auctions has permissions.export set (reuses auction.manage, post 16-C audit correction)', () => {
    // 16-B audit reported auctions had NO permissions.export, but actual config
    // DOES set export='auction.manage'. 16-B error.
    expect(cfg.permissions.export).toBeDefined();
    expect(cfg.permissions.export).toBe('auction.manage');
  });
});
