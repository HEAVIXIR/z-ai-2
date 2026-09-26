/**
 * HEAVIX — Services Marketplace Service Layer (PHASE-P9-SERVICES)
 * ------------------------------------------------------------
 * Business logic for the SERVICES MARKETPLACE domain — connecting
 * customers with transport, inspection, maintenance, repair, installation,
 * and delivery providers via a quote-driven state machine.
 *
 * The ServiceProvider is the catalog row (provider identity + capabilities)
 * and the ServiceRequest is the operational job row. The state machine:
 *
 *   REQUESTED  → (provider quote)       →  QUOTED
 *   QUOTED     → (customer/admin accept) →  ACCEPTED
 *   ACCEPTED   → (admin schedule)       →  SCHEDULED
 *   SCHEDULED  → (admin start)          →  IN_PROGRESS
 *   IN_PROGRESS → (admin complete)       →  COMPLETED
 *   any state  → (admin cancel)          →  CANCELLED
 *
 * Audit conventions (mirror rental-service.ts / store-returns-service.ts):
 *   - Every state transition uses its own action verb so the audit
 *     trail records the business operation, not just the data mutation:
 *       store.service.provider.create
 *       store.service.request.create
 *       store.service.request.quote
 *       store.service.request.accept
 *       store.service.request.schedule
 *       store.service.request.start
 *       store.service.request.complete
 *       store.service.request.cancel
 *   - Update-style audits include both `before` and `after` so the
 *     state-machine transition is reconstructable from the log alone.
 *   - All audits are best-effort (a thrown audit helper NEVER fails
 *     the service mutation).
 *
 * All DB calls go through the storeDb PrismaClient (separate SQLite
 * store schema). The route handlers stay thin: parse request, enforce
 * RBAC, call service, map thrown ServicesServiceError → HTTP response.
 */

import { storeDb } from "@/lib/store-db";
import { logAudit } from "@/lib/audit";

// ── Service error (maps to HTTP status in route handler) ──
export class ServicesServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ServicesServiceError';
  }
}

// ── Lifecycle statuses + types ──────────────────────────────
export const SERVICE_REQUEST_STATUSES = [
  'REQUESTED',
  'QUOTED',
  'ACCEPTED',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;
export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];

