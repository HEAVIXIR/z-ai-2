import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import {
  updateReturnStatus,
  ReturnsServiceError,
} from "@/lib/store-returns-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/returns/[id] — single Return detail + status update
   T2-W2-B — Returns domain.
   T-A-DEEP-STORE — PATCH business logic extracted to
   src/lib/store-returns-service.ts; GET stays inline (rich read).
   GET   : fetch a single return with order + customer context
   PATCH : advance status (REQUESTED → APPROVED → INSPECTED → RESOLVED
           | REJECTED) and optionally set inspection/resolution notes.
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
  } catch {
    return NextResponse.json({ error: "Forbidden: requires returns.manage" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const body = await req.json();
    const ret = await updateReturnStatus(
      id,
      body.status,
      body.inspection,
      body.resolution,
      user.id,
      { reason: body.reason },
    );
    return NextResponse.json({ success: true, data: ret });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}
