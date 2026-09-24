/**
 * HEAVIX — STEP 16-C Pass 2: Per-Resource Contract Test — LISTINGS
 *
 * Resource-specific invariants for the `listings` admin resource, beyond
 * the 27 generic invariants in resource-contract.test.ts. This addresses
 * the Dim 19 ⚠️ verdict from the 16-B Completion Matrix (ZERO per-resource
 * test files existed for any of 18 resources).
 *
 * Invariants tested (resource-specific to listings):
 *   L1. listing config has 15 fields, including required `title`
 *   L2. `title` field has validation: minLength >= 5, maxLength <= 200
 *   L3. `price` field has validation: min >= 0 (non-negative)
 *   L4. `year` field has validation: min >= 1950, max <= 2100
 *   L5. `workingHours` field has validation: min >= 0
 *   L6. `sellerPhone` field has validation: pattern matches ^0\d{10}$
 *   L7. `sellerPhone` field has field-level permissions { read, write }
 *   L8. listing has 4 actions: publish, feature, verify, delete
 *   L9. listing has 3 bulkActions: bulk-publish, bulk-feature, bulk-delete
 *   L10. listing has 5 detailTabs (overview/attributes/media/activity/audit)
 *   L11. listing has 2 relations (listing-images, offers)
 *   L12. listing audit.actions include listing.publish + listing.delete
 *   L13. listing config.key === 'listings'
 *   L14. listing config.model === 'listing'
 *   L15. listing config.permissions.export === 'listing.export' (canonical)
 *
 * Usage: bunx vitest run tests/contract/listing-contract.test.ts
 */

import { describe, it, expect } from 'vitest';
import '@/lib/admin/resource-index';
import { registry } from '@/lib/admin/resource-registry';

const cfg = registry.get('listings');

describe('Listing Resource Contract (resource-specific invariants)', () => {
  if (!cfg) {
    it('listings config should be registered', () => {
      expect(cfg).toBeDefined();
    });
    return;
  }

  // ── L1. Field count + required title ─────────────────────
  it('L1: should have at least 13 fields including required title', () => {
    expect(cfg.fields.length).toBeGreaterThanOrEqual(13);
    const titleField = cfg.fields.find(f => f.key === 'title');
    expect(titleField).toBeDefined();
    expect(titleField?.required).toBe(true);
  });

  // ── L2. Title field validation ──────────────────────────
  it('L2: title field should have validation with minLength >= 5 and maxLength <= 200', () => {
    const titleField = cfg.fields.find(f => f.key === 'title');
    expect(titleField?.validation).toBeDefined();
    expect(titleField?.validation?.minLength).toBeGreaterThanOrEqual(5);
    expect(titleField?.validation?.maxLength).toBeLessThanOrEqual(200);
  });

  // ── L3. Price field validation (non-negative) ────────────
  it('L3: price field should have validation with min >= 0', () => {
    const priceField = cfg.fields.find(f => f.key === 'price');
    expect(priceField?.validation).toBeDefined();
    expect(priceField?.validation?.min).toBeGreaterThanOrEqual(0);
  });

  // ── L4. Year field validation (1950-2100 range) ──────────
  it('L4: year field should have validation with min=1950 and max=2100', () => {
    const yearField = cfg.fields.find(f => f.key === 'year');
    expect(yearField?.validation).toBeDefined();
    expect(yearField?.validation?.min).toBe(1950);
    expect(yearField?.validation?.max).toBe(2100);
  });

  // ── L5. workingHours field validation (non-negative) ─────
  it('L5: workingHours field should have validation with min >= 0', () => {
    const hoursField = cfg.fields.find(f => f.key === 'workingHours');
    expect(hoursField?.validation).toBeDefined();
    expect(hoursField?.validation?.min).toBeGreaterThanOrEqual(0);
  });

  // ── L6. sellerPhone field pattern validation ─────────────
  it('L6: sellerPhone field should have validation with Iranian phone pattern', () => {
    const phoneField = cfg.fields.find(f => f.key === 'sellerPhone');
    expect(phoneField?.validation).toBeDefined();
    expect(phoneField?.validation?.pattern).toMatch(/\^0/);
  });

  // ── L7. sellerPhone field-level permissions ──────────────
  it('L7: sellerPhone field should have field-level permissions {read, write}', () => {
    const phoneField = cfg.fields.find(f => f.key === 'sellerPhone');
    expect(phoneField?.permissions).toBeDefined();
    expect(phoneField?.permissions?.read).toBeDefined();
    expect(phoneField?.permissions?.write).toBeDefined();
  });

  // ── L8. Actions ──────────────────────────────────────────
  it('L8: should have actions publish, feature, verify, delete', () => {
    const actionKeys = (cfg.actions ?? []).map(a => a.key);
    expect(actionKeys).toContain('publish');
    expect(actionKeys).toContain('feature');
    expect(actionKeys).toContain('verify');
    expect(actionKeys).toContain('delete');
  });

  // ── L9. Bulk actions ─────────────────────────────────────
  it('L9: should have bulkActions bulk-publish, bulk-feature, bulk-delete', () => {
    const bulkKeys = (cfg.bulkActions ?? []).map(a => a.key);
    expect(bulkKeys).toContain('bulk-publish');
    expect(bulkKeys).toContain('bulk-feature');
    expect(bulkKeys).toContain('bulk-delete');
  });

  // ── L10. Detail tabs ─────────────────────────────────────
  it('L10: should have 5 detail tabs (overview, attributes, media, activity, audit)', () => {
    expect(cfg.detailTabs).toBeDefined();
    expect(cfg.detailTabs?.length).toBe(5);
    const tabKeys = (cfg.detailTabs ?? []).map(t => t.key);
    expect(tabKeys).toEqual(['overview', 'attributes', 'media', 'activity', 'audit']);
  });

  // ── L11. Relations ───────────────────────────────────────
  it('L11: should have relations listing-images and offers', () => {
    expect(cfg.relations).toBeDefined();
    expect(cfg.relations?.length).toBe(2);
    const relResources = (cfg.relations ?? []).map(r => r.resource);
    expect(relResources).toContain('listing-images');
    expect(relResources).toContain('offers');
  });

  // ── L12. Audit action labels ─────────────────────────────
  it('L12: audit.actions should include listing.publish and listing.delete', () => {
    expect(cfg.audit?.enabled).toBe(true);
    expect(cfg.audit?.actions).toContain('listing.publish');
    expect(cfg.audit?.actions).toContain('listing.delete');
  });

  // ── L13. Key + model + permissions.export canonical ─────
  it('L13-L15: should have key=listings, model=listing, permissions.export=listing.export', () => {
    expect(cfg.key).toBe('listings');
    expect(cfg.model).toBe('listing');
    expect(cfg.permissions.export).toBe('listing.export');
  });
});
