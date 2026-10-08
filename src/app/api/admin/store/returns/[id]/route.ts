import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { checkCsrf } from "@/lib/csrf";
import {
  updateReturnStatus,
  inspectReturn,
  resolveReturn,
  ReturnsServiceError,
} from "@/lib/store-returns-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/returns/[id] — single Return detail + lifecycle
   T2-W2-B — Returns domain.
   T-A-DEEP-STORE — PATCH business logic extracted to
   src/lib/store-returns-service.ts; GET stays inline (rich read).
   T2-DEEP — PATCH now dispatches three workflow modes:
     - body.action === 'inspect'  → inspectReturn (item conditions)
     - body.action === 'resolve'  → resolveReturn (REFUND/EXCHANGE/REJECT)
     - default (no action)        → updateReturnStatus (status/notes)
   GET   : fetch a single return with order + customer + items context
   PATCH : advance status / inspect / resolve (see modes above).
   ============================================================ */

function serialize(r: any) {
  return {
    ...r,
    createdAt: r.createdAt?.toISOString?.() ?? null,
    updatedAt: r.updatedAt?.toISOString?.() ?? null,
  };
}

function toErrorResponse(e: unknown) {
  if (e instanceof ReturnsServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error("[store/returns/[id]] error:", err);
  return NextResponse.json(
    { success: false, error: err?.message ?? "Internal error" },
    { status: 500 },
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'returns.read');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires returns.read" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const ret = await storeDb.return.findUnique({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentStatus: true,
            customer: {
              select: { id: true, name: true, family: true, phone: true },
            },
            items: {
              include: {
                part: { select: { id: true, name: true, sku: true } },
              },
            },
          },
        },
        // T2-DEEP — include the per-line return items + their orderItem
        // context so the inspector UI can render restockable flags +
        // the resolver UI can show which items will be refunded.
        items: {
          include: {
            orderItem: {
              select: {
                id: true,
                partNameSnapshot: true,
                quantity: true,
                lineTotalIrr: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!ret) {
      return NextResponse.json(
        { success: false, error: "مرجوعی یافت نشد" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: serialize(ret) });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'returns.manage');
    if (!checkCsrf(req)) {
      return NextResponse.json(
        { error: "CSRF check failed" },
        { status: 403 },
      );
    }
  } catch {
    return NextResponse.json({ error: "Forbidden: requires returns.manage" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const body = await req.json();

    // T2-DEEP — dispatch based on `body.action`. Three workflow modes:
    //   1. action='inspect' → inspectReturn (admin records per-item
    //      restockable flags + inspection notes; status → INSPECTED).
    //   2. action='resolve' → resolveReturn (admin finalizes with
    //      REFUND | EXCHANGE | REJECT; for REFUND creates WalletTxn).
    //   3. no action → legacy updateReturnStatus (status flip + notes).
    if (body.action === "inspect") {
      const ret = await inspectReturn(
        id,
        body.inspection ?? null,
        Array.isArray(body.itemConditions) ? body.itemConditions : [],
        user.id,
      );
      // P2 (Contract Drift Remediation): Removed the route-scope
      // store.returns.update audit — inspectReturn() already audits
      // this in the service as store.return.inspect (with before/after).
      // The route audit was missing before: and used a plural action key.
      return NextResponse.json({ success: true, data: ret });
    }

    if (body.action === "resolve") {
      const ret = await resolveReturn(id, body.resolution, user.id);
      // P2: Same as above — resolveReturn() already audits this in the
      // service as store.return.resolve (with before/after). Removed
      // the redundant route-scope store.returns.update audit.
      return NextResponse.json({ success: true, data: ret });
    }

    // Default: legacy status/notes update.
    const ret = await updateReturnStatus(
      id,
      body.status,
      body.inspection,
      body.resolution,
      user.id,
      { reason: body.reason },
    );
    // P2: Same as above — updateReturnStatus() already audits this in
    // the service as store.return.update (with before: existing + after).
    // Removed the redundant route-scope store.returns.update audit.
    return NextResponse.json({ success: true, data: ret });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
