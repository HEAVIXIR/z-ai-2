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
