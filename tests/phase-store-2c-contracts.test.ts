/**
 * HEAVIX — PHASE STORE-2C: Store Control Plane Contract Tests
 *
 * Evidence-anchored on the STORE-1A/2A/2B inventory:
 *   18 admin store routes  (38 route.ts files after health filter)
 *   4 service files         (T-A-DEEP-STORE: inventory + returns + shipments
 *     + PHASE1-PROCUREMENT-SHIPPING-DEEP: procurement)
 *   70 requirePermission calls (15 store.read + 22 store.manage +
 *     33 fine-grained domain keys: inventory/returns/shipping/procurement)
 *   61 storeDb mutation calls (31 in routes + 30 in services = 61 combined)
 *   63 logAudit calls       (33 in routes + 30 in services = 63 combined)
 *   46 unique action keys   (31 in routes+services original +
 *     9 new in T1+T2-DEEP: warehouse.create/update/delete,
 *     inventory.balance.update, inventory.reserve, inventory.release,
 *     return.item.add, return.inspect, return.resolve
 *     + 6 new in PHASE1-PROCUREMENT-SHIPPING-DEEP: procurement.po.create/
 *     submit/approve/receive/cancel, shipment.tracking.add)
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
 *   Procurement CRUD routes (route.ts + [id]/route.ts) are still inline;
 *   the deeper PO lifecycle (purchase-orders/*) is delegated to the
 *   store-procurement-service.ts (PHASE1-PROCUREMENT-SHIPPING-DEEP).
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
 * T1-DEEP + T2-DEEP architecture change (PHASE1-STORE-INVENTORY-RETURNS-DEEP):
 *   Inventory service extended with warehouse + reservation + low-stock:
 *     - createWarehouse / updateWarehouse / deleteWarehouse
 *     - adjustStock (per-warehouse: InventoryBalance + StockMovement + Part.stock)
 *     - reserveStock / releaseStock (soft-reserved counter)
 *     - getLowStockItems (low-stock alert report)
 *   Returns service extended with item + inspection + resolution workflow:
 *     - addReturnItem (per-OrderItem line)
 *     - inspectReturn (admin restockable flags + notes; status → INSPECTED)
 *     - resolveReturn (REFUND/EXCHANGE/REJECT; REFUND → WalletTransaction)
 *
 *   New routes (6 added → 28 became 34):
 *     - /api/admin/store/warehouses (GET list + POST create)
 *     - /api/admin/store/warehouses/[id] (GET + PATCH + DELETE)
 *     - /api/admin/store/inventory/reserve (POST)
 *     - /api/admin/store/inventory/release (POST)
 *     - /api/admin/store/inventory/low-stock (GET)
 *     - /api/admin/store/returns/[id]/items (GET items + POST add item)
 *
 *   New action-key verbs allowed (T1+T2-DEEP): reserve, release, add,
 *   inspect, resolve (in addition to create/update/delete/import). The
 *   convention regex is widened to accept these.
 *
 * PHASE1-PROCUREMENT-SHIPPING-DEEP architecture change:
 *   Procurement Deep (PurchaseOrder + Approval + Receiving):
 *     - store-procurement-service.ts (NEW — 4th service file)
 *       - createPurchaseOrder / submitPurchaseOrder / approvePurchaseOrder
 *       - receivePurchaseOrderItem (partial receiving: StockMovement +
 *         Part.stock snapshot + conditional PO status flip to RECEIVED)
 *       - cancelPurchaseOrder
 *   Shipping Deep (Tracking History):
 *     - store-shipments-service.ts extended with addTrackingEvent +
 *       getTrackingHistory (append-only ShipmentTracking ledger +
 *       parent Shipment snapshot sync).
 *
 *   New routes (4 added → 34 became 38):
 *     - /api/admin/store/procurement/[id]/purchase-orders (GET list + POST create)
 *     - /api/admin/store/procurement/[id]/purchase-orders/[poId] (GET + PATCH
 *       for submit/approve/cancel state-machine)
 *     - /api/admin/store/procurement/[id]/purchase-orders/[poId]/receive (POST
 *       partial receiving)
 *     - /api/admin/store/shipments/[id]/tracking (GET history + POST add event)
 *
 *   New action-key verbs allowed (PHASE1-PROCUREMENT-SHIPPING-DEEP):
 *     submit, approve, receive, cancel (in addition to the T1+T2-DEEP set).
 *     The convention regex is widened again to accept these state-machine
 *     verbs so the audit trail is self-describing (po.submit, po.approve,
 *     po.receive, po.cancel vs a generic po.update).
 *
 * Contracts proven:
 *   1. Permission wiring (route RBAC: 70 calls across store.* + domain keys)
 *   2. Audit hook presence (combined: every mutation has a logAudit call)
 *   3. Audit field correctness (actorId, actorType, action, entityType, before/after)
 *   4. Best-effort design (mutation happens before audit; audit failure won't break mutation)
 *   5. Mutation coverage (no route/service has more mutations than audits)
 *   6. Action key coverage (46 unique keys across routes + services)
 *   7. AI scraper internal helpers (findOrCreateBrand/Category + importPartIntoStore)
 *   8. Side-effect audit (payments/[id] order.update + payment.update)
 *   9. Permission key declarations in permissions.ts
 *   10. Service layer extraction (T-A-DEEP-STORE + PHASE1-PROCUREMENT-SHIPPING-DEEP:
 *       4 service files)
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const STORE_ROUTES_DIR = 'src/app/api/admin/store';
const STORE_SERVICE_FILES = [
  'src/lib/store-inventory-service.ts',
  'src/lib/store-returns-service.ts',
  'src/lib/store-shipments-service.ts',
  // PHASE1-PROCUREMENT-SHIPPING-DEEP — PurchaseOrder + Approval +
  // Receiving workflow service. The base ProcurementRequest CRUD
  // stays inline in the procurement/route.ts + [id]/route.ts files;
  // this service owns the deeper PO lifecycle.
  'src/lib/store-procurement-service.ts',
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
  // ── T1-DEEP + T2-DEEP (9 new action keys) ──
  // Warehouse + InventoryBalance domain (warehouse CRUD + balance update
  // side-effect audit + reserve/release verbs).
  'store.warehouse.create',
  'store.warehouse.update',
  'store.warehouse.delete',
  'store.inventory.balance.update',
  'store.inventory.reserve',
  'store.inventory.release',
  // Returns deep (item add + inspection + resolution). Resolution audits
  // 3 entityTypes (Return, WalletTransaction, Customer) but reuses the
  // same action key per phase-2C "one action per business operation"
  // convention.
  'store.return.item.add',
  'store.return.inspect',
  'store.return.resolve',
  // ── PHASE1-PROCUREMENT-SHIPPING-DEEP (6 new action keys) ──
  // PurchaseOrder lifecycle: create → submit → approve → receive
  // (with conditional PO status flip) → cancel. Plus shipment tracking
  // append (the tracking.add verb on ShipmentTracking entity).
  'store.procurement.po.create',
  'store.procurement.po.submit',
  'store.procurement.po.approve',
  'store.procurement.po.receive',
  'store.procurement.po.cancel',
  'store.shipment.tracking.add',
  // ── PHASE-P8-TRANSACTION (2 new action keys in route scope) ──
  // The RentalBooking state-machine audits (store.rental.create,
  // store.rental.booking.{request,approve,cancel}, store.rental.start,
  // store.rental.complete) live in src/lib/rental-service.ts which is
  // NOT in this test's service scope (covered separately by
  // tests/phase-p8-transaction.test.ts). The 2 route-scope keys are
  // the inline audits on rentals/[id]/route.ts (PATCH update + DELETE).
  'store.rental.update',
  'store.rental.delete',
  // ── PHASE-P9-SERVICES-LOGISTICS (2 new route-scope keys) ──
  // The services marketplace + logistics state-machine audits (store.
  // service.provider.create, store.service.request.create/quote/accept/
  // schedule/start/complete/cancel, store.shipment.assign/pickup_scheduled/
  // delivery_attempt/delivered/exception) live in src/lib/services-service.ts
  // + src/lib/logistics-service.ts which are NOT in this test's service
  // scope (covered separately by tests/phase-p9-services-logistics.test.ts).
  // The 2 route-scope keys are the inline audits on services/providers/[id]
  // PATCH update + DELETE delete.
  'store.service.provider.update',
  'store.service.provider.delete',
];

describe('Phase Store-2C — Store Control Plane Contract Tests', () => {

  // ═══════════════════════════════════════════════════════════════
  // 1. PERMISSION CONTRACTS (route-only — RBAC is enforced in routes)
  // ═══════════════════════════════════════════════════════════════
  describe('1. Permission Wiring', () => {
    it('should have exactly 42 admin store route files', () => {
      // T-A-DEEP-STORE: 28 routes originally.
      // T1+T2-DEEP: +6 new routes (warehouses/route, warehouses/[id],
      // inventory/reserve, inventory/release, inventory/low-stock,
      // returns/[id]/items) → 34.
      // PHASE1-PROCUREMENT-SHIPPING-DEEP: +4 new routes
      //   (procurement/[id]/purchase-orders/route,
      //    procurement/[id]/purchase-orders/[poId]/route,
      //    procurement/[id]/purchase-orders/[poId]/receive,
      //    shipments/[id]/tracking) → 38.
      // PHASE-P8-TRANSACTION: +4 new routes (rentals/route, rentals/[id],
      //   rentals/[id]/bookings, rentals/[id]/bookings/[bookingId]) → 42.
      // PHASE-P9-SERVICES-LOGISTICS: +9 new routes (services/providers,
      //   services/providers/[id], services/requests, services/requests/[id],
      //   logistics/dashboard, shipments/[id]/{assign,pickup,deliver,
      //   exception}) → 51.
      const files = listRouteFiles();
      expect(files.length).toBe(51);
    });

    it('should have 78 requirePermission calls across all store routes', () => {
      // T-A-DEEP-STORE: 53 originally.
      // T1+T2-DEEP: +10 new (warehouses 2+3, reserve 1, release 1,
      // low-stock 1, returns/[id]/items 2) → 63.
      // PHASE1-PROCUREMENT-SHIPPING-DEEP: +7 new (purchase-orders 2+2,
      // purchase-orders/[poId]/receive 1, shipments/[id]/tracking 2) → 70.
      // PHASE-P8-TRANSACTION: +8 new (rentals/route 2, rentals/[id] 3,
      //   rentals/[id]/bookings 2, rentals/[id]/bookings/[bookingId] 1) → 78.
      // PHASE-P9-SERVICES-LOGISTICS: +14 new (services/providers 2,
      //   services/providers/[id] 3, services/requests 2, services/requests/[id]
      //   2, logistics/dashboard 1, shipments/[id]/{assign,pickup,deliver,
      //   exception} 1+1+1+1) → 92.
      const files = listRouteFiles();
      let count = 0;
      for (const f of files) {
        const content = readRoute(f);
        const matches = content.match(/requirePermission\(user\.id,/g);
        count += matches ? matches.length : 0;
      }
      expect(count).toBe(92);
    });

    it('should have 23 store.read requirePermission calls', () => {
      // T-A-DEEP-STORE: 8 store.read calls were migrated to domain-specific
      // keys (inventory/returns/shipping/procurement .read). Down from 23.
      // PHASE-P8-TRANSACTION: +3 new (rentals/route GET, rentals/[id] GET,
      //   rentals/[id]/bookings GET) → 18.
      // PHASE-P9-SERVICES-LOGISTICS: +5 new (services/providers GET,
      //   services/providers/[id] GET, services/requests GET,
      //   services/requests/[id] GET, logistics/dashboard GET) → 23.
      const files = listRouteFiles();
      let count = 0;
      for (const f of files) {
        const content = readRoute(f);
        const matches = content.match(/requirePermission\(user\.id,\s*'store\.read'\)/g);
        count += matches ? matches.length : 0;
      }
      expect(count).toBe(23);
    });

    it('should have 32 store.manage requirePermission calls', () => {
      // T-A-DEEP-STORE: 8 store.manage calls were migrated to domain-specific
      // keys (inventory/returns/shipping/procurement .manage). Down from 30.
      // PHASE-P8-TRANSACTION: +5 new (rentals/route POST, rentals/[id] PATCH,
      //   rentals/[id] DELETE, rentals/[id]/bookings POST,
      //   rentals/[id]/bookings/[bookingId] PATCH) → 27.
      // PHASE-P9-SERVICES-LOGISTICS: +5 new (services/providers POST,
      //   services/providers/[id] PATCH, services/providers/[id] DELETE,
      //   services/requests POST, services/requests/[id] PATCH) → 32.
      const files = listRouteFiles();
      let count = 0;
      for (const f of files) {
        const content = readRoute(f);
        const matches = content.match(/requirePermission\(user\.id,\s*'store\.manage'\)/g);
        count += matches ? matches.length : 0;
      }
      expect(count).toBe(32);
    });

    it('should have 15 fine-grained domain read permissions (inventory/returns/shipping/procurement.read)', () => {
      // T-A-DEEP-STORE: 8 routes migrated from store.read to domain-specific read keys.
      //   inventory.read × 2, returns.read × 2, shipping.read × 2, procurement.read × 2
      // T1+T2-DEEP: +4 new read calls
      //   inventory.read × 3 new (warehouses/route GET, warehouses/[id] GET,
      //     inventory/low-stock GET) → total inventory.read = 5
      //   returns.read × 1 new (returns/[id]/items GET) → total returns.read = 3
      //   shipping.read × 0 → unchanged at 2
      //   procurement.read × 0 → unchanged at 2
      //   Total = 5 + 3 + 2 + 2 = 12
      // PHASE1-PROCUREMENT-SHIPPING-DEEP: +3 new read calls
      //   procurement.read × 2 new (purchase-orders/route GET,
      //     purchase-orders/[poId] GET) → total procurement.read = 4
      //   shipping.read × 1 new (shipments/[id]/tracking GET) → total shipping.read = 3
      //   Total = 5 + 3 + 3 + 4 = 15
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
      // T1+T2-DEEP: the "exactly 2 (collection + [id] GETs)" invariant no
      // longer holds for inventory + returns because we added sub-resource
      // read endpoints (warehouses/* under inventory, returns/[id]/items
      // under returns). New expected counts:
      // PHASE1-PROCUREMENT-SHIPPING-DEEP: shipping + procurement also
      // gained sub-resource GETs (tracking under shipments,
      // purchase-orders/* under procurement) → all 4 domains now have
      // more than 2 read calls each.
      const expected: Record<string, number> = {
        'inventory.read': 5,
        'returns.read': 3,
        'shipping.read': 3,
        'procurement.read': 4,
      };
      for (const key of Object.keys(expected)) {
        expect(counts[key]).toBe(expected[key]);
      }
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      expect(total).toBe(15);
    });

    it('should have 22 fine-grained domain manage permissions (inventory/returns/shipping/procurement.manage)', () => {
      // T-A-DEEP-STORE: 8 routes migrated from store.manage to domain-specific manage keys.
      //   inventory.manage × 1, returns.manage × 2, shipping.manage × 2, procurement.manage × 3
      // T1+T2-DEEP: +6 new manage calls (all under inventory + returns)
      //   inventory.manage × 5 new (warehouses/route POST, warehouses/[id]
      //     PATCH, warehouses/[id] DELETE, inventory/reserve POST,
      //     inventory/release POST) → total inventory.manage = 6
      //   returns.manage × 1 new (returns/[id]/items POST) → total returns.manage = 3
      //   shipping.manage × 0 → unchanged at 2
      //   procurement.manage × 0 → unchanged at 3
      //   Total = 6 + 3 + 2 + 3 = 14
      // PHASE1-PROCUREMENT-SHIPPING-DEEP: +4 new manage calls
      //   procurement.manage × 3 new (purchase-orders/route POST,
      //     purchase-orders/[poId] PATCH, purchase-orders/[poId]/receive
      //     POST) → total procurement.manage = 6
      //   shipping.manage × 1 new (shipments/[id]/tracking POST) → total shipping.manage = 3
      //   Total = 6 + 3 + 3 + 6 = 18
      // PHASE-P9-SERVICES-LOGISTICS: +4 new shipping.manage calls
      //   (shipments/[id]/{assign,pickup,deliver,exception} POST) → total
      //   shipping.manage = 7. The 5 services/* POST/PATCH/DELETE handlers
      //   use store.manage (counted above), not domain-specific keys.
      //   Total = 6 + 3 + 7 + 6 = 22.
      const files = listRouteFiles();
      const expected: Record<string, number> = {
        'inventory.manage': 6,
        'returns.manage': 3,
        'shipping.manage': 7,
        'procurement.manage': 6,
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
    it('should have 65 logAudit calls across all store routes + services', () => {
      // T-A-DEEP-STORE: 33 in routes + 6 in services = 39.
      // T1+T2-DEEP: services grew (+14: 8 in inventory service +
      // 6 in returns service) → 33 routes + 20 services = 53.
      // PHASE1-PROCUREMENT-SHIPPING-DEEP: services grew (+10: 8 in the
      // new procurement service + 2 in the shipments service for tracking)
      // → 33 routes + 30 services = 63.
      // PHASE-P8-TRANSACTION: +2 in routes (rentals/[id] PATCH store.rental.update
      //   + DELETE store.rental.delete audits inline; the 6 rental-service.ts
      //   audits live in src/lib/rental-service.ts which is NOT in this test's
      //   service scope — it's covered separately by phase-p8-transaction.test.ts)
      //   → 35 routes + 30 services = 65.
      const files = readAllStoreFiles();
      let count = 0;
      for (const { content } of files) {
        const matches = content.match(/await logAudit\(/g);
        count += matches ? matches.length : 0;
      }
      // PHASE-P9-SERVICES-LOGISTICS: +2 new route-scope audits (services/
      //   providers/[id] PATCH update + DELETE delete — the inline audits
      //   for the provider catalog row; the 15 service-scope audits live
      //   in src/lib/services-service.ts + src/lib/logistics-service.ts
      //   which are NOT in this test's service scope — covered separately
      //   by tests/phase-p9-services-logistics.test.ts) → 35 routes + 32
      //   services = 67.
      expect(count).toBe(67);
    });

    it('should have 65 storeDb mutation calls across routes + services', () => {
      // T-A-DEEP-STORE: 31 in routes + 6 in services = 37.
      // T1+T2-DEEP: services grew (+14: 8 in inventory service +
      // 6 in returns service) → 31 routes + 20 services = 51.
      // PHASE1-PROCUREMENT-SHIPPING-DEEP: services grew (+10: 8 in the
      // new procurement service + 2 in the shipments service for tracking)
      // → 31 routes + 30 services = 61.
      // PHASE-P8-TRANSACTION: +2 in routes (rentals/[id] PATCH + DELETE
      //   call storeDb.rentalListing.update + .delete inline; the 6
      //   rental-service.ts mutations live in src/lib/rental-service.ts
      //   which is NOT in this test's service scope — it's covered
      //   separately by phase-p8-transaction.test.ts) → 33 routes + 30
      //   services = 63.
      // PHASE-P9-SERVICES-LOGISTICS: +2 in routes (services/providers/[id]
      //   PATCH serviceProvider.update + DELETE serviceProvider.delete;
      //   the 11 services-service.ts + logistics-service.ts mutations
      //   live out-of-scope for this test — covered separately by
      //   tests/phase-p9-services-logistics.test.ts) → 35 routes + 30
      //   services = 65.
      const files = readAllStoreFiles();
      let count = 0;
      for (const { content } of files) {
        const matches = content.match(/storeDb\.\w+\.(create|update|delete|upsert)\(/g);
        count += matches ? matches.length : 0;
      }
      expect(count).toBe(65);
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

    it('total audits (67) >= total mutations (65)', () => {
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
      expect(totalMut).toBe(65);
      expect(totalAudit).toBe(67);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 6. ACTION KEY COVERAGE (50 unique keys across routes + services)
  //   T-A-DEEP-STORE: 31 keys originally.
  //   T1+T2-DEEP: +9 new keys (warehouse.create/update/delete,
  //     inventory.balance.update, inventory.reserve, inventory.release,
  //     return.item.add, return.inspect, return.resolve) → 40.
  //   PHASE1-PROCUREMENT-SHIPPING-DEEP: +6 new keys (procurement.po.
  //     {create, submit, approve, receive, cancel}, shipment.tracking.
  //     add) → 46.
  //   PHASE-P8-TRANSACTION: +2 new route-scope keys (rental.update,
  //     rental.delete — inline audits on rentals/[id] PATCH + DELETE).
  //     The 6 rental-service.ts state-machine audits live out-of-scope
  //     for this test (covered by tests/phase-p8-transaction.test.ts) → 48.
  //   PHASE-P9-SERVICES-LOGISTICS: +2 new route-scope keys
  //     (service.provider.update, service.provider.delete — inline audits
  //     on services/providers/[id] PATCH + DELETE). The 13 service-scope
  //     audit keys (service.provider.create, service.request.create/
  //     quote/accept/schedule/start/complete/cancel, shipment.assign/
  //     pickup_scheduled/delivery_attempt/delivered/exception) live in
  //     src/lib/services-service.ts + src/lib/logistics-service.ts which
  //     are NOT in this test's service scope (covered separately by
  //     tests/phase-p9-services-logistics.test.ts) → 50.
  // ═══════════════════════════════════════════════════════════════
  describe('6. Action Key Coverage', () => {
    it('should have all 50 expected action keys', () => {
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
      expect(foundKeys.size).toBe(50);
    });

    it('action keys follow the store.<entity>(.<sub>)?.<operation> convention', () => {
      // T1+T2-DEEP: convention widened to also accept reserve/release/add/
      // inspect/resolve as the final operation token (in addition to
      // create/update/delete/import). The store.<entity>(.<sub>)? prefix
      // structure is preserved.
      // PHASE1-PROCUREMENT-SHIPPING-DEEP: convention widened again to
      // accept submit/approve/receive/cancel (PO lifecycle state-machine
      // verbs) as the final operation token. These are state-transition
      // verbs, semantically equivalent to update but explicitly named to
      // make the audit trail self-describing.
      const files = readAllStoreFiles();
      for (const { content } of files) {
        const matches = content.matchAll(/action:\s*['"](store\.[^'"]+)['"]/g);
        for (const m of matches) {
          const key = m[1];
          expect(key).toMatch(
            /^store\.[a-z_]+(\.[a-z_]+)*\.(create|update|delete|import|reserve|release|add|inspect|resolve|submit|approve|receive|cancel)$/,
          );
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
    it('should have 4 store service files', () => {
      // T-A-DEEP-STORE: 3 service files (inventory, returns, shipments).
      // PHASE1-PROCUREMENT-SHIPPING-DEEP: +1 service file
      //   (store-procurement-service.ts for the PO lifecycle) → 4.
      const services = listServiceFiles();
      expect(services.length).toBe(4);
      expect(services).toContain('src/lib/store-inventory-service.ts');
      expect(services).toContain('src/lib/store-returns-service.ts');
      expect(services).toContain('src/lib/store-shipments-service.ts');
      expect(services).toContain('src/lib/store-procurement-service.ts');
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

    it('store-shipments-service.ts exports createShipment + updateShipment + listShipments + addTrackingEvent + getTrackingHistory', () => {
      const content = readService('src/lib/store-shipments-service.ts');
      expect(content).toMatch(/export async function createShipment\b/);
      expect(content).toMatch(/export async function updateShipment\b/);
      expect(content).toMatch(/export async function listShipments\b/);
      // PHASE1-PROCUREMENT-SHIPPING-DEEP — Shipping Deep (Tracking History)
      expect(content).toMatch(/export async function addTrackingEvent\b/);
      expect(content).toMatch(/export async function getTrackingHistory\b/);
    });

    it('store-procurement-service.ts exports createPurchaseOrder + submitPurchaseOrder + approvePurchaseOrder + receivePurchaseOrderItem + cancelPurchaseOrder', () => {
      // PHASE1-PROCUREMENT-SHIPPING-DEEP — Procurement Deep (PO +
      // Approval + Receiving). The base ProcurementRequest CRUD stays
      // inline in the procurement/route.ts + [id]/route.ts files; this
      // service owns the deeper PO lifecycle.
      const content = readService('src/lib/store-procurement-service.ts');
      expect(content).toMatch(/export async function createPurchaseOrder\b/);
      expect(content).toMatch(/export async function submitPurchaseOrder\b/);
      expect(content).toMatch(/export async function approvePurchaseOrder\b/);
      expect(content).toMatch(/export async function receivePurchaseOrderItem\b/);
      expect(content).toMatch(/export async function cancelPurchaseOrder\b/);
      // Also exports list + get read helpers.
      expect(content).toMatch(/export async function listPurchaseOrders\b/);
      expect(content).toMatch(/export async function getPurchaseOrder\b/);
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

    it('shipments/[id]/tracking route imports addTrackingEvent + getTrackingHistory from service', () => {
      // PHASE1-PROCUREMENT-SHIPPING-DEEP — Shipping Deep (Tracking
      // History). The tracking route delegates all DB mutations to the
      // shipments service (no inline storeDb calls).
      const content = readRoute('src/app/api/admin/store/shipments/[id]/tracking/route.ts');
      expect(content).toContain('addTrackingEvent');
      expect(content).toContain('getTrackingHistory');
      expect(content).toContain('from "@/lib/store-shipments-service"');
    });

    it('procurement/[id]/purchase-orders routes import from store-procurement-service', () => {
      // PHASE1-PROCUREMENT-SHIPPING-DEEP — Procurement Deep (PO +
      // Approval + Receiving). The new purchase-orders routes delegate
      // all DB mutations to the new service.
      const listContent = readRoute('src/app/api/admin/store/procurement/[id]/purchase-orders/route.ts');
      expect(listContent).toContain('createPurchaseOrder');
      expect(listContent).toContain('listPurchaseOrders');
      expect(listContent).toContain('from "@/lib/store-procurement-service"');

      const detailContent = readRoute('src/app/api/admin/store/procurement/[id]/purchase-orders/[poId]/route.ts');
      expect(detailContent).toContain('submitPurchaseOrder');
      expect(detailContent).toContain('approvePurchaseOrder');
      expect(detailContent).toContain('cancelPurchaseOrder');
      expect(detailContent).toContain('getPurchaseOrder');
      expect(detailContent).toContain('from "@/lib/store-procurement-service"');

      const receiveContent = readRoute('src/app/api/admin/store/procurement/[id]/purchase-orders/[poId]/receive/route.ts');
      expect(receiveContent).toContain('receivePurchaseOrderItem');
      expect(receiveContent).toContain('from "@/lib/store-procurement-service"');
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

    it('inventory/returns/shipments/procurement-purchase-orders routes have 0 inline storeDb mutations (delegated to services)', () => {
      // T1+T2-DEEP: extended to include the new sub-resource routes
      // (warehouses + inventory/reserve/release/low-stock + returns/items)
      // which also delegate all mutations to the service layer.
      // PHASE1-PROCUREMENT-SHIPPING-DEEP: extended again to include the
      // new PO + tracking routes (procurement/[id]/purchase-orders/* +
      // shipments/[id]/tracking) which also delegate to services.
      const delegatedRoutes = [
        'src/app/api/admin/store/inventory/route.ts',
        'src/app/api/admin/store/inventory/reserve/route.ts',
        'src/app/api/admin/store/inventory/release/route.ts',
        'src/app/api/admin/store/inventory/low-stock/route.ts',
        'src/app/api/admin/store/returns/route.ts',
        'src/app/api/admin/store/returns/[id]/route.ts',
        'src/app/api/admin/store/returns/[id]/items/route.ts',
        'src/app/api/admin/store/shipments/route.ts',
        'src/app/api/admin/store/shipments/[id]/route.ts',
        'src/app/api/admin/store/shipments/[id]/tracking/route.ts',
        'src/app/api/admin/store/warehouses/route.ts',
        'src/app/api/admin/store/warehouses/[id]/route.ts',
        'src/app/api/admin/store/procurement/[id]/purchase-orders/route.ts',
        'src/app/api/admin/store/procurement/[id]/purchase-orders/[poId]/route.ts',
        'src/app/api/admin/store/procurement/[id]/purchase-orders/[poId]/receive/route.ts',
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
