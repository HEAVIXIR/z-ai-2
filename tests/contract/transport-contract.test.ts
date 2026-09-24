/**
 * HEAVIX — STEP 16-C Pass 4: Per-Resource Contract Test — TRANSPORTS
 */

import { describe, it, expect } from 'vitest';
import '@/lib/admin/resource-index';
import { registry } from '@/lib/admin/resource-registry';

const cfg = registry.get('transports');

describe('Transport Resource Contract (resource-specific invariants)', () => {
  if (!cfg) {
    it('transports config should be registered', () => expect(cfg).toBeDefined());
    return;
  }

  it('T1: should have at least 15 fields including required origin + destination + requestedBy', () => {
    expect(cfg.fields.length).toBeGreaterThanOrEqual(15);
    expect(cfg.fields.find(f => f.key === 'origin')?.required).toBe(true);
    expect(cfg.fields.find(f => f.key === 'destination')?.required).toBe(true);
    expect(cfg.fields.find(f => f.key === 'requestedBy')?.required).toBe(true);
  });

  it('T2: origin should have validation with minLength >= 2', () => {
    const f = cfg.fields.find(f => f.key === 'origin');
    expect(f?.validation?.minLength).toBeGreaterThanOrEqual(2);
  });

  it('T3: destination should have validation with minLength >= 2', () => {
    const f = cfg.fields.find(f => f.key === 'destination');
    expect(f?.validation?.minLength).toBeGreaterThanOrEqual(2);
  });

  it('T4: cargoWeight should have validation with min >= 0', () => {
    const f = cfg.fields.find(f => f.key === 'cargoWeight');
    expect(f?.validation?.min).toBeGreaterThanOrEqual(0);
  });

  it('T5: quotedPrice should have validation with min >= 0', () => {
    const f = cfg.fields.find(f => f.key === 'quotedPrice');
    expect(f?.validation?.min).toBeGreaterThanOrEqual(0);
  });

  it('T6: carrierPhone should have validation with Iranian phone pattern', () => {
    const f = cfg.fields.find(f => f.key === 'carrierPhone');
    expect(f?.validation?.pattern).toMatch(/\^0/);
  });

  it('T7: should have actions accept, deliver, cancel (post 16-C fix — handlers registered)', () => {
    const keys = (cfg.actions ?? []).map(a => a.key);
    expect(keys).toContain('accept');
    expect(keys).toContain('deliver');
    expect(keys).toContain('cancel');
  });

  it('T8: should have key=transports, model=transportRequest', () => {
    expect(cfg.key).toBe('transports');
    expect(cfg.model).toBe('transportRequest');
  });

  it('T9: audit should be enabled', () => {
    expect(cfg.audit?.enabled).toBe(true);
  });

  // Documented 16-B gaps
  it('T10: transports has NO detailTabs (documented 16-B gap)', () => {
    expect(cfg.detailTabs).toBeUndefined();
  });

  it('T11: transports has NO relations (documented 16-B gap)', () => {
    expect(cfg.relations).toBeUndefined();
  });

  it('T12: transports has NO bulkActions (documented 16-B gap)', () => {
    expect(cfg.bulkActions).toBeUndefined();
  });
});
