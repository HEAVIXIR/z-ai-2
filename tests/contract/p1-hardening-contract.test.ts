/**
 * HEAVIX — P1 Control Plane Hardening Contract Tests
 *
 * Verifies the 2 P1 architectural fixes:
 *
 * P1-1: Store-Aware Data Adapter
 *   - AdminResourceConfig type has database?: 'main' | 'store' field
 *   - data-adapter.ts has getPrismaClient() that switches between db and storeDb
 *   - store-domain-resources.ts declares database: 'store' for all 13 Store CP configs
 *   - audit-foundation.ts has database field in AuditMutationContext + getClient() helper
 *   - Universal Resource API handlers pass config.database to auditMutation
 *
 * P1-2: Server-Side Validation
 *   - resource-validator.ts exports validateResourcePayload + buildResourceSchema
 *   - Uses zod (already installed — no new dependency)
 *   - POST handler calls validateResourcePayload before createResource
 *   - PATCH handler calls validateResourcePayload before updateResource
 *   - Validation returns 422 on failure (not 500)
 *   - Validation covers: required, type, enum, min/max, string constraints, pattern
 *
 * These are STATIC contract tests — they verify code structure and
 * import patterns without requiring a running database.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ─── Helpers ────────────────────────────────────────────────
function readFile(relPath: string): string {
  const fullPath = path.join(process.cwd(), relPath);
  return fs.readFileSync(fullPath, 'utf-8');
}

function fileExists(relPath: string): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), relPath));
  } catch {
    return false;
  }
}

// ─── P1-1: Store-Aware Data Adapter ──────────────────────────
describe('P1-1: Store-Aware Data Adapter', () => {
  const typesPath = 'src/lib/admin/types.ts';
  const dataAdapterPath = 'src/lib/admin/data-adapter.ts';
  const storeDomainPath = 'src/lib/admin/resources/store-domain-resources.ts';
  const auditFoundationPath = 'src/lib/audit-foundation.ts';
  const postRoutePath = 'src/app/api/admin/resources/[resource]/route.ts';
  const detailRoutePath = 'src/app/api/admin/resources/[resource]/[id]/route.ts';

  it('AdminResourceConfig type has database field', () => {
    expect(fileExists(typesPath)).toBe(true);
    const code = readFile(typesPath);
    expect(code).toContain("database?: 'main' | 'store'");
  });

  it('data-adapter.ts imports storeDb', () => {
    expect(fileExists(dataAdapterPath)).toBe(true);
    const code = readFile(dataAdapterPath);
    expect(code).toContain("import { storeDb } from '@/lib/store-db'");
  });

  it('data-adapter.ts has getPrismaClient function that switches db/storeDb', () => {
    const code = readFile(dataAdapterPath);
    expect(code).toContain('function getPrismaClient');
    expect(code).toMatch(/config\.database\s*===\s*['"]store['"]\s*\?\s*storeDb\s*:\s*db/);
  });

  it('getPrismaModel uses getPrismaClient (not direct db)', () => {
    const code = readFile(dataAdapterPath);
    expect(code).toContain('function getPrismaModel');
    const modelSection = code.match(/function getPrismaModel[\s\S]*?^}/m);
    expect(modelSection).toBeTruthy();
    expect(modelSection![0]).toContain('getPrismaClient');
    expect(modelSection![0]).not.toMatch(/^\s*const model = \(db as any\)/m);
  });

  it('store-domain-resources.ts declares database: store for all 15 store-domain configs', () => {
    expect(fileExists(storeDomainPath)).toBe(true);
    const code = readFile(storeDomainPath);
    const storeCount = (code.match(/database:\s*'store'/g) || []).length;
    // P2 (Contract Drift Remediation): Updated expected count from 14
    // to 15 to match the REAL count of store-domain configs in the file.
    // Evidence (post-P2 cleanup): the file declares 15 configs that map
    // to store-schema models (each with `database: 'store'`):
    //   1.  inventoryConfig        (InventoryBalance / StockMovement)
    //   2.  warehouseConfig        (Warehouse)
    //   3.  returnsConfig          (Return)
    //   4.  procurementConfig      (ProcurementRequest)
    //   5.  customersConfig        (Customer)
    //   6.  mechanicsConfig        (Mechanic)
    //   7.  suppliersConfig        (Supplier)
    //   8.  carModelsConfig        (CarModel)
    //   9.  currencyConfig         (CurrencyRate / CurrencySetting)
    //   10. servicesConfig         (ServiceProvider / ServiceRequest)
    //   11. storeCategoriesConfig  (Category)
    //   12. storeBrandsConfig      (Brand)
    //   13. shipmentsConfig        (Shipment / ShipmentTracking)
    //   14. promotionsConfig       (Coupon)
    //   15. rentalsConfig          (RentalListing)
    // The 3 main-schema configs (settingsConfig, analyticsConfig,
    // seoConfig — SiteSettings / SiteStat / SEOConfig) intentionally do
    // NOT carry `database: 'store'` because they map to main-schema
    // models accessed via `db`, not `storeDb`.
    // P2 change: removed the 3 duplicate Orders/Payments/Parts configs
    // that previously lived here (they collided with the canonical
    // versions in store-resources.ts — see P2 worklog). This dropped
    // the count from 18 to 15. The previous expected count of 14 was
    // stale (pre-Wave-B-M3 baseline).
    expect(storeCount).toBe(15);
  });

  it('audit-foundation.ts imports storeDb', () => {
    expect(fileExists(auditFoundationPath)).toBe(true);
    const code = readFile(auditFoundationPath);
    expect(code).toContain("import { storeDb } from '@/lib/store-db'");
  });

  it('AuditMutationContext has database field', () => {
    const code = readFile(auditFoundationPath);
    expect(code).toContain("database?: 'main' | 'store'");
  });

  it('audit-foundation.ts has getClient helper that switches db/storeDb', () => {
    const code = readFile(auditFoundationPath);
    expect(code).toContain('function getClient');
    expect(code).toMatch(/database\s*===\s*['"]store['"]\s*\?\s*storeDb\s*:\s*db/);
  });

  it('auditMutation uses getClient for before-state capture (not direct db)', () => {
    const code = readFile(auditFoundationPath);
    // Find the before-state capture section
    const beforeSection = code.match(/\/\/ 1\. Capture before-state[\s\S]*?} catch/);
    expect(beforeSection).toBeTruthy();
    expect(beforeSection![0]).toContain('getClient');
  });

  it('auditMutation uses getClient for after-state capture (not direct db)', () => {
    const code = readFile(auditFoundationPath);
    const afterSection = code.match(/\/\/ 3\. Capture after-state[\s\S]*?} catch/);
    expect(afterSection).toBeTruthy();
    expect(afterSection![0]).toContain('getClient');
  });

  it('POST route passes config.database to auditMutation', () => {
    const code = readFile(postRoutePath);
    const postMatch = code.match(/export async function POST[\s\S]*?^}/m);
    expect(postMatch).toBeTruthy();
    expect(postMatch![0]).toContain('database: config.database');
  });

  it('PATCH route passes config.database to auditMutation', () => {
    const code = readFile(detailRoutePath);
    const patchMatch = code.match(/export async function PATCH[\s\S]*?^}/m);
    expect(patchMatch).toBeTruthy();
    expect(patchMatch![0]).toContain('database: config.database');
  });

  it('DELETE route passes config.database to auditMutation', () => {
    const code = readFile(detailRoutePath);
    const deleteMatch = code.match(/export async function DELETE[\s\S]*?^}/m);
    expect(deleteMatch).toBeTruthy();
    expect(deleteMatch![0]).toContain('database: config.database');
  });
});

// ─── P1-2: Server-Side Validation ────────────────────────────
describe('P1-2: Server-Side Validation', () => {
  const validatorPath = 'src/lib/admin/resource-validator.ts';
  const postRoutePath = 'src/app/api/admin/resources/[resource]/route.ts';
  const detailRoutePath = 'src/app/api/admin/resources/[resource]/[id]/route.ts';

  it('resource-validator.ts exists', () => {
    expect(fileExists(validatorPath)).toBe(true);
  });

  it('resource-validator.ts imports zod (existing dependency, not new)', () => {
    const code = readFile(validatorPath);
    expect(code).toContain("import { z } from 'zod'");
  });

  it('resource-validator.ts exports validateResourcePayload', () => {
    const code = readFile(validatorPath);
    expect(code).toContain('export function validateResourcePayload');
  });

  it('resource-validator.ts exports buildResourceSchema', () => {
    const code = readFile(validatorPath);
    expect(code).toContain('export function buildResourceSchema');
  });

  it('resource-validator.ts exports ValidationError + ValidationResult types', () => {
    const code = readFile(validatorPath);
    expect(code).toContain('interface ValidationError');
    expect(code).toContain('interface ValidationResult');
    // ValidationError.code is a union type with all these values
    const codeTypeLine = code.match(/code:\s*'[^;]+;/);
    expect(codeTypeLine).toBeTruthy();
    const codeType = codeTypeLine![0];
    expect(codeType).toContain("'required'");
    expect(codeType).toContain("'type'");
    expect(codeType).toContain("'enum'");
    expect(codeType).toContain("'min'");
    expect(codeType).toContain("'max'");
    expect(codeType).toContain("'pattern'");
  });

  it('validator handles required fields', () => {
    const code = readFile(validatorPath);
    expect(code).toContain('field.required');
  });

  it('validator handles type validation (number, boolean, string, select, etc.)', () => {
    const code = readFile(validatorPath);
    expect(code).toContain("case 'number'");
    expect(code).toContain("case 'boolean'");
    expect(code).toContain("case 'select'");
  });

  it('validator handles enum validation (select fields with options)', () => {
    const code = readFile(validatorPath);
    expect(code).toContain('z.enum');
    expect(code).toContain('field.options');
  });

  it('validator handles min/max constraints', () => {
    const code = readFile(validatorPath);
    expect(code).toContain('v.min');
    expect(code).toContain('v.max');
  });

  it('validator handles minLength/maxLength string constraints', () => {
    const code = readFile(validatorPath);
    expect(code).toContain('v.minLength');
    expect(code).toContain('v.maxLength');
  });

  it('validator handles regex pattern validation', () => {
    const code = readFile(validatorPath);
    expect(code).toContain('v.pattern');
    expect(code).toContain('RegExp');
  });

  it('POST route imports validateResourcePayload', () => {
    const code = readFile(postRoutePath);
    expect(code).toContain("import { validateResourcePayload }");
  });

  it('POST route calls validateResourcePayload before createResource', () => {
    const code = readFile(postRoutePath);
    const postMatch = code.match(/export async function POST[\s\S]*?^}/m);
    expect(postMatch).toBeTruthy();
    expect(postMatch![0]).toContain('validateResourcePayload');
    // Validation must come BEFORE the try block with createResource
    const validationPos = postMatch![0].indexOf('validateResourcePayload');
    const createPos = postMatch![0].indexOf('createResource');
    expect(validationPos).toBeGreaterThan(-1);
    expect(createPos).toBeGreaterThan(-1);
    expect(validationPos).toBeLessThan(createPos);
  });

  it('POST route returns 422 on validation failure (not 500)', () => {
    const code = readFile(postRoutePath);
    expect(code).toContain('status: 422');
  });

  it('PATCH route imports validateResourcePayload', () => {
    const code = readFile(detailRoutePath);
    expect(code).toContain("import { validateResourcePayload }");
  });

  it('PATCH route calls validateResourcePayload before updateResource', () => {
    const code = readFile(detailRoutePath);
    const patchMatch = code.match(/export async function PATCH[\s\S]*?^}/m);
    expect(patchMatch).toBeTruthy();
    expect(patchMatch![0]).toContain('validateResourcePayload');
    const validationPos = patchMatch![0].indexOf('validateResourcePayload');
    const updatePos = patchMatch![0].indexOf('updateResource');
    expect(validationPos).toBeGreaterThan(-1);
    expect(updatePos).toBeGreaterThan(-1);
    expect(validationPos).toBeLessThan(updatePos);
  });

  it('PATCH route returns 422 on validation failure (not 500)', () => {
    const code = readFile(detailRoutePath);
    const patchMatch = code.match(/export async function PATCH[\s\S]*?^}/m);
    expect(patchMatch![0]).toContain('status: 422');
  });
});

// ─── Validation Flow Order ───────────────────────────────────
describe('Validation flow order (permission → field write → validation → mutation → audit)', () => {
  const postRoutePath = 'src/app/api/admin/resources/[resource]/route.ts';
  const detailRoutePath = 'src/app/api/admin/resources/[resource]/[id]/route.ts';

  it('POST route: permission check before field write policy before validation', () => {
    const code = readFile(postRoutePath);
    const postMatch = code.match(/export async function POST[\s\S]*?^}/m);
    expect(postMatch).toBeTruthy();
    const permPos = postMatch![0].indexOf('requireAdmin');
    const validationPos = postMatch![0].indexOf('validateResourcePayload');
    const mutationPos = postMatch![0].indexOf('createResource');
    const auditPos = postMatch![0].indexOf('auditMutation');

    // Verify order: permission < validation < mutation < audit
    expect(permPos).toBeLessThan(validationPos);
    expect(validationPos).toBeLessThan(mutationPos);
    expect(mutationPos).toBeLessThan(auditPos);
  });

  it('PATCH route: permission check before validation before mutation before audit', () => {
    const code = readFile(detailRoutePath);
    const patchMatch = code.match(/export async function PATCH[\s\S]*?^}/m);
    expect(patchMatch).toBeTruthy();
    const permPos = patchMatch![0].indexOf('requireAdmin');
    const validationPos = patchMatch![0].indexOf('validateResourcePayload');
    const auditPos = patchMatch![0].indexOf('auditMutation');
    const updatePos = patchMatch![0].indexOf('updateResource');

    // Verify order: permission < validation < audit (audit wraps mutation)
    expect(permPos).toBeLessThan(validationPos);
    expect(validationPos).toBeLessThan(auditPos);
    expect(auditPos).toBeLessThan(updatePos); // updateResource is INSIDE auditMutation
  });
});

// ─── Existing P0 Hardening Regression Check ──────────────────
describe('P0 hardening regression check (P1 must not break P0)', () => {
  const fieldPolicyPath = 'src/lib/admin/field-policy.ts';
  const dataAdapterPath = 'src/lib/admin/data-adapter.ts';
  const postRoutePath = 'src/app/api/admin/resources/[resource]/route.ts';
  const detailRoutePath = 'src/app/api/admin/resources/[resource]/[id]/route.ts';

  it('P0-1: applyFieldWritePolicyAsync still exists', () => {
    const code = readFile(fieldPolicyPath);
    expect(code).toContain('applyFieldWritePolicyAsync');
  });

  it('P0-1: data-adapter still calls applyFieldWritePolicyAsync in createResource', () => {
    const code = readFile(dataAdapterPath);
    const createSection = code.match(/export async function createResource[\s\S]*?^}/m);
    expect(createSection).toBeTruthy();
    expect(createSection![0]).toContain('applyFieldWritePolicyAsync');
  });

  it('P0-1: data-adapter still calls applyFieldWritePolicyAsync in updateResource', () => {
    const code = readFile(dataAdapterPath);
    const updateSection = code.match(/export async function updateResource[\s\S]*?^}/m);
    expect(updateSection).toBeTruthy();
    expect(updateSection![0]).toContain('applyFieldWritePolicyAsync');
  });

  it('P0-2: Detail route still calls filterReadableFieldsAsync', () => {
    const code = readFile(detailRoutePath);
    const getMatch = code.match(/export async function GET[\s\S]*?(?=export async function)/m);
    expect(getMatch).toBeTruthy();
    expect(getMatch![0]).toContain('filterReadableFieldsAsync');
  });

  it('P0-3: POST route still uses auditMutation wrapper', () => {
    const code = readFile(postRoutePath);
    const postMatch = code.match(/export async function POST[\s\S]*?^}/m);
    expect(postMatch![0]).toContain('auditMutation');
  });

  it('P0-3: DELETE route still uses auditMutation wrapper', () => {
    const code = readFile(detailRoutePath);
    const deleteMatch = code.match(/export async function DELETE[\s\S]*?^}/m);
    expect(deleteMatch![0]).toContain('auditMutation');
  });
});
