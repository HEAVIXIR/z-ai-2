/**
 * HEAVIX — STEP 16-C Pass 4: Per-Resource Contract Test — PRODUCTS
 *
 * Resource-specific invariants for the `products` admin resource.
 * Addresses Dim 19 ⚠️ from the 16-B Completion Matrix.
 */

import { describe, it, expect } from 'vitest';
import '@/lib/admin/resource-index';
import { registry } from '@/lib/admin/resource-registry';

const cfg = registry.get('products');

describe('Product Resource Contract (resource-specific invariants)', () => {
  if (!cfg) {
    it('products config should be registered', () => expect(cfg).toBeDefined());
    return;
  }

  it('P1: should have at least 6 fields including required canonicalName', () => {
    expect(cfg.fields.length).toBeGreaterThanOrEqual(6);
    expect(cfg.fields.find(f => f.key === 'canonicalName')?.required).toBe(true);
  });

  it('P2: canonicalName should have validation with minLength >= 2', () => {
    const f = cfg.fields.find(f => f.key === 'canonicalName');
    expect(f?.validation?.minLength).toBeGreaterThanOrEqual(2);
  });

  it('P3: canonicalName should have validation with maxLength <= 200', () => {
    const f = cfg.fields.find(f => f.key === 'canonicalName');
    expect(f?.validation?.maxLength).toBeLessThanOrEqual(200);
  });

  it('P4: sortOrder should have validation with min >= 0', () => {
    const f = cfg.fields.find(f => f.key === 'sortOrder');
    expect(f?.validation?.min).toBeGreaterThanOrEqual(0);
  });

  it('P5: should have actions verify, delete', () => {
    const keys = (cfg.actions ?? []).map(a => a.key);
    expect(keys).toContain('verify');
    expect(keys).toContain('delete');
  });

  it('P6: should have bulkAction bulk-delete', () => {
    const keys = (cfg.bulkActions ?? []).map(a => a.key);
    expect(keys).toContain('bulk-delete');
  });

  it('P7: should have 4 detail tabs (overview, machines, parts, audit)', () => {
    expect(cfg.detailTabs?.length).toBe(4);
    const tabKeys = (cfg.detailTabs ?? []).map(t => t.key);
    expect(tabKeys).toEqual(['overview', 'machines', 'parts', 'audit']);
  });

  it('P8: should have 2 relations (machines, parts)', () => {
    expect(cfg.relations?.length).toBe(2);
    const rels = (cfg.relations ?? []).map(r => r.resource);
    expect(rels).toContain('machines');
    expect(rels).toContain('parts');
  });

  it('P9: audit.actions should include product.create, product.update, product.delete', () => {
    expect(cfg.audit?.enabled).toBe(true);
    expect(cfg.audit?.actions).toContain('product.create');
    expect(cfg.audit?.actions).toContain('product.update');
    expect(cfg.audit?.actions).toContain('product.delete');
  });

  it('P10-P12: should have key=products, model=product, export=product.read', () => {
    expect(cfg.key).toBe('products');
    expect(cfg.model).toBe('product');
    expect(cfg.permissions.export).toBe('product.read');
  });

  it('P13: should have at least 9 columns', () => {
    expect(cfg.columns.length).toBeGreaterThanOrEqual(9);
  });
});
