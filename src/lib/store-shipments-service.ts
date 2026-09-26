/**
 * HEAVIX — Store Shipments Service Layer
 *
 * Extracted from src/app/api/admin/store/shipments/route.ts (T-A-DEEP-STORE)
 * and src/app/api/admin/store/shipments/[id]/route.ts.
 *
 * Responsibilities:
 *   - createShipment(): create a Shipment for an order + log audit.
 *   - updateShipment(): update tracking/carrier/status/note; auto-set
 *     shippedAt on DISPATCHED and deliveredAt on DELIVERED + log audit.
 *   - listShipments(): query Shipments with filters (status, carrier, limit).
 *
 * PHASE1-PROCUREMENT-SHIPPING-DEEP — Shipping Deep (Tracking History):
 *   - addTrackingEvent(): append a ShipmentTracking row + sync the parent
 *     Shipment.status + shippedAt/deliveredAt + log audit. Tracking events
 *     are append-only (the audit trail reconstructs the full delivery
 *     timeline; the parent fields are a snapshot for storefront queries).
 *   - getTrackingHistory(): return ShipmentTracking rows ordered by timestamp.
 *
 * The route handlers stay thin: parse request, enforce RBAC, call service,
 * map thrown ServiceError → HTTP response. All DB + audit logic lives here.
 */

import { storeDb } from '@/lib/store-db';
import { logAudit } from '@/lib/audit';

// ── Service error (maps to HTTP status in route handler) ──
export class ShipmentsServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ShipmentsServiceError';
  }
}

// ── PHASE1-PROCUREMENT-SHIPPING-DEEP — Tracking status vocab ──
const ALLOWED_TRACKING_STATUSES = [
  'DISPATCHED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'EXCEPTION',
] as const;

// ── Filters for listShipments() ────────────────────────────
export interface ShipmentFilters {
  status?: string;
  carrier?: string;
  limit?: number;
}

// ── createShipment ────────────────────────────────────────
/**
 * Create a Shipment for an order. One shipment per order (enforced).
 *
 * @throws ShipmentsServiceError on validation/lookup failure (400).
 */
export async function createShipment(
  orderId: string,
  carrier: string,
  trackingCode?: string | null,
  note?: string | null,
  userId?: string | null,
): Promise<any> {
  if (!orderId || !carrier) {
    throw new ShipmentsServiceError(
      400,
      'orderId و carrier الزامی هستند',
    );
  }

  const existing = await storeDb.shipment.findUnique({ where: { orderId } });
  if (existing) {
    throw new ShipmentsServiceError(
      400,
      'سفارش قبلاً محموله دارد',
    );
  }

  const shipment = await storeDb.shipment.create({
    data: {
      orderId,
      carrier,
      trackingCode: trackingCode || null,
      note: note || null,
    },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.shipment.create',
    entityType: 'Shipment',
    entityId: shipment.id,
    after: shipment,
  });

  return shipment;
}

// ── updateShipment ───────────────────────────────────────
/**
 * Update a Shipment's trackingCode/carrier/status/note.
 *
 * Auto-sets shippedAt on DISPATCHED and deliveredAt on DELIVERED
 * (idempotent — won't overwrite existing timestamps).
 *
 * @throws ShipmentsServiceError on lookup failure (404).
 */
export async function updateShipment(
  id: string,
  trackingCode?: string | null,
  carrier?: string,
  status?: string,
  note?: string | null,
  userId?: string | null,
): Promise<any> {
  const existing = await storeDb.shipment.findUnique({ where: { id } });
  if (!existing) {
    throw new ShipmentsServiceError(404, 'یافت نشد');
  }

  const data: any = {};
  if (trackingCode !== undefined) data.trackingCode = trackingCode || null;
  if (carrier !== undefined) data.carrier = carrier;
  if (status !== undefined) {
    data.status = status;
    if (status === 'DISPATCHED' && !existing.shippedAt) {
      data.shippedAt = new Date();
    }
    if (status === 'DELIVERED' && !existing.deliveredAt) {
      data.deliveredAt = new Date();
    }
  }
  if (note !== undefined) data.note = note || null;

  const shipment = await storeDb.shipment.update({
    where: { id },
    data,
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.shipment.update',
    entityType: 'Shipment',
    entityId: id,
    before: existing,
    after: shipment,
  });

  return shipment;
}

// ── listShipments ────────────────────────────────────────
/**
 * List Shipments with optional filters.
 */
export async function listShipments(
  filters: ShipmentFilters = {},
): Promise<{ items: any[]; total: number }> {
  const { status, carrier, limit = 100 } = filters;
  const cappedLimit = Math.min(200, Number(limit) || 100);

  const where: any = {};
  if (status) where.status = status;
  if (carrier) where.carrier = carrier;

  const items = await storeDb.shipment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: cappedLimit,
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          customer: { select: { id: true, name: true, family: true } },
        },
      },
    },
  });

  const total = await storeDb.shipment.count({ where });

  return { items, total };
}

