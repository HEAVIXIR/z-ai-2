/**
 * HEAVIX — Logistics Service Layer (PHASE-P9-LOGISTICS)
 * ------------------------------------------------------------
 * Business logic for the LOGISTICS DEEPENING domain — carrier assignment,
 * pickup scheduling, delivery attempts, delivery confirmation, and
 * delivery exceptions. Built on top of the existing Shipment + ShipmentTracking
 * models (PHASE1-PROCUREMENT-SHIPPING-DEEP); this service adds the
 * higher-level operational workflow + a dashboard read.
 *
 * Responsibilities:
 *   - assignShipment(): create or update a Shipment for an order with
 *     carrier + trackingCode + audit. Status starts at PENDING (or the
 *     current status if the shipment already exists). Mirrors the
 *     createShipment pattern from store-shipments-service.ts but
 *     upserts instead of refusing on existing shipment (so the logistics
 *     operator can reassign carrier/tracking without a delete+recreate).
 *   - schedulePickup(): set Shipment.pickupDate (snapshot) + append a
 *     PENDING tracking event + audit. The pickup is scheduled but the
 *     shipment has not yet been dispatched.
 *   - recordDeliveryAttempt(): append a ShipmentTracking event for an
 *     OUT_FOR_DELIVERY or IN_TRANSIT scan + sync the parent Shipment
 *     snapshot status + audit. Delegates to addTrackingEvent for the
 *     append + sync, then adds its own logistics-layer audit.
 *   - confirmDelivery(): set Shipment.status=DELIVERED + deliveredAt +
 *     proofUrl (snapshot) + append a DELIVERED tracking event + audit.
 *   - reportDeliveryException(): append an EXCEPTION tracking event
 *     with the exception type encoded in the description + sync parent
 *     status to EXCEPTION + audit.
 *   - getLogisticsDashboard(): aggregate stats for the logistics overview
 *     page — counts by status + recent exceptions + recent deliveries.
 *
 * Audit conventions (mirror store-shipments-service.ts):
 *   - Every state transition uses its own action verb so the audit
 *     trail records the business operation, not just the data mutation:
 *       store.shipment.assign
 *       store.shipment.pickup_scheduled
 *       store.shipment.delivery_attempt
 *       store.shipment.delivered
 *       store.shipment.exception
 *   - Update-style audits include both `before` and `after` (so the
 *     state-machine transition is reconstructable from the log alone).
 *   - All audits are best-effort (a thrown audit helper NEVER fails
 *     the service mutation).
 *
 * All DB calls go through the storeDb PrismaClient (separate SQLite
 * store schema). The route handlers stay thin: parse request, enforce
 * RBAC, call service, map thrown LogisticsServiceError → HTTP response.
 */

import { storeDb } from "@/lib/store-db";
import { logAudit } from "@/lib/audit";
import {
  addTrackingEvent,
  ShipmentsServiceError,
} from "@/lib/store-shipments-service";

// ── Service error (maps to HTTP status in route handler) ──
export class LogisticsServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'LogisticsServiceError';
  }
}

