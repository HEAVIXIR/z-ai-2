import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { checkCsrf } from "@/lib/csrf";
import { storeDb } from "@/lib/store-db";
import {
  addReturnItem,
  ReturnsServiceError,
} from "@/lib/store-returns-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/returns/[id]/items — ReturnItem list + add
   T2-DEEP — Returns Deep (ReturnItem + Inspection Workflow).

   GET  : list ReturnItems for a Return (with their OrderItem context).
   POST : add a ReturnItem (one per OrderItem per Return).
   ============================================================ */

function serialize(r: any) {
  return {
    ...r,
    createdAt: r.createdAt?.toISOString?.() ?? null,
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
  console.error("[store/returns/[id]/items] error:", err);
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
    return NextResponse.json(
      { error: "Forbidden: requires returns.read" },
      { status: 403 },
    );
  }
  const { id: returnId } = await params;
  try {
    const items = await storeDb.returnItem.findMany({
      where: { returnId },
      orderBy: { createdAt: "asc" },
      include: {
        orderItem: {
          select: {
            id: true,
            partNameSnapshot: true,
            quantity: true,
            lineTotalUsd: true,
            lineTotalIrr: true,
          },
        },
      },
    });
    return NextResponse.json({
      success: true,
      data: items.map(serialize),
      total: items.length,
    });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}

export async function POST(
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
    return NextResponse.json(
      { error: "Forbidden: requires returns.manage" },
      { status: 403 },
    );
  }
  const { id: returnId } = await params;
  try {
    const body = await req.json();
    const { orderItemId, quantity, reason, condition } = body;
    const item = await addReturnItem(
      returnId,
      orderItemId,
      quantity,
      reason ?? null,
      condition ?? null,
      user.id,
    );
    return NextResponse.json({ success: true, data: serialize(item) });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
