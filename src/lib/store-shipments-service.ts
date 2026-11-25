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
import { enqueueAuditOutbox } from '@/lib/store-audit-outbox';

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
    throw new ShipmentsServiceError(400, 'orderId و carrier الزامی هستند');
  }
  try {
    return await storeDb.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true, status: true, paymentStatus: true, shipment: { select: { id: true } } },
      });
      if (!order) throw new ShipmentsServiceError(404, 'سفارش یافت نشد');
      if (order.shipment) throw new ShipmentsServiceError(409, 'سفارش قبلاً محموله دارد');
      if (!['CONFIRMED', 'PROCESSING'].includes(order.status) || order.paymentStatus !== 'PAID') {
        throw new ShipmentsServiceError(409, 'ایجاد محموله فقط برای سفارش تأییدشده و تسویه‌شده مجاز است');
      }
      const shipment = await tx.shipment.create({
        data: { orderId, carrier, trackingCode: trackingCode || null, note: note || null },
      });
      await enqueueAuditOutbox(tx, {
        actorId: userId ?? null,
        actorType: 'ADMIN',
        action: 'store.shipment.create',
        entityType: 'Shipment',
        entityId: shipment.id,
        after: shipment,
      });
      return serializeShipment(shipment);
    }, { isolationLevel: 'Serializable' });
  } catch (error: any) {
    if (error?.code === 'P2002' || error?.code === 'P2034') {
      throw new ShipmentsServiceError(409, 'محموله برای این سفارش هم‌زمان ایجاد شده یا وضعیت سفارش تغییر کرده است');
    }
    throw error;
  }
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
  if (status !== undefined) {
    throw new ShipmentsServiceError(
      409,
      'تغییر وضعیت محموله فقط از طریق ثبت رویداد رهگیری مجاز است',
    );
  }

  try {
    return await storeDb.$transaction(async (tx) => {
      const existing = await tx.shipment.findUnique({ where: { id } });
      if (!existing) throw new ShipmentsServiceError(404, 'یافت نشد');
      const data: any = {};
      if (trackingCode !== undefined) data.trackingCode = trackingCode || null;
      if (carrier !== undefined) data.carrier = carrier;
      if (note !== undefined) data.note = note || null;
      if (Object.keys(data).length === 0) return serializeShipment(existing);

      const changed = await tx.shipment.updateMany({
        where: { id, updatedAt: existing.updatedAt },
        data,
      });
      if (changed.count !== 1) {
        throw new ShipmentsServiceError(409, 'محموله هم‌زمان تغییر کرده است؛ اطلاعات را تازه‌سازی کنید');
      }
      const shipment = await tx.shipment.findUnique({ where: { id } });
      if (!shipment) throw new ShipmentsServiceError(404, 'یافت نشد');
      await enqueueAuditOutbox(tx, {
        actorId: userId ?? null,
        actorType: 'ADMIN',
        action: 'store.shipment.update',
        entityType: 'Shipment',
        entityId: id,
        before: existing,
        after: shipment,
      });
      return serializeShipment(shipment);
    }, { isolationLevel: 'Serializable' });
  } catch (error: any) {
    if (error?.code === 'P2034') {
      throw new ShipmentsServiceError(409, 'محموله هم‌زمان تغییر کرده است؛ دوباره تلاش کنید');
    }
    throw error;
  }
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
    throw new ShipmentsServiceError(400, 'shipmentId و status الزامی هستند');
  }
  if (!ALLOWED_TRACKING_STATUSES.includes(status as (typeof ALLOWED_TRACKING_STATUSES)[number])) {
    throw new ShipmentsServiceError(400, 'وضعیت ردیابی نامعتبر است');
  }

  const transitions: Record<string, string[]> = {
    PENDING: ['DISPATCHED', 'EXCEPTION'],
    DISPATCHED: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION'],
    IN_TRANSIT: ['OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION'],
    OUT_FOR_DELIVERY: ['DELIVERED', 'EXCEPTION'],
    EXCEPTION: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'],
    DELIVERED: [],
    FAILED: [],
  };

  try {
    return await storeDb.$transaction(async (tx) => {
      const existing = await tx.shipment.findUnique({ where: { id: shipmentId } });
      if (!existing) throw new ShipmentsServiceError(404, 'محموله یافت نشد');
      if (!(transitions[existing.status] ?? []).includes(status)) {
        throw new ShipmentsServiceError(
          409,
          `تغییر وضعیت محموله از ${existing.status} به ${status} مجاز نیست`,
        );
      }

      const now = new Date();
      const data: any = { status };
      if (status === 'DISPATCHED' && !existing.shippedAt) data.shippedAt = now;
      if (status === 'DELIVERED' && !existing.deliveredAt) data.deliveredAt = now;
      const changed = await tx.shipment.updateMany({
        where: { id: shipmentId, status: existing.status, updatedAt: existing.updatedAt },
        data,
      });
      if (changed.count !== 1) {
        throw new ShipmentsServiceError(409, 'وضعیت محموله هم‌زمان تغییر کرده است');
      }

      const event = await tx.shipmentTracking.create({
        data: {
          shipmentId,
          status,
          location: location || null,
          description: description || null,
        },
      });

      // Order fulfillment state is derived from the shipment lifecycle.
      // Do not let shipment and order snapshots drift apart.
      if (status === 'DISPATCHED' || status === 'DELIVERED') {
        const expectedOrderStatuses = status === 'DISPATCHED'
          ? ['CONFIRMED', 'PROCESSING']
          : ['SHIPPED', 'CONFIRMED', 'PROCESSING'];
        const nextOrderStatus = status === 'DISPATCHED' ? 'SHIPPED' : 'DELIVERED';
        const orderBefore = await tx.order.findUnique({
          where: { id: existing.orderId },
          select: { id: true, status: true, updatedAt: true },
        });
        if (!orderBefore || !expectedOrderStatuses.includes(orderBefore.status)) {
          throw new ShipmentsServiceError(
            409,
            'وضعیت سفارش با چرخه محموله سازگار نیست؛ ابتدا سفارش را بررسی کنید',
          );
        }
        const orderChanged = await tx.order.updateMany({
          where: {
            id: orderBefore.id,
            status: orderBefore.status,
            updatedAt: orderBefore.updatedAt,
          },
          data: { status: nextOrderStatus },
        });
        if (orderChanged.count !== 1) {
          throw new ShipmentsServiceError(409, 'وضعیت سفارش هم‌زمان تغییر کرده است');
        }
        await enqueueAuditOutbox(tx, {
          actorId: userId ?? null,
          actorType: 'ADMIN',
          action: 'store.order.fulfillment.transition',
          entityType: 'Order',
          entityId: orderBefore.id,
          before: { status: orderBefore.status, shipmentStatus: existing.status },
          after: { status: nextOrderStatus, shipmentStatus: status },
        });
      }

      const shipment = await tx.shipment.findUnique({ where: { id: shipmentId } });
      if (!shipment) throw new ShipmentsServiceError(404, 'محموله پس از ثبت رویداد یافت نشد');

      await enqueueAuditOutbox(tx, {
        actorId: userId ?? null,
        actorType: 'ADMIN',
        action: 'store.shipment.tracking.add',
        entityType: 'ShipmentTracking',
        entityId: event.id,
        before: { shipmentId, status: existing.status },
        after: {
          shipmentId,
          status,
          location: event.location,
          description: event.description,
          shippedAt: shipment.shippedAt,
          deliveredAt: shipment.deliveredAt,
        },
      });
      return { event: serializeTracking(event), shipment: serializeShipment(shipment) };
    }, { isolationLevel: 'Serializable' });
  } catch (error: any) {
    if (error?.code === 'P2034') {
      throw new ShipmentsServiceError(409, 'وضعیت محموله هم‌زمان تغییر کرده است؛ تاریخچه را تازه‌سازی کنید');
    }
    throw error;
  }
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