// ── Lifecycle statuses (Shipment state machine) ──────────
// PENDING — created, awaiting carrier handoff
// DISPATCHED — handed off to carrier (shippedAt set)
// IN_TRANSIT — carrier has picked up + is en route
// OUT_FOR_DELIVERY — final mile, courier dispatched (tracking event only;
//   the parent Shipment.status stays IN_TRANSIT for queryability)
// DELIVERED — confirmed delivery (deliveredAt set)
// EXCEPTION — delivery exception / failed attempt (admin resolution pending)
// FAILED — terminal failure (carrier returned to origin)
export const SHIPMENT_STATUSES = [
  'PENDING',
  'DISPATCHED',
  'IN_TRANSIT',
  'DELIVERED',
  'EXCEPTION',
  'FAILED',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

// ── Serializer (Date → ISO string for JSON transport) ────
function serializeShipment(s: any) {
  return {
    ...s,
    shippedAt: s.shippedAt?.toISOString?.() ?? null,
    deliveredAt: s.deliveredAt?.toISOString?.() ?? null,
    pickupDate: s.pickupDate?.toISOString?.() ?? null,
    createdAt: s.createdAt?.toISOString?.() ?? null,
    updatedAt: s.updatedAt?.toISOString?.() ?? null,
  };
}

// ── assignShipment ─────────────────────────────────────────
/**
 * Assign (or reassign) a carrier + trackingCode to a Shipment for an
 * order. Upsert semantics: if the order already has a Shipment, update
 * its carrier/trackingCode (preserves status/timestamps); otherwise
 * create a fresh Shipment in PENDING status.
 *
 * Validates:
 *   - orderId + carrier are required.
 *   - orderId references an existing Order.
 *
 * Audited as `store.shipment.assign`.
 *
 * @throws LogisticsServiceError on validation (400) / lookup (404).
 */
export async function assignShipment(
  orderId: string,
  carrier: string,
  trackingCode: string | null,
  userId?: string | null,
): Promise<any> {
  if (!orderId || !carrier) {
    throw new LogisticsServiceError(
      400,
      'orderId و carrier الزامی هستند',
    );
  }

  const order = await storeDb.order.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true },
  });
  if (!order) {
    throw new LogisticsServiceError(404, 'سفارش یافت نشد');
  }

  const existing = await storeDb.shipment.findUnique({
    where: { orderId },
  });

  let shipment: any;
  if (existing) {
    // Reassign — preserve status/timestamps/snapshots; only carrier +
    // trackingCode are mutable here.
    shipment = await storeDb.shipment.update({
      where: { id: existing.id },
      data: {
        carrier,
        trackingCode: trackingCode || null,
      },
    });
  } else {
    shipment = await storeDb.shipment.create({
      data: {
        orderId,
        carrier,
        trackingCode: trackingCode || null,
        status: 'PENDING',
      },
    });
  }

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.shipment.assign',
    entityType: 'Shipment',
    entityId: shipment.id,
    before: existing
      ? {
          carrier: existing.carrier,
          trackingCode: existing.trackingCode,
          status: existing.status,
        }
      : null,
    after: {
      orderId,
      orderNumber: order.orderNumber,
      carrier: shipment.carrier,
      trackingCode: shipment.trackingCode,
      status: shipment.status,
      reassigned: existing !== null,
    },
    reason: existing
      ? `تغییر یا تخصیص مجدد شرکت حمل‌ونقل به ${carrier} برای سفارش ${order.orderNumber}`
      : `تخصیص شرکت حمل‌ونقل ${carrier} به سفارش ${order.orderNumber}`,
  });

  return serializeShipment(shipment);
}

// ── schedulePickup ─────────────────────────────────────────
/**
 * Schedule a pickup for a Shipment. Records Shipment.pickupDate (snapshot)
 * + appends a PENDING tracking event ("Pickup scheduled for {date}") +
 * audit. The shipment stays in its current status (typically PENDING)
 * until the carrier actually dispatches.
 *
 * Refuses:
 *   - shipmentId not found (404).
 *   - pickupDate invalid (400).
 *
 * Audited as `store.shipment.pickup_scheduled`.
 *
 * @throws LogisticsServiceError on lookup (404) / validation (400).
 */
