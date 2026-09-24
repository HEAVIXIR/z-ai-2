/**
 * HEAVIX — STEP 16-C Pass 4: Per-Resource Contract Test — MACHINES
 *
 * Resource-specific invariants for the `machines` admin resource.
 * Note: machines was significantly incomplete in 16-B (5 ❌).
 */

import { describe, it, expect } from 'vitest';
import '@/lib/admin/resource-index';
import { registry } from '@/lib/admin/resource-registry';

const cfg = registry.get('machines');

describe('Machine Resource Contract (resource-specific invariants)', () => {
  if (!cfg) {
    it('machines config should be registered', () => expect(cfg).toBeDefined());
    return;
  }

  it('M1: should have at least 5 fields', () => {
    expect(cfg.fields.length).toBeGreaterThanOrEqual(5);
  });

  it('M2: serialNumber should have validation with minLength >= 3', () => {
    const f = cfg.fields.find(f => f.key === 'serialNumber');
    expect(f?.validation?.minLength).toBeGreaterThanOrEqual(3);
  });

  it('M3: serialNumber should have validation with maxLength <= 100', () => {
    const f = cfg.fields.find(f => f.key === 'serialNumber');
    expect(f?.validation?.maxLength).toBeLessThanOrEqual(100);
  });

  it('M4: manufactureYear should have validation with min=1950, max=2100', () => {
    const f = cfg.fields.find(f => f.key === 'manufactureYear');
    expect(f?.validation?.min).toBe(1950);
    expect(f?.validation?.max).toBe(2100);
  });

  it('M5: hours should have validation with min=0, max=100000', () => {
    const f = cfg.fields.find(f => f.key === 'hours');
    expect(f?.validation?.min).toBe(0);
    expect(f?.validation?.max).toBe(100000);
  });

  it('M6: should have key=machines, model=machine', () => {
    expect(cfg.key).toBe('machines');
    expect(cfg.model).toBe('machine');
  });

  it('M7: audit should be enabled with entityType=Machine', () => {
    expect(cfg.audit?.enabled).toBe(true);
    expect(cfg.audit?.entityType).toBe('Machine');
  });

  // Documented 16-B gaps (still ❌ in matrix)
  it('M8: machines has NO detailTabs (documented 16-B gap, acknowledged V2.4 read-only)', () => {
    expect(cfg.detailTabs).toBeUndefined();
  });

  it('M9: machines has NO relations field (documented 16-B gap)', () => {
    expect(cfg.relations).toBeUndefined();
  });

  it('M10: machines has NO actions field (documented 16-B gap)', () => {
    expect(cfg.actions).toBeUndefined();
  });

  it('M11: machines has NO bulkActions field (documented 16-B gap)', () => {
    expect(cfg.bulkActions).toBeUndefined();
  });

  it('M12: machines has NO permissions.export (documented 16-B gap)', () => {
    expect(cfg.permissions.export).toBeUndefined();
  });
});
