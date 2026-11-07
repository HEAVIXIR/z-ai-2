import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { checkCsrf } from "@/lib/csrf";
import { enqueueAuditOutbox } from "@/lib/store-audit-outbox";

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
    return NextResponse.json(
      { error: "Forbidden: requires procurement.manage" },
      { status: 403 },
    );
  }
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "بدنه درخواست نامعتبر است" }, { status: 400 });
    }

    const result = await storeDb.$transaction(async (tx) => {
      const existing = await tx.procurementRequest.findUnique({ where: { id } });
      if (!existing) {
        return { error: "مناقصه یافت نشد", status: 404 as const };
      }

      const data: Record<string, unknown> = {};
      if (body.title !== undefined) {
        if (typeof body.title !== 'string' || !body.title.trim()) {
          return { error: "عنوان الزامی است", status: 400 as const };
        }
        data.title = body.title.trim();
      }
      if (body.description !== undefined) {
        if (body.description !== null && typeof body.description !== 'string') {
          return { error: "توضیحات نامعتبر است", status: 400 as const };
        }
        data.description = body.description || null;
      }
      if (body.quantity !== undefined) {
        const quantity = Number(body.quantity);
        if (!Number.isSafeInteger(quantity) || quantity < 1) {
          return { error: "تعداد باید عدد صحیح مثبت باشد", status: 400 as const };
        }
        data.quantity = quantity;
      }

      const nextBudgetMin = body.budgetMin !== undefined
        ? (body.budgetMin === null || body.budgetMin === '' ? null : Number(body.budgetMin))
        : existing.budgetMin;
      const nextBudgetMax = body.budgetMax !== undefined
        ? (body.budgetMax === null || body.budgetMax === '' ? null : Number(body.budgetMax))
        : existing.budgetMax;
      if (
        (nextBudgetMin !== null && (!Number.isFinite(nextBudgetMin) || nextBudgetMin < 0)) ||
        (nextBudgetMax !== null && (!Number.isFinite(nextBudgetMax) || nextBudgetMax < 0)) ||
        (nextBudgetMin !== null && nextBudgetMax !== null && nextBudgetMin > nextBudgetMax)
      ) {
        return { error: "بازه بودجه نامعتبر است", status: 400 as const };
      }
      if (body.budgetMin !== undefined) data.budgetMin = nextBudgetMin;
      if (body.budgetMax !== undefined) data.budgetMax = nextBudgetMax;

      if (body.deadline !== undefined) {
        if (body.deadline === null || body.deadline === '') {
          data.deadline = null;
        } else {
          const deadline = new Date(body.deadline);
          if (Number.isNaN(deadline.getTime())) {
            return { error: "تاریخ مهلت نامعتبر است", status: 400 as const };
          }
          data.deadline = deadline;
        }
      }

      if (body.status !== undefined) {
        if (!ALLOWED_STATUSES.includes(body.status)) {
          return { error: "وضعیت نامعتبر", status: 400 as const };
        }
        const transitions: Record<string, readonly string[]> = {
          DRAFT: ['PUBLISHED', 'CANCELLED'],
          PUBLISHED: ['QUOTING', 'CANCELLED'],
          QUOTING: ['AWARDED', 'CANCELLED'],
          AWARDED: ['COMPLETED', 'CANCELLED'],
          COMPLETED: [],
          CANCELLED: [],
        };
        if (body.status !== existing.status && !transitions[existing.status]?.includes(body.status)) {
          return {
            error: `تغییر وضعیت از ${existing.status} به ${body.status} مجاز نیست`,
            status: 409 as const,
          };
        }
        data.status = body.status;
      }

      if (body.supplierId !== undefined) {
        if (body.supplierId !== null && (typeof body.supplierId !== 'string' || !body.supplierId.trim())) {
          return { error: "شناسه تأمین‌کننده نامعتبر است", status: 400 as const };
        }
        const nextSupplierId = body.supplierId || null;
        if (
          ['AWARDED', 'COMPLETED'].includes(existing.status) &&
          nextSupplierId !== existing.supplierId
        ) {
          return { error: "پس از واگذاری مناقصه، تغییر تأمین‌کننده مجاز نیست", status: 409 as const };
        }
        data.supplierId = nextSupplierId;
      }

      if (Object.keys(data).length === 0) {
        return { error: "هیچ تغییری برای ثبت ارسال نشده است", status: 400 as const };
      }

      const effectiveStatus = (data.status as string | undefined) ?? existing.status;
      const effectiveSupplierId = (data.supplierId as string | null | undefined) ?? existing.supplierId;
      if (effectiveStatus === 'AWARDED') {
        if (!effectiveSupplierId) {
          return { error: "برای واگذاری مناقصه باید تأمین‌کننده برنده مشخص باشد", status: 409 as const };
        }
        const supplier = await tx.supplier.findUnique({
          where: { id: effectiveSupplierId },
          select: { id: true, active: true },
        });
        if (!supplier || !supplier.active) {
          return { error: "تأمین‌کننده برنده وجود ندارد یا غیرفعال است", status: 409 as const };
        }
      }

      if (body.status === 'COMPLETED' && existing.status !== 'COMPLETED') {
        const openPurchaseOrders = await tx.purchaseOrder.count({
          where: {
            procurementId: id,
            status: { notIn: ['RECEIVED', 'CANCELLED'] },
          },
        });
        if (openPurchaseOrders > 0) {
          return {
            error: "تا زمان دریافت یا لغو تمام سفارش‌های خرید، تکمیل مناقصه مجاز نیست",
            status: 409 as const,
          };
        }
      }

      const changed = await tx.procurementRequest.updateMany({
        where: { id, status: existing.status },
        data: data as any,
      });
      if (changed.count !== 1) {
        return { error: "مناقصه هم‌زمان تغییر کرده است؛ دوباره بارگذاری کنید", status: 409 as const };
      }

      const updated = await tx.procurementRequest.findUnique({
        where: { id },
        include: {
          supplier: { select: { id: true, name: true, nameFa: true } },
        },
      });
      if (!updated) {
        return { error: "مناقصه پس از ویرایش یافت نشد", status: 404 as const };
      }

      await enqueueAuditOutbox(tx, {
        actorId: user.id,
        actorType: 'ADMIN',
        action: 'store.procurement.update',
        entityType: 'ProcurementRequest',
        entityId: id,
        before: {
          title: existing.title,
          description: existing.description,
          quantity: existing.quantity,
          budgetMin: existing.budgetMin,
          budgetMax: existing.budgetMax,
          deadline: existing.deadline,
          status: existing.status,
          supplierId: existing.supplierId,
        },
        after: {
          title: updated.title,
          description: updated.description,
          quantity: updated.quantity,
          budgetMin: updated.budgetMin,
          budgetMax: updated.budgetMax,
          deadline: updated.deadline,
          status: updated.status,
          supplierId: updated.supplierId,
        },
      });
      return { data: updated };
    }, { isolationLevel: 'Serializable' });

    if ('error' in result) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status },
      );
    }
    return NextResponse.json({ success: true, data: serialize(result.data) });
  } catch (e: any) {
    if (e?.code === 'P2034') {
      return NextResponse.json(
        { success: false, error: "مناقصه هم‌زمان تغییر کرده است؛ دوباره تلاش کنید" },
        { status: 409 },
      );
    }
    console.error("[store/procurement/[id] PATCH] error:", e);
    return NextResponse.json(
      { success: false, error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
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
    return NextResponse.json(
      { error: "Forbidden: requires procurement.manage" },
      { status: 403 },
    );
  }
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const result = await storeDb.$transaction(async (tx) => {
      const existing = await tx.procurementRequest.findUnique({
        where: { id },
        include: { _count: { select: { purchaseOrders: true } } },
      });
      if (!existing) return { error: "مناقصه یافت نشد", status: 404 as const };
      if (existing._count.purchaseOrders > 0) {
        return {
          error: "مناقصه دارای سفارش خرید است؛ به‌جای حذف، وضعیت آن را لغو یا تکمیل کنید",
          status: 409 as const,
        };
      }

      const deleted = await tx.procurementRequest.deleteMany({
        where: { id, status: existing.status },
      });
      if (deleted.count !== 1) {
        return { error: "مناقصه هم‌زمان تغییر کرده است؛ دوباره تلاش کنید", status: 409 as const };
      }

      await enqueueAuditOutbox(tx, {
        actorId: user.id,
        actorType: 'ADMIN',
        action: 'store.procurement.delete',
        entityType: 'ProcurementRequest',
        entityId: id,
        before: {
          title: existing.title,
          description: existing.description,
          quantity: existing.quantity,
          status: existing.status,
          supplierId: existing.supplierId,
        },
      });
      return { success: true as const };
    }, { isolationLevel: 'Serializable' });

    if ('error' in result) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status },
      );
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e?.code === 'P2034') {
      return NextResponse.json(
        { success: false, error: "مناقصه هم‌زمان تغییر کرده است؛ دوباره تلاش کنید" },
        { status: 409 },
      );
    }
    console.error("[store/procurement/[id] DELETE] error:", e);
    return NextResponse.json(
      { success: false, error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
