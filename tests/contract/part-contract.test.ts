/**
 * HEAVIX — STEP 16-C Pass 4: Per-Resource Contract Test — PARTS
 *
 * Resource-specific invariants for the `parts` admin resource.
 * Addresses Dim 19 ⚠️ from the 16-B Completion Matrix.
 * Note: parts was the LEAST complete resource in 16-B (50% score, 6 ❌).
 */

import { describe, it, expect } from 'vitest';
import '@/lib/admin/resource-index';
import { registry } from '@/lib/admin/resource-registry';

const cfg = registry.get('parts');

describe('Part Resource Contract (resource-specific invariants)', () => {
  if (!cfg) {
    it('parts config should be registered', () => expect(cfg).toBeDefined());
    return;
  }

  it('PT1: should have at least 4 fields', () => {
    expect(cfg.fields.length).toBeGreaterThanOrEqual(4);
  });

  it('PT2: partNumber should have validation with maxLength <= 100', () => {
    const f = cfg.fields.find(f => f.key === 'partNumber');
    expect(f?.validation?.maxLength).toBeLessThanOrEqual(100);
  });

  it('PT3: oemNumber should have validation with maxLength <= 100', () => {
    const f = cfg.fields.find(f => f.key === 'oemNumber');
    expect(f?.validation?.maxLength).toBeLessThanOrEqual(100);
  });

  it('PT4: should have action delete', () => {
    const keys = (cfg.actions ?? []).map(a => a.key);
    expect(keys).toContain('delete');
  });

  it('PT5: should have key=parts, model=part', () => {
    expect(cfg.key).toBe('parts');
    expect(cfg.model).toBe('part');
  });

  it('PT6: audit should be enabled with entityType=Part', () => {
    expect(cfg.audit?.enabled).toBe(true);
    expect(cfg.audit?.entityType).toBe('Part');
  });

  // 16-C pass 6 — ADDED missing config sections (was 16-B gap)
  it('PT7: parts now has filters field (16-C pass 6 added)', () => {
    // 16-B Dim 8 was ❌; pass 6 added 2 filters (status, condition)
    expect(cfg.filters).toBeDefined();
    expect(cfg.filters?.length).toBeGreaterThanOrEqual(2);
  });

  it('PT8: parts now has detailTabs (16-C pass 6 added)', () => {
    expect(cfg.detailTabs).toBeDefined();
    expect(cfg.detailTabs?.length).toBeGreaterThanOrEqual(2);
  });

  it('PT9: parts now has relations (16-C pass 6 added)', () => {
    expect(cfg.relations).toBeDefined();
    expect(cfg.relations?.length).toBeGreaterThanOrEqual(1);
  });

  it('PT10: parts now has bulkActions (16-C pass 6 added)', () => {
    expect(cfg.bulkActions).toBeDefined();
    expect(cfg.bulkActions?.length).toBeGreaterThanOrEqual(1);
  });

  it('PT11: parts now has permissions.export set (16-C pass 6 added)', () => {
    expect(cfg.permissions.export).toBeDefined();
    expect(cfg.permissions.export).toBe('part.read');
  });

  it('PT12: parts permissions.read uses canonical part.read (16-C pass 6 fix)', () => {
    expect(cfg.permissions.read).toBe('part.read');
  });

  it('PT13: parts has 2 actions (delete + activate, 16-C pass 6 added)', () => {
    expect(cfg.actions?.length).toBeGreaterThanOrEqual(2);
    const keys = (cfg.actions ?? []).map(a => a.key);
    expect(keys).toContain('delete');
    expect(keys).toContain('activate');
  });
});