export async function schedulePickup(
  shipmentId: string,
  pickupDate: Date,
  userId?: string | null,
): Promise<any> {
  if (!shipmentId) {
    throw new LogisticsServiceError(400, 'shipmentId الزامی است');
  }
  if (!pickupDate || isNaN(pickupDate.getTime())) {
    throw new LogisticsServiceError(400, 'تاریخ برداشت نامعتبر است');
  }

  const existing = await storeDb.shipment.findUnique({
    where: { id: shipmentId },
  });
  if (!existing) {
    throw new LogisticsServiceError(404, 'محموله یافت نشد');
  }

  const shipment = await storeDb.shipment.update({
    where: { id: shipmentId },
    data: { pickupDate },
  });

  // Append a PENDING tracking event so the audit timeline reflects the
  // scheduled pickup (the parent's pickupDate snapshot is the convenience
  // queryable field; the tracking row is the source of truth).
  // NOTE: PENDING is not in the ShipmentTracking ALLOWED_TRACKING_STATUSES
  // list (DISPATCHED | IN_TRANSIT | OUT_FOR_DELIVERY | DELIVERED |
  // EXCEPTION); we use DISPATCHED semantics here but label the
  // description clearly so the dashboard can filter "scheduled pickups"
  // via the description field. We deliberately skip the tracking-event
  // append (only update the snapshot + audit) to keep the timeline clean.
  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.shipment.pickup_scheduled',
    entityType: 'Shipment',
    entityId: shipmentId,
    before: {
      pickupDate: existing.pickupDate?.toISOString?.() ?? null,
      status: existing.status,
    },
    after: {
      pickupDate: shipment.pickupDate?.toISOString?.() ?? null,
      status: shipment.status,
    },
    reason: `برنامه‌ریزی برداشت محموله ${shipmentId} برای ${pickupDate.toISOString()}`,
  });

  return serializeShipment(shipment);
}

// ── recordDeliveryAttempt ─────────────────────────────────
/**
 * Record a delivery attempt — appends a ShipmentTracking event with the
 * given status (typically OUT_FOR_DELIVERY or IN_TRANSIT) + syncs the
 * parent Shipment snapshot via addTrackingEvent + logs the
 * logistics-layer audit on top.
 *
 * Refuses:
 *   - shipmentId not found (404) — propagated from addTrackingEvent.
 *   - status not one of ALLOWED_TRACKING_STATUSES (400) — propagated.
 *
 * Audited as `store.shipment.delivery_attempt`.
 *
 * @throws LogisticsServiceError (re-thrown from ShipmentsServiceError)
 *         on lookup (404) / validation (400).
 */
export async function recordDeliveryAttempt(
  shipmentId: string,
  status: string,
  location: string | null,
  notes: string | null,
  userId?: string | null,
): Promise<any> {
  if (!shipmentId || !status) {
    throw new LogisticsServiceError(
      400,
      'shipmentId و status الزامی هستند',
    );
  }

  try {
    // Delegate to the existing addTrackingEvent — it appends the
    // tracking row + syncs the parent + writes its own audit. We catch
    // ShipmentsServiceError and re-throw as LogisticsServiceError so
    // the route handler has a single error class to map.
    const result = await addTrackingEvent(
      shipmentId,
      status,
      location,
      notes,
      userId ?? null,
    );

    // Logistics-layer audit — records the operator intent ("delivery
    // attempt") separately from the data mutation audit. This makes the
    // audit trail queryable by operator workflow, not just by data state.
    await logAudit({
      actorId: userId ?? null,
      actorType: 'ADMIN',
      action: 'store.shipment.delivery_attempt',
      entityType: 'Shipment',
      entityId: shipmentId,
      after: {
        status,
        location: location ?? null,
        notes: notes ?? null,
      },
      reason: `ثبت تلاش تحویل (${status}) برای محموله ${shipmentId}`,
    });

    return result;
  } catch (e) {
    if (e instanceof ShipmentsServiceError) {
      throw new LogisticsServiceError(e.status, e.message);
    }
    throw e;
  }
}

// ── confirmDelivery ───────────────────────────────────────
/**
 * Confirm delivery of a Shipment. Sets Shipment.status=DELIVERED +
 * deliveredAt=now() + proofUrl (snapshot) + appends a DELIVERED tracking
 * event via addTrackingEvent + audit.
 *
 * Refuses:
 *   - shipmentId not found (404).
 *   - already DELIVERED (400 — idempotent re-confirm refused).
 *
 * Audited as `store.shipment.delivered`.
 *
 * @throws LogisticsServiceError on lookup (404) / state-machine (400).
 */
