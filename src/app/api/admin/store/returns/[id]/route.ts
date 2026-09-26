import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/returns/[id] — single Return detail + status update
   T2-W2-B — Returns domain.
   GET   : fetch a single return with order + customer context
   PATCH : advance status (REQUESTED → APPROVED → INSPECTED → RESOLVED
           | REJECTED) and optionally set inspection/resolution notes.
   ============================================================ */

const ALLOWED_STATUSES = [
  "REQUESTED",
  "APPROVED",
  "INSPECTED",
  "RESOLVED",
  "REJECTED",
] as const;

const ALLOWED_RESOLUTIONS = ["REFUND", "EXCHANGE", "REJECT"] as const;

function serialize(r: any) {
  return {
    ...r,
    createdAt: r.createdAt?.toISOString?.() ?? null,
    updatedAt: r.updatedAt?.toISOString?.() ?? null,
  };
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
    await requirePermission(user.id, 'store.read');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.read" }, { status: 403 });
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
    console.error("[store/returns/[id] GET] error:", e);
    return NextResponse.json(
      { success: false, error: e?.message ?? "Internal error" },
      { status: 500 },
    );
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
    await requirePermission(user.id, 'store.manage');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.manage" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const body = await req.json();
    const existing = await storeDb.return.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "مرجوعی یافت نشد" },
        { status: 404 },
      );
    }

    const data: any = {};
    if (body.status !== undefined) {
      if (!ALLOWED_STATUSES.includes(body.status)) {
        return NextResponse.json(
          { success: false, error: "وضعیت نامعتبر" },
          { status: 400 },
        );
      }
      data.status = body.status;
    }
    if (body.inspection !== undefined) {
      data.inspection = body.inspection || null;
    }
    if (body.resolution !== undefined) {
      if (body.resolution && !ALLOWED_RESOLUTIONS.includes(body.resolution)) {
        return NextResponse.json(
          { success: false, error: "نوع تصمیم نامعتبر" },
          { status: 400 },
        );
      }
      data.resolution = body.resolution || null;
    }
    if (body.reason !== undefined) {
      data.reason = body.reason || existing.reason;
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
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.return.update',
      entityType: 'Return',
      entityId: ret.id,
      before: existing,
      after: ret,
    });

    return NextResponse.json({ success: true, data: serialize(ret) });
  } catch (e: any) {
    console.error("[store/returns/[id] PATCH] error:", e);
    return NextResponse.json(
      { success: false, error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
