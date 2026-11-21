import { HOMEPAGE_CACHE_TAGS } from '@/lib/homepage-cache-tags';
import { revalidateTag } from 'next/cache';
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/auth-helpers/require-admin";
import { uniqueSlug } from "@/lib/api-helpers";
import { normalizeAliasValue } from "@/lib/brand-alias";
import { checkCsrf } from "@/lib/csrf";
import { readBoundedJson } from "@/lib/read-bounded-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/taxonomy/brands — search, sort, filter. */
export async function GET(req: Request) {
  const __auth = await requireAdminPermission("taxonomy.read");
  if (__auth.error) return __auth.error;

  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() || undefined;
    const country = url.searchParams.get("country") || undefined;
    const domain = url.searchParams.get("domain") || undefined;
    const featured = url.searchParams.get("featured");
    const status = url.searchParams.get("status") || undefined;
    const type = url.searchParams.get("type") || undefined;
    const verification = url.searchParams.get("verification") || undefined;
    const industry = url.searchParams.get("industry") || undefined;
    const sort = url.searchParams.get("sort") || "name";
    const requestedLimit = Number(url.searchParams.get("limit") ?? url.searchParams.get("pageSize"));
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(300, Math.max(1, Math.trunc(requestedLimit)))
      : 200;

    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (verification) where.verification = verification;
    if (country) where.country = country;
    if (industry) {
      where.industries = { some: { industry } };
    }
    if (featured !== null && featured !== undefined && featured !== "")
      where.featured = ["1", "true", "yes"].includes(featured);
    if (domain) {
      where.domains = { some: { domain } };
    }
    if (q) {
      const qNorm = normalizeAliasValue(q);
      where.OR = [
        { name: { contains: q } },
        { nameEn: { contains: q } },
        { shortName: { contains: q } },
        // alias match — both raw + normalized so callers can search by either form
        { aliases: { some: { normalizedValue: { contains: qNorm } } } },
        { aliases: { some: { value: { contains: q } } } },
      ];
    }

    let orderBy: any = { name: "asc" };
    if (sort === "name_desc") orderBy = { name: "desc" };
    else if (sort === "featured") orderBy = [{ featured: "desc" }, { name: "asc" }];
    else if (sort === "newest") orderBy = { createdAt: "desc" };
    else if (sort === "sortOrder") orderBy = [{ sortOrder: "asc" }, { name: "asc" }];

    const brands = await db.brand.findMany({
      where,
      orderBy,
      take: limit,
      include: {
        _count: { select: { listings: true } },
        aliases: { orderBy: { confidence: "desc" } },
        industries: true,
        brandFamily: { select: { id: true, name: true, slug: true } },
      },
    });

    const data = brands.map((b) => ({
      ...b,
      listingsCount: b._count.listings,
      _count: undefined,
    }));

    // Preserve both response keys for existing admin consumers.
    return NextResponse.json({ brands: data, data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* POST /api/taxonomy/brands — create. */
export async function POST(req: Request) {
  const __auth = await requireAdminPermission("taxonomy.write"); if (__auth.error) return __auth.error;
  if (!checkCsrf(req)) return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  try {
    const parsed = await readBoundedJson<unknown>(req, 128 * 1024);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }
    if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const body = parsed.value as Record<string, any>;
    if (!body.name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const slug = await uniqueSlug(db.brand, body.slug || body.name);

    const brand = await db.$transaction(async (tx) => {
      const createdBrand = await tx.brand.create({
        data: {
          name: String(body.name).trim(),
          nameEn: body.nameEn == null ? null : String(body.nameEn).trim() || null,
          shortName: body.shortName == null ? null : String(body.shortName).trim() || null,
          slug,
          logoUrl: body.logoUrl == null ? null : String(body.logoUrl).trim() || null,
          website: body.website == null ? null : String(body.website).trim() || null,
          country: body.country == null ? null : String(body.country).trim() || null,
          description: body.description == null ? null : String(body.description).trim() || null,
          featured: Boolean(body.featured),
          active: body.active !== false,
          status: body.status ?? "ACTIVE",
          type: body.type ?? null,
          verification: body.verification ?? "UNVERIFIED",
          parentBrandId: body.parentBrandId ?? null,
          brandFamilyId: body.brandFamilyId ?? null,
          manufacturer: body.manufacturer ?? null,
          foundedYear:
            body.foundedYear === undefined ||
            body.foundedYear === null ||
            body.foundedYear === ""
              ? null
              : Number(body.foundedYear),
          sortOrder: Number.isInteger(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
        },
      });

      if (Array.isArray(body.aliases)) {
        for (const alias of body.aliases) {
          if (!alias || !alias.value) continue;
          const normalizedValue = normalizeAliasValue(String(alias.value));
          if (!normalizedValue) continue;
          await tx.brandAlias.upsert({
            where: {
              brandId_normalizedValue: {
                brandId: createdBrand.id,
                normalizedValue,
              },
            },
            update: {
              value: String(alias.value),
              language: alias.language ?? "fa",
              type: alias.type ?? "COMMON",
              confidence: Number(alias.confidence) || 80,
            },
            create: {
              brandId: createdBrand.id,
              value: String(alias.value),
              normalizedValue,
              language: alias.language ?? "fa",
              type: alias.type ?? "COMMON",
              confidence: Number(alias.confidence) || 80,
            },
          });
        }
      }

      if (Array.isArray(body.industries)) {
        for (const industry of body.industries) {
          if (!industry || typeof industry !== "string") continue;
          await tx.brandIndustry.create({
            data: { brandId: createdBrand.id, industry },
          });
        }
      }

      if (Array.isArray(body.domains)) {
        for (const domain of body.domains) {
          if (!domain || typeof domain !== "string") continue;
          await tx.brandDomain.create({
            data: { brandId: createdBrand.id, domain },
          });
        }
      }
      return createdBrand;
    });

    // STEP 15-B.5.4-C.2-P3: Invalidate Homepage cache
    try { revalidateTag(HOMEPAGE_CACHE_TAGS.brands, 'default'); } catch (e) { console.error('[brands] revalidateTag failed:', e); }

    return NextResponse.json({ ok: true, success: true, brand }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: err?.code === "P2002" ? 409 : 500 },
    );
  }
}
