import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/parts — HEAVIX parts list + create
   STEP STORE-2A: Permission gate wired — GET requires store.read,
   POST requires store.manage (mirrors 6D pricing/observations pattern).
   ============================================================ */

function serialize(p: any) {
  return {
    ...p,
    images: (() => {
      try { return JSON.parse(p.images || "[]"); } catch { return []; }
    })(),
    compatibleCars: (() => {
      try { return JSON.parse(p.compatibleCars || "[]"); } catch { return []; }
    })(),
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
    await requirePermission(user.id, 'store.read');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.read" }, { status: 403 });
  }
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() || undefined;
    const categoryId = url.searchParams.get("categoryId") || undefined;
    const brandId = url.searchParams.get("brandId") || undefined;
    const active = url.searchParams.get("active");
    const featured = url.searchParams.get("featured");
    const lowStock = url.searchParams.get("lowStock") === "1";
    const limit = Math.min(200, Number(url.searchParams.get("limit")) || 100);

    const where: any = {};
    if (q) where.OR = [{ name: { contains: q } }, { nameFa: { contains: q } }, { sku: { contains: q } }];
    if (categoryId) where.categoryId = categoryId;
    if (brandId) where.brandId = brandId;
    if (active === "1") where.active = true;
    if (active === "0") where.active = false;
    if (featured === "1") where.featured = true;
    if (lowStock) where.stock = { lte: 5 };

    const [items, total] = await Promise.all([
      storeDb.part.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          brand: { select: { id: true, name: true, slug: true } },
        },
      }),
      storeDb.part.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: items.map(serialize),
      total,
    });
  } catch (e: any) {
    console.error("[store/parts GET] error:", e);
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
    await requirePermission(user.id, 'store.manage');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.manage" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { name, nameFa, sku, categoryId, brandId, description, priceUsd, oldPriceUsd, contactForPrice, stock, lowStockThreshold, images, compatibleCars, sourceUrl, active, featured } = body;

    if (!name || !sku || !categoryId || priceUsd === undefined) {
      return NextResponse.json(
        { success: false, error: "نام، SKU، دسته‌بندی و قیمت الزامی هستند" },
        { status: 400 },
      );
    }

    const existing = await storeDb.part.findUnique({ where: { sku } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "SKU تکراری است" },
        { status: 400 },
      );
    }

    const part = await storeDb.part.create({
      data: {
        name,
        nameFa: nameFa || null,
        sku,
        categoryId,
        brandId: brandId || null,
        description: description || null,
        priceUsd: Number(priceUsd) || 0,
        oldPriceUsd: oldPriceUsd ? Number(oldPriceUsd) : null,
        contactForPrice: contactForPrice === true,
        stock: Number(stock) || 0,
        lowStockThreshold: Number(lowStockThreshold) || 5,
        images: JSON.stringify(images || []),
        compatibleCars: JSON.stringify(compatibleCars || []),
        sourceUrl: sourceUrl || null,
        active: active !== false,
        featured: featured === true,
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        brand: { select: { id: true, name: true, slug: true } },
      },
    });

    await logAudit({
      actorId: user.id,
      actorType: 'ADMIN',
      action: 'store.part.create',
      entityType: 'Part',
      entityId: part.id,
      after: {
        name: part.name,
        sku: part.sku,
        categoryId: part.categoryId,
        brandId: part.brandId,
        priceUsd: part.priceUsd,
        stock: part.stock,
        active: part.active,
        featured: part.featured,
      },
    });

    return NextResponse.json({ success: true, data: serialize(part) });
  } catch (e: any) {
    console.error("[store/parts POST] error:", e);
    return NextResponse.json(
      { success: false, error: e?.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
