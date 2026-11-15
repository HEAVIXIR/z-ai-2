import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { storeDb } from "@/lib/store-db";
import { checkCsrf } from "@/lib/csrf";
import { enqueueAuditOutbox } from "@/lib/store-audit-outbox";
import {
  listSuppliers,
  SuppliersServiceError,
} from "@/lib/store-suppliers-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/suppliers — HEAVIX supplier directory CRUD
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
  console.error("[store/suppliers] error:", err);
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
    await requirePermission(user.id, 'store.read');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.read" }, { status: 403 });
  }
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() || undefined;
    const activeParam = url.searchParams.get("active");
    const active =
      activeParam === "true" ? true
      : activeParam === "false" ? false
      : undefined;

    const result = await listSuppliers({ q, active });
    return NextResponse.json({
      success: true,
      data: result.items.map(serialize),
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
    await requirePermission(user.id, 'store.manage');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.manage" }, { status: 403 });
  }
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }

  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "بدنه درخواست نامعتبر است" }, { status: 400 });
    }
    const { name, nameFa, phone, email, address, active } = body;
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ success: false, error: "نام تأمین‌کننده الزامی است" }, { status: 400 });
    }
    for (const [field, value] of Object.entries({ nameFa, phone, email, address })) {
      if (value !== undefined && value !== null && typeof value !== 'string') {
        return NextResponse.json({ success: false, error: `فیلد ${field} نامعتبر است` }, { status: 400 });
      }
    }
    if (active !== undefined && typeof active !== 'boolean') {
      return NextResponse.json({ success: false, error: "وضعیت فعال بودن نامعتبر است" }, { status: 400 });
    }

    const result = await storeDb.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({
        data: {
          name: name.trim(),
          nameFa: nameFa?.trim() || null,
          phone: phone?.trim() || null,
          email: email?.trim() || null,
          address: address?.trim() || null,
          active: typeof active === 'boolean' ? active : true,
        },
      });
      await enqueueAuditOutbox(tx, {
        actorId: user.id,
        actorType: 'ADMIN',
        action: 'store.supplier.create',
        entityType: 'Supplier',
        entityId: supplier.id,
        after: { id: supplier.id, name: supplier.name, nameFa: supplier.nameFa, active: supplier.active },
      });
      return supplier;
    }, { isolationLevel: 'Serializable' });

    return NextResponse.json({ success: true, data: serialize(result) });
  } catch (e: any) {
    if (e?.code === 'P2034') {
      return NextResponse.json({ success: false, error: "اطلاعات تأمین‌کننده هم‌زمان تغییر کرده است؛ دوباره تلاش کنید" }, { status: 409 });
    }
    return toErrorResponse(e);
  }
}
