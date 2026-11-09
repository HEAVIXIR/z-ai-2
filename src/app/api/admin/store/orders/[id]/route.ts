import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { enqueueAuditOutbox } from "@/lib/store-audit-outbox";
import {
  getOrderDetail,
  CommerceServiceError,
} from "@/lib/commerce-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/orders/[id] — order detail + status update
   PHASE-P8-TRANSACTION — GET delegated to commerce-service
   (getOrderDetail, richer read with customer + mechanic + payments
   + shipment context). PATCH stays inline for the metadata fields
   (status / notes / shippingAddress / couponCode / mechanicId) and
   imports commerce-service so future deepening (status-state-machine
   via the service) is one method-call away.
   ============================================================ */

const ALLOWED_STATUSES = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED"];

function toErrorResponse(e: unknown) {
  if (e instanceof CommerceServiceError) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: e.status },
    );
  }
  const err = e as Error;
  console.error("[store/orders/[id]] error:", err);
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
    // Delegate the rich read to the commerce-service so the read
    // shape + audit context is owned by the service (same pattern
    // as the procurement/shipments detail routes after extraction).
    const order = await getOrderDetail(id);
    return NextResponse.json({ success: true, data: order });
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

  const { id } = await params;
  try {
    const declaredLength = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > 16 * 1024) {
      return NextResponse.json({ success: false, error: "بدنه درخواست بیش از حد بزرگ است" }, { status: 413 });
    }
    const raw = await req.text();
    if (raw.length > 16 * 1024) {
      return NextResponse.json({ success: false, error: "بدنه درخواست بیش از حد بزرگ است" }, { status: 413 });
    }

    let body: unknown;
    try {
      body = raw.trim() ? JSON.parse(raw) : null;
    } catch {
      return NextResponse.json({ success: false, error: "JSON درخواست معتبر نیست" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "بدنه درخواست باید یک شیء معتبر باشد" }, { status: 400 });
    }

    const input = body as Record<string, unknown>;
    const allowedFields = new Set(["status", "notes", "shippingAddress", "couponCode", "mechanicId"]);
    for (const key of Object.keys(input)) {
      if (!allowedFields.has(key)) {
        // In particular, paymentStatus is intentionally not writable here.
        // It is derived from the approved payment ledger only.
        return NextResponse.json({ success: false, error: `فیلد غیرمجاز: ${key}` }, { status: 400 });
      }
    }
    if (Object.keys(input).length === 0) {
      return NextResponse.json({ success: false, error: "حداقل یک فیلد برای به‌روزرسانی الزامی است" }, { status: 400 });
    }

    const data: any = {};
    if (input.status !== undefined) {
      if (typeof input.status !== "string" || !ALLOWED_STATUSES.includes(input.status)) {
        return NextResponse.json({ success: false, error: "وضعیت سفارش نامعتبر است" }, { status: 400 });
      }
      data.status = input.status;
    }
    if (input.notes !== undefined) {
      if (input.notes !== null && (typeof input.notes !== "string" || input.notes.length > 5000)) {
        return NextResponse.json({ success: false, error: "یادداشت سفارش نامعتبر است" }, { status: 400 });
      }
      data.notes = typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : null;
    }
    if (input.shippingAddress !== undefined) {
      if (input.shippingAddress !== null && (typeof input.shippingAddress !== "string" || input.shippingAddress.length > 2000)) {
        return NextResponse.json({ success: false, error: "نشانی ارسال نامعتبر است" }, { status: 400 });
      }
      data.shippingAddress = typeof input.shippingAddress === "string" && input.shippingAddress.trim()
        ? input.shippingAddress.trim()
        : null;
    }
    if (input.couponCode !== undefined) {
      if (input.couponCode !== null && (typeof input.couponCode !== "string" || input.couponCode.length > 100)) {
        return NextResponse.json({ success: false, error: "کد تخفیف نامعتبر است" }, { status: 400 });
      }
      data.couponCode = typeof input.couponCode === "string" && input.couponCode.trim()
        ? input.couponCode.trim()
        : null;
    }
    if (input.mechanicId !== undefined) {
      if (input.mechanicId !== null && (typeof input.mechanicId !== "string" || input.mechanicId.length > 128)) {
        return NextResponse.json({ success: false, error: "شناسه مکانیک نامعتبر است" }, { status: 400 });
      }
      data.mechanicId = typeof input.mechanicId === "string" && input.mechanicId.trim()
        ? input.mechanicId.trim()
        : null;
    }

    const order = await storeDb.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({ where: { id } });
      if (!existing) return null;

      if (data.mechanicId) {
        const mechanic = await tx.mechanic.findUnique({
          where: { id: data.mechanicId as string },
          select: { id: true },
        });
        if (!mechanic) {
          throw new CommerceServiceError(404, "مکانیک انتخاب‌شده یافت نشد");
        }
      }

      const changed = await tx.order.updateMany({
        where: { id, status: existing.status },
        data,
      });
      if (changed.count !== 1) {
        throw new CommerceServiceError(409, "سفارش هم‌زمان تغییر کرده است؛ صفحه را تازه‌سازی کنید");
      }

      const updated = await tx.order.findUnique({
        where: { id },
        include: {
          customer: { select: { id: true, name: true, family: true, phone: true } },
          mechanic: { select: { id: true, name: true, family: true, shopName: true } },
          _count: { select: { items: true, payments: true } },
        },
      });
      if (!updated) {
        throw new CommerceServiceError(404, "سفارش پس از به‌روزرسانی یافت نشد");
      }

      await enqueueAuditOutbox(tx, {
        actorId: user.id,
        actorType: "ADMIN",
        action: "store.order.update",
        entityType: "Order",
        entityId: updated.id,
        before: {
          status: existing.status,
          paymentStatus: existing.paymentStatus,
          notes: existing.notes,
          shippingAddress: existing.shippingAddress,
          couponCode: existing.couponCode,
          mechanicId: existing.mechanicId,
        },
        after: {
          status: updated.status,
          paymentStatus: updated.paymentStatus,
          notes: updated.notes,
          shippingAddress: updated.shippingAddress,
          couponCode: updated.couponCode,
          mechanicId: updated.mechanicId,
        },
      });
      return updated;
    }, { isolationLevel: "Serializable" });

    if (!order) {
      return NextResponse.json({ success: false, error: "سفارش یافت نشد" }, { status: 404 });
    }

    const refreshed = await getOrderDetail(id).catch(() => null);
    return NextResponse.json({
      success: true,
      data: refreshed ?? {
        ...order,
        subtotalUsd: String(order.subtotalUsd),
        shippingUsd: String(order.shippingUsd),
        discountIrr: String(order.discountIrr),
        totalUsd: String(order.totalUsd),
        totalIrr: String(order.totalIrr),
        currencyRateAtOrder: String(order.currencyRateAtOrder),
        marginPercentAtOrder: String(order.marginPercentAtOrder),
        createdAt: order.createdAt?.toISOString?.() ?? null,
        updatedAt: order.updatedAt?.toISOString?.() ?? null,
      },
    });
  } catch (e: any) {
    if (e?.code === "P2034") {
      return NextResponse.json({ success: false, error: "سفارش هم‌زمان تغییر کرده است؛ صفحه را تازه‌سازی کنید" }, { status: 409 });
    }
    if (e instanceof CommerceServiceError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    }
    console.error("[store/orders PATCH] error:", e);
    return NextResponse.json({ success: false, error: "خطای داخلی سرور" }, { status: 500 });
  }
}
