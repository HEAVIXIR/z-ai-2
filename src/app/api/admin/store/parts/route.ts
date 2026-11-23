import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { storeDb } from "@/lib/store-db";
import { requirePermission } from "@/lib/authorization";
import { checkCsrf } from "@/lib/csrf";
import { logAudit } from "@/lib/audit";
import { readBoundedJson } from "@/lib/read-bounded-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PART_CREATE_BODY_BYTES = 512 * 1024;
const MAX_PART_STOCK = 1_000_000;

function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return undefined;
  return normalized;
}

function boundedNumber(value: unknown, options: { optional?: boolean; integer?: boolean } = {}): number | null | undefined {
  if (value === undefined || value === null || value === "") return options.optional ? null : undefined;
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && !value.trim()) return options.optional ? null : undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  if (options.integer && !Number.isInteger(parsed)) return undefined;
  return parsed;
}

function boundedStringArray(value: unknown, maxItems: number, maxLength: number): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const normalized = value.map((item) => typeof item === "string" ? item.trim() : "");
  if (normalized.some((item) => !item || item.length > maxLength)) return null;
  return normalized;
}

function safeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

/* ============================================================
   /api/admin/store/parts — HEAVIX parts list + create
   Manual creation is a first-class zero-AI path. It must not
   require a scraper, provider credential, quota reservation or
   source URL. Store catalog writes remain permissioned/audited.
   ============================================================ */

