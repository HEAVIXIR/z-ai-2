import { NextResponse } from "next/server";
import { searchBrands } from "@/lib/search";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/brands/search?q=...
 *
 * Public, no-auth, alias-aware global brand search. Category selection does
 * not constrain brand identity or visibility.
 *
 * P1-18: delegates to `searchBrands` (src/lib/search.ts) which performs
 * Persian normalization (ي→ی, ك→ک, ZWNJ strip, Arabic→Persian digits,
 * lowercase) and matches against name / nameEn / shortName plus the
 * BrandAlias.normalizedValue column (symmetric: aliases are normalized
 * on write through `normalizeAliasValue`).
 *
 * Returns the top 20 brands with the public card shape:
 *   { brands: [{ id, slug, name, nameEn, shortName, country, logoUrl,
 *               type, status, verification, featured, listingsCount }] }
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawQ = url.searchParams.get("q")?.trim() ?? "";
    // Empty query powers the initial picker drawer: show active global suggestions.
    // Typed queries search the full catalog and never apply a category visibility filter.
    const brands = rawQ
      ? await searchBrands(rawQ, { take: 20 })
      : await db.brand.findMany({
          where: { active: true, status: "ACTIVE" },
          take: 20,
          orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true, slug: true, name: true, nameEn: true, shortName: true,
            country: true, logoUrl: true, type: true, status: true,
            verification: true, featured: true,
            _count: { select: { listings: { where: { status: "PUBLISHED" } } } },
          },
        }).then((rows) => rows.map((b) => ({ ...b, listingsCount: b._count.listings })));

    // Backward-compat: the original endpoint returned `_count: { listings }`.
    // Map `listingsCount` back to that shape so existing clients
    // (BrandLiveSearch, etc.) keep working.
    return NextResponse.json({
      brands: brands.map((b) => ({
        id: b.id,
        slug: b.slug,
        name: b.name,
        nameEn: b.nameEn,
        shortName: b.shortName,
        country: b.country,
        logoUrl: b.logoUrl,
        type: b.type,
        status: b.status,
        verification: b.verification,
        featured: b.featured,
        listingsCount: b.listingsCount,
        _count: { listings: b.listingsCount },
      })),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