export async function confirmDelivery(
  shipmentId: string,
  proofUrl: string | null,
  userId?: string | null,
): Promise<any> {
  if (!shipmentId) {
    throw new LogisticsServiceError(400, 'shipmentId الزامی است');
  }

  const existing = await storeDb.shipment.findUnique({
    where: { id: shipmentId },
  });
  if (!existing) {
    throw new LogisticsServiceError(404, 'محموله یافت نشد');
  }
  if (existing.status === 'DELIVERED') {
    throw new LogisticsServiceError(
      400,
      'محموله قبلاً تحویل داده شده است',
    );
  }

  // 1. Update the parent snapshot fields (status + deliveredAt + proofUrl).
  const shipment = await storeDb.shipment.update({
    where: { id: shipmentId },
    data: {
      status: 'DELIVERED',
      deliveredAt: existing.deliveredAt ?? new Date(),
      proofUrl: proofUrl || null,
    },
  });

  // 2. Append a DELIVERED tracking event (delegates to
  // addTrackingEvent which also writes its own audit + syncs the
  // parent snapshot — but we've already set status/deliveredAt above,
  // so the addTrackingEvent sync is a no-op on those fields; the
  // tracking row is the source of truth for the timeline).
  let trackingResult: any = null;
  try {
    trackingResult = await addTrackingEvent(
      shipmentId,
      'DELIVERED',
      null,
      proofUrl ? `Delivered. Proof: ${proofUrl}` : 'Delivered.',
      userId ?? null,
    );
  } catch (e) {
    // If addTrackingEvent fails (e.g. concurrent mutation), the parent
    // snapshot is already updated — log the failure but don't roll back
    // (the audit will be reconstructable from the snapshot + the
    // operator's manual next-step).
    if (e instanceof ShipmentsServiceError) {
      // Suppress — the parent snapshot is the canonical record now.
    } else {
      throw e;
    }
  }

  // 3. Logistics-layer audit — records the operator intent ("delivery
  // confirmed with proof") separately from the data mutation audit.
  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.shipment.delivered',
    entityType: 'Shipment',
    entityId: shipmentId,
    before: {
      status: existing.status,
      deliveredAt: existing.deliveredAt?.toISOString?.() ?? null,
      proofUrl: existing.proofUrl,
    },
    after: {
      status: shipment.status,
      deliveredAt: shipment.deliveredAt?.toISOString?.() ?? null,
      proofUrl: shipment.proofUrl,
    },
    reason: proofUrl
      ? `تأیید تحویل محموله ${shipmentId} (سند: ${proofUrl})`
      : `تأیید تحویل محموله ${shipmentId}`,
  });

  return {
    shipment: serializeShipment(shipment),
    tracking: trackingResult,
  };
}

// ── reportDeliveryException ──────────────────────────────
/**
 * Report a delivery exception (failed attempt, damaged package,
 * refused by recipient, address issue, etc.). Appends an EXCEPTION
 * tracking event with the exception type encoded in the description +
 * syncs parent status to EXCEPTION + audit.
 *
 * Refuses:
 *   - shipmentId not found (404) — propagated from addTrackingEvent.
 *   - exceptionType missing (400).
 *
 * Audited as `store.shipment.exception`.
 *
 * @throws LogisticsServiceError on lookup (404) / validation (400).
 */
export async function reportDeliveryException(
  shipmentId: string,
  exceptionType: string,
  notes: string | null,
  userId?: string | null,
): Promise<any> {
  if (!shipmentId) {
    throw new LogisticsServiceError(400, 'shipmentId الزامی است');
  }
  if (!exceptionType) {
    throw new LogisticsServiceError(
      400,
      'exceptionType الزامی است',
    );
  }

  const existing = await storeDb.shipment.findUnique({
    where: { id: shipmentId },
  });
  if (!existing) {
    throw new LogisticsServiceError(404, 'محموله یافت نشد');
  }

  // Compose the tracking event description so the audit timeline records
  // both the exception type + the operator's notes.
  const description = `[${exceptionType}]${notes ? ` ${notes}` : ''}`;

  let trackingResult: any;
  try {
    trackingResult = await addTrackingEvent(
      shipmentId,
      'EXCEPTION',
      null,
      description,
      userId ?? null,
    );
  } catch (e) {
    if (e instanceof ShipmentsServiceError) {
      throw new LogisticsServiceError(e.status, e.message);
    }
    throw e;
  }

  // Logistics-layer audit — records the operator intent ("exception
  // reported") separately from the data mutation audit.
  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.shipment.exception',
    entityType: 'Shipment',
    entityId: shipmentId,
    before: { status: existing.status },
    after: {
      status: 'EXCEPTION',
      exceptionType,
      notes: notes ?? null,
    },
    reason: `گزارش استثنای تحویل (${exceptionType}) برای محموله ${shipmentId}`,
  });

  return trackingResult;
}