function serialize(p: any) {
  return {
    id: p.id,
    name: p.name,
    nameFa: p.nameFa,
    sku: p.sku,
    categoryId: p.categoryId,
    brandId: p.brandId,
    description: p.description,
    priceUsd: p.priceUsd,
    oldPriceUsd: p.oldPriceUsd,
    contactForPrice: p.contactForPrice,
    stock: p.stock,
    lowStockThreshold: p.lowStockThreshold,
    images: (() => {
      try { return JSON.parse(p.images || "[]"); } catch { return []; }
    })(),
    compatibleCars: (() => {
      try { return JSON.parse(p.compatibleCars || "[]"); } catch { return []; }
    })(),
    sourceUrl: p.sourceUrl,
    active: p.active,
    featured: p.featured,
    views: p.views,
    soldCount: p.soldCount,
    createdAt: p.createdAt?.toISOString?.() ?? null,
    updatedAt: p.updatedAt?.toISOString?.() ?? null,
    ...(p.category
      ? { category: { id: p.category.id, name: p.category.name, slug: p.category.slug } }
      : {}),
    ...(p.brand
      ? { brand: { id: p.brand.id, name: p.brand.name, slug: p.brand.slug } }
      : {}),
  };
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, "store.read");
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
  } catch (e) {
    console.error("[store/parts GET] error:", e);
    return NextResponse.json(
      { success: false, error: "بارگذاری قطعات ناموفق بود." },
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
    await requirePermission(user.id, "store.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.manage" }, { status: 403 });
  }
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }

  const parsed = await readBoundedJson<Record<string, unknown>>(req, MAX_PART_CREATE_BODY_BYTES);
  if (!parsed.ok) {
    return NextResponse.json({ success: false, error: parsed.error }, { status: parsed.status });
  }
  const body = parsed.value;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ success: false, error: "بدنه درخواست معتبر نیست." }, { status: 400 });
  }

  const name = optionalText(body.name, 180);
  const nameFa = optionalText(body.nameFa, 180);
  const sku = optionalText(body.sku, 100);
  const categoryId = optionalText(body.categoryId, 128);
  const brandId = optionalText(body.brandId, 128);
  const description = optionalText(body.description, 5000);
  const sourceUrl = optionalText(body.sourceUrl, 2000);
  const contactForPrice = body.contactForPrice === true;
  const priceUsd = boundedNumber(body.priceUsd, { optional: contactForPrice });
  const oldPriceUsd = boundedNumber(body.oldPriceUsd, { optional: true });
  const stock = boundedNumber(body.stock, { optional: true, integer: true }) ?? 0;
  const lowStockThreshold = boundedNumber(body.lowStockThreshold, { optional: true, integer: true }) ?? 5;
  const images = boundedStringArray(body.images, 20, 2000);
  const compatibleCars = boundedStringArray(body.compatibleCars, 100, 160);
  const active = body.active === undefined ? true : body.active;
  const featured = body.featured === undefined ? false : body.featured;

  if (!name || !sku || !categoryId) {
    return NextResponse.json({ success: false, error: "نام، SKU و دسته‌بندی الزامی هستند." }, { status: 400 });
  }
  if (nameFa === undefined || description === undefined || sourceUrl === undefined) {
    return NextResponse.json({ success: false, error: "یکی از فیلدهای متنی نامعتبر یا بیش از حد مجاز است." }, { status: 400 });
  }
  if (body.contactForPrice !== undefined && typeof body.contactForPrice !== "boolean") {
    return NextResponse.json({ success: false, error: "وضعیت قیمت نامعتبر است." }, { status: 400 });
  }
  if (priceUsd === undefined || oldPriceUsd === undefined || stock === undefined || lowStockThreshold === undefined) {
    return NextResponse.json({ success: false, error: "قیمت یا موجودی باید عدد معتبر و غیرمنفی باشد." }, { status: 400 });
  }
  if (stock > MAX_PART_STOCK || lowStockThreshold > MAX_PART_STOCK) {
    return NextResponse.json({ success: false, error: "مقدار موجودی از حد مجاز بیشتر است." }, { status: 400 });
  }
  if (typeof active !== "boolean" || typeof featured !== "boolean") {
    return NextResponse.json({ success: false, error: "وضعیت فعال یا ویژه نامعتبر است." }, { status: 400 });
  }
  if (!images || !compatibleCars) {
    return NextResponse.json({ success: false, error: "فهرست تصاویر یا خودروهای سازگار نامعتبر است." }, { status: 400 });
  }
  if (sourceUrl && !safeHttpUrl(sourceUrl)) {
    return NextResponse.json({ success: false, error: "آدرس منبع باید یک URL معتبر HTTP یا HTTPS باشد." }, { status: 400 });
  }

  try {
    const [category, brand] = await Promise.all([
      storeDb.category.findUnique({ where: { id: categoryId }, select: { id: true, name: true, slug: true } }),
      brandId
        ? storeDb.brand.findFirst({ where: { id: brandId, active: true }, select: { id: true } })
        : Promise.resolve(null),
    ]);
    if (!category) {
      return NextResponse.json({ success: false, error: "دسته‌بندی انتخاب‌شده وجود ندارد." }, { status: 400 });
    }
    if (brandId && !brand) {
      return NextResponse.json({ success: false, error: "برند انتخاب‌شده وجود ندارد یا غیرفعال است." }, { status: 400 });
    }

    const existing = await storeDb.part.findUnique({ where: { sku }, select: { id: true } });
    if (existing) {
      return NextResponse.json({ success: false, error: "SKU تکراری است." }, { status: 409 });
    }

    const part = await storeDb.part.create({
      data: {
        name,
        nameFa,
        sku,
        categoryId,
        brandId,
        description,
        priceUsd: priceUsd ?? 0,
        oldPriceUsd,
        contactForPrice,
        stock,
        lowStockThreshold,
        images: JSON.stringify(images),
        compatibleCars: JSON.stringify(compatibleCars),
        sourceUrl,
        active,
        featured,
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        brand: { select: { id: true, name: true, slug: true } },
      },
    });

    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "store.part.create",
      entityType: "Part",
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
        contactForPrice: part.contactForPrice,
        sourceUrl: part.sourceUrl,
      },
    });

    return NextResponse.json({ success: true, data: serialize(part) }, { status: 201 });
  } catch (e) {
    console.error("[store/parts POST] failed:", e);
    return NextResponse.json(
      { success: false, error: "ثبت قطعه ناموفق بود. لطفاً ورودی‌ها را بررسی و دوباره تلاش کنید." },
      { status: 500 },
    );
  }
}
