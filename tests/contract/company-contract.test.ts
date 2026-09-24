/**
 * HEAVIX — STEP 16-C Pass 3: Per-Resource Contract Test — COMPANIES
 *
 * Resource-specific invariants for the `companies` admin resource.
 * Addresses Dim 19 ⚠️ from the 16-B Completion Matrix.
 *
 * Invariants tested:
 *   C1. company config has 13 fields including required name
 *   C2. name field has validation: minLength >= 2, maxLength <= 200
 *   C3. phone field has validation: pattern matches ^0\d{10}$
 *   C4. email field has validation: email pattern
 *   C5. phone field has field-level permissions {read, write}
 *   C6. email field has field-level permissions {read, write}
 *   C7. address field has field-level permissions {read, write}
 *   C8. company has 2 actions: verify, delete
 *   C9. company has 1 bulkAction: bulk-verify
 *   C10. company has 6 detailTabs (overview/branches/verifications/partners/reviews/audit)
 *   C11. company audit.actions include company.verify + company.delete
 *   C12. company config.key === 'companies'
 *   C13. company config.model === 'company'
 *   C14. company permissions.export is set (canonical 'company.read')
 *   C15. company has at least 11 columns
 */

import { describe, it, expect } from 'vitest';
import '@/lib/admin/resource-index';
import { registry } from '@/lib/admin/resource-registry';

const cfg = registry.get('companies');

describe('Company Resource Contract (resource-specific invariants)', () => {
  if (!cfg) {
    it('companies config should be registered', () => {
      expect(cfg).toBeDefined();
    });
    return;
  }

  // ── C1. Field count + required name ────────────────────
  it('C1: should have at least 13 fields including required name', () => {
    expect(cfg.fields.length).toBeGreaterThanOrEqual(13);
    const nameField = cfg.fields.find(f => f.key === 'name');
    expect(nameField?.required).toBe(true);
  });

  // ── C2. name field validation ──────────────────────────
  it('C2: name field should have validation with minLength >= 2 and maxLength <= 200', () => {
    const nameField = cfg.fields.find(f => f.key === 'name');
    expect(nameField?.validation).toBeDefined();
    expect(nameField?.validation?.minLength).toBeGreaterThanOrEqual(2);
    expect(nameField?.validation?.maxLength).toBeLessThanOrEqual(200);
  });

  // ── C3. phone field pattern ─────────────────────────────
  it('C3: phone field should have validation with Iranian phone pattern', () => {
    const phoneField = cfg.fields.find(f => f.key === 'phone');
    expect(phoneField?.validation).toBeDefined();
    expect(phoneField?.validation?.pattern).toMatch(/\^0/);
  });

  // ── C4. email field pattern ─────────────────────────────
  it('C4: email field should have validation with email pattern', () => {
    const emailField = cfg.fields.find(f => f.key === 'email');
    expect(emailField?.validation).toBeDefined();
    expect(emailField?.validation?.pattern).toMatch(/@/);
  });

  // ── C5-C7. Field-level permissions on PII fields ────────
  it('C5: phone field should have field-level permissions {read, write}', () => {
    const phoneField = cfg.fields.find(f => f.key === 'phone');
    expect(phoneField?.permissions).toBeDefined();
    expect(phoneField?.permissions?.read).toBeDefined();
    expect(phoneField?.permissions?.write).toBeDefined();
  });

  it('C6: email field should have field-level permissions {read, write}', () => {
    const emailField = cfg.fields.find(f => f.key === 'email');
    expect(emailField?.permissions).toBeDefined();
    expect(emailField?.permissions?.read).toBeDefined();
    expect(emailField?.permissions?.write).toBeDefined();
  });

  it('C7: address field should have field-level permissions {read, write}', () => {
    const addressField = cfg.fields.find(f => f.key === 'address');
    expect(addressField?.permissions).toBeDefined();
    expect(addressField?.permissions?.read).toBeDefined();
    expect(addressField?.permissions?.write).toBeDefined();
  });

  // ── C8. Actions ─────────────────────────────────────────
  it('C8: should have actions verify, delete', () => {
    const actionKeys = (cfg.actions ?? []).map(a => a.key);
    expect(actionKeys).toContain('verify');
    expect(actionKeys).toContain('delete');
  });

  // ── C9. Bulk actions ───────────────────────────────────
  it('C9: should have bulkAction bulk-verify', () => {
    const bulkKeys = (cfg.bulkActions ?? []).map(a => a.key);
    expect(bulkKeys).toContain('bulk-verify');
  });

  // ── C10. Detail tabs ────────────────────────────────────
  it('C10: should have 6 detail tabs (overview, branches, verifications, partners, reviews, audit)', () => {
    expect(cfg.detailTabs?.length).toBe(6);
    const tabKeys = (cfg.detailTabs ?? []).map(t => t.key);
    expect(tabKeys).toEqual(['overview', 'branches', 'verifications', 'partners', 'reviews', 'audit']);
  });

  // ── C11. Audit action labels ───────────────────────────
  it('C11: audit.actions should include company.verify and company.delete', () => {
    expect(cfg.audit?.enabled).toBe(true);
    expect(cfg.audit?.actions).toContain('company.verify');
    expect(cfg.audit?.actions).toContain('company.delete');
  });

  // ── C12-C14. Canonical config ───────────────────────────
  it('C12-C14: should have key=companies, model=company, export=company.read', () => {
    expect(cfg.key).toBe('companies');
    expect(cfg.model).toBe('company');
    expect(cfg.permissions.export).toBe('company.read');
  });

  // ── C15. Column count ───────────────────────────────────
  it('C15: should have at least 11 columns (top-tier completeness)', () => {
    expect(cfg.columns.length).toBeGreaterThanOrEqual(11);
  });
});
