/**
 * HEAVIX — Store Returns Service Layer
 *
 * Extracted from src/app/api/admin/store/returns/route.ts (T-A-DEEP-STORE)
 * and src/app/api/admin/store/returns/[id]/route.ts.
 *
 * Responsibilities:
 *   - createReturn(): create a Return for an order + log audit.
 *   - updateReturnStatus(): advance status (REQUESTED → APPROVED →
 *     INSPECTED → RESOLVED | REJECTED) + optionally set inspection/
 *     resolution notes + log audit.
 *   - listReturns(): query Returns with filters (orderId, status, limit).
 *
 * The route handlers stay thin: parse request, enforce RBAC, call service,
 * map thrown ServiceError → HTTP response. All DB + audit logic lives here.
 */

import { storeDb } from '@/lib/store-db';
import { logAudit } from '@/lib/audit';

// ── Constants ──────────────────────────────────────────────
const ALLOWED_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'INSPECTED',
  'RESOLVED',
  'REJECTED',
] as const;

const ALLOWED_RESOLUTIONS = ['REFUND', 'EXCHANGE', 'REJECT'] as const;

// ── Service error (maps to HTTP status in route handler) ──
export class ReturnsServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ReturnsServiceError';
  }
}

// ── Filters for listReturns() ──────────────────────────────
export interface ReturnsFilters {
  orderId?: string;
  status?: string;
  limit?: number;
}

// ── Optional extra fields for createReturn() ───────────────
export interface CreateReturnOptions {
  status?: string;
  inspection?: string | null;
  resolution?: string | null;
  reference?: string | null;
}

// ── Optional extra fields for updateReturnStatus() ─────────
export interface UpdateReturnOptions {
  reason?: string | null;
}

// ── Serializer (Date → ISO string for JSON transport) ────
function serialize(r: any) {
  return {
    ...r,
    createdAt: r.createdAt?.toISOString?.() ?? null,
    updatedAt: r.updatedAt?.toISOString?.() ?? null,
  };
}

// ── createReturn ──────────────────────────────────────────
/**
 * Create a Return for an order. Default status: REQUESTED.
 *
 * @throws ReturnsServiceError on validation/lookup failure (400/404).
 */
export async function createReturn(
  orderId: string,
  reason: string,
  userId?: string | null,
  options: CreateReturnOptions = {},
): Promise<any> {
  if (!orderId || !reason) {
    throw new ReturnsServiceError(
      400,
      'سفارش و دلیل مرجوعی الزامی است',
    );
  }

  const order = await storeDb.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw new ReturnsServiceError(404, 'سفارش یافت نشد');
  }

  const initialStatus =
    options.status && ALLOWED_STATUSES.includes(options.status as (typeof ALLOWED_STATUSES)[number])
      ? options.status
      : 'REQUESTED';

  const ret = await storeDb.return.create({
    data: {
      orderId,
      reason,
      status: initialStatus,
      inspection: options.inspection || null,
      resolution: options.resolution || null,
      createdBy: userId ?? null,
    },
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

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.return.create',
    entityType: 'Return',
    entityId: ret.id,
    after: {
      orderId,
      reason,
      status: initialStatus,
      inspection: ret.inspection,
      resolution: ret.resolution,
      reference: options.reference || null,
    },
  });

  return serialize(ret);
}

// ── updateReturnStatus ────────────────────────────────────
/**
 * Update a Return's status, inspection, and/or resolution notes.
 *
 * Status flow: REQUESTED → APPROVED → INSPECTED → RESOLVED | REJECTED.
 *
 * @throws ReturnsServiceError on lookup failure (404) or invalid
 *         status/resolution (400).
 */
export async function updateReturnStatus(
  id: string,
  status?: string,
  inspection?: string | null,
  resolution?: string | null,
  userId?: string | null,
  options: UpdateReturnOptions = {},
): Promise<any> {
  const existing = await storeDb.return.findUnique({ where: { id } });
  if (!existing) {
    throw new ReturnsServiceError(404, 'مرجوعی یافت نشد');
  }

  const data: any = {};
  if (status !== undefined) {
    if (!ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])) {
      throw new ReturnsServiceError(400, 'وضعیت نامعتبر');
    }
    data.status = status;
  }
  if (inspection !== undefined) {
    data.inspection = inspection || null;
  }
  if (resolution !== undefined) {
    if (resolution && !ALLOWED_RESOLUTIONS.includes(resolution as (typeof ALLOWED_RESOLUTIONS)[number])) {
      throw new ReturnsServiceError(400, 'نوع تصمیم نامعتبر');
    }
    data.resolution = resolution || null;
  }
  if (options.reason !== undefined) {
    data.reason = options.reason || existing.reason;
  }

  const ret = await storeDb.return.update({
    where: { id },
    data,
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

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.return.update',
    entityType: 'Return',
    entityId: ret.id,
    before: existing,
    after: ret,
  });

  return serialize(ret);
}

// ── listReturns ───────────────────────────────────────────
/**
 * List Returns with optional filters.
 *
 * @throws ReturnsServiceError if `status` is invalid (400).
 */
export async function listReturns(
  filters: ReturnsFilters = {},
): Promise<{ items: any[]; total: number }> {
  const { orderId, status, limit = 100 } = filters;
  const cappedLimit = Math.min(500, Number(limit) || 100);

  const where: any = {};
  if (orderId) where.orderId = orderId;
  if (status) {
    if (!ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])) {
      throw new ReturnsServiceError(400, 'وضعیت نامعتبر');
    }
    where.status = status;
  }

  const [items, total] = await Promise.all([
    storeDb.return.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: cappedLimit,
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
    }),
    storeDb.return.count({ where }),
  ]);

  return { items: items.map(serialize), total };
}
