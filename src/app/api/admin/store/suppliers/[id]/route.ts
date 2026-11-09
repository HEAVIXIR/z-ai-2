import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { storeDb } from "@/lib/store-db";
import { checkCsrf } from "@/lib/csrf";
import { enqueueAuditOutbox } from "@/lib/store-audit-outbox";
import {
  getSupplier,
  SuppliersServiceError,
} from "@/lib/store-suppliers-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/suppliers/[id] — single supplier CRUD
   T2-W1-A — Store Gap Domain #3 (Suppliers)
   T-A-DEEP-STORE — Business logic extracted to
   src/lib/store-suppliers-service.ts; route handler stays thin.
   Audit logging remains in the route to preserve the exact
   audit JSON shape that existed pre-extraction.
   ============================================================ */

function serialize(s: any) {
  return {
    ...s,
    createdAt: s.createdAt?.toISOString?.() ?? null,
    updatedAt: s.updatedAt?.toISOString?.() ?? null,
  };
}

function toErrorResponse(e: unknown) {
  if (e instanceof SuppliersServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error("[store/suppliers/[id]] error:", err);
  return NextResponse.json(
    { success: false, error: err?.message ?? "Internal error" },
    { status: 500 },
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const s = await getSupplier(id);
    return NextResponse.json({ success: true, data: serialize(s) });
  } catch (e: any) {
    return toErrorResponse(e);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.manage');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.manage" }, { status: 403 });
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
      const existing = await tx.supplier.findUnique({ where: { id } });
      if (!existing) return { error: "تأمین‌کننده یافت نشد", status: 404 as const };

      const data: Record<string, unknown> = {};
      if (body.name !== undefined) {
        if (typeof body.name !== 'string' || !body.name.trim()) {
          return { error: "نام تأمین‌کننده الزامی است", status: 400 as const };
        }
        data.name = body.name.trim();
      }
      for (const field of ['nameFa', 'phone', 'email', 'address'] as const) {
        if (body[field] !== undefined) {
          if (body[field] !== null && typeof body[field] !== 'string') {
            return { error: `فیلد ${field} نامعتبر است`, status: 400 as const };
          }
          data[field] = body[field]?.trim() || null;
        }
      }
      if (body.active !== undefined) {
        if (typeof body.active !== 'boolean') {
          return { error: "وضعیت فعال بودن نامعتبر است", status: 400 as const };
        }
        data.active = body.active;
      }
      if (Object.keys(data).length === 0) {
        return { error: "هیچ تغییری برای ثبت ارسال نشده است", status: 400 as const };
      }

      const changed = await tx.supplier.updateMany({
        where: { id, updatedAt: existing.updatedAt },
        data: data as any,
      });
      if (changed.count !== 1) {
        return { error: "اطلاعات تأمین‌کننده هم‌زمان تغییر کرده است", status: 409 as const };
      }
      const supplier = await tx.supplier.findUnique({ where: { id } });
      if (!supplier) return { error: "تأمین‌کننده پس از ویرایش یافت نشد", status: 404 as const };

      await enqueueAuditOutbox(tx, {
        actorId: user.id,
        actorType: 'ADMIN',
        action: 'store.supplier.update',
        entityType: 'Supplier',
        entityId: id,
        before: {
          name: existing.name,
          nameFa: existing.nameFa,
          active: existing.active,
        },
        after: {
          name: supplier.name,
          nameFa: supplier.nameFa,
          active: supplier.active,
        },
      });
      return { data: supplier };
    }, { isolationLevel: 'Serializable' });

    if ('error' in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, data: serialize(result.data) });
  } catch (e: any) {
    if (e?.code === 'P2034') {
      return NextResponse.json({ success: false, error: "اطلاعات تأمین‌کننده هم‌زمان تغییر کرده است؛ دوباره تلاش کنید" }, { status: 409 });
    }
    return toErrorResponse(e);
  }
}


export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.manage');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.manage" }, { status: 403 });
  }
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }

  const { id } = await params;
  try {
    const result = await storeDb.$transaction(async (tx) => {
      const existing = await tx.supplier.findUnique({
        where: { id },
        include: { _count: { select: { procurements: true, purchaseOrders: true } } },
      });
      if (!existing) return { error: "تأمین‌کننده یافت نشد", status: 404 as const };
      if (existing._count.procurements > 0 || existing._count.purchaseOrders > 0) {
        return {
          error: "تأمین‌کننده به مناقصه یا سفارش خرید متصل است؛ ابتدا آن را غیرفعال کنید",
          status: 409 as const,
        };
      }

      const deleted = await tx.supplier.deleteMany({
        where: { id, updatedAt: existing.updatedAt },
      });
      if (deleted.count !== 1) {
        return { error: "تأمین‌کننده هم‌زمان تغییر کرده است", status: 409 as const };
      }

      await enqueueAuditOutbox(tx, {
        actorId: user.id,
        actorType: 'ADMIN',
        action: 'store.supplier.delete',
        entityType: 'Supplier',
        entityId: id,
        before: {
          name: existing.name,
          nameFa: existing.nameFa,
          active: existing.active,
        },
      });
      return { success: true as const };
    }, { isolationLevel: 'Serializable' });

    if ('error' in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e?.code === 'P2034') {
      return NextResponse.json({ success: false, error: "تأمین‌کننده هم‌زمان تغییر کرده است؛ دوباره تلاش کنید" }, { status: 409 });
    }
    return toErrorResponse(e);
  }
}
