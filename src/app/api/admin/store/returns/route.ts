import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import {
  createReturn,
  listReturns,
  ReturnsServiceError,
} from "@/lib/store-returns-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/returns — HEAVIX returns list + create
   T2-W2-B — Returns domain (Return → Order → Items → Reason →
   Status → Inspection → Resolution → Refund → Audit).
   T-A-DEEP-STORE — Business logic extracted to
   src/lib/store-returns-service.ts; route handler stays thin.
   GET  : list returns with filters (orderId, status, limit)
   POST : create a return request for an order
   ============================================================ */

function toErrorResponse(e: unknown) {
  if (e instanceof ReturnsServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error("[store/returns] error:", err);
  return NextResponse.json(
    { success: false, error: err?.message ?? "Internal error" },
    { status: 500 },
  );
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'returns.read');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires returns.read" }, { status: 403 });
  }
  try {
    const url = new URL(req.url);
    const orderId = url.searchParams.get("orderId") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const limit = Number(url.searchParams.get("limit")) || 100;

    const result = await listReturns({ orderId, status, limit });
    return NextResponse.json({
      success: true,
      data: result.items,
      total: result.total,
    });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'returns.manage');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires returns.manage" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { orderId, reason, status, inspection, resolution, reference } = body;
    const ret = await createReturn(orderId, reason, user.id, {
      status,
      inspection,
      resolution,
      reference,
    });
    return NextResponse.json({ success: true, data: ret });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