export const SERVICE_TYPES = [
  'TRANSPORT',
  'INSPECTION',
  'MAINTENANCE',
  'REPAIR',
  'INSTALLATION',
  'DELIVERY',
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

// ── Serializer (Date → ISO string for JSON transport) ────
function serializeProvider(row: any) {
  return {
    ...row,
    rating: row.rating ?? 0,
    createdAt: row.createdAt?.toISOString?.() ?? null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
    serviceRequestCount: row._count?.serviceRequests ?? row.serviceRequests?.length ?? 0,
    _count: undefined,
  };
}

function serializeRequest(r: any) {
  return {
    ...r,
    scheduledDate: r.scheduledDate?.toISOString?.() ?? null,
    completedAt: r.completedAt?.toISOString?.() ?? null,
    createdAt: r.createdAt?.toISOString?.() ?? null,
    updatedAt: r.updatedAt?.toISOString?.() ?? null,
  };
}

// ── createProvider ────────────────────────────────────────
/**
 * Create a new ServiceProvider (catalog row).
 *
 * Audited as `store.service.provider.create`.
 *
 * @throws ServicesServiceError on validation (400) or invalid type (400).
 */
export async function createProvider(params: {
  name: string;
  nameFa?: string | null;
  type: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  active?: boolean | null;
  verified?: boolean | null;
  rating?: number | null;
  userId: string;
}): Promise<any> {
  const {
    name,
    nameFa = null,
    type,
    phone = null,
    email = null,
    address = null,
    active = true,
    verified = false,
    rating = 0,
    userId,
  } = params;

  if (!userId) {
    throw new ServicesServiceError(400, 'userId الزامی است');
  }
  if (!name || !String(name).trim()) {
    throw new ServicesServiceError(400, 'نام ارائه‌دهنده الزامی است');
  }
  if (!type) {
    throw new ServicesServiceError(400, 'نوع خدمت الزامی است');
  }
  if (!SERVICE_TYPES.includes(type as (typeof SERVICE_TYPES)[number])) {
    throw new ServicesServiceError(
      400,
      'نوع خدمت نامعتبر است (TRANSPORT | INSPECTION | MAINTENANCE | REPAIR | INSTALLATION | DELIVERY)',
    );
  }

  const provider = await storeDb.serviceProvider.create({
    data: {
      name: String(name).trim(),
      nameFa: nameFa || null,
      type,
      phone: phone || null,
      email: email || null,
      address: address || null,
      active: Boolean(active),
      verified: Boolean(verified),
      rating: Number(rating) || 0,
    },
    include: {
      _count: { select: { serviceRequests: true } },
    },
  });

  await logAudit({
    actorId: userId,
    actorType: 'ADMIN',
    action: 'store.service.provider.create',
    entityType: 'ServiceProvider',
    entityId: provider.id,
    after: {
      name: provider.name,
      nameFa: provider.nameFa,
      type: provider.type,
      phone: provider.phone,
      email: provider.email,
      address: provider.address,
      active: provider.active,
      verified: provider.verified,
      rating: provider.rating,
    },
    reason: `ایجاد ارائه‌دهنده خدمت ${provider.name} (${type})`,
  });

  return serializeProvider(provider);
}

// ── createServiceRequest ─────────────────────────────────
/**
 * Create a new ServiceRequest (status=REQUESTED) for a customer against
 * an optional ServiceProvider. When `providerId` is omitted, the request
 * is broadcast to all providers of the matching type (admin resolves
 * the assignment manually via submitQuote later).
 *
 * Audited as `store.service.request.create`.
 *
 * @throws ServicesServiceError on validation (400) / type mismatch (400)
 *         / lookup (404).
 */
export async function createServiceRequest(params: {
  customerId: string;
  type: string;
  description?: string | null;
  providerId?: string | null;
  userId: string;
}): Promise<any> {
  const {
    customerId,
    type,
    description = null,
    providerId = null,
    userId,
  } = params;

  if (!customerId) {
    throw new ServicesServiceError(400, 'customerId الزامی است');
  }
  if (!type) {
    throw new ServicesServiceError(400, 'نوع خدمت الزامی است');
  }
  if (!SERVICE_TYPES.includes(type as (typeof SERVICE_TYPES)[number])) {
    throw new ServicesServiceError(
      400,
      'نوع خدمت نامعتبر است (TRANSPORT | INSPECTION | MAINTENANCE | REPAIR | INSTALLATION | DELIVERY)',
    );
  }

  let provider: { id: string; name: string } | null = null;
  if (providerId) {
    const found = await storeDb.serviceProvider.findUnique({
      where: { id: providerId },
      select: { id: true, name: true },
    });
    if (!found) {
      throw new ServicesServiceError(404, 'ارائه‌دهنده خدمت یافت نشد');
    }
    provider = found;
    // Allow mismatched type but warn via audit (the request can still be
    // fulfilled by a multi-type provider — the policy is UI-side).
  }

  const request = await storeDb.serviceRequest.create({
    data: {
      customerId,
      type,
      description: description || null,
      providerId: providerId || null,
      status: 'REQUESTED',
    },
  });

  await logAudit({
    actorId: userId,
    actorType: 'ADMIN',
    action: 'store.service.request.create',
    entityType: 'ServiceRequest',
    entityId: request.id,
    after: {
      customerId,
      type,
      description: request.description,
      providerId: request.providerId,
      providerName: provider?.name ?? null,
      status: 'REQUESTED',
    },
    reason: `ایجاد درخواست خدمت ${type} برای مشتری ${customerId}`,
  });

  return serializeRequest(request);
}

// ── submitQuote ───────────────────────────────────────────
/**
 * Transition a ServiceRequest from REQUESTED → QUOTED.
 *
 * The provider (or admin on the provider's behalf) submits a price quote
 * for the requested service. The price is recorded on the request and
 * the request becomes QUOTED (awaiting customer/admin acceptance).
 *
 * Refuses:
 *   - requestId not found (404).
 *   - request not in REQUESTED state (400 — state-machine guard).
 *   - price invalid (400).
 *
 * Audited as `store.service.request.quote`.
 *
 * @throws ServicesServiceError on lookup (404) / state-machine (400) / validation (400).
 */
export async function submitQuote(
  requestId: string,
  providerId: string | null,
  price: number,
  userId?: string | null,
): Promise<any> {
  if (!requestId) {
    throw new ServicesServiceError(400, 'requestId الزامی است');
  }
  const p = Number(price);
  if (!Number.isFinite(p) || p < 0) {
    throw new ServicesServiceError(400, 'قیمت نامعتبر است');
  }

  const existing = await storeDb.serviceRequest.findUnique({
    where: { id: requestId },
  });
  if (!existing) {
    throw new ServicesServiceError(404, 'درخواست خدمت یافت نشد');
  }
  if (existing.status !== 'REQUESTED') {
    throw new ServicesServiceError(
      400,
      `درخواست در وضعیت ${existing.status} قرار دارد و قابل استعلام قیمت نیست`,
    );
  }

  const data: any = { status: 'QUOTED', price: p };
  if (providerId) {
    // Lock the request to this provider (assign-on-quote pattern).
    const provider = await storeDb.serviceProvider.findUnique({
      where: { id: providerId },
    });
    if (!provider) {
      throw new ServicesServiceError(404, 'ارائه‌دهنده خدمت یافت نشد');
    }
    data.providerId = providerId;
  }

  const request = await storeDb.serviceRequest.update({
    where: { id: requestId },
    data,
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.service.request.quote',
    entityType: 'ServiceRequest',
    entityId: requestId,
    before: { status: existing.status, price: existing.price, providerId: existing.providerId },
    after: { status: request.status, price: request.price, providerId: request.providerId },
    reason: `استعلام قیمت ${p} برای درخواست خدمت ${requestId}`,
  });

  return serializeRequest(request);
}

// ── acceptQuote ───────────────────────────────────────────
/**
 * Transition a ServiceRequest from QUOTED → ACCEPTED. The customer (or
 * admin on their behalf) accepts the provider's quote.
 *
 * Refuses:
 *   - requestId not found (404).
 *   - request not in QUOTED state (400 — state-machine guard).
 *
 * Audited as `store.service.request.accept`.
 *
 * @throws ServicesServiceError on lookup (404) / state-machine (400).
 */
export async function acceptQuote(
  requestId: string,
  userId?: string | null,
): Promise<any> {
  if (!requestId) {
    throw new ServicesServiceError(400, 'requestId الزامی است');
  }

  const existing = await storeDb.serviceRequest.findUnique({
    where: { id: requestId },
  });
  if (!existing) {
    throw new ServicesServiceError(404, 'درخواست خدمت یافت نشد');
  }
  if (existing.status !== 'QUOTED') {
    throw new ServicesServiceError(
      400,
      `درخواست در وضعیت ${existing.status} قرار دارد و قابل پذیرش نیست`,
    );
  }

  const request = await storeDb.serviceRequest.update({
    where: { id: requestId },
    data: { status: 'ACCEPTED' },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.service.request.accept',
    entityType: 'ServiceRequest',
    entityId: requestId,
    before: { status: existing.status },
    after: { status: request.status },
    reason: `پذیرش استعلام برای درخواست خدمت ${requestId}`,
  });

  return serializeRequest(request);
}

// ── scheduleService ───────────────────────────────────────
/**
 * Transition a ServiceRequest from ACCEPTED → SCHEDULED. The admin
 * records the scheduled date for the service to be performed.
 *
 * Refuses:
 *   - requestId not found (404).
 *   - request not in ACCEPTED state (400 — state-machine guard).
 *   - scheduledDate invalid (400).
 *
 * Audited as `store.service.request.schedule`.
 *
 * @throws ServicesServiceError on lookup (404) / state-machine (400) / validation (400).
 */
export async function scheduleService(
  requestId: string,
  scheduledDate: Date,
  userId?: string | null,
): Promise<any> {
  if (!requestId) {
    throw new ServicesServiceError(400, 'requestId الزامی است');
  }
  if (!scheduledDate || isNaN(scheduledDate.getTime())) {
    throw new ServicesServiceError(400, 'تاریخ برنامه‌ریزی نامعتبر است');
  }

  const existing = await storeDb.serviceRequest.findUnique({
    where: { id: requestId },
  });
  if (!existing) {
    throw new ServicesServiceError(404, 'درخواست خدمت یافت نشد');
  }
  if (existing.status !== 'ACCEPTED') {
    throw new ServicesServiceError(
      400,
      `درخواست در وضعیت ${existing.status} قرار دارد و قابل برنامه‌ریزی نیست`,
    );
  }

  const request = await storeDb.serviceRequest.update({
    where: { id: requestId },
    data: { status: 'SCHEDULED', scheduledDate },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.service.request.schedule',
    entityType: 'ServiceRequest',
    entityId: requestId,
    before: { status: existing.status, scheduledDate: existing.scheduledDate },
    after: {
      status: request.status,
      scheduledDate: request.scheduledDate?.toISOString?.() ?? null,
    },
    reason: `برنامه‌ریزی درخواست خدمت ${requestId} برای ${scheduledDate.toISOString()}`,
  });

  return serializeRequest(request);
}

// ── startService ──────────────────────────────────────────
/**
 * Transition a ServiceRequest from SCHEDULED → IN_PROGRESS. The provider
 * physically starts performing the service.
 *
 * Refuses:
 *   - requestId not found (404).
 *   - request not in SCHEDULED state (400 — state-machine guard).
 *
 * Audited as `store.service.request.start`.
 *
 * @throws ServicesServiceError on lookup (404) / state-machine (400).
 */
export async function startService(
  requestId: string,
  userId?: string | null,
): Promise<any> {
  if (!requestId) {
    throw new ServicesServiceError(400, 'requestId الزامی است');
  }

  const existing = await storeDb.serviceRequest.findUnique({
    where: { id: requestId },
  });
  if (!existing) {
    throw new ServicesServiceError(404, 'درخواست خدمت یافت نشد');
  }
  if (existing.status !== 'SCHEDULED') {
    throw new ServicesServiceError(
      400,
      `درخواست در وضعیت ${existing.status} قرار دارد و قابل شروع نیست`,
    );
  }

  const request = await storeDb.serviceRequest.update({
    where: { id: requestId },
    data: { status: 'IN_PROGRESS' },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.service.request.start',
    entityType: 'ServiceRequest',
    entityId: requestId,
    before: { status: existing.status },
    after: { status: request.status },
    reason: `شروع اجرای درخواست خدمت ${requestId}`,
  });

  return serializeRequest(request);
}

// ── completeService ──────────────────────────────────────
/**
 * Transition a ServiceRequest from IN_PROGRESS → COMPLETED. The provider
 * finished the service. The optional notes are recorded as the final
 * completion notes (overwrites prior notes — the audit trail keeps
 * the prior value via the `before` snapshot).
 *
 * Refuses:
 *   - requestId not found (404).
 *   - request not in IN_PROGRESS state (400 — state-machine guard).
 *
 * Audited as `store.service.request.complete`.
 *
 * @throws ServicesServiceError on lookup (404) / state-machine (400).
 */
export async function completeService(
  requestId: string,
  notes?: string | null,
  userId?: string | null,
): Promise<any> {
  if (!requestId) {
    throw new ServicesServiceError(400, 'requestId الزامی است');
  }

  const existing = await storeDb.serviceRequest.findUnique({
    where: { id: requestId },
  });
  if (!existing) {
    throw new ServicesServiceError(404, 'درخواست خدمت یافت نشد');
  }
  if (existing.status !== 'IN_PROGRESS') {
    throw new ServicesServiceError(
      400,
      `درخواست در وضعیت ${existing.status} قرار دارد و قابل اتمام نیست`,
    );
  }

  const request = await storeDb.serviceRequest.update({
    where: { id: requestId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      notes: notes ?? existing.notes,
    },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.service.request.complete',
    entityType: 'ServiceRequest',
    entityId: requestId,
    before: { status: existing.status, notes: existing.notes },
    after: {
      status: request.status,
      notes: request.notes,
      completedAt: request.completedAt?.toISOString?.() ?? null,
    },
    reason: `اتمام درخواست خدمت ${requestId}`,
  });

  return serializeRequest(request);
}

// ── cancelServiceRequest ──────────────────────────────────
/**
 * Cancel a ServiceRequest (any non-terminal state → CANCELLED).
 * Idempotent re-cancel refused (already-CANCELLED cannot be cancelled
 * again). COMPLETED is terminal (refused).
 *
 * Audited as `store.service.request.cancel` with the supplied reason.
 *
 * @throws ServicesServiceError on lookup (404) / state-machine (400).
 */
export async function cancelServiceRequest(
  requestId: string,
  reason?: string | null,
  userId?: string | null,
): Promise<any> {
  if (!requestId) {
    throw new ServicesServiceError(400, 'requestId الزامی است');
  }

  const existing = await storeDb.serviceRequest.findUnique({
    where: { id: requestId },
  });
  if (!existing) {
    throw new ServicesServiceError(404, 'درخواست خدمت یافت نشد');
  }
  if (existing.status === 'CANCELLED') {
    throw new ServicesServiceError(
      400,
      'درخواست قبلاً لغو شده است',
    );
  }
  if (existing.status === 'COMPLETED') {
    throw new ServicesServiceError(
      400,
      'درخواست تکمیل‌شده قابل لغو نیست',
    );
  }

  const request = await storeDb.serviceRequest.update({
    where: { id: requestId },
    data: { status: 'CANCELLED' },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.service.request.cancel',
    entityType: 'ServiceRequest',
    entityId: requestId,
    before: { status: existing.status },
    after: { status: request.status },
    reason: reason ? `لغو درخواست خدمت: ${reason}` : `لغو درخواست خدمت ${requestId}`,
  });

  return serializeRequest(request);
}
