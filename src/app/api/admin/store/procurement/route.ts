import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/procurement — HEAVIX B2B procurement tenders
   T2-W2-C — Procurement domain. Backs the admin UI at
   /admin/procurement. A ProcurementRequest is an internal
   purchasing need that flows DRAFT → PUBLISHED → QUOTING →
   AWARDED → COMPLETED (or CANCELLED).
   GET  : list procurement requests with filters (q, status, supplierId)
   POST : create a new procurement request (DRAFT by default)
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
    quoteCount: 0, // no quote model yet — UI placeholder
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

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.read');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.read" }, { status: 403 });
  }
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() || undefined;
    const status = url.searchParams.get("status") || undefined;
    const supplierId = url.searchParams.get("supplierId") || undefined;
    const limit = Math.min(500, Number(url.searchParams.get("limit")) || 100);

    const where: any = {};
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { description: { contains: q } },
      ];
    }
    if (status) {
      if (!ALLOWED_STATUSES.includes(status as any)) {
        return NextResponse.json(
          { success: false, error: "وضعیت نامعتبر" },
          { status: 400 },
        );
      }
      where.status = status;
    }
    if (supplierId) where.supplierId = supplierId;

    const [items, total] = await Promise.all([
      storeDb.procurementRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          supplier: {
            select: { id: true, name: true, nameFa: true },
          },
        },
      }),
      storeDb.procurementRequest.count({ where }),
    ]);

    // Compute stats for the admin dashboard cards.
    const statusCounts = await storeDb.procurementRequest.groupBy({
      by: ["status"],
      _count: true,
    });
    const stats: Record<string, number> = { total: total };
    for (const row of statusCounts) {
      stats[row.status.toLowerCase()] = row._count;
    }
    stats.totalQuotes = 0;

    return NextResponse.json({
      success: true,
      data: items.map(serialize),
      total,
      stats,
    });
  } catch (e: any) {
    console.error("[store/procurement GET] error:", e);
    return NextResponse.json(
      { success: false, error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.manage');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.manage" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const {
      title,
      description,
      quantity,
      budgetMin,
      budgetMax,
      deadline,
      status,
      supplierId,
    } = body;

    if (!title || !title.trim()) {
      return NextResponse.json(
        { success: false, error: "عنوان الزامی است" },
        { status: 400 },
      );
    }
    const q = Number(quantity) || 1;
    if (q < 1) {
      return NextResponse.json(
        { success: false, error: "تعداد باید حداقل ۱ باشد" },
        { status: 400 },
      );
    }

    const initialStatus =
      status && ALLOWED_STATUSES.includes(status as any) ? status : "DRAFT";

    let deadlineDate: Date | null = null;
    if (deadline) {
      const d = new Date(deadline);
      if (!isNaN(d.getTime())) deadlineDate = d;
    }

    const pr = await storeDb.procurementRequest.create({
      data: {
        title: title.trim(),
        description: description || null,
        quantity: q,
        budgetMin: budgetMin ? Number(budgetMin) : null,
        budgetMax: budgetMax ? Number(budgetMax) : null,
        deadline: deadlineDate,
        status: initialStatus,
        supplierId: supplierId || null,
      },
      include: {
        supplier: {
          select: { id: true, name: true, nameFa: true },
        },
      },
    });

    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.procurement.create',
      entityType: 'ProcurementRequest',
      entityId: pr.id,
      after: {
        title: pr.title,
        quantity: pr.quantity,
        budgetMin: pr.budgetMin,
        budgetMax: pr.budgetMax,
        deadline: pr.deadline,
        status: pr.status,
        supplierId: pr.supplierId,
      },
    });

    return NextResponse.json({ success: true, data: serialize(pr) });
  } catch (e: any) {
    console.error("[store/procurement POST] error:", e);
    return NextResponse.json(
      { success: false, error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
