/**
 * HEAVIX — STEP 16-C Pass 2: Per-Resource Contract Test — PAYMENTS
 *
 * Resource-specific invariants for the `payments` admin resource. Addresses
 * Dim 19 ⚠️ from the 16-B Completion Matrix. Critical because R7 payments
 * had multiple gaps: BigInt `amount` had no min, `trackingCode`/`idempotencyKey`
 * had no length validation, and verify handler wrote non-existent fields.
 *
 * Invariants tested:
 *   P1. payment config has 7 fields including required amount
 *   P2. amount field has validation: min >= 1000 (BigInt min)
 *   P3. currency field has validation: pattern matches IRR|USD|EUR
 *   P4. trackingCode field has validation: maxLength <= 100
 *   P5. idempotencyKey field has validation: maxLength <= 64
 *   P6. trackingCode field has field-level permissions { read, write }
 *   P7. idempotencyKey field has field-level permissions { read, write }
 *   P8. payment has 2 actions: refund, verify
 *   P9. payment has 2 detailTabs (overview, audit)
 *   P10. payment audit.actions include payment.manage + payment.refund
 *   P11. payment config.key === 'payments'
 *   P12. payment config.model === 'payment'
 *   P13. payment permissions.export === 'payment.read' (canonical)
 *   P14. permissions.read/create/update/delete are all set
 *   P15. payment model is referenced in audit.entityType as 'Payment'
 */

import { describe, it, expect } from 'vitest';
import '@/lib/admin/resource-index';
import { registry } from '@/lib/admin/resource-registry';

const cfg = registry.get('payments');

describe('Payment Resource Contract (resource-specific invariants)', () => {
  if (!cfg) {
    it('payments config should be registered', () => {
      expect(cfg).toBeDefined();
    });
    return;
  }

  // ── P1. Field count + required amount ────────────────────
  it('P1: should have 7 fields including required amount', () => {
    expect(cfg.fields.length).toBe(7);
    const amountField = cfg.fields.find(f => f.key === 'amount');
    expect(amountField?.required).toBe(true);
  });

  // ── P2. amount field min validation ──────────────────────
  it('P2: amount field should have validation with min >= 1000 (BigInt min)', () => {
    const amountField = cfg.fields.find(f => f.key === 'amount');
    expect(amountField?.validation).toBeDefined();
    expect(amountField?.validation?.min).toBeGreaterThanOrEqual(1000);
  });

  // ── P3. currency field pattern ───────────────────────────
  it('P3: currency field should have validation with IRR|USD|EUR pattern', () => {
    const currencyField = cfg.fields.find(f => f.key === 'currency');
    expect(currencyField?.validation).toBeDefined();
    expect(currencyField?.validation?.pattern).toMatch(/IRR/);
    expect(currencyField?.validation?.pattern).toMatch(/USD/);
    expect(currencyField?.validation?.pattern).toMatch(/EUR/);
  });

  // ── P4. trackingCode maxLength ───────────────────────────
  it('P4: trackingCode field should have validation with maxLength <= 100', () => {
    const trackingField = cfg.fields.find(f => f.key === 'trackingCode');
    expect(trackingField?.validation).toBeDefined();
    expect(trackingField?.validation?.maxLength).toBeLessThanOrEqual(100);
  });

  // ── P5. idempotencyKey maxLength ─────────────────────────
  it('P5: idempotencyKey field should have validation with maxLength <= 64', () => {
    const idemField = cfg.fields.find(f => f.key === 'idempotencyKey');
    expect(idemField?.validation).toBeDefined();
    expect(idemField?.validation?.maxLength).toBeLessThanOrEqual(64);
  });

  // ── P6. trackingCode field-level permissions ─────────────
  it('P6: trackingCode field should have field-level permissions {read, write}', () => {
    const trackingField = cfg.fields.find(f => f.key === 'trackingCode');
    expect(trackingField?.permissions).toBeDefined();
    expect(trackingField?.permissions?.read).toBeDefined();
    expect(trackingField?.permissions?.write).toBeDefined();
  });

  // ── P7. idempotencyKey field-level permissions ───────────
  it('P7: idempotencyKey field should have field-level permissions {read, write}', () => {
    const idemField = cfg.fields.find(f => f.key === 'idempotencyKey');
    expect(idemField?.permissions).toBeDefined();
    expect(idemField?.permissions?.read).toBeDefined();
    expect(idemField?.permissions?.write).toBeDefined();
  });

  // ── P8. Actions ──────────────────────────────────────────
  it('P8: should have actions refund, verify', () => {
    const actionKeys = (cfg.actions ?? []).map(a => a.key);
    expect(actionKeys).toContain('refund');
    expect(actionKeys).toContain('verify');
  });

  // ── P9. Detail tabs ──────────────────────────────────────
  it('P9: should have 2 detail tabs (overview, audit)', () => {
    expect(cfg.detailTabs?.length).toBe(2);
    const tabKeys = (cfg.detailTabs ?? []).map(t => t.key);
    expect(tabKeys).toEqual(['overview', 'audit']);
  });

  // ── P10. Audit action labels ─────────────────────────────
  it('P10: audit.actions should include payment.manage and payment.refund', () => {
    expect(cfg.audit?.enabled).toBe(true);
    expect(cfg.audit?.actions).toContain('payment.manage');
    expect(cfg.audit?.actions).toContain('payment.refund');
  });

  // ── P11-P13. Canonical config values ─────────────────────
  it('P11-P13: should have key=payments, model=payment, export=payment.read', () => {
    expect(cfg.key).toBe('payments');
    expect(cfg.model).toBe('payment');
    expect(cfg.permissions.export).toBe('payment.read');
  });

  // ── P14. All 5 RBAC fields set ───────────────────────────
  it('P14: should have all 5 RBAC permission fields set', () => {
    expect(cfg.permissions.read).toBeDefined();
    expect(cfg.permissions.create).toBeDefined();
    expect(cfg.permissions.update).toBeDefined();
    expect(cfg.permissions.delete).toBeDefined();
    expect(cfg.permissions.export).toBeDefined();
  });

  // ── P15. Audit entityType ────────────────────────────────
  it('P15: audit.entityType should be "Payment"', () => {
    expect(cfg.audit?.entityType).toBe('Payment');
  });
});
