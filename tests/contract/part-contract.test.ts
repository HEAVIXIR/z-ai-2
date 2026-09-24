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

  // Documented 16-B gaps (still ❌ in matrix, intentionally NOT yet fixed)
  it('PT7: parts has NO filters field (documented 16-B gap)', () => {
    // 16-B Dim 8 = ❌ for parts. Acknowledged debt, not a regression.
    expect(cfg.filters).toBeUndefined();
  });

  it('PT8: parts has NO detailTabs field (documented 16-B gap)', () => {
    // 16-B Dim 13 = ❌ for parts. Acknowledged debt.
    expect(cfg.detailTabs).toBeUndefined();
  });

  it('PT9: parts has NO relations field (documented 16-B gap)', () => {
    // 16-B Dim 14 = ❌ for parts. Acknowledged debt.
    expect(cfg.relations).toBeUndefined();
  });

  it('PT10: parts has NO bulkActions field (documented 16-B gap)', () => {
    // 16-B Dim 16 = ❌ for parts. Acknowledged debt.
    expect(cfg.bulkActions).toBeUndefined();
  });

  it('PT11: parts has NO permissions.export (documented 16-B gap)', () => {
    // 16-B Dim 17 was ❌; post 16-C pass 1, canExport uses map entry 'parts' → 'part.read'
    expect(cfg.permissions.export).toBeUndefined();
  });
});
