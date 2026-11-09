import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { checkCsrf } from "@/lib/csrf";
import { enqueueAuditOutbox } from "@/lib/store-audit-outbox";

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
    await requirePermission(user.id, 'procurement.read');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires procurement.read" }, { status: 403 });
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
    await requirePermission(user.id, 'procurement.manage');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires procurement.manage" }, { status: 403 });
  }
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }

  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "بدنه درخواست نامعتبر است" }, { status: 400 });
    }
    const { title, description, quantity, budgetMin, budgetMax, deadline, status, supplierId } = body;

    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ success: false, error: "عنوان الزامی است" }, { status: 400 });
    }
    const q = quantity === undefined ? 1 : Number(quantity);
    if (!Number.isSafeInteger(q) || q < 1) {
      return NextResponse.json({ success: false, error: "تعداد باید عدد صحیح مثبت باشد" }, { status: 400 });
    }
    if (status !== undefined && status !== 'DRAFT') {
      return NextResponse.json({ success: false, error: "مناقصه جدید باید در وضعیت پیش‌نویس ایجاد شود" }, { status: 400 });
    }
    if (description !== undefined && description !== null && typeof description !== 'string') {
      return NextResponse.json({ success: false, error: "توضیحات نامعتبر است" }, { status: 400 });
    }

    const min = budgetMin === undefined || budgetMin === null || budgetMin === '' ? null : Number(budgetMin);
    const max = budgetMax === undefined || budgetMax === null || budgetMax === '' ? null : Number(budgetMax);
    if (
      (min !== null && (!Number.isFinite(min) || min < 0)) ||
      (max !== null && (!Number.isFinite(max) || max < 0)) ||
      (min !== null && max !== null && min > max)
    ) {
      return NextResponse.json({ success: false, error: "بازه بودجه نامعتبر است" }, { status: 400 });
    }

    let deadlineDate: Date | null = null;
    if (deadline !== undefined && deadline !== null && deadline !== '') {
      deadlineDate = new Date(deadline);
      if (Number.isNaN(deadlineDate.getTime())) {
        return NextResponse.json({ success: false, error: "تاریخ مهلت نامعتبر است" }, { status: 400 });
      }
    }

    if (supplierId !== undefined && supplierId !== null && (typeof supplierId !== 'string' || !supplierId.trim())) {
      return NextResponse.json({ success: false, error: "شناسه تأمین‌کننده نامعتبر است" }, { status: 400 });
    }

    const result = await storeDb.$transaction(async (tx) => {
      if (supplierId) {
        const supplier = await tx.supplier.findUnique({
          where: { id: supplierId },
          select: { id: true, active: true },
        });
        if (!supplier || !supplier.active) {
          return { error: "تأمین‌کننده وجود ندارد یا غیرفعال است", status: 409 as const };
        }
      }

      const pr = await tx.procurementRequest.create({
        data: {
          title: title.trim(),
          description: description || null,
          quantity: q,
          budgetMin: min,
          budgetMax: max,
          deadline: deadlineDate,
          status: 'DRAFT',
          supplierId: supplierId || null,
        },
        include: {
          supplier: { select: { id: true, name: true, nameFa: true } },
        },
      });

      await enqueueAuditOutbox(tx, {
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
      return { data: pr };
    }, { isolationLevel: 'Serializable' });

    if ('error' in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, data: serialize(result.data) });
  } catch (e: any) {
    if (e?.code === 'P2034') {
      return NextResponse.json({ success: false, error: "مناقصه هم‌زمان تغییر کرده است؛ دوباره تلاش کنید" }, { status: 409 });
    }
    console.error("[store/procurement POST] error:", e);
    return NextResponse.json(
      { success: false, error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
