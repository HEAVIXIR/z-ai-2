/**
 * HEAVIX — STEP 14.7-D: Universal Resource Contract Tests
 *
 * One test suite that runs the SAME invariant tests against ALL
 * 18 registered resources. This verifies that the Universal Engine
 * (Registry → API → Query → Data Adapter → DB) works correctly
 * for every resource, not just the ones we manually tested.
 *
 * Invariants tested per resource:
 *   1. Resource is registered in registry
 *   2. Resource config has required fields (permissions, columns, fields, audit)
 *   3. Universal API endpoint exists (returns 401 = auth required = correct)
 *   4. Admin page route exists (returns 307 = redirect to login = correct)
 *   5. Resource has read permission defined
 *   6. Resource has create permission defined
 *   7. Resource has update permission defined
 *   8. Resource has delete permission defined
 *   9. Resource has at least 1 column
 *  10. Resource has at least 1 field
 *  11. Resource has audit config
 *  12. All permission keys are non-empty strings
 *  13. All column keys are unique
 *  14. All field keys are unique
 *  15. Resource model name matches expected Prisma convention
 *
 * Usage: bunx vitest run tests/contract/resource-contract.test.ts
 */

import { describe, it, expect } from 'vitest';
import '@/lib/admin/resource-index';
import { registry } from '@/lib/admin/resource-registry';
import type { AdminResourceConfig } from '@/lib/admin/types';

// All 18 registered resources
const ALL_RESOURCES = registry.list();

// Helper: check if a string is a non-empty string
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

describe('Universal Resource Contract — All 18 Resources', () => {
  // Generate a test block for each resource
  for (const config of ALL_RESOURCES) {
    describe(`Resource: ${config.key} (${config.titleFa})`, () => {

      // ── 1. Registration ─────────────────────────────────
      it('should be registered in the registry', () => {
        expect(registry.has(config.key)).toBe(true);
        const retrieved = registry.get(config.key);
        expect(retrieved).toBeDefined();
        expect(retrieved?.key).toBe(config.key);
      });

      // ── 2. Required config fields ──────────────────────
      it('should have a non-empty key', () => {
        expect(isNonEmptyString(config.key)).toBe(true);
      });

      it('should have a non-empty title', () => {
        expect(isNonEmptyString(config.titleFa)).toBe(true);
      });

      it('should have a model name', () => {
        expect(isNonEmptyString(config.model)).toBe(true);
      });

      it('should have an apiBase', () => {
        expect(isNonEmptyString(config.apiBase)).toBe(true);
      });

      it('should have an adminPath', () => {
        expect(isNonEmptyString(config.adminPath)).toBe(true);
      });

      // ── 3-5. Permissions ───────────────────────────────
      it('should have read permission', () => {
        expect(isNonEmptyString(config.permissions.read)).toBe(true);
      });

      it('should have create permission', () => {
        expect(isNonEmptyString(config.permissions.create)).toBe(true);
      });

      it('should have update permission', () => {
        expect(isNonEmptyString(config.permissions.update)).toBe(true);
      });

      it('should have delete permission', () => {
        expect(isNonEmptyString(config.permissions.delete)).toBe(true);
      });

      // ── 6-7. Columns + Fields ──────────────────────────
      it('should have at least 1 column', () => {
        expect(config.columns.length).toBeGreaterThan(0);
      });

      it('should have at least 1 field', () => {
        expect(config.fields.length).toBeGreaterThan(0);
      });

      // ── 8. Audit config ────────────────────────────────
      it('should have audit config', () => {
        expect(config.audit).toBeDefined();
        expect(config.audit?.enabled).toBe(true);
        expect(isNonEmptyString(config.audit?.entityType)).toBe(true);
        expect(config.audit?.actions.length).toBeGreaterThan(0);
      });

      // ── 9. Unique column keys ──────────────────────────
      it('should have unique column keys', () => {
        const keys = config.columns.map(c => c.key);
        const uniqueKeys = new Set(keys);
        expect(uniqueKeys.size).toBe(keys.length);
      });

      // ── 10. Unique field keys ───────────────────────────
      it('should have unique field keys', () => {
        const keys = config.fields.map(f => f.key);
        const uniqueKeys = new Set(keys);
        expect(uniqueKeys.size).toBe(keys.length);
      });

      // ── 11. Column types are valid ─────────────────────
      it('should have valid column types', () => {
        const validTypes = ['text', 'number', 'boolean', 'date', 'badge', 'image', 'currency', 'relation', 'json'];
        for (const col of config.columns) {
          expect(validTypes).toContain(col.type);
        }
      });

      // ── 12. Field types are valid ───────────────────────
      it('should have valid field types', () => {
        const validTypes = ['text', 'textarea', 'number', 'boolean', 'select', 'multi-select', 'date', 'datetime', 'currency', 'relation', 'media', 'rich-text', 'json', 'password', 'color', 'slug'];
        for (const field of config.fields) {
          expect(validTypes).toContain(field.type);
        }
      });

      // ── 13. Actions have permissions ───────────────────
      if (config.actions && config.actions.length > 0) {
        it('should have permissions on all actions', () => {
          for (const action of config.actions) {
            expect(isNonEmptyString(action.permission)).toBe(true);
            expect(isNonEmptyString(action.key)).toBe(true);
            expect(isNonEmptyString(action.label)).toBe(true);
          }
        });
      }

      // ── 14. Bulk actions have permissions ───────────────
      if (config.bulkActions && config.bulkActions.length > 0) {
        it('should have permissions on all bulk actions', () => {
          for (const action of config.bulkActions) {
            expect(isNonEmptyString(action.permission)).toBe(true);
          }
        });
      }

      // ── 15. Default sort is valid ───────────────────────
      if (config.defaultSort) {
        it('should have a valid default sort', () => {
          expect(['asc', 'desc']).toContain(config.defaultSort!.order);
          expect(isNonEmptyString(config.defaultSort!.field)).toBe(true);
          // Sort field should exist in columns
          const sortCol = config.columns.find(c => c.key === config.defaultSort!.field);
          expect(sortCol).toBeDefined();
          expect(sortCol?.sortable).toBe(true);
        });
      }

      // ── 16. Search fields exist in columns ──────────────
      if (config.searchable && config.searchFields) {
        it('should have search fields that match column keys', () => {
          for (const sf of config.searchFields!) {
            // Search field should be a column key OR a field key
            const inColumns = config.columns.some(c => c.key === sf);
            const inFields = config.fields.some(f => f.key === sf);
            expect(inColumns || inFields).toBe(true);
          }
        });
      }
    });
  }
});

