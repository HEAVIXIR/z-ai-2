/**
 * HEAVIX — Store Services Marketplace — Request Detail API (PHASE-P9-SERVICES)
 * GET   /api/admin/store/services/requests/[id] — get a service request
 * PATCH /api/admin/store/services/requests/[id] — body-driven state-machine
 *
 * Body-driven state-machine transitions for a ServiceRequest. The body's
 * `action` field selects which service transition to invoke:
 *   action=quote    → submitQuote     (REQUESTED   → QUOTED)
 *   action=accept   → acceptQuote    (QUOTED      → ACCEPTED)
 *   action=schedule → scheduleService (ACCEPTED   → SCHEDULED)
 *   action=start    → startService   (SCHEDULED   → IN_PROGRESS)
 *   action=complete → completeService (IN_PROGRESS → COMPLETED)
 *   action=cancel   → cancelServiceRequest (any non-terminal → CANCELLED)
 *
 * Permission: store.read (GET) / store.manage (PATCH). The state-machine
 * business logic + audit lives in src/lib/services-service.ts; this route
 * just maps the action string to the service call.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import {
  submitQuote,
  acceptQuote,
  scheduleService,
  startService,
  completeService,
  cancelServiceRequest,
  ServicesServiceError,
} from "@/lib/services-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const ALLOWED_ACTIONS = [
  'quote',
  'accept',
  'schedule',
  'start',
  'complete',
  'cancel',
] as const;
type RequestAction = (typeof ALLOWED_ACTIONS)[number];

function toErrorResponse(e: unknown) {
  if (e instanceof ServicesServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error('[store/services/requests/[id]] error:', err);
  return NextResponse.json(
    { success: false, error: err?.message ?? 'Internal error' },
    { status: 500 },
  );
}

function serializeRequest(r: any) {
  return {
    ...r,
    scheduledDate: r.scheduledDate?.toISOString?.() ?? null,
    completedAt: r.completedAt?.toISOString?.() ?? null,
    createdAt: r.createdAt?.toISOString?.() ?? null,
    updatedAt: r.updatedAt?.toISOString?.() ?? null,
    provider: r.provider
      ? {
          id: r.provider.id,
          name: r.provider.name,
          nameFa: r.provider.nameFa,
          type: r.provider.type,
          phone: r.provider.phone,
        }
      : null,
  };
}

/* GET /api/admin/store/services/requests/[id] */
export async function GET(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.read');
  } catch {
    return NextResponse.json(
      { error: 'Forbidden: requires store.read' },
      { status: 403 },
    );
  }
  const { id } = await params;
  try {
    const request = await storeDb.serviceRequest.findUnique({
      where: { id },
      include: {
        provider: {
          select: { id: true, name: true, nameFa: true, type: true, phone: true },
        },
      },
    });
    if (!request) {
      return NextResponse.json(
        { success: false, error: 'یافت نشد' },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: serializeRequest(request) });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/* PATCH /api/admin/store/services/requests/[id] */
export async function PATCH(req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.manage');
  } catch {
    return NextResponse.json(
      { error: 'Forbidden: requires store.manage' },
      { status: 403 },
    );
  }
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? '').toLowerCase() as RequestAction;
    if (!ALLOWED_ACTIONS.includes(action)) {
      return NextResponse.json(
        {
          success: false,
          error: `action باید یکی از ${ALLOWED_ACTIONS.join('، ')} باشد`,
        },
        { status: 400 },
      );
    }

    let result: any;
    switch (action) {
      case 'quote': {
        const price = Number(body.price);
        if (!Number.isFinite(price) || price < 0) {
          return NextResponse.json(
            { success: false, error: 'قیمت نامعتبر است' },
            { status: 400 },
          );
        }
        result = await submitQuote(
          id,
          body.providerId ?? null,
          price,
          user.id,
        );
        break;
      }
      case 'accept':
        result = await acceptQuote(id, user.id);
        break;
      case 'schedule': {
        let scheduledDate: Date;
        try {
          scheduledDate = new Date(body.scheduledDate);
        } catch {
          return NextResponse.json(
            { success: false, error: 'تاریخ برنامه‌ریزی نامعتبر است' },
            { status: 400 },
          );
        }
        if (isNaN(scheduledDate.getTime())) {
          return NextResponse.json(
            { success: false, error: 'تاریخ برنامه‌ریزی نامعتبر است' },
            { status: 400 },
          );
        }
        result = await scheduleService(id, scheduledDate, user.id);
        break;
      }
      case 'start':
        result = await startService(id, user.id);
        break;
      case 'complete':
        result = await completeService(id, body.notes ?? null, user.id);
        break;
      case 'cancel':
        result = await cancelServiceRequest(id, body.reason ?? null, user.id);
        break;
    }

    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    return toErrorResponse(e);
  }
}
