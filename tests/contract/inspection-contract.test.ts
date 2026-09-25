/**
 * HEAVIX — STEP 16-C Pass 4: Per-Resource Contract Test — INSPECTIONS
 */

import { describe, it, expect } from 'vitest';
import '@/lib/admin/resource-index';
import { registry } from '@/lib/admin/resource-registry';

const cfg = registry.get('inspections');

describe('Inspection Resource Contract (resource-specific invariants)', () => {
  if (!cfg) {
    it('inspections config should be registered', () => expect(cfg).toBeDefined());
    return;
  }

  it('I1: should have at least 8 fields including required requestedBy', () => {
    expect(cfg.fields.length).toBeGreaterThanOrEqual(8);
    expect(cfg.fields.find(f => f.key === 'requestedBy')?.required).toBe(true);
  });

  it('I2: requestedBy should have validation with minLength >= 2', () => {
    const f = cfg.fields.find(f => f.key === 'requestedBy');
    expect(f?.validation?.minLength).toBeGreaterThanOrEqual(2);
  });

  it('I3: score should have validation with min=0, max=100', () => {
    const f = cfg.fields.find(f => f.key === 'score');
    expect(f?.validation?.min).toBe(0);
    expect(f?.validation?.max).toBe(100);
  });

  it('I4: price should have validation with min >= 0', () => {
    const f = cfg.fields.find(f => f.key === 'price');
    expect(f?.validation?.min).toBeGreaterThanOrEqual(0);
  });

  it('I5: should have actions schedule, complete (post 16-C fix — handlers registered)', () => {
    const keys = (cfg.actions ?? []).map(a => a.key);
    expect(keys).toContain('schedule');
    expect(keys).toContain('complete');
  });

  it('I6: should have key=inspections, model=inspection', () => {
    expect(cfg.key).toBe('inspections');
    expect(cfg.model).toBe('inspection');
  });

  it('I7: audit should be enabled', () => {
    expect(cfg.audit?.enabled).toBe(true);
  });

  // 16-C pass 7 — ADDED missing config sections
  it('I8: inspections now has detailTabs (16-C pass 7 added)', () => {
    expect(cfg.detailTabs).toBeDefined();
    expect(cfg.detailTabs?.length).toBeGreaterThanOrEqual(2);
  });

  it('I9: inspections now has relations (16-C pass 7 added)', () => {
    expect(cfg.relations).toBeDefined();
    expect(cfg.relations?.length).toBeGreaterThanOrEqual(1);
  });

  it('I10: inspections now has bulkActions (16-C pass 7 added)', () => {
    expect(cfg.bulkActions).toBeDefined();
    expect(cfg.bulkActions?.length).toBeGreaterThanOrEqual(2);
    const keys = (cfg.bulkActions ?? []).map(a => a.key);
    expect(keys).toContain('bulk-schedule');
    expect(keys).toContain('bulk-cancel');
  });

  it('I11: inspections permissions.read references inspection.read (post 16-C fix in PERMISSIONS array)', () => {
    expect(cfg.permissions.read).toBe('inspection.read');
  });
});
