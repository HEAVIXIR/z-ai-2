/**
 * HEAVIX — STEP 16-C Pass 4: Per-Resource Contract Test — DISPUTES
 */

import { describe, it, expect } from 'vitest';
import '@/lib/admin/resource-index';
import { registry } from '@/lib/admin/resource-registry';

const cfg = registry.get('disputes');

describe('Dispute Resource Contract (resource-specific invariants)', () => {
  if (!cfg) {
    it('disputes config should be registered', () => expect(cfg).toBeDefined());
    return;
  }

  it('D1: should have at least 6 fields including required reason + openedBy', () => {
    expect(cfg.fields.length).toBeGreaterThanOrEqual(6);
    expect(cfg.fields.find(f => f.key === 'reason')?.required).toBe(true);
    expect(cfg.fields.find(f => f.key === 'openedBy')?.required).toBe(true);
  });

  it('D2: reason should have validation with minLength >= 5', () => {
    const f = cfg.fields.find(f => f.key === 'reason');
    expect(f?.validation?.minLength).toBeGreaterThanOrEqual(5);
  });

  it('D3: reason should have validation with maxLength <= 200', () => {
    const f = cfg.fields.find(f => f.key === 'reason');
    expect(f?.validation?.maxLength).toBeLessThanOrEqual(200);
  });

  it('D4: description should have validation with maxLength <= 5000', () => {
    const f = cfg.fields.find(f => f.key === 'description');
    expect(f?.validation?.maxLength).toBeLessThanOrEqual(5000);
  });

  it('D5: openedBy should have validation with minLength >= 2', () => {
    const f = cfg.fields.find(f => f.key === 'openedBy');
    expect(f?.validation?.minLength).toBeGreaterThanOrEqual(2);
  });

  it('D6: should have actions review, resolve, cancel (post 16-C fix — handlers registered)', () => {
    const keys = (cfg.actions ?? []).map(a => a.key);
    expect(keys).toContain('review');
    expect(keys).toContain('resolve');
    expect(keys).toContain('cancel');
  });

  it('D7: should have key=disputes, model=dispute', () => {
    expect(cfg.key).toBe('disputes');
    expect(cfg.model).toBe('dispute');
  });

  it('D8: audit should be enabled with entityType=Dispute', () => {
    expect(cfg.audit?.enabled).toBe(true);
    expect(cfg.audit?.entityType).toBe('Dispute');
  });

  it('D9: audit.actions should include deal.manage (disputes reuses deal.* perms)', () => {
    expect(cfg.audit?.actions).toContain('deal.manage');
  });

  // 16-C pass 7 — ADDED missing config sections
  it('D10: disputes now has detailTabs (16-C pass 7 added)', () => {
    expect(cfg.detailTabs).toBeDefined();
    expect(cfg.detailTabs?.length).toBeGreaterThanOrEqual(2);
  });

  it('D11: disputes now has relations (16-C pass 7 added)', () => {
    expect(cfg.relations).toBeDefined();
    expect(cfg.relations?.length).toBeGreaterThanOrEqual(1);
  });

  it('D12: disputes now has bulkActions (16-C pass 7 added)', () => {
    expect(cfg.bulkActions).toBeDefined();
    expect(cfg.bulkActions?.length).toBeGreaterThanOrEqual(2);
    const keys = (cfg.bulkActions ?? []).map(a => a.key);
    expect(keys).toContain('bulk-review');
    expect(keys).toContain('bulk-resolve');
  });

  it('D13: disputes permissions.read references deal.read (reuses deal.* perms)', () => {
    expect(cfg.permissions.read).toBe('deal.read');
  });
});
