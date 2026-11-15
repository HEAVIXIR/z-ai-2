import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/auth-helpers/require-admin";
import { checkCsrf } from "@/lib/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Args {
  params: Promise<{ id: string }>;
}

/* PATCH /api/transaction-types/[id] — admin update. */
export async function PATCH(req: Request, { params }: Args) {
  const auth = await requireAdminPermission("taxonomy.write");
  if (auth.error) return auth.error;
  if (!checkCsrf(req)) return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const existing = await db.transactionType.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "نوع معامله یافت نشد." }, { status: 404 });

    const data: Record<string, unknown> = {};
    if ("key" in body) {
      const key = String(body.key ?? "").trim().toUpperCase();
      if (!key) return NextResponse.json({ error: "کلید نوع معامله الزامی است." }, { status: 400 });
      const duplicate = await db.transactionType.findFirst({ where: { key, NOT: { id } }, select: { id: true } });
      if (duplicate) return NextResponse.json({ error: "این کلید قبلاً استفاده شده است." }, { status: 409 });
      data.key = key;
    }
    for (const field of ["nameFa", "nameEn", "description", "icon"] as const) {
      if (field in body) {
        const value = body[field];
        if (field === "nameFa" && !String(value ?? "").trim()) {
          return NextResponse.json({ error: "عنوان فارسی الزامی است." }, { status: 400 });
        }
        data[field] = value == null || value === "" ? null : String(value).trim();
      }
    }
    if ("active" in body) data.active = Boolean(body.active);
    if ("sortOrder" in body) {
      const sortOrder = Number(body.sortOrder);
      if (!Number.isInteger(sortOrder)) {
        return NextResponse.json({ error: "ترتیب نمایش باید عدد صحیح باشد." }, { status: 400 });
      }
      data.sortOrder = sortOrder;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "هیچ تغییری برای ذخیره ارسال نشده است." }, { status: 400 });
    }

    const type = await db.transactionType.update({ where: { id }, data });
    return NextResponse.json({ ok: true, type });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "این کلید قبلاً استفاده شده است." }, { status: 409 });
    return NextResponse.json({ error: error?.message ?? "به‌روزرسانی نوع معامله ناموفق بود." }, { status: 500 });
  }
}

/* DELETE /api/transaction-types/[id] — delete only when no listing uses it. */
export async function DELETE(req: Request, { params }: Args) {
  const auth = await requireAdminPermission("taxonomy.write");
  if (auth.error) return auth.error;
  if (!checkCsrf(req)) return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });

  try {
    const { id } = await params;
    const existing = await db.transactionType.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "نوع معامله یافت نشد." }, { status: 404 });

    const listingCount = await db.listing.count({ where: { transactionTypeId: id } });
    if (listingCount > 0) {
      return NextResponse.json(
        { error: `این نوع معامله به ${listingCount} آگهی متصل است؛ برای حفظ سوابق آن را غیرفعال کنید.` },
        { status: 409 },
      );
    }

    await db.transactionType.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "حذف نوع معامله ناموفق بود." }, { status: 500 });
  }
}
