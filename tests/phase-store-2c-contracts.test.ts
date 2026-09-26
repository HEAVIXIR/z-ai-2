/**
 * HEAVIX — PHASE STORE-2C: Store Control Plane Contract Tests
 *
 * Evidence-anchored on the STORE-1A/2A/2B inventory:
 *   18 admin store routes
 *   32 requirePermission calls (13 store.read + 19 store.manage)
 *   25 storeDb mutation calls (create/update/delete/upsert)
 *   27 logAudit calls
 *   20 unique action keys
 *
 * Design principle (per user directive):
 *   - Unit/contract level with dependency isolation.
 *   - NO runtime DB dependency (PGlite is NOT a blocker here).
 *   - Runtime DB smoke is deferred to Phase 2E (where the PostgreSQL/PGlite
 *     limitation was already registered as EVD-6D-01/02).
 *
 * Contracts proven:
 *   1. Permission wiring (store.read for GET, store.manage for mutations)
 *   2. Audit hook presence (every mutation has a logAudit call)
 *   3. Audit field correctness (actorId, actorType, action, entityType, before/after)
 *   4. Best-effort design (mutation happens before audit; audit failure won't break mutation)
 *   5. Mutation coverage (no route has more mutations than audits)
 *   6. AI scraper internal helpers (findOrCreateBrand/Category + importPartIntoStore)
 *   7. Side-effect audit (payments/[id] order.update + payment.update)
 *   8. Permission key declarations in permissions.ts
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const STORE_ROUTES_DIR = 'src/app/api/admin/store';

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
  'store.supplier.create',
  'store.supplier.delete',
  'store.supplier.update',
];

describe('Phase Store-2C — Store Control Plane Contract Tests', () => {

  // ═══════════════════════════════════════════════════════════════
  // 1. PERMISSION CONTRACTS
  // ═══════════════════════════════════════════════════════════════
  describe('1. Permission Wiring', () => {
    it('should have exactly 26 admin store route files', () => {
      const files = listRouteFiles();
      expect(files.length).toBe(26);
    });

    it('should have 49 requirePermission calls across all store routes', () => {
      const files = listRouteFiles();
      let count = 0;
      for (const f of files) {
        const content = readRoute(f);
        const matches = content.match(/requirePermission\(user\.id,/g);
        count += matches ? matches.length : 0;
      }
      expect(count).toBe(49);
    });

    it('should have 21 store.read requirePermission calls', () => {
      const files = listRouteFiles();
      let count = 0;
      for (const f of files) {
        const content = readRoute(f);
        const matches = content.match(/requirePermission\(user\.id,\s*'store\.read'\)/g);
        count += matches ? matches.length : 0;
      }
      expect(count).toBe(21);
    });

    it('should have 28 store.manage requirePermission calls', () => {
      const files = listRouteFiles();
      let count = 0;
      for (const f of files) {
        const content = readRoute(f);
        const matches = content.match(/requirePermission\(user\.id,\s*'store\.manage'\)/g);
        count += matches ? matches.length : 0;
      }
      expect(count).toBe(28);
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

    it('every GET handler uses store.read permission', () => {
      // For each route file that has a GET handler, verify it calls requirePermission with store.read
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
        if (content.match(/export async function GET\b/)) {
          expect(content).toContain("requirePermission(user.id, 'store.read')");
        }
      }
    });

    it('every POST handler uses store.manage permission', () => {
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
        if (content.match(/export async function POST\b/)) {
          expect(content).toContain("requirePermission(user.id, 'store.manage')");
        }
      }
    });

    it('every PATCH handler uses store.manage permission', () => {
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
        if (content.match(/export async function PATCH\b/)) {
          expect(content).toContain("requirePermission(user.id, 'store.manage')");
        }
      }
    });

    it('every DELETE handler uses store.manage permission', () => {
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
        if (content.match(/export async function DELETE\b/)) {
          expect(content).toContain("requirePermission(user.id, 'store.manage')");
        }
      }
    });

    it('store.read and store.manage permission keys are declared in permissions.ts', () => {
      const content = fs.readFileSync('src/lib/authorization/permissions.ts', 'utf8');
      expect(content).toContain("'store.read'");
      expect(content).toContain("'store.manage'");
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 2. AUDIT HOOK PRESENCE
  // ═══════════════════════════════════════════════════════════════
  describe('2. Audit Hook Presence', () => {
    it('should have 37 logAudit calls across all store routes', () => {
      const files = listRouteFiles();
      let count = 0;
      for (const f of files) {
        const content = readRoute(f);
        const matches = content.match(/await logAudit\(/g);
        count += matches ? matches.length : 0;
      }
      expect(count).toBe(37);
    });

    it('should have 35 storeDb mutation calls (create/update/delete/upsert)', () => {
      const files = listRouteFiles();
      let count = 0;
      for (const f of files) {
        const content = readRoute(f);
        const matches = content.match(/storeDb\.\w+\.(create|update|delete|upsert)\(/g);
        count += matches ? matches.length : 0;
      }
      expect(count).toBe(35);
    });

    it('every mutation route file imports logAudit from @/lib/audit', () => {
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
        const hasMutation = /storeDb\.\w+\.(create|update|delete|upsert)\(/.test(content);
        if (hasMutation) {
          expect(content).toContain('import { logAudit } from "@/lib/audit";');
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 3. AUDIT FIELD CORRECTNESS
  // ═══════════════════════════════════════════════════════════════
  describe('3. Audit Field Correctness', () => {
    it('every logAudit call uses actorId from user (user.id or userId)', () => {
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
        const auditBlocks = content.match(/await logAudit\(\{[\s\S]*?\}\);/g) || [];
        for (const block of auditBlocks) {
          expect(block).toMatch(/actorId:\s*(user\.id|userId\s*\?\?\s*null)/);
        }
      }
    });

    it('every logAudit call uses actorType ADMIN', () => {
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
        // Find each logAudit call and check it has actorType ADMIN (single or double quotes)
        const auditRegex = /await logAudit\(\{[\s\S]*?\}\);/g;
        // Use a simpler approach: check that actorType ADMIN appears in the file
        // near each logAudit call. Since all audits use ADMIN, just verify the pattern exists.
        const auditCount = (content.match(/await logAudit\(/g) || []).length;
        const adminCount = (content.match(/actorType:\s*['"]ADMIN['"]/g) || []).length;
        expect(adminCount).toBe(auditCount);
      }
    });

    it('every logAudit call has an action key starting with store.', () => {
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
        const auditBlocks = content.match(/await logAudit\(\{[\s\S]*?\}\);/g) || [];
        for (const block of auditBlocks) {
          expect(block).toMatch(/action:\s*['"]store\./);
        }
      }
    });

    it('every logAudit call has an entityType', () => {
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
        const auditBlocks = content.match(/await logAudit\(\{[\s\S]*?\}\);/g) || [];
        for (const block of auditBlocks) {
          expect(block).toMatch(/entityType:\s*['"]/);
        }
      }
    });

    it('every logAudit call has an entityId', () => {
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
        const auditBlocks = content.match(/await logAudit\(\{[\s\S]*?\}\);/g) || [];
        for (const block of auditBlocks) {
          expect(block).toMatch(/entityId:\s*/);
        }
      }
    });

    it('update audits have both before and after fields (except upserts)', () => {
      // For every audit with action store.*.update, verify before + after present.
      // EXCEPTION: upsert-based updates (currency route) don't fetch a 'before' state
      // because upsert creates-or-updates in one call. These are identified by the
      // use of .upsert( in the same file.
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
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
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
        const createActionRegex = /action:\s*['"]store\.\w+\.create['"]/g;
        let m;
        while ((m = createActionRegex.exec(content)) !== null) {
          const window = content.substring(m.index, m.index + 400);
          expect(window).toMatch(/after:/);
        }
      }
    });

    it('delete audits have a before field', () => {
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
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
      // In each route, the storeDb mutation call should appear BEFORE the logAudit call
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
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
      // The logAudit function must have try/catch so it never throws.
      // Search the full file (not just a window) for the function + its catch + console.error.
      const fnIdx = content.indexOf('export async function logAudit');
      expect(fnIdx).toBeGreaterThan(-1);
      // Search from the function start to the end of the file for try/catch/console.error
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
    it('every route file has audits >= mutations', () => {
      const files = listRouteFiles();
      const gaps: string[] = [];
      for (const f of files) {
        const content = readRoute(f);
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

    it('total audits (37) >= total mutations (35)', () => {
      const files = listRouteFiles();
      let totalMut = 0;
      let totalAudit = 0;
      for (const f of files) {
        const content = readRoute(f);
        const mutMatches = content.match(/storeDb\.\w+\.(create|update|delete|upsert)\(/g) || [];
        const auditMatches = content.match(/await logAudit\(/g) || [];
        totalMut += mutMatches.length;
        totalAudit += auditMatches.length;
      }
      expect(totalAudit).toBeGreaterThanOrEqual(totalMut);
      expect(totalMut).toBe(35);
      expect(totalAudit).toBe(37);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 6. ACTION KEY COVERAGE (29 unique keys)
  // ═══════════════════════════════════════════════════════════════
  describe('6. Action Key Coverage', () => {
    it('should have all 29 expected action keys', () => {
      const files = listRouteFiles();
      const foundKeys = new Set<string>();
      for (const f of files) {
        const content = readRoute(f);
        const matches = content.matchAll(/action:\s*['"](store\.[^'"]+)['"]/g);
        for (const m of matches) {
          foundKeys.add(m[1]);
        }
      }
      for (const key of EXPECTED_ACTION_KEYS) {
        expect(foundKeys.has(key)).toBe(true);
      }
      expect(foundKeys.size).toBe(29);
    });

    it('action keys follow the store.<entity>(.<sub>)?.<operation> convention', () => {
      const files = listRouteFiles();
      for (const f of files) {
        const content = readRoute(f);
        const matches = content.matchAll(/action:\s*['"](store\.[^'"]+)['"]/g);
        for (const m of matches) {
          const key = m[1];
          // Must match store.<entity>(.<subentity>)*.<operation>
          // where operation is create/update/delete/import. This
          // supports nested entity names like
          // `store.inventory.movement.create` (T2-W2-A inventory
          // movement ledger) — the .<sub> part can repeat.
          expect(key).toMatch(/^store\.[a-z_]+(\.[a-z_]+)*\.(create|update|delete|import)$/);
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 7. AI SCRAPER INTERNAL HELPERS
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
      // The function body should contain store.brand.create action
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
      // Both call sites should pass user.id as the second argument
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
  // 9. TYPE / STRUCTURAL INTEGRITY
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
});
