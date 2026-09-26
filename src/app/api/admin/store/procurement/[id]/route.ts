import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/procurement/[id] — single ProcurementRequest
   T2-W2-C — Procurement domain. Backs the admin edit modal at
   /admin/procurement.
   GET    : fetch a single procurement request with supplier context
   PATCH  : update any field (title, description, quantity, budget,
            deadline, status, supplierId)
   DELETE : hard delete (cascades from supplier via null-set FK)
   ============================================================ */

const ALLOWED_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "QUOTING",
  "AWARDED",
  "COMPLETED",
  "CANCELLED",
] as const;

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "پیش‌نویس",
  PUBLISHED: "منتشرشده",
  QUOTING: "در حال پیشنهاد",
  AWARDED: "تأییدشده",
  COMPLETED: "تکمیل‌شده",
  CANCELLED: "لغوشده",
};

function serialize(p: any) {
  return {
    ...p,
    budgetMin: p.budgetMin !== null ? String(Math.round(p.budgetMin)) : null,
    budgetMax: p.budgetMax !== null ? String(Math.round(p.budgetMax)) : null,
    deadline: p.deadline?.toISOString?.() ?? null,
    statusLabel: STATUS_LABELS[p.status] ?? p.status,
    quoteCount: 0,
    company:
      p.supplier !== null
        ? {
            id: p.supplier?.id,
            name: p.supplier?.name,
            slug: p.supplier?.nameFa ?? p.supplier?.name,
          }
        : null,
    createdAt: p.createdAt?.toISOString?.() ?? null,
    updatedAt: p.updatedAt?.toISOString?.() ?? null,
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
    await requirePermission(user.id, 'procurement.read');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires procurement.read" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const pr = await storeDb.procurementRequest.findUnique({
      where: { id },
      include: {
        supplier: {
          select: { id: true, name: true, nameFa: true },
        },
      },
    });
    if (!pr) {
      return NextResponse.json(
        { success: false, error: "مناقصه یافت نشد" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: serialize(pr) });
  } catch (e: any) {
    console.error("[store/procurement/[id] GET] error:", e);
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
    await requirePermission(user.id, 'procurement.manage');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires procurement.manage" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const body = await req.json();
    const existing = await storeDb.procurementRequest.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "مناقصه یافت نشد" },
        { status: 404 },
      );
    }

    const data: any = {};
    if (body.title !== undefined) {
      if (!body.title || !body.title.trim()) {
        return NextResponse.json(
          { success: false, error: "عنوان الزامی است" },
          { status: 400 },
        );
      }
      data.title = body.title.trim();
    }
    if (body.description !== undefined) {
      data.description = body.description || null;
    }
    if (body.quantity !== undefined) {
      const q = Number(body.quantity) || 0;
      if (q < 1) {
        return NextResponse.json(
          { success: false, error: "تعداد باید حداقل ۱ باشد" },
          { status: 400 },
        );
      }
      data.quantity = q;
    }
    if (body.budgetMin !== undefined) {
      data.budgetMin = body.budgetMin ? Number(body.budgetMin) : null;
    }
    if (body.budgetMax !== undefined) {
      data.budgetMax = body.budgetMax ? Number(body.budgetMax) : null;
    }
    if (body.deadline !== undefined) {
      let deadlineDate: Date | null = null;
      if (body.deadline) {
        const d = new Date(body.deadline);
        if (!isNaN(d.getTime())) deadlineDate = d;
      }
      data.deadline = deadlineDate;
    }
    if (body.status !== undefined) {
      if (!ALLOWED_STATUSES.includes(body.status)) {
        return NextResponse.json(
          { success: false, error: "وضعیت نامعتبر" },
          { status: 400 },
        );
      }
      data.status = body.status;
    }
    if (body.supplierId !== undefined) {
      data.supplierId = body.supplierId || null;
    }

    const pr = await storeDb.procurementRequest.update({
      where: { id },
      data,
      include: {
        supplier: {
          select: { id: true, name: true, nameFa: true },
        },
      },
    });

    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.procurement.update',
      entityType: 'ProcurementRequest',
      entityId: pr.id,
      before: existing,
      after: pr,
    });

    return NextResponse.json({ success: true, data: serialize(pr) });
  } catch (e: any) {
    console.error("[store/procurement/[id] PATCH] error:", e);
    return NextResponse.json(
      { success: false, error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'procurement.manage');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires procurement.manage" }, { status: 403 });
  }
  const { id } = await params;
  try {
    const existing = await storeDb.procurementRequest.findUnique({
      where: { id },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "مناقصه یافت نشد" },
        { status: 404 },
      );
    }

    await storeDb.procurementRequest.delete({ where: { id } });

    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.procurement.delete',
      entityType: 'ProcurementRequest',
      entityId: id,
      before: existing,
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[store/procurement/[id] DELETE] error:", e);
    return NextResponse.json(
      { success: false, error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
