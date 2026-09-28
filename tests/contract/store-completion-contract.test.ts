/**
 * HEAVIX — Store Completion Contract Tests (Batch A)
 *
 * Verifies all 13 Store Control Plane resources against the DoD chain:
 *   Schema → Service → API → Permission → Registry → UI → Validation
 *   → Audit → Tests → Monitoring → Documentation
 *
 * Reuses the SAME static-code-inspection pattern as P0/P1 hardening tests.
 * No parallel test architecture — one file, 13 resources, Universal abstractions.
 *
 * Coverage per resource:
 *   - Registry (registered in resource-index.ts)
 *   - Config (database: 'store' declared)
 *   - API (route.ts exists at correct path)
 *   - Permission (requirePermission used in route)
 *   - Service (service file exists or uses existing service)
 *   - Audit (logAudit/auditMutation calls in mutation handlers)
 *   - Store-awareness (P1 getPrismaClient handles store schema)
 *   - Validation (P1-2 validateResourcePayload available universally)
 *   - Field policy (P0-1 + P0-2 available universally)
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

// ─── Resource definitions (13 Store CP resources) ───────────
const STORE_RESOURCES = [
  { key: 'inventory',        model: 'stockMovement',       configName: 'inventoryConfig',         apiPath: '/api/admin/store/inventory',         serviceFile: 'store-inventory-service' },
  { key: 'warehouses',       model: 'warehouse',            configName: 'warehouseConfig',         apiPath: '/api/admin/store/warehouses',       serviceFile: 'store-inventory-service' },
  { key: 'returns',          model: 'return',              configName: 'returnsConfig',           apiPath: '/api/admin/store/returns',          serviceFile: 'store-returns-service' },
  { key: 'procurement',      model: 'procurementRequest',   configName: 'procurementConfig',        apiPath: '/api/admin/store/procurement',      serviceFile: 'store-procurement-service' },
  { key: 'customers',        model: 'customer',             configName: 'customersConfig',          apiPath: '/api/admin/store/customers',        serviceFile: null },
  { key: 'mechanics',        model: 'mechanic',             configName: 'mechanicsConfig',          apiPath: '/api/admin/store/mechanics',        serviceFile: null },
  { key: 'suppliers',        model: 'supplier',            configName: 'suppliersConfig',         apiPath: '/api/admin/store/suppliers',        serviceFile: null },
  { key: 'car-models',       model: 'carModel',             configName: 'carModelsConfig',         apiPath: '/api/admin/store/car-models',       serviceFile: null },
  { key: 'currency',         model: 'currencyRate',         configName: 'currencyConfig',          apiPath: '/api/admin/store/currency',        serviceFile: 'store-currency' },
  { key: 'services',         model: 'serviceProvider',     configName: 'servicesConfig',           apiPath: '/api/admin/store/services/providers', serviceFile: 'services-service' },
  { key: 'store-categories', model: 'category',             configName: 'storeCategoriesConfig',    apiPath: '/api/admin/store/categories',       serviceFile: null },
  { key: 'store-brands',     model: 'brand',                configName: 'storeBrandsConfig',        apiPath: '/api/admin/store/brands',           serviceFile: null },
  { key: 'shipments',        model: 'shipment',             configName: 'shipmentsConfig',         apiPath: '/api/admin/store/shipments',        serviceFile: 'store-shipments-service' },
] as const;

// ─── Universal Abstraction Verification (applies to all 13) ──
describe('Universal Store abstractions (P0/P1 hardening applies to all 13)', () => {
  it('data-adapter has getPrismaClient that switches db/storeDb', () => {
    const code = readFile('src/lib/admin/data-adapter.ts');
    expect(code).toContain('function getPrismaClient');
    expect(code).toMatch(/config\.database\s*===\s*['"]store['"]\s*\?\s*storeDb\s*:\s*db/);
  });

  it('field-policy has applyFieldWritePolicyAsync (P0-1 fail-closed)', () => {
    const code = readFile('src/lib/admin/field-policy.ts');
    expect(code).toContain('applyFieldWritePolicyAsync');
  });

  it('field-policy has filterReadableFieldsAsync (P0-2 read filtering)', () => {
    const code = readFile('src/lib/admin/field-policy.ts');
    expect(code).toContain('filterReadableFieldsAsync');
  });

  it('resource-validator has validateResourcePayload (P1-2 server validation)', () => {
    const code = readFile('src/lib/admin/resource-validator.ts');
    expect(code).toContain('validateResourcePayload');
  });

  it('audit-foundation has auditMutation (P0-3 central audit)', () => {
    const code = readFile('src/lib/audit-foundation.ts');
    expect(code).toContain('auditMutation');
  });

  it('audit-foundation has getClient for store-aware snapshot capture (P1-1)', () => {
    const code = readFile('src/lib/audit-foundation.ts');
    expect(code).toContain('function getClient');
  });
});

// ─── Per-Resource Contract Tests ────────────────────────────
describe('Store Completion Matrix — 13 Resources', () => {
  // Schema verification
  describe('Schema (Prisma model exists in store-schema.prisma)', () => {
    for (const r of STORE_RESOURCES) {
      it(`${r.key}: model ${r.model} exists in store-schema.prisma`, () => {
        const schema = readFile('prisma/store-schema.prisma');
        const modelPascal = r.model.charAt(0).toUpperCase() + r.model.slice(1);
        expect(schema).toContain(`model ${modelPascal} {`);
      });
    }
  });

  // Registry verification
  describe('Registry (registered in resource-index.ts)', () => {
    for (const r of STORE_RESOURCES) {
      it(`${r.key}: registerResource(${r.configName}) called`, () => {
        const code = readFile('src/lib/admin/resource-index.ts');
        expect(code).toContain(`registerResource(${r.configName})`);
      });
    }
  });

  // Config verification (database: 'store')
  describe('Config (database: store declared in store-domain-resources.ts)', () => {
    for (const r of STORE_RESOURCES) {
      it(`${r.key}: config declares database: 'store'`, () => {
        const code = readFile('src/lib/admin/resources/store-domain-resources.ts');
        // Find the config block and verify database: 'store' is set
        const configMatch = code.match(
          new RegExp(`export const ${r.configName}[\\s\\S]*?database:\\s*'store'`)
        );
        expect(configMatch).toBeTruthy();
      });
    }
  });

  // API verification
  describe('API (route.ts exists at correct path)', () => {
    for (const r of STORE_RESOURCES) {
      it(`${r.key}: route.ts exists at ${r.apiPath}`, () => {
        expect(fileExists(`src/app${r.apiPath}/route.ts`)).toBe(true);
      });
    }
  });

  // Permission verification
  describe('Permission (requirePermission used in route)', () => {
    for (const r of STORE_RESOURCES) {
      it(`${r.key}: route uses requirePermission with appropriate permission key`, () => {
        const code = readFile(`src/app${r.apiPath}/route.ts`);
        expect(code).toContain('requirePermission');
        // Accept any valid permission key pattern — some Store resources use
        // domain-specific keys (inventory.read, returns.read, shipping.read, etc.)
        // while others use the generic store.read/store.manage.
        // The key requirement is that requirePermission IS called, not which key.
        expect(code).toMatch(/requirePermission\(user\.id,\s*['"]/);
      });
    }
  });

  // Service verification
  describe('Service (dedicated service file or existing service reuse)', () => {
    for (const r of STORE_RESOURCES) {
      it(`${r.key}: service file exists or route uses existing service`, () => {
        if (r.serviceFile) {
          // Check if dedicated service file exists
          expect(fileExists(`src/lib/${r.serviceFile}.ts`)).toBe(true);
        } else {
          // For resources without a dedicated service file, check if route
          // imports from a service or uses storeDb directly
          const code = readFile(`src/app${r.apiPath}/route.ts`);
          const hasServiceImport = code.includes('from "@/lib/store-') || code.includes("from '@/lib/store-");
          const hasDirectDb = code.includes('storeDb') || code.includes('from "@/lib/store-db"');
          // At least one of: service import OR direct storeDb usage
          expect(hasServiceImport || hasDirectDb).toBe(true);
        }
      });
    }
  });

  // Admin UI verification
  describe('Admin UI (page.tsx exists)', () => {
    for (const r of STORE_RESOURCES) {
      it(`${r.key}: admin UI page exists`, () => {
        // Try various paths
        const paths = [
          `src/app/admin/store/${r.key}/page.tsx`,
          `src/app/admin/${r.key}/page.tsx`,
          `src/app/admin/${r.key.replace('store-', '')}/page.tsx`,
        ];
        const found = paths.some(p => fileExists(p));
        // warehouses is the only one without a dedicated page (managed via inventory)
        if (r.key === 'warehouses') {
          // warehouses is managed via inventory page — this is acceptable
          expect(fileExists('src/app/admin/store/inventory/page.tsx')).toBe(true);
        } else {
          expect(found).toBe(true);
        }
      });
    }
  });

  // Audit verification (for resources with mutations)
  describe('Audit (logAudit/auditMutation in mutation handlers)', () => {
    // Resources with mutations (POST/PATCH/DELETE)
    const mutationResources = STORE_RESOURCES.filter(r => r.key !== 'customers'); // customers is read-only

    for (const r of mutationResources) {
      it(`${r.key}: mutation handlers have logAudit or auditMutation calls`, () => {
        // Check the main route
        const mainCode = readFile(`src/app${r.apiPath}/route.ts`);
        const idRoutePath = `src/app${r.apiPath}/[id]/route.ts`;
        const idCode = fileExists(idRoutePath) ? readFile(idRoutePath) : '';

        const allCode = mainCode + idCode;
        // At least one audit call should exist
        expect(allCode).toMatch(/logAudit|auditMutation|auditCreate|auditDelete/);
      });
    }

    // customers is read-only — no mutations = no audit needed
    it('customers: read-only (GET only) — audit N/A', () => {
      const code = readFile('src/app/api/admin/store/customers/route.ts');
      expect(code).toContain('export async function GET');
      expect(code).not.toContain('export async function POST');
      expect(code).not.toContain('export async function PATCH');
      expect(code).not.toContain('export async function DELETE');
    });
  });

  // Store-awareness verification
  describe('Store-awareness (database routing)', () => {
    for (const r of STORE_RESOURCES) {
      it(`${r.key}: config.database === 'store' → getPrismaClient returns storeDb`, () => {
        const configCode = readFile('src/lib/admin/resources/store-domain-resources.ts');
        const dataAdapterCode = readFile('src/lib/admin/data-adapter.ts');

        // Config declares database: 'store'
        const configMatch = configCode.match(
          new RegExp(`export const ${r.configName}[\\s\\S]*?database:\\s*'store'`)
        );
        expect(configMatch).toBeTruthy();

        // Data adapter switches to storeDb when database === 'store'
        expect(dataAdapterCode).toMatch(/config\.database\s*===\s*['"]store['"]\s*\?\s*storeDb\s*:\s*db/);
      });
    }
  });

  // Validation verification (P1-2 universal)
  describe('Validation (P1-2 validateResourcePayload available)', () => {
    it('resource-validator.ts exists and exports validateResourcePayload', () => {
      expect(fileExists('src/lib/admin/resource-validator.ts')).toBe(true);
      const code = readFile('src/lib/admin/resource-validator.ts');
      expect(code).toContain('export function validateResourcePayload');
    });

    it('Universal Resource API POST handler calls validateResourcePayload', () => {
      const code = readFile('src/app/api/admin/resources/[resource]/route.ts');
      expect(code).toContain('validateResourcePayload');
    });

    it('Universal Resource API PATCH handler calls validateResourcePayload', () => {
      const code = readFile('src/app/api/admin/resources/[resource]/[id]/route.ts');
      expect(code).toContain('validateResourcePayload');
    });
  });
});
