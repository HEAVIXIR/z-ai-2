import { HOMEPAGE_CACHE_TAGS } from '@/lib/homepage-cache-tags';
import { revalidateTag } from 'next/cache';
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/auth-helpers/require-admin";
import { uniqueSlug } from "@/lib/api-helpers";
import { checkCsrf } from "@/lib/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/taxonomy/categories
   Query params (all optional, public):
     - layer=CATALOG|MARKETPLACE|SERVICE|FALLBACK  → filter by layer
     - root=true                                   → only level-0 categories
   Response: { categories: tree, flat: allRows }
   Each node includes: layer, taxPath, appIndustries[]
*/
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const layer = searchParams.get("layer");
    const rootOnly = searchParams.get("root") === "true";

    const where: any = { active: true };
    if (layer) where.layer = String(layer).toUpperCase();
    if (rootOnly) where.level = 0;

    const all = await db.category.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { listings: true, children: true } },
        appIndustries: {
          include: {
            applicationIndustry: {
              select: { id: true, key: true, nameFa: true, nameEn: true, icon: true },
            },
          },
        },
      },
    });

    // Build tree
    const map = new Map<string, any>();
    all.forEach((c) => {
      map.set(c.id, {
        ...c,
        appIndustries: c.appIndustries.map((ai) => ai.applicationIndustry),
        children: [] as any[],
      });
    });
    const roots: any[] = [];
    all.forEach((c) => {
      const node = map.get(c.id)!;
      if (c.parentId && map.has(c.parentId)) {
        map.get(c.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    return NextResponse.json({
      categories: roots,
      flat: all.map((c) => ({
        ...c,
        appIndustries: c.appIndustries.map((ai) => ai.applicationIndustry),
      })),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* POST /api/taxonomy/categories
   Create a new category (admin). Accepts all standard fields plus:
     - layer (CATALOG | MARKETPLACE | SERVICE | FALLBACK, default CATALOG)
     - taxPath (string, materialized path)
     - appIndustries: string[]  → array of ApplicationIndustry keys or IDs
   Returns { ok: true, category }.
*/
export async function POST(req: Request) {
  const __auth = await requireAdminPermission("taxonomy.write");
  if (__auth.error) return __auth.error;
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const validLayers = ["CATALOG", "MARKETPLACE", "SERVICE", "FALLBACK"];
    const layer = body.layer == null || body.layer === ""
      ? "CATALOG"
      : String(body.layer).toUpperCase();
    if (!validLayers.includes(layer)) {
      return NextResponse.json({ error: "Invalid category layer" }, { status: 400 });
    }

    let level = 0;
    let parentId: string | null = null;
    if (body.parentId) {
      parentId = String(body.parentId);
      const parent = await db.category.findUnique({
        where: { id: parentId },
        select: { id: true, level: true, layer: true },
      });
      if (!parent) return NextResponse.json({ error: "دسته والد یافت نشد." }, { status: 400 });
      if (parent.layer !== layer) {
        return NextResponse.json({ error: "لایه دسته باید با دسته والد یکسان باشد." }, { status: 400 });
      }
      level = (parent.level ?? 0) + 1;
    }

    const industryValues: unknown[] = Array.isArray(body.appIndustries) ? body.appIndustries : [];
    const industryKeys: string[] = Array.from(new Set(
      industryValues.map((value) => String(value).trim()).filter((value) => value.length > 0),
    ));
    const industries = industryKeys.length
      ? await db.applicationIndustry.findMany({
          where: { OR: [{ key: { in: industryKeys } }, { id: { in: industryKeys } }] },
          select: { id: true, key: true },
        })
      : [];
    const resolvedIndustries = industryKeys.map((value) =>
      industries.find((industry) => industry.id === value || industry.key === value),
    );
    const missingIndustries = industryKeys.filter((_, index) => !resolvedIndustries[index]);
    if (missingIndustries.length) {
      return NextResponse.json(
        { error: `صنعت‌های ناشناخته: ${missingIndustries.join(", ")}` },
        { status: 400 },
      );
    }
    const applicationIndustryIds = [...new Set(
      resolvedIndustries.filter(Boolean).map((industry: any) => industry.id),
    )];

    const slug = body.slug
      ? await uniqueSlug(db.category, String(body.slug).trim())
      : await uniqueSlug(db.category, name);
    const sortOrder = body.sortOrder == null ? 0 : Number(body.sortOrder);
    if (!Number.isInteger(sortOrder)) {
      return NextResponse.json({ error: "sortOrder must be an integer" }, { status: 400 });
    }

    const category = await db.category.create({
      data: {
        name,
        nameEn: body.nameEn == null ? null : String(body.nameEn).trim() || null,
        slug,
        icon: body.icon == null ? null : String(body.icon).trim() || null,
        imageUrl: body.imageUrl == null ? null : String(body.imageUrl).trim() || null,
        description: body.description == null ? null : String(body.description).trim() || null,
        domain: body.domain == null ? null : String(body.domain).trim() || null,
        parentId,
        layer,
        taxPath: body.taxPath == null ? null : String(body.taxPath).trim() || null,
        featured: Boolean(body.featured),
        active: body.active !== false,
        showOnHome: body.showOnHome !== false,
        sortOrder,
        level,
        ...(applicationIndustryIds.length
          ? {
              appIndustries: {
                create: applicationIndustryIds.map((applicationIndustryId) => ({
                  applicationIndustryId,
                })),
              },
            }
          : {}),
      },
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

    try { revalidateTag(HOMEPAGE_CACHE_TAGS.categories, "default"); }
    catch (error) { console.error("[taxonomy/categories] revalidateTag failed:", error); }

    return NextResponse.json({
      ok: true,
      category: {
        ...category,
        appIndustries: category.appIndustries.map((link) => link.applicationIndustry),
      },
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Server error" },
      { status: error?.code === "P2002" ? 409 : 500 },
    );
  }
}
