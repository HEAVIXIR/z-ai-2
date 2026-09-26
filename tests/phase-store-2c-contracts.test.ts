/**
 * HEAVIX — PHASE STORE-2C: Store Control Plane Contract Tests
 *
 * Evidence-anchored on the STORE-1A/2A/2B inventory:
 *   18 admin store routes  (28 route.ts files after health filter)
 *   3 service files         (T-A-DEEP-STORE: inventory + returns + shipments)
 *   53 requirePermission calls (15 store.read + 22 store.manage +
 *     8 fine-grained domain keys: inventory/returns/shipping/procurement)
 *   25 storeDb mutation calls (31 in routes + 6 in services = 37 combined)
 *   27 logAudit calls       (33 in routes + 6 in services = 39 combined)
 *   31 unique action keys   (26 in routes + 6 in services; 5 moved to
 *     services entirely; store.part.update shared between routes and
 *     inventory service)
 *
 * Design principle (per user directive):
 *   - Unit/contract level with dependency isolation.
 *   - NO runtime DB dependency (PGlite is NOT a blocker here).
 *   - Runtime DB smoke is deferred to Phase 2E (where the PostgreSQL/PGlite
 *     limitation was already registered as EVD-6D-01/02).
 *
 * T-A-DEEP-STORE architecture change:
 *   Service layer extracted for inventory, returns, shipments domains.
 *   The route handlers are thin (parse, enforce RBAC, call service,
 *   map errors). The service files hold all DB mutations + audit calls.
 *   Procurement routes are still inline (no service extraction yet).
 *
 *   Contract tests now scan BOTH the route files AND the service files
 *   for audit/mutation/action-key contracts (the combined contract).
 *   Permission contracts stay route-only (RBAC is enforced in the route
 *   handler, not the service).
 *
 *   Fine-grained RBAC (T-A): 8 store.read + 8 store.manage calls were
 *   replaced with domain-specific keys:
 *     inventory.read / inventory.manage
 *     returns.read / returns.manage
 *     shipping.read / shipping.manage
 *     procurement.read / procurement.manage
 *
 * Contracts proven:
 *   1. Permission wiring (route RBAC: 53 calls across store.* + domain keys)
 *   2. Audit hook presence (combined: every mutation has a logAudit call)
 *   3. Audit field correctness (actorId, actorType, action, entityType, before/after)
 *   4. Best-effort design (mutation happens before audit; audit failure won't break mutation)
 *   5. Mutation coverage (no route/service has more mutations than audits)
 *   6. Action key coverage (31 unique keys across routes + services)
 *   7. AI scraper internal helpers (findOrCreateBrand/Category + importPartIntoStore)
 *   8. Side-effect audit (payments/[id] order.update + payment.update)
 *   9. Permission key declarations in permissions.ts
 *   10. Service layer extraction (T-A-DEEP-STORE: 3 service files)
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const STORE_ROUTES_DIR = 'src/app/api/admin/store';
const STORE_SERVICE_FILES = [
  'src/lib/store-inventory-service.ts',
  'src/lib/store-returns-service.ts',
  'src/lib/store-shipments-service.ts',
];

function listRouteFiles(): string[] {
  const results: string[] = [];
  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'route.ts') results.push(full);
    }
  }
  walk(STORE_ROUTES_DIR);
  // Exclude health endpoints (monitoring stubs — no auth required)
  return results.filter(f => !f.includes('/health/')).sort();
}

function readRoute(rel: string): string {
  return fs.readFileSync(rel, 'utf8');
}

function listServiceFiles(): string[] {
  return STORE_SERVICE_FILES.filter(f => fs.existsSync(f));
}

function readService(rel: string): string {
  return fs.readFileSync(rel, 'utf8');
}

// Combined scan: returns content of every route file + every service file.
// Used for audit/mutation/action-key contracts (which now live in both).
function readAllStoreFiles(): { path: string; content: string }[] {
  const routes = listRouteFiles().map(p => ({ path: p, content: readRoute(p) }));
  const services = listServiceFiles().map(p => ({ path: p, content: readService(p) }));
  return [...routes, ...services];
}

// ── Expected action keys (from 2B inventory + T2-W2 store domains) ──
const EXPECTED_ACTION_KEYS = [
  'store.ai_scraper.import',
  'store.brand.create',
  'store.brand.delete',
  'store.brand.update',
  'store.car_model.create',
  'store.car_model.delete',
  'store.car_model.update',
  'store.category.create',
  'store.category.delete',
  'store.category.update',
  'store.currency_rate.update',
  'store.currency_setting.update',
  'store.inventory.movement.create',
  'store.mechanic.create',
  'store.mechanic.delete',
  'store.mechanic.update',
  'store.order.update',
  'store.part.create',
  'store.part.delete',
  'store.part.update',
  'store.payment.update',
  'store.procurement.create',
  'store.procurement.delete',
  'store.procurement.update',
  'store.return.create',
  'store.return.update',
  'store.shipment.create',
  'store.shipment.update',
  'store.supplier.create',
  'store.supplier.delete',
  'store.supplier.update',
];

describe('Phase Store-2C — Store Control Plane Contract Tests', () => {

  // ═══════════════════════════════════════════════════════════════
  // 1. PERMISSION CONTRACTS (route-only — RBAC is enforced in routes)
  // ═══════════════════════════════════════════════════════════════
  describe('1. Permission Wiring', () => {
    it('should have exactly 28 admin store route files', () => {
      const files = listRouteFiles();
      expect(files.length).toBe(28);
    });

    it('should have 53 requirePermission calls across all store routes', () => {
      const files = listRouteFiles();
      let count = 0;
      for (const f of files) {
        const content = readRoute(f);
        const matches = content.match(/requirePermission\(user\.id,/g);
        count += matches ? matches.length : 0;
      }
      expect(count).toBe(53);
    });

    it('should have 15 store.read requirePermission calls', () => {
      // T-A-DEEP-STORE: 8 store.read calls were migrated to domain-specific
      // keys (inventory/returns/shipping/procurement .read). Down from 23.
      const files = listRouteFiles();
      let count = 0;
      for (const f of files) {
        const content = readRoute(f);
        const matches = content.match(/requirePermission\(user\.id,\s*'store\.read'\)/g);
        count += matches ? matches.length : 0;
      }
      expect(count).toBe(15);
    });

    it('should have 22 store.manage requirePermission calls', () => {
      // T-A-DEEP-STORE: 8 store.manage calls were migrated to domain-specific
      // keys (inventory/returns/shipping/procurement .manage). Down from 30.
      const files = listRouteFiles();
      let count = 0;
      for (const f of files) {
        const content = readRoute(f);
        const matches = content.match(/requirePermission\(user\.id,\s*'store\.manage'\)/g);
        count += matches ? matches.length : 0;
      }
      expect(count).toBe(22);
    });

    it('should have 8 fine-grained domain read permissions (inventory/returns/shipping/procurement.read)', () => {
      // T-A-DEEP-STORE: 8 routes migrated from store.read to domain-specific read keys.
      //   inventory.read × 2, returns.read × 2, shipping.read × 2, procurement.read × 2
      const files = listRouteFiles();
      const expectedKeys = [
        'inventory.read',
        'returns.read',
        'shipping.read',
        'procurement.read',
      ];
      const counts: Record<string, number> = {};
      for (const key of expectedKeys) counts[key] = 0;
      for (const f of files) {
        const content = readRoute(f);
        for (const key of expectedKeys) {
          const target = `requirePermission(user.id, '${key}')`;
          let idx = 0;
          while ((idx = content.indexOf(target, idx)) !== -1) {
            counts[key]++;
            idx += target.length;
          }
        }
      }
      // Each domain key should appear exactly 2 times (collection + [id] GETs).
      for (const key of expectedKeys) {
        expect(counts[key]).toBe(2);
      }
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      expect(total).toBe(8);
    });

    it('should have 8 fine-grained domain manage permissions (inventory/returns/shipping/procurement.manage)', () => {
      // T-A-DEEP-STORE: 8 routes migrated from store.manage to domain-specific manage keys.
      //   inventory.manage × 1, returns.manage × 2, shipping.manage × 2, procurement.manage × 3
      const files = listRouteFiles();
      const expected: Record<string, number> = {
        'inventory.manage': 1,
        'returns.manage': 2,
        'shipping.manage': 2,
        'procurement.manage': 3,
      };
      const counts: Record<string, number> = {};
      for (const key of Object.keys(expected)) counts[key] = 0;
      for (const f of files) {
        const content = readRoute(f);
        for (const key of Object.keys(expected)) {
          const target = `requirePermission(user.id, '${key}')`;
          let idx = 0;
          while ((idx = content.indexOf(target, idx)) !== -1) {
            counts[key]++;
            idx += target.length;
          }
        }
      }
      for (const key of Object.keys(expected)) {
        expect(counts[key]).toBe(expected[key]);
      }
    });

    it('every admin store route imports requirePermission from @/lib/authorization', () => {
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
        expect(content).toContain('import { requirePermission } from "@/lib/authorization";');
      }
    });

    it('every admin store route imports getCurrentUser from @/lib/auth', () => {
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
        expect(content).toContain('import { getCurrentUser } from "@/lib/auth";');
      }
    });

    it('no admin store route uses the legacy isAuthenticated pattern', () => {
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
        expect(content).not.toContain('isAuthenticated');
      }
    });

    it('no admin store route imports requireAdmin from @/lib/admin-guard', () => {
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
        expect(content).not.toContain('import { requireAdmin } from "@/lib/admin-guard"');
      }
    });

    it('every GET handler uses a recognized read permission key', () => {
      // T-A-DEEP-STORE: GET handlers may use store.read OR a domain-specific
      //   read key (inventory.read, returns.read, shipping.read, procurement.read).
      const READ_PERMS = [
        'store.read',
        'inventory.read',
        'returns.read',
        'shipping.read',
        'procurement.read',
      ];
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
        if (content.match(/export async function GET\b/)) {
          // Must call requirePermission with at least one of the read keys.
          const found = READ_PERMS.some(p =>
            content.includes(`requirePermission(user.id, '${p}')`),
          );
          expect(found).toBe(true);
        }
      }
    });

    it('every POST handler uses a recognized manage permission key', () => {
      const MANAGE_PERMS = [
        'store.manage',
        'inventory.manage',
        'returns.manage',
        'shipping.manage',
        'procurement.manage',
      ];
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
        if (content.match(/export async function POST\b/)) {
          const found = MANAGE_PERMS.some(p =>
            content.includes(`requirePermission(user.id, '${p}')`),
          );
          expect(found).toBe(true);
        }
      }
    });

    it('every PATCH handler uses a recognized manage permission key', () => {
      const MANAGE_PERMS = [
        'store.manage',
        'inventory.manage',
        'returns.manage',
        'shipping.manage',
        'procurement.manage',
      ];
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
        if (content.match(/export async function PATCH\b/)) {
          const found = MANAGE_PERMS.some(p =>
            content.includes(`requirePermission(user.id, '${p}')`),
          );
          expect(found).toBe(true);
        }
      }
    });

    it('every DELETE handler uses a recognized manage permission key', () => {
      const MANAGE_PERMS = [
        'store.manage',
        'inventory.manage',
        'returns.manage',
        'shipping.manage',
        'procurement.manage',
      ];
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
        if (content.match(/export async function DELETE\b/)) {
          const found = MANAGE_PERMS.some(p =>
            content.includes(`requirePermission(user.id, '${p}')`),
          );
          expect(found).toBe(true);
        }
      }
    });

    it('store.read + store.manage + 8 fine-grained keys are declared in permissions.ts', () => {
      const content = fs.readFileSync('src/lib/authorization/permissions.ts', 'utf8');
      expect(content).toContain("'store.read'");
      expect(content).toContain("'store.manage'");
      expect(content).toContain("'inventory.read'");
      expect(content).toContain("'inventory.manage'");
      expect(content).toContain("'returns.read'");
      expect(content).toContain("'returns.manage'");
      expect(content).toContain("'shipping.read'");
      expect(content).toContain("'shipping.manage'");
      expect(content).toContain("'procurement.read'");
      expect(content).toContain("'procurement.manage'");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 2. AUDIT HOOK PRESENCE (combined: routes + services)
  // ═══════════════════════════════════════════════════════════════
  describe('2. Audit Hook Presence', () => {
    it('should have 39 logAudit calls across all store routes + services', () => {
      // 33 in routes + 6 in services (T-A-DEEP-STORE).
      const files = readAllStoreFiles();
      let count = 0;
      for (const { content } of files) {
        const matches = content.match(/await logAudit\(/g);
        count += matches ? matches.length : 0;
      }
      expect(count).toBe(39);
    });

    it('should have 37 storeDb mutation calls across routes + services', () => {
      // 31 in routes + 6 in services (T-A-DEEP-STORE).
      const files = readAllStoreFiles();
      let count = 0;
      for (const { content } of files) {
        const matches = content.match(/storeDb\.\w+\.(create|update|delete|upsert)\(/g);
        count += matches ? matches.length : 0;
      }
      expect(count).toBe(37);
    });

    it('every mutation file imports logAudit from @/lib/audit', () => {
      // Files (route OR service) that have storeDb mutations must import logAudit.
      // Route files use double quotes; service files use single quotes (both valid).
      const files = readAllStoreFiles();
      for (const { path: f, content } of files) {
        const hasMutation = /storeDb\.\w+\.(create|update|delete|upsert)\(/.test(content);
        if (hasMutation) {
          const hasDouble = content.includes('import { logAudit } from "@/lib/audit";');
          const hasSingle = content.includes("import { logAudit } from '@/lib/audit';");
          expect(hasDouble || hasSingle).toBe(true);
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 3. AUDIT FIELD CORRECTNESS (combined: routes + services)
  // ═══════════════════════════════════════════════════════════════
  describe('3. Audit Field Correctness', () => {
    it('every logAudit call uses actorId from user (user.id or userId ?? null)', () => {
      const files = readAllStoreFiles();
      for (const { content } of files) {
        const auditBlocks = content.match(/await logAudit\(\{[\s\S]*?\}\);/g) || [];
        for (const block of auditBlocks) {
          expect(block).toMatch(/actorId:\s*(user\.id|userId\s*\?\?\s*null)/);
        }
      }
    });

    it('every logAudit call uses actorType ADMIN', () => {
      const files = readAllStoreFiles();
      for (const { content } of files) {
        const auditCount = (content.match(/await logAudit\(/g) || []).length;
        const adminCount = (content.match(/actorType:\s*['"]ADMIN['"]/g) || []).length;
        expect(adminCount).toBe(auditCount);
      }
    });

    it('every logAudit call has an action key starting with store.', () => {
      const files = readAllStoreFiles();
      for (const { content } of files) {
        const auditBlocks = content.match(/await logAudit\(\{[\s\S]*?\}\);/g) || [];
        for (const block of auditBlocks) {
          expect(block).toMatch(/action:\s*['"]store\./);
        }
      }
    });

    it('every logAudit call has an entityType', () => {
      const files = readAllStoreFiles();
      for (const { content } of files) {
        const auditBlocks = content.match(/await logAudit\(\{[\s\S]*?\}\);/g) || [];
        for (const block of auditBlocks) {
          expect(block).toMatch(/entityType:\s*['"]/);
        }
      }
    });

    it('every logAudit call has an entityId', () => {
      const files = readAllStoreFiles();
      for (const { content } of files) {
        const auditBlocks = content.match(/await logAudit\(\{[\s\S]*?\}\);/g) || [];
        for (const block of auditBlocks) {
          expect(block).toMatch(/entityId:\s*/);
        }
      }
    });

    it('update audits have both before and after fields (except upserts)', () => {
      const files = readAllStoreFiles();
      for (const { content } of files) {
        const isUpsertRoute = content.includes('.upsert(');
        const updateActionRegex = /action:\s*['"]store\.\w+\.update['"]/g;
        let m;
        while ((m = updateActionRegex.exec(content)) !== null) {
          const window = content.substring(m.index, m.index + 400);
          expect(window).toMatch(/after:/);
          // upsert routes don't have 'before' (no pre-fetch); all others must have it
          if (!isUpsertRoute) {
            expect(window).toMatch(/before:/);
          }
        }
      }
    });

    it('create audits have an after field', () => {
      const files = readAllStoreFiles();
      for (const { content } of files) {
        const createActionRegex = /action:\s*['"]store\.\w+\.create['"]/g;
        let m;
        while ((m = createActionRegex.exec(content)) !== null) {
          const window = content.substring(m.index, m.index + 400);
          expect(window).toMatch(/after:/);
        }
      }
    });

    it('delete audits have a before field', () => {
      const files = readAllStoreFiles();
      for (const { content } of files) {
        const deleteActionRegex = /action:\s*['"]store\.\w+\.delete['"]/g;
        let m;
        while ((m = deleteActionRegex.exec(content)) !== null) {
          const window = content.substring(m.index, m.index + 400);
          expect(window).toMatch(/before:/);
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 4. BEST-EFFORT DESIGN (mutation happens before audit)
  // ═══════════════════════════════════════════════════════════════
  describe('4. Best-Effort Audit Design', () => {
    it('logAudit is called AFTER the mutation (not before)', () => {
      // In each file, the storeDb mutation call should appear BEFORE the logAudit call
      const files = readAllStoreFiles();
      for (const { content } of files) {
        const mutIdx = content.search(/storeDb\.\w+\.(create|update|delete|upsert)\(/);
        const auditIdx = content.search(/await logAudit\(/);
        if (mutIdx >= 0 && auditIdx >= 0) {
          // The mutation should come before the audit in the file
          expect(mutIdx).toBeLessThan(auditIdx);
        }
      }
    });

    it('logAudit function itself is best-effort (try/catch in audit.ts)', () => {
      const content = fs.readFileSync('src/lib/admin/audit.ts', 'utf8');
      const fnIdx = content.indexOf('export async function logAudit');
      expect(fnIdx).toBeGreaterThan(-1);
      const restOfFile = content.substring(fnIdx);
      expect(restOfFile).toContain('try');
      expect(restOfFile).toContain('catch');
      expect(restOfFile).toContain('console.error');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 5. MUTATION COVERAGE (no mutation without audit)
  // ═══════════════════════════════════════════════════════════════
  describe('5. Mutation Coverage (0 mutations without audit)', () => {
    it('every file has audits >= mutations', () => {
      const files = readAllStoreFiles();
      const gaps: string[] = [];
      for (const { path: f, content } of files) {
        const mutMatches = content.match(/storeDb\.\w+\.(create|update|delete|upsert)\(/g) || [];
        const auditMatches = content.match(/await logAudit\(/g) || [];
        const mutCount = mutMatches.length;
        const auditCount = auditMatches.length;
        if (mutCount > auditCount) {
          gaps.push(`${f}: mutations=${mutCount} audits=${auditCount}`);
        }
      }
      expect(gaps).toEqual([]);
    });

    it('total audits (39) >= total mutations (37)', () => {
      const files = readAllStoreFiles();
      let totalMut = 0;
      let totalAudit = 0;
      for (const { content } of files) {
        const mutMatches = content.match(/storeDb\.\w+\.(create|update|delete|upsert)\(/g) || [];
        const auditMatches = content.match(/await logAudit\(/g) || [];
        totalMut += mutMatches.length;
        totalAudit += auditMatches.length;
      }
      expect(totalAudit).toBeGreaterThanOrEqual(totalMut);
      expect(totalMut).toBe(37);
      expect(totalAudit).toBe(39);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 6. ACTION KEY COVERAGE (31 unique keys across routes + services)
  // ═══════════════════════════════════════════════════════════════
  describe('6. Action Key Coverage', () => {
    it('should have all 31 expected action keys', () => {
      const files = readAllStoreFiles();
      const foundKeys = new Set<string>();
      for (const { content } of files) {
        const matches = content.matchAll(/action:\s*['"](store\.[^'"]+)['"]/g);
        for (const m of matches) {
          foundKeys.add(m[1]);
        }
      }
      for (const key of EXPECTED_ACTION_KEYS) {
        expect(foundKeys.has(key)).toBe(true);
      }
      expect(foundKeys.size).toBe(31);
    });

    it('action keys follow the store.<entity>(.<sub>)?.<operation> convention', () => {
      const files = readAllStoreFiles();
      for (const { content } of files) {
        const matches = content.matchAll(/action:\s*['"](store\.[^'"]+)['"]/g);
        for (const m of matches) {
          const key = m[1];
          expect(key).toMatch(/^store\.[a-z_]+(\.[a-z_]+)*\.(create|update|delete|import)$/);
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 7. AI SCRAPER INTERNAL HELPERS (route-only)
  // ═══════════════════════════════════════════════════════════════
  describe('7. AI Scraper Internal Helpers', () => {
    const aiScraper = 'src/app/api/admin/store/ai-scraper/route.ts';

    it('findOrCreateBrand accepts userId parameter', () => {
      const content = readRoute(aiScraper);
      expect(content).toMatch(/async function findOrCreateBrand\([^)]*userId\??:\s*string \| null/);
    });

    it('findOrCreateCategory accepts userId parameter', () => {
      const content = readRoute(aiScraper);
      expect(content).toMatch(/async function findOrCreateCategory\([^)]*userId\??:\s*string \| null/);
    });

    it('importPartIntoStore accepts userId parameter', () => {
      const content = readRoute(aiScraper);
      expect(content).toMatch(/async function importPartIntoStore\([\s\S]*?userId\??:\s*string \| null/);
    });

    it('findOrCreateBrand has store.brand.create audit', () => {
      const content = readRoute(aiScraper);
      const fnStart = content.indexOf('async function findOrCreateBrand');
      const fnEnd = content.indexOf('\n}', fnStart);
      const fnBody = content.substring(fnStart, fnEnd);
      expect(fnBody).toContain("action: 'store.brand.create'");
    });

    it('findOrCreateCategory has store.category.create audit', () => {
      const content = readRoute(aiScraper);
      const fnStart = content.indexOf('async function findOrCreateCategory');
      const fnEnd = content.indexOf('\n}', fnStart);
      const fnBody = content.substring(fnStart, fnEnd);
      expect(fnBody).toContain("action: 'store.category.create'");
    });

    it('importPartIntoStore has store.part.create audit', () => {
      const content = readRoute(aiScraper);
      const fnStart = content.indexOf('async function importPartIntoStore');
      const fnEnd = content.indexOf('\n}', fnStart);
      const fnBody = content.substring(fnStart, fnEnd);
      expect(fnBody).toContain("action: 'store.part.create'");
    });

    it('call sites pass user.id to importPartIntoStore', () => {
      const content = readRoute(aiScraper);
      const calls = content.matchAll(/importPartIntoStore\((\w+),\s*user\.id\)/g);
      const callArray = Array.from(calls);
      expect(callArray.length).toBe(2);
    });

    it('ai-scraper has store.ai_scraper.import audit for user-initiated action', () => {
      const content = readRoute(aiScraper);
      expect(content).toContain("action: 'store.ai_scraper.import'");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 8. SIDE-EFFECT AUDIT (payments/[id] order + payment)
  // ═══════════════════════════════════════════════════════════════
  describe('8. Side-Effect Audit (payments/[id])', () => {
    const paymentsId = 'src/app/api/admin/store/payments/[id]/route.ts';

    it('payments/[id] audits the order.update side-effect', () => {
      const content = readRoute(paymentsId);
      expect(content).toContain("action: 'store.order.update'");
      expect(content).toContain("entityType: 'Order'");
    });

    it('payments/[id] audits the payment.update', () => {
      const content = readRoute(paymentsId);
      expect(content).toContain("action: 'store.payment.update'");
      expect(content).toContain("entityType: 'Payment'");
    });

    it('payments/[id] has 2 mutations and 2 audits', () => {
      const content = readRoute(paymentsId);
      const mutMatches = content.match(/storeDb\.\w+\.(create|update|delete|upsert)\(/g) || [];
      const auditMatches = content.match(/await logAudit\(/g) || [];
      expect(mutMatches.length).toBe(2);
      expect(auditMatches.length).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 9. TYPE / STRUCTURAL INTEGRITY (route-only)
  // ═══════════════════════════════════════════════════════════════
  describe('9. Type / Structural Integrity', () => {
    it('every admin store route has runtime = nodejs', () => {
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
        expect(content).toContain('export const runtime = "nodejs"');
      }
    });

    it('every admin store route has dynamic = force-dynamic', () => {
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
        expect(content).toContain('export const dynamic = "force-dynamic"');
      }
    });

    it('no admin store route has @ts-nocheck', () => {
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
        expect(content).not.toContain('@ts-nocheck');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 10. SERVICE LAYER EXTRACTION (T-A-DEEP-STORE)
  // ═══════════════════════════════════════════════════════════════
  describe('10. Service Layer Extraction (T-A-DEEP-STORE)', () => {
    it('should have 3 store service files', () => {
      const services = listServiceFiles();
      expect(services.length).toBe(3);
      expect(services).toContain('src/lib/store-inventory-service.ts');
      expect(services).toContain('src/lib/store-returns-service.ts');
      expect(services).toContain('src/lib/store-shipments-service.ts');
    });

    it('store-inventory-service.ts exports createMovement + listMovements', () => {
      const content = readService('src/lib/store-inventory-service.ts');
      expect(content).toMatch(/export async function createMovement\b/);
      expect(content).toMatch(/export async function listMovements\b/);
    });

    it('store-returns-service.ts exports createReturn + updateReturnStatus + listReturns', () => {
      const content = readService('src/lib/store-returns-service.ts');
      expect(content).toMatch(/export async function createReturn\b/);
      expect(content).toMatch(/export async function updateReturnStatus\b/);
      expect(content).toMatch(/export async function listReturns\b/);
    });

    it('store-shipments-service.ts exports createShipment + updateShipment + listShipments', () => {
      const content = readService('src/lib/store-shipments-service.ts');
      expect(content).toMatch(/export async function createShipment\b/);
      expect(content).toMatch(/export async function updateShipment\b/);
      expect(content).toMatch(/export async function listShipments\b/);
    });

    it('inventory route imports createMovement + listMovements from service', () => {
      const content = readRoute('src/app/api/admin/store/inventory/route.ts');
      expect(content).toContain('import');
      expect(content).toContain('createMovement');
      expect(content).toContain('listMovements');
      expect(content).toContain('from "@/lib/store-inventory-service"');
    });

    it('returns route imports createReturn + listReturns from service', () => {
      const content = readRoute('src/app/api/admin/store/returns/route.ts');
      expect(content).toContain('createReturn');
      expect(content).toContain('listReturns');
      expect(content).toContain('from "@/lib/store-returns-service"');
    });

    it('returns/[id] route imports updateReturnStatus from service', () => {
      const content = readRoute('src/app/api/admin/store/returns/[id]/route.ts');
      expect(content).toContain('updateReturnStatus');
      expect(content).toContain('from "@/lib/store-returns-service"');
    });

    it('shipments route imports createShipment + listShipments from service', () => {
      const content = readRoute('src/app/api/admin/store/shipments/route.ts');
      expect(content).toContain('createShipment');
      expect(content).toContain('listShipments');
      expect(content).toContain('from "@/lib/store-shipments-service"');
    });

    it('shipments/[id] route imports updateShipment from service', () => {
      const content = readRoute('src/app/api/admin/store/shipments/[id]/route.ts');
      expect(content).toContain('updateShipment');
      expect(content).toContain('from "@/lib/store-shipments-service"');
    });

    it('every service file imports storeDb + logAudit', () => {
      // Service files use single quotes (audit.ts convention); route files use double.
      for (const f of listServiceFiles()) {
        const content = readService(f);
        const hasStoreDbDouble = content.includes('import { storeDb } from "@/lib/store-db";');
        const hasStoreDbSingle = content.includes("import { storeDb } from '@/lib/store-db';");
        expect(hasStoreDbDouble || hasStoreDbSingle).toBe(true);
        const hasLogAuditDouble = content.includes('import { logAudit } from "@/lib/audit";');
        const hasLogAuditSingle = content.includes("import { logAudit } from '@/lib/audit';");
        expect(hasLogAuditDouble || hasLogAuditSingle).toBe(true);
      }
    });

    it('inventory/returns/shipments routes have 0 inline storeDb mutations (delegated to services)', () => {
      const delegatedRoutes = [
        'src/app/api/admin/store/inventory/route.ts',
        'src/app/api/admin/store/returns/route.ts',
        'src/app/api/admin/store/returns/[id]/route.ts',
        'src/app/api/admin/store/shipments/route.ts',
        'src/app/api/admin/store/shipments/[id]/route.ts',
      ];
      for (const f of delegatedRoutes) {
        const content = readRoute(f);
        const muts = content.match(/storeDb\.\w+\.(create|update|delete|upsert)\(/g) || [];
        // GET handlers may still have read queries (findUnique/findMany) —
        // but no mutations should be inline; all delegated to services.
        expect(muts.length).toBe(0);
      }
    });

    it('procurement routes still inline (no service extraction)', () => {
      // Per T-A-DEEP-STORE scope: procurement routes were NOT migrated to a service.
      // Their mutations stay inline in the route files.
      const content = readRoute('src/app/api/admin/store/procurement/route.ts');
      expect(content).toMatch(/storeDb\.procurementRequest\.create/);
      const contentId = readRoute('src/app/api/admin/store/procurement/[id]/route.ts');
      expect(contentId).toMatch(/storeDb\.procurementRequest\.(update|delete)/);
    });
  });
});