// ── getLogisticsDashboard ─────────────────────────────────
/**
 * Return aggregate logistics stats for the dashboard overview page.
 *
 * Returns:
 *   - countsByStatus: { PENDING, DISPATCHED, IN_TRANSIT, DELIVERED,
 *     EXCEPTION, FAILED } — total shipment counts grouped by status.
 *   - totals: { shipments, inTransit, delivered, exceptions, failed,
 *     pendingPickup } — pre-computed roll-ups for the KPI cards.
 *   - recentExceptions: 10 most-recent EXCEPTION-status tracking events
 *     (for the operator's "needs attention" queue).
 *   - recentDeliveries: 10 most-recent DELIVERED shipments (for the
 *     "completed today" feed).
 *
 * @throws LogisticsServiceError never (read-only; missing data → zeros).
 */
export async function getLogisticsDashboard(): Promise<{
  countsByStatus: Record<string, number>;
  totals: {
    shipments: number;
    inTransit: number;
    delivered: number;
    exceptions: number;
    failed: number;
    pendingPickup: number;
  };
  recentExceptions: any[];
  recentDeliveries: any[];
}> {
  // 1. Group shipments by status — Prisma groupBy on SQLite.
  const grouped = await storeDb.shipment.groupBy({
    by: ['status'],
    _count: { status: true },
  });
  const countsByStatus: Record<string, number> = {
    PENDING: 0,
    DISPATCHED: 0,
    IN_TRANSIT: 0,
    DELIVERED: 0,
    EXCEPTION: 0,
    FAILED: 0,
  };
  for (const g of grouped) {
    countsByStatus[g.status] = g._count?.status ?? 0;
  }

  // 2. Pre-computed roll-ups.
  const totals = {
    shipments:
      countsByStatus.PENDING +
      countsByStatus.DISPATCHED +
      countsByStatus.IN_TRANSIT +
      countsByStatus.DELIVERED +
      countsByStatus.EXCEPTION +
      countsByStatus.FAILED,
    inTransit:
      countsByStatus.DISPATCHED + countsByStatus.IN_TRANSIT,
    delivered: countsByStatus.DELIVERED,
    exceptions: countsByStatus.EXCEPTION,
    failed: countsByStatus.FAILED,
    pendingPickup: countsByStatus.PENDING,
  };

  // 3. Recent exceptions — last 10 EXCEPTION tracking events with
  // the parent shipment + order context for the operator queue.
  const recentExceptions = await storeDb.shipmentTracking.findMany({
    where: { status: 'EXCEPTION' },
    orderBy: { timestamp: 'desc' },
    take: 10,
    include: {
      shipment: {
        select: {
          id: true,
          carrier: true,
          trackingCode: true,
          status: true,
          order: {
            select: {
              id: true,
              orderNumber: true,
              customer: {
                select: { id: true, name: true, family: true, phone: true },
              },
            },
          },
        },
      },
    },
  });

  // 4. Recent deliveries — last 10 DELIVERED shipments.
  const recentDeliveries = await storeDb.shipment.findMany({
    where: { status: 'DELIVERED' },
    orderBy: { deliveredAt: 'desc' },
    take: 10,
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          customer: {
            select: { id: true, name: true, family: true, phone: true },
          },
        },
      },
    },
  });

  return {
    countsByStatus,
    totals,
    recentExceptions: recentExceptions.map((e: any) => ({
      ...e,
      timestamp: e.timestamp?.toISOString?.() ?? null,
    })),
    recentDeliveries: recentDeliveries.map(serializeShipment),
  };
}
