import { HOMEPAGE_CACHE_TAGS } from '@/lib/homepage-cache-tags';
import { revalidateTag } from 'next/cache';
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/auth-helpers/require-admin";
import { uniqueSlug } from "@/lib/api-helpers";
import { checkCsrf } from "@/lib/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

const VALID_LAYERS = ["CATALOG", "MARKETPLACE", "SERVICE", "FALLBACK"];

/* GET /api/taxonomy/categories/[id] — public category detail with children.
   Used by the listing wizard's cascading picker to resolve grandchildren. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const category = await db.category.findUnique({
      where: { id },
      include: {
        children: {
          where: { active: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true, nameEn: true, slug: true, icon: true, level: true },
        },
        parent: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!category) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ category });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* PUT /api/taxonomy/categories/[id] — admin update.
   Now supports: layer, taxPath, appIndustries[] (replace strategy).
*/
export async function PUT(req: Request, { params }: Params) {
  const __auth = await requireAdminPermission("taxonomy.write");
  if (__auth.error) return __auth.error;
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const existing = await db.category.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: any = {};
    const allowed = [
      "name", "nameEn", "icon", "imageUrl", "description", "domain",
      "featured", "active", "showOnHome", "sortOrder",
    ];
    for (const key of allowed) {
      if (!(key in body)) continue;
      if (["featured", "active", "showOnHome"].includes(key)) {
        data[key] = Boolean(body[key]);
      } else if (key === "sortOrder") {
        const value = Number(body[key]);
        if (!Number.isInteger(value)) {
          return NextResponse.json({ error: "sortOrder must be an integer" }, { status: 400 });
        }
        data[key] = value;
      } else {
        data[key] = body[key] == null ? null : String(body[key]).trim();
      }
    }

    const validLayers = ["CATALOG", "MARKETPLACE", "SERVICE", "FALLBACK"];
    const nextLayer = "layer" in body
      ? String(body.layer ?? "").toUpperCase()
      : existing.layer;
    if (!validLayers.includes(nextLayer)) {
      return NextResponse.json({ error: "Invalid category layer" }, { status: 400 });
    }
    if ("layer" in body) data.layer = nextLayer;
    if ("taxPath" in body) data.taxPath = body.taxPath == null ? null : String(body.taxPath).trim() || null;

    if ("parentId" in body) {
      const parentId = body.parentId ? String(body.parentId) : null;
      if (parentId === id) {
        return NextResponse.json({ error: "A category cannot be its own parent." }, { status: 400 });
      }
      if (parentId) {
        let parent = await db.category.findUnique({
          where: { id: parentId },
          select: { id: true, parentId: true, level: true, layer: true },
        });
        if (!parent) return NextResponse.json({ error: "دسته والد یافت نشد." }, { status: 400 });
        if (parent.layer !== nextLayer) {
          return NextResponse.json({ error: "لایه دسته باید با دسته والد یکسان باشد." }, { status: 400 });
        }
        // Reject moving a category beneath one of its own descendants.
        let cursor: typeof parent | null = parent;
        while (cursor) {
          if (cursor.id === id) {
            return NextResponse.json({ error: "انتقال دسته به زیرمجموعه خودش مجاز نیست." }, { status: 400 });
          }
          cursor = cursor.parentId
            ? await db.category.findUnique({
                where: { id: cursor.parentId },
                select: { id: true, parentId: true, level: true, layer: true },
              })
            : null;
        }
        data.parentId = parentId;
        data.level = (parent.level ?? 0) + 1;
      } else {
        data.parentId = null;
        data.level = 0;
      }
    } else if ("layer" in body && existing.parentId) {
      const parent = await db.category.findUnique({
        where: { id: existing.parentId },
        select: { layer: true },
      });
      if (parent && parent.layer !== nextLayer) {
        return NextResponse.json({ error: "لایه دسته باید با دسته والد یکسان باشد." }, { status: 400 });
      }
    }

    let industryIds: string[] | null = null;
    if (Array.isArray(body.appIndustries)) {
      const keysOrIds = [...new Set(
        (body.appIndustries as unknown[]).map((value) => String(value).trim()).filter(Boolean),
      )];
      const industries = keysOrIds.length
        ? await db.applicationIndustry.findMany({
            where: { OR: [{ key: { in: keysOrIds } }, { id: { in: keysOrIds } }] },
            select: { id: true, key: true },
          })
        : [];
      const resolved = keysOrIds.map((value) =>
        industries.find((industry) => industry.id === value || industry.key === value),
      );
      const missing = keysOrIds.filter((_, index) => !resolved[index]);
      if (missing.length) {
        return NextResponse.json(
          { error: `صنعت‌های ناشناخته: ${missing.join(", ")}` },
          { status: 400 },
        );
      }
      industryIds = [...new Set(resolved.filter(Boolean).map((industry: any) => industry.id))];
    }

    const category = await db.$transaction(async (tx) => {
      await tx.category.update({ where: { id }, data });
      if (industryIds !== null) {
        await tx.categoryApplicationIndustry.deleteMany({ where: { categoryId: id } });
        if (industryIds.length) {
          await tx.categoryApplicationIndustry.createMany({
            data: industryIds.map((applicationIndustryId) => ({
              categoryId: id,
              applicationIndustryId,
            })),
          });
        }
      }
      return tx.category.findUnique({
        where: { id },
        include: {
          appIndustries: {
            include: {
              applicationIndustry: {
                select: { id: true, key: true, nameFa: true, nameEn: true, icon: true },
              },
            },
          },
        },
      });
    });

    try { revalidateTag(HOMEPAGE_CACHE_TAGS.categories, "default"); }
    catch (error) { console.error("[categories/id] revalidateTag failed:", error); }

    return NextResponse.json({
      ok: true,
      category: {
        ...category,
        appIndustries: category?.appIndustries.map((link) => link.applicationIndustry) ?? [],
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Server error" },
      { status: error?.code === "P2002" ? 409 : 500 },
    );
  }
}

/* DELETE /api/taxonomy/categories/[id] */
export async function DELETE(req: Request, { params }: Params) {
  const __auth = await requireAdminPermission("taxonomy.write");
  if (__auth.error) return __auth.error;
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const category = await db.category.findUnique({ where: { id }, select: { id: true } });
    if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [children, listings, models, brandLinks, attributeLinks] = await Promise.all([
      db.category.count({ where: { parentId: id } }),
      db.listing.count({ where: { categoryId: id } }),
      db.productModel.count({ where: { categoryId: id } }),
      db.brandCategory.count({ where: { categoryId: id } }),
      db.categoryAttribute.count({ where: { categoryId: id } }),
    ]);
    if (children || listings || models || brandLinks || attributeLinks) {
      return NextResponse.json(
        {
          error: "این دسته هنوز وابستگی دارد؛ برای حفظ آگهی‌ها، مدل‌ها و فرم‌های فنی آن را غیرفعال کنید، نه حذف.",
          dependencies: { children, listings, models, brandLinks, attributeLinks },
        },
        { status: 409 },
      );
    }

    await db.category.delete({ where: { id } });
    try { revalidateTag(HOMEPAGE_CACHE_TAGS.categories, "default"); }
    catch (error) { console.error("[categories/id] revalidateTag failed:", error); }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Server error" },
      { status: error?.code === "P2003" ? 409 : 500 },
    );
  }
}
