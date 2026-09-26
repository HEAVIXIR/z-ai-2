/**
 * HEAVIX — Phase P9: Services Marketplace + Logistics Deep (PHASE9-9A-9B)
 * ------------------------------------------------------------
 * Contract tests for the Phase 9 Services + Logistics deepening
 * deliverables described in PHASE9-9A-9B-SERVICES-LOGISTICS:
 *
 *   1. src/lib/services-service.ts — 8 exports:
 *        createProvider, createServiceRequest, submitQuote,
 *        acceptQuote, scheduleService, startService, completeService,
 *        cancelServiceRequest
 *   2. src/lib/logistics-service.ts — 6 exports:
 *        assignShipment, schedulePickup, recordDeliveryAttempt,
 *        confirmDelivery, reportDeliveryException, getLogisticsDashboard
 *   3. Routes:
 *        - /api/admin/store/services/providers (GET list + POST create)
 *        - /api/admin/store/services/providers/[id] (GET + PATCH + DELETE)
 *        - /api/admin/store/services/requests (GET list + POST create)
 *        - /api/admin/store/services/requests/[id] (GET + PATCH action-driven)
 *        - /api/admin/store/logistics/dashboard (GET)
 *        - /api/admin/store/shipments/[id]/assign (POST)
 *        - /api/admin/store/shipments/[id]/pickup (POST)
 *        - /api/admin/store/shipments/[id]/deliver (POST)
 *        - /api/admin/store/shipments/[id]/exception (POST)
 *   4. Schema: ServiceProvider + ServiceRequest models added to store-schema
 *   5. Audit keys:
 *        store.service.provider.create / store.service.request.create /
 *        store.service.request.quote / store.service.request.accept /
 *        store.service.request.schedule / store.service.request.start /
 *        store.service.request.complete / store.service.request.cancel /
 *        store.shipment.assign / store.shipment.pickup_scheduled /
 *        store.shipment.delivery_attempt / store.shipment.delivered /
 *        store.shipment.exception
 *   6. State machines:
 *        ServiceRequest: REQUESTED | QUOTED | ACCEPTED | SCHEDULED |
 *          IN_PROGRESS | COMPLETED | CANCELLED  (7 states)
 *        Shipment: PENDING | DISPATCHED | IN_TRANSIT | DELIVERED |
 *          EXCEPTION | FAILED  (6 states, 5+ as required)
 *
 * Tests are file-content based (no DB calls) so they pass in
 * every environment — including CI without DATABASE_URL set.
 * This matches the established pattern from
 * tests/phase-p8-transaction.test.ts + tests/phase-store-2c-contracts.test.ts.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';

const SERVICES_SVC = 'src/lib/services-service.ts';
const LOGISTICS_SVC = 'src/lib/logistics-service.ts';

const PROVIDERS_LIST_ROUTE =
  'src/app/api/admin/store/services/providers/route.ts';
const PROVIDERS_DETAIL_ROUTE =
  'src/app/api/admin/store/services/providers/[id]/route.ts';
const REQUESTS_LIST_ROUTE =
  'src/app/api/admin/store/services/requests/route.ts';
const REQUESTS_DETAIL_ROUTE =
  'src/app/api/admin/store/services/requests/[id]/route.ts';

const LOGISTICS_DASHBOARD_ROUTE =
  'src/app/api/admin/store/logistics/dashboard/route.ts';
const SHIPMENT_ASSIGN_ROUTE =
  'src/app/api/admin/store/shipments/[id]/assign/route.ts';
const SHIPMENT_PICKUP_ROUTE =
  'src/app/api/admin/store/shipments/[id]/pickup/route.ts';
const SHIPMENT_DELIVER_ROUTE =
  'src/app/api/admin/store/shipments/[id]/deliver/route.ts';
const SHIPMENT_EXCEPTION_ROUTE =
  'src/app/api/admin/store/shipments/[id]/exception/route.ts';

const STORE_SCHEMA = 'prisma/store-schema.prisma';

function read(path: string): string {
  return fs.readFileSync(path, 'utf8');
}

describe('Phase P9 — Services Marketplace + Logistics Deep', () => {
  // ── 1. services-service.ts exists + exports ───────────────
  describe('1. services-service.ts', () => {
    it('should exist as src/lib/services-service.ts', () => {
      expect(fs.existsSync(SERVICES_SVC)).toBe(true);
    });

    it('should export createProvider(params)', () => {
      const c = read(SERVICES_SVC);
      expect(c).toContain('export async function createProvider');
      expect(c).toContain('name');
      expect(c).toContain('type');
      expect(c).toContain('phone');
      expect(c).toContain('email');
      expect(c).toContain('address');
      expect(c).toContain('userId');
    });

    it('should export createServiceRequest(params)', () => {
      const c = read(SERVICES_SVC);
      expect(c).toContain('export async function createServiceRequest');
      expect(c).toContain('customerId');
      expect(c).toContain('type');
      expect(c).toContain('description');
      expect(c).toContain('providerId');
    });

    it('should export submitQuote(requestId, providerId, price, userId)', () => {
      const c = read(SERVICES_SVC);
      expect(c).toContain('export async function submitQuote');
      expect(c).toMatch(
        /submitQuote\(\s*requestId:\s*string\s*,\s*providerId:\s*string \| null\s*,\s*price:\s*number\s*,\s*userId\?\s*:\s*string \| null\s*,?\s*\)/,
      );
    });

    it('should export acceptQuote(requestId, userId)', () => {
      const c = read(SERVICES_SVC);
      expect(c).toContain('export async function acceptQuote');
      expect(c).toMatch(
        /acceptQuote\(\s*requestId:\s*string\s*,\s*userId\?\s*:\s*string \| null\s*,?\s*\)/,
      );
    });

    it('should export scheduleService(requestId, scheduledDate, userId)', () => {
      const c = read(SERVICES_SVC);
      expect(c).toContain('export async function scheduleService');
      expect(c).toMatch(
        /scheduleService\(\s*requestId:\s*string\s*,\s*scheduledDate:\s*Date\s*,\s*userId\?\s*:\s*string \| null\s*,?\s*\)/,
      );
    });

    it('should export startService(requestId, userId)', () => {
      const c = read(SERVICES_SVC);
      expect(c).toContain('export async function startService');
      expect(c).toMatch(
        /startService\(\s*requestId:\s*string\s*,\s*userId\?\s*:\s*string \| null\s*,?\s*\)/,
      );
    });

    it('should export completeService(requestId, notes, userId)', () => {
      const c = read(SERVICES_SVC);
      expect(c).toContain('export async function completeService');
      expect(c).toMatch(
        /completeService\(\s*requestId:\s*string\s*,\s*notes\?\s*:\s*string \| null\s*,\s*userId\?\s*:\s*string \| null\s*,?\s*\)/,
      );
    });

    it('should export cancelServiceRequest(requestId, reason, userId)', () => {
      const c = read(SERVICES_SVC);
      expect(c).toContain('export async function cancelServiceRequest');
      expect(c).toMatch(
        /cancelServiceRequest\(\s*requestId:\s*string\s*,\s*reason\?\s*:\s*string \| null\s*,\s*userId\?\s*:\s*string \| null\s*,?\s*\)/,
      );
    });

    it('should audit all service-request state transitions with the documented keys', () => {
      const c = read(SERVICES_SVC);
      expect(c).toContain('store.service.provider.create');
      expect(c).toContain('store.service.request.create');
      expect(c).toContain('store.service.request.quote');
      expect(c).toContain('store.service.request.accept');
      expect(c).toContain('store.service.request.schedule');
      expect(c).toContain('store.service.request.start');
      expect(c).toContain('store.service.request.complete');
      expect(c).toContain('store.service.request.cancel');
    });

    it('should use storeDb for all DB mutations', () => {
      const c = read(SERVICES_SVC);
      expect(c).toContain('import { storeDb } from "@/lib/store-db"');
      expect(c).toContain('storeDb.serviceProvider');
      expect(c).toContain('storeDb.serviceRequest');
    });

    it('should define all 7 ServiceRequest states in SERVICE_REQUEST_STATUSES', () => {
      const c = read(SERVICES_SVC);
      expect(c).toContain("'REQUESTED'");
      expect(c).toContain("'QUOTED'");
      expect(c).toContain("'ACCEPTED'");
      expect(c).toContain("'SCHEDULED'");
      expect(c).toContain("'IN_PROGRESS'");
      expect(c).toContain("'COMPLETED'");
      expect(c).toContain("'CANCELLED'");
      expect(c).toContain('SERVICE_REQUEST_STATUSES');
    });
  });

  // ── 2. logistics-service.ts exists + exports ──────────────
  describe('2. logistics-service.ts', () => {
    it('should exist as src/lib/logistics-service.ts', () => {
      expect(fs.existsSync(LOGISTICS_SVC)).toBe(true);
    });

    it('should export assignShipment(orderId, carrier, trackingCode, userId)', () => {
      const c = read(LOGISTICS_SVC);
      expect(c).toContain('export async function assignShipment');
      expect(c).toMatch(
        /assignShipment\(\s*orderId:\s*string\s*,\s*carrier:\s*string\s*,\s*trackingCode:\s*string \| null\s*,\s*userId\?\s*:\s*string \| null\s*,?\s*\)/,
      );
    });

    it('should export schedulePickup(shipmentId, pickupDate, userId)', () => {
      const c = read(LOGISTICS_SVC);
      expect(c).toContain('export async function schedulePickup');
      expect(c).toMatch(
        /schedulePickup\(\s*shipmentId:\s*string\s*,\s*pickupDate:\s*Date\s*,\s*userId\?\s*:\s*string \| null\s*,?\s*\)/,
      );
    });

    it('should export recordDeliveryAttempt(shipmentId, status, location, notes, userId)', () => {
      const c = read(LOGISTICS_SVC);
      expect(c).toContain('export async function recordDeliveryAttempt');
      expect(c).toMatch(
        /recordDeliveryAttempt\(\s*shipmentId:\s*string\s*,\s*status:\s*string\s*,\s*location:\s*string \| null\s*,\s*notes:\s*string \| null\s*,\s*userId\?\s*:\s*string \| null\s*,?\s*\)/,
      );
    });

    it('should export confirmDelivery(shipmentId, proofUrl, userId)', () => {
      const c = read(LOGISTICS_SVC);
      expect(c).toContain('export async function confirmDelivery');
      expect(c).toMatch(
        /confirmDelivery\(\s*shipmentId:\s*string\s*,\s*proofUrl:\s*string \| null\s*,\s*userId\?\s*:\s*string \| null\s*,?\s*\)/,
      );
    });

    it('should export reportDeliveryException(shipmentId, exceptionType, notes, userId)', () => {
      const c = read(LOGISTICS_SVC);
      expect(c).toContain('export async function reportDeliveryException');
      expect(c).toMatch(
        /reportDeliveryException\(\s*shipmentId:\s*string\s*,\s*exceptionType:\s*string\s*,\s*notes:\s*string \| null\s*,\s*userId\?\s*:\s*string \| null\s*,?\s*\)/,
      );
    });

    it('should export getLogisticsDashboard()', () => {
      const c = read(LOGISTICS_SVC);
      expect(c).toContain('export async function getLogisticsDashboard');
      expect(c).toMatch(/getLogisticsDashboard\(\s*\)/);
    });

    it('should audit all logistics state transitions with the documented keys', () => {
      const c = read(LOGISTICS_SVC);
      expect(c).toContain('store.shipment.assign');
      expect(c).toContain('store.shipment.pickup_scheduled');
      expect(c).toContain('store.shipment.delivery_attempt');
      expect(c).toContain('store.shipment.delivered');
      expect(c).toContain('store.shipment.exception');
    });

    it('should use storeDb for all DB mutations', () => {
      const c = read(LOGISTICS_SVC);
      expect(c).toContain('import { storeDb } from "@/lib/store-db"');
      expect(c).toContain('storeDb.shipment');
      expect(c).toContain('storeDb.shipmentTracking');
    });

    it('should define all Shipment states (5+) in SHIPMENT_STATUSES', () => {
      const c = read(LOGISTICS_SVC);
      expect(c).toContain("'PENDING'");
      expect(c).toContain("'DISPATCHED'");
      expect(c).toContain("'IN_TRANSIT'");
      expect(c).toContain("'DELIVERED'");
      expect(c).toContain("'EXCEPTION'");
      expect(c).toContain("'FAILED'");
      expect(c).toContain('SHIPMENT_STATUSES');
    });
  });

  // ── 3. Routes exist + use the services ──────────────────
  describe('3. Routes', () => {
    it('services providers list+create route should exist + import createProvider + requirePermission', () => {
      expect(fs.existsSync(PROVIDERS_LIST_ROUTE)).toBe(true);
      const c = read(PROVIDERS_LIST_ROUTE);
      expect(c).toContain('createProvider');
      expect(c).toContain("requirePermission(user.id, 'store.read')");
      expect(c).toContain("requirePermission(user.id, 'store.manage')");
      expect(c).toContain('export async function GET');
      expect(c).toContain('export async function POST');
    });

    it('services providers detail route should exist + handle GET/PATCH/DELETE', () => {
      expect(fs.existsSync(PROVIDERS_DETAIL_ROUTE)).toBe(true);
      const c = read(PROVIDERS_DETAIL_ROUTE);
      expect(c).toContain('export async function GET');
      expect(c).toContain('export async function PATCH');
      expect(c).toContain('export async function DELETE');
      expect(c).toContain('store.service.provider.update');
      expect(c).toContain('store.service.provider.delete');
    });

    it('services requests list+create route should exist + import createServiceRequest', () => {
      expect(fs.existsSync(REQUESTS_LIST_ROUTE)).toBe(true);
      const c = read(REQUESTS_LIST_ROUTE);
      expect(c).toContain('createServiceRequest');
      expect(c).toContain('export async function GET');
      expect(c).toContain('export async function POST');
    });

    it('services requests detail route should exist + import all transition functions', () => {
      expect(fs.existsSync(REQUESTS_DETAIL_ROUTE)).toBe(true);
      const c = read(REQUESTS_DETAIL_ROUTE);
      expect(c).toContain('submitQuote');
      expect(c).toContain('acceptQuote');
      expect(c).toContain('scheduleService');
      expect(c).toContain('startService');
      expect(c).toContain('completeService');
      expect(c).toContain('cancelServiceRequest');
      expect(c).toContain("export async function PATCH");
    });

    it('logistics dashboard route should exist + import getLogisticsDashboard', () => {
      expect(fs.existsSync(LOGISTICS_DASHBOARD_ROUTE)).toBe(true);
      const c = read(LOGISTICS_DASHBOARD_ROUTE);
      expect(c).toContain('getLogisticsDashboard');
      expect(c).toContain('export async function GET');
      expect(c).toContain("requirePermission(user.id, 'store.read')");
    });

    it('shipment assign route should exist + import assignShipment', () => {
      expect(fs.existsSync(SHIPMENT_ASSIGN_ROUTE)).toBe(true);
      const c = read(SHIPMENT_ASSIGN_ROUTE);
      expect(c).toContain('assignShipment');
      expect(c).toContain('export async function POST');
      expect(c).toContain("requirePermission(user.id, 'shipping.manage')");
    });

    it('shipment pickup route should exist + import schedulePickup', () => {
      expect(fs.existsSync(SHIPMENT_PICKUP_ROUTE)).toBe(true);
      const c = read(SHIPMENT_PICKUP_ROUTE);
      expect(c).toContain('schedulePickup');
      expect(c).toContain('export async function POST');
      expect(c).toContain("requirePermission(user.id, 'shipping.manage')");
    });

    it('shipment deliver route should exist + import confirmDelivery', () => {
      expect(fs.existsSync(SHIPMENT_DELIVER_ROUTE)).toBe(true);
      const c = read(SHIPMENT_DELIVER_ROUTE);
      expect(c).toContain('confirmDelivery');
      expect(c).toContain('export async function POST');
      expect(c).toContain("requirePermission(user.id, 'shipping.manage')");
    });

    it('shipment exception route should exist + import reportDeliveryException', () => {
      expect(fs.existsSync(SHIPMENT_EXCEPTION_ROUTE)).toBe(true);
      const c = read(SHIPMENT_EXCEPTION_ROUTE);
      expect(c).toContain('reportDeliveryException');
      expect(c).toContain('export async function POST');
      expect(c).toContain("requirePermission(user.id, 'shipping.manage')");
    });
  });

  // ── 4. Schema — Service models added to store-schema ──────
  describe('4. Schema (store-schema.prisma)', () => {
    it('should define ServiceProvider model with the documented fields', () => {
      const c = read(STORE_SCHEMA);
      expect(c).toMatch(/model ServiceProvider \{/);
      expect(c).toContain('name         String');
      expect(c).toContain('nameFa       String?');
      expect(c).toContain('type         String');
      expect(c).toContain('phone        String?');
      expect(c).toContain('email        String?');
      expect(c).toContain('address      String?');
      expect(c).toContain('active       Boolean  @default(true)');
      expect(c).toContain('verified     Boolean  @default(false)');
      expect(c).toContain('rating       Float    @default(0)');
      expect(c).toContain('serviceRequests ServiceRequest[]');
    });

    it('should define ServiceRequest model with the documented fields', () => {
      const c = read(STORE_SCHEMA);
      expect(c).toMatch(/model ServiceRequest \{/);
      expect(c).toContain('providerId   String?');
      expect(c).toContain('provider     ServiceProvider? @relation');
      expect(c).toContain('customerId   String');
      expect(c).toContain('type         String');
      expect(c).toContain('status       String   @default("REQUESTED")');
      expect(c).toContain('description  String?');
      expect(c).toContain('scheduledDate DateTime?');
      expect(c).toContain('completedAt  DateTime?');
      expect(c).toContain('price        Float?');
      expect(c).toContain('notes        String?');
    });

    it('Shipment model should have pickupDate + proofUrl snapshot fields', () => {
      const c = read(STORE_SCHEMA);
      // The logistics service uses these snapshot fields to mirror
      // the existing shippedAt/deliveredAt pattern.
      expect(c).toMatch(/pickupDate\s+DateTime\?/);
      expect(c).toMatch(/proofUrl\s+String\?/);
    });
  });

  // ── 5. State-machine completeness ─────────────────────────
  describe('5. State machines', () => {
    it('ServiceRequest should support all 7 lifecycle states', () => {
      const c = read(SERVICES_SVC);
      // The state machine is enforced via status guards in each
      // transition function. We verify the guards reference the
      // expected current-state checks.
      expect(c).toMatch(/'REQUESTED'/);
      expect(c).toMatch(/'QUOTED'/);
      expect(c).toMatch(/'ACCEPTED'/);
      expect(c).toMatch(/'SCHEDULED'/);
      expect(c).toMatch(/'IN_PROGRESS'/);
      expect(c).toMatch(/'COMPLETED'/);
      expect(c).toMatch(/'CANCELLED'/);
      // The transition guards:
      expect(c).toMatch(/existing\.status !== 'REQUESTED'/);
      expect(c).toMatch(/existing\.status !== 'QUOTED'/);
      expect(c).toMatch(/existing\.status !== 'ACCEPTED'/);
      expect(c).toMatch(/existing\.status !== 'SCHEDULED'/);
      expect(c).toMatch(/existing\.status !== 'IN_PROGRESS'/);
    });

    it('Shipment should support 5+ lifecycle states', () => {
      const c = read(LOGISTICS_SVC);
      // The SHIPMENT_STATUSES const must list at least 5 statuses.
      expect(c).toMatch(/'PENDING'/);
      expect(c).toMatch(/'DISPATCHED'/);
      expect(c).toMatch(/'IN_TRANSIT'/);
      expect(c).toMatch(/'DELIVERED'/);
      expect(c).toMatch(/'EXCEPTION'/);
      expect(c).toMatch(/'FAILED'/);
    });
  });
});
