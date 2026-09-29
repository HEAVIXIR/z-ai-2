import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/rfq
   GET  — list all RFQs with stats (admin)
   POST — bulk actions { action, ids: [] }
   ============================================================ */

const STATUS_LABELS: Record<string, string> = {
  OPEN: "باز",
  QUOTING: "در حال پیشنهاد",
  AWARDED: "تأییدشده",
  CLOSED: "بسته‌شده",
  CANCELLED: "لغوشده",
};

export async function GET(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "rfq.read"))) {
    return NextResponse.json(
      { error: "Forbidden: requires rfq.read" },
      { status: 403 },
    );
  }
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const where = status ? { status } : {};

    const [rfqs, total, open, quoting, awarded, closed, cancelled, totalQuotes] =
      await Promise.all([
        db.rFQ.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: 200,
          include: { _count: { select: { quotes: true } } },
        }),
        db.rFQ.count({ where }),
        db.rFQ.count({ where: { ...where, status: "OPEN" } }),
        db.rFQ.count({ where: { ...where, status: "QUOTING" } }),
        db.rFQ.count({ where: { ...where, status: "AWARDED" } }),
        db.rFQ.count({ where: { ...where, status: "CLOSED" } }),
        db.rFQ.count({ where: { ...where, status: "CANCELLED" } }),
        db.rFQQuote.count(),
      ]);

    return NextResponse.json({
      success: true,
      data: rfqs.map((r) => ({
        ...r,
        budgetMin: r.budgetMin ? r.budgetMin.toString() : null,
        budgetMax: r.budgetMax ? r.budgetMax.toString() : null,
        statusLabel: STATUS_LABELS[r.status] ?? r.status,
        quoteCount: r._count.quotes,
        _count: undefined,
      })),
      stats: {
        total,
        open,
        quoting,
        awarded,
        closed,
        cancelled,
        totalQuotes,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "rfq.manage"))) {
    return NextResponse.json(
      { error: "Forbidden: requires rfq.manage" },
      { status: 403 },
    );
  }
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "").trim();
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
    if (!action || !["close", "cancel", "award"].includes(action)) {
      return NextResponse.json({ error: "invalid action" }, { status: 400 });
    }
    if (ids.length === 0) {
      return NextResponse.json({ error: "ids is required" }, { status: 400 });
    }

    const statusMap: Record<string, string> = {
      close: "CLOSED",
      cancel: "CANCELLED",
      award: "AWARDED",
    };
    const result = await db.rFQ.updateMany({
      where: { id: { in: ids } },
      data: { status: statusMap[action] },
    });

    await logAudit({
      actorId: sessionUser.id,
      actorType: "ADMIN",
      action: "admin.rfqs.updateMany",
      entityType: "RFQ",
      entityId: null,
      before: { ids, action },
      after: { action, status: statusMap[action], count: result.count },
      reason: "via admin API",
    });

    return NextResponse.json({
      success: true,
      updated: result.count,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
