import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/auth-helpers/require-admin";
import { checkCsrf } from "@/lib/csrf";

/* ============================================================
   /api/taxonomy/brands/[id]/models
   GET   (public) → list brand's models
   POST  (admin)  → create model under brand
   ============================================================ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const categoryId = url.searchParams.get("categoryId");

  const where = {
    brandId: id,
    status: "ACTIVE",
    ...(categoryId
      ? { OR: [{ categoryId }, { modelCategories: { some: { categoryId } } }] }
      : {}),
  };

  const models = await db.productModel.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { listings: true, generations: true } },
      category: { select: { name: true, icon: true } },
    },
  });

  return NextResponse.json({ success: true, data: models });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const __auth = await requireAdminPermission("taxonomy.write");
  if (__auth.error) return __auth.error;
  if (!checkCsrf(req)) return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "نام مدل الزامی است" }, { status: 400 });

    const brand = await db.brand.findUnique({
      where: { id },
      select: { id: true, active: true, status: true },
    });
    if (!brand || !brand.active || brand.status !== "ACTIVE") {
      return NextResponse.json({ error: "برند معتبر یا فعال نیست." }, { status: 400 });
    }

    const categoryId = String(body.categoryId ?? "").trim();
    if (!categoryId) {
      return NextResponse.json({ error: "انتخاب دسته‌بندی برای مدل الزامی است." }, { status: 400 });
    }
    const category = await db.category.findFirst({
      where: { id: categoryId, active: true, layer: "CATALOG" },
      select: { id: true },
    });
    if (!category) {
      return NextResponse.json({ error: "دسته‌بندی معتبر یا فعال نیست." }, { status: 400 });
    }

    const slugify = (value: string) =>
      value.toString().trim().toLowerCase()
        .replace(/[^\w\u0600-\u06FF-]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const baseSlug = slugify(body.slug || body.nameEn || name);
    if (!baseSlug) return NextResponse.json({ error: "شناسه مدل قابل ساخت نیست." }, { status: 400 });

    let slug = baseSlug;
    let suffix = 2;
    while (await db.productModel.findFirst({ where: { brandId: id, slug }, select: { id: true } })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    const model = await db.$transaction(async (tx) => {
      const created = await tx.productModel.create({
        data: {
          brandId: id,
          name,
          nameEn: body.nameEn ? String(body.nameEn).trim() : null,
          slug,
          description: body.description ? String(body.description).trim() : null,
          categoryId,
          status: "ACTIVE",
          sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
        },
        include: { category: { select: { id: true, name: true, slug: true } } },
      });

      // A model in a category implies the brand/category association exists.
      // Preserve an existing admin-disabled link rather than silently reactivating it.
      await tx.brandCategory.upsert({
        where: { brandId_categoryId: { brandId: id, categoryId } },
        create: { brandId: id, categoryId },
        update: {},
      });
      return created;
    });
    return NextResponse.json({ success: true, data: model }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "این مدل قبلاً برای برند ثبت شده است." }, { status: 409 });
    }
    return NextResponse.json({ error: error?.message ?? "ثبت مدل ناموفق بود." }, { status: 500 });
  }
}