// ──────────────────────────────────────────────────────────
// PHASE1-PROCUREMENT-SHIPPING-DEEP — TRACKING HISTORY
// ──────────────────────────────────────────────────────────

// ── addTrackingEvent ─────────────────────────────────────
/**
 * Append a ShipmentTracking row to a Shipment + sync the parent
 * Shipment.status + shippedAt/deliveredAt + log audit.
 *
 * Status sync rules (idempotent — won't overwrite existing timestamps):
 *   - DISPATCHED → set Shipment.status = DISPATCHED + shippedAt = now()
 *     (if not already set).
 *   - IN_TRANSIT / OUT_FOR_DELIVERY → set Shipment.status (no timestamps).
 *   - DELIVERED → set Shipment.status = DELIVERED + deliveredAt = now()
 *     (if not already set).
 *   - EXCEPTION → set Shipment.status = EXCEPTION (no timestamps; the
 *     admin is expected to add a follow-up resolution event).
 *
 * Refuses:
 *   - shipmentId not found (404).
 *   - status not one of ALLOWED_TRACKING_STATUSES (400).
 *
 * @throws ShipmentsServiceError on validation (400) or lookup (404).
 */
export async function addTrackingEvent(
  shipmentId: string,
  status: string,
  location: string | null,
  description: string | null,
  userId?: string | null,
): Promise<any> {
  if (!shipmentId || !status) {
    throw new ShipmentsServiceError(
      400,
      'shipmentId و status الزامی هستند',
    );
  }
  if (
    !ALLOWED_TRACKING_STATUSES.includes(
      status as (typeof ALLOWED_TRACKING_STATUSES)[number],
    )
  ) {
    throw new ShipmentsServiceError(
      400,
      'وضعیت ردیابی نامعتبر (DISPATCHED | IN_TRANSIT | OUT_FOR_DELIVERY | DELIVERED | EXCEPTION)',
    );
  }

  const existing = await storeDb.shipment.findUnique({
    where: { id: shipmentId },
  });
  if (!existing) {
    throw new ShipmentsServiceError(404, 'محموله یافت نشد');
  }

  // 1. Append the tracking row (audit source-of-truth).
  const event = await storeDb.shipmentTracking.create({
    data: {
      shipmentId,
      status,
      location: location || null,
      description: description || null,
    },
  });

  // 2. Sync the parent Shipment snapshot fields.
  const data: any = { status };
  if (status === 'DISPATCHED' && !existing.shippedAt) {
    data.shippedAt = new Date();
  }
  if (status === 'DELIVERED' && !existing.deliveredAt) {
    data.deliveredAt = new Date();
  }
  const shipment = await storeDb.shipment.update({
    where: { id: shipmentId },
    data,
  });

  // Audit a: the tracking event append (primary audit hook).
  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.shipment.tracking.add',
    entityType: 'ShipmentTracking',
    entityId: event.id,
    after: {
      shipmentId,
      status,
      location: event.location,
      description: event.description,
    },
  });

  // Audit b: the parent Shipment snapshot update (side-effect, mirrors
  // the payments/[id] order.update side-effect pattern).
  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.shipment.update',
    entityType: 'Shipment',
    entityId: shipmentId,
    before: {
      status: existing.status,
      shippedAt: existing.shippedAt,
      deliveredAt: existing.deliveredAt,
    },
    after: {
      status: shipment.status,
      shippedAt: shipment.shippedAt,
      deliveredAt: shipment.deliveredAt,
    },
  });

  return {
    event: serializeTracking(event),
    shipment: serializeShipment(shipment),
  };
}

// ── getTrackingHistory ───────────────────────────────────
/**
 * Return ShipmentTracking rows for a shipment, ordered oldest → newest.
 *
 * @throws ShipmentsServiceError on lookup failure (404) if the shipment
 *         does not exist.
 */
export async function getTrackingHistory(
  shipmentId: string,
): Promise<{ items: any[]; total: number }> {
  const shipment = await storeDb.shipment.findUnique({
    where: { id: shipmentId },
  });
  if (!shipment) {
    throw new ShipmentsServiceError(404, 'محموله یافت نشد');
  }

  const items = await storeDb.shipmentTracking.findMany({
    where: { shipmentId },
    orderBy: { timestamp: 'asc' },
    take: 500, // safety cap — carriers rarely exceed a few dozen events
  });

  return { items: items.map(serializeTracking), total: items.length };
}

// ── Serializer for ShipmentTracking (Date → ISO string) ──
function serializeTracking(t: any) {
  return {
    ...t,
    timestamp: t.timestamp?.toISOString?.() ?? null,
  };
}

// ── Serializer for Shipment (Date → ISO string) ──────────
function serializeShipment(s: any) {
  return {
    ...s,
    shippedAt: s.shippedAt?.toISOString?.() ?? null,
    deliveredAt: s.deliveredAt?.toISOString?.() ?? null,
    createdAt: s.createdAt?.toISOString?.() ?? null,
    updatedAt: s.updatedAt?.toISOString?.() ?? null,
  };
}