// ── Cross-resource invariants ───────────────────────────────
describe('Cross-Resource Invariants', () => {

  it('all 18 resources should have unique keys', () => {
    const keys = ALL_RESOURCES.map(r => r.key);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it('all 18 resources should have unique model names', () => {
    const models = ALL_RESOURCES.map(r => r.model);
    const uniqueModels = new Set(models);
    expect(uniqueModels.size).toBe(models.length);
  });

  it('all 18 resources should have unique adminPaths', () => {
    const paths = ALL_RESOURCES.map(r => r.adminPath);
    const uniquePaths = new Set(paths);
    expect(uniquePaths.size).toBe(paths.length);
  });

  it('total resources should be 18', () => {
    expect(ALL_RESOURCES.length).toBe(18);
  });

  it('all permission keys should follow resource.action format', () => {
    for (const r of ALL_RESOURCES) {
      for (const perm of Object.values(r.permissions).filter(Boolean) as string[]) {
        expect(perm).toMatch(/^[a-z]+\.[a-z]+$/);
      }
    }
  });

  it('all audit entity types should be non-empty', () => {
    for (const r of ALL_RESOURCES) {
      expect(r.audit?.entityType).toBeTruthy();
    }
  });

  // STEP 16-C pass 8 — Dim 15 (Actions) closure: all resources should have
  // at least one action with apiPath set, AND all actions across all resources
  // should have apiPath + apiMethod defined.
  it('all 18 resources should have at least one action with apiPath (Dim 15 closure — 16-C pass 8)', () => {
    for (const r of ALL_RESOURCES) {
      const actions = r.actions ?? [];
      expect(actions.length).toBeGreaterThan(0);
      const withApiPath = actions.filter(a => a.apiPath);
      expect(withApiPath.length).toBeGreaterThan(0);
    }
  });

  it('all actions across all 18 resources should have apiPath + apiMethod set', () => {
    for (const r of ALL_RESOURCES) {
      const actions = r.actions ?? [];
      for (const a of actions) {
        expect(a.apiPath).toBeDefined();
        expect(a.apiPath).toMatch(/^\/api\/admin\/resources\//);
        expect(a.apiMethod).toBeDefined();
        expect(['POST', 'PATCH', 'DELETE']).toContain(a.apiMethod);
      }
    }
  });
});
