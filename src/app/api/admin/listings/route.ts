// HEAVIX Marketplace admin (Phase MARKETPLACE-2C: type-safe, no @ts-nocheck)
import { HOMEPAGE_CACHE_TAGS } from '@/lib/homepage-cache-tags';
import { revalidateTag } from 'next/cache';
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { hasPermission } from "@/lib/rbac";
import { isAdmin } from "@/lib/authorization";
import { parseBig, parseBool, parseNumber } from "@/lib/api-helpers";

// STEP 11.32 NEW-C1 FIX: these legacy admin routes are ADMIN-ONLY.
// A SELLER with listing.read/listing.publish could previously access
// ALL listings (cross-tenant) via these routes — bypassing the
// tenant-scoped Universal Resource API (/api/admin/resources/listings)
// fixed in PR #11 (PR-SC-00). Now we require the ADMIN role: sellers
// use the Universal API (tenant-scoped) or /api/listings/* (authorize()-checked).
async function requireAdminRole(userId: string): Promise<boolean> {
  return await isAdmin(userId);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serialize(l: any) {
  return {
    ...l,
    price: l.price ? l.price.toString() : null,
    images: (l.images ?? []).map((i: any) => ({ ...i })),
  };
}

/* GET /api/admin/listings — list with filters + stats. */
export async function GET(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // STEP 11.32 NEW-C1 FIX: ADMIN-ONLY. Sellers use /api/admin/resources/listings (tenant-scoped).
  if (!(await requireAdminRole(sessionUser.id))) {
    return NextResponse.json(
      { error: "Forbidden: admin access required" },
      { status: 403 },
    );
  }
  if (!(await hasPermission(sessionUser.id, "listing.read"))) {
    return NextResponse.json(
      { error: "Forbidden: missing permission 'listing.read'" },
      { status: 403 },
    );
  }
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() || undefined;
    const status = url.searchParams.get("status") || undefined;
    const brandId = url.searchParams.get("brandId") || undefined;
    const categoryId = url.searchParams.get("categoryId") || undefined;
    const featured = url.searchParams.get("featured");
    const verified = url.searchParams.get("verified");
    const showInLatest = url.searchParams.get("showInLatest");
    const sort = url.searchParams.get("sort") || "newest";
    const limit = parseNumber(url.searchParams.get("limit")) ?? 100;
    const offset = parseNumber(url.searchParams.get("offset")) ?? 0;

    const where: any = {};
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { description: { contains: q } },
        { shortDesc: { contains: q } },
        { sellerName: { contains: q } },
        { sellerPhone: { contains: q } },
      ];
    }
    if (status) where.status = status;
    if (brandId) where.brandId = brandId;
    if (categoryId) where.categoryId = categoryId;
    if (featured !== null && featured !== undefined && featured !== "")
      where.featured = parseBool(featured);
    if (verified) where.verified = parseBool(verified);
    if (showInLatest) where.showInLatest = parseBool(showInLatest);

    let orderBy: any = { createdAt: "desc" };
    if (sort === "oldest") orderBy = { createdAt: "asc" };
    else if (sort === "price_desc") orderBy = { price: "desc" };
    else if (sort === "price_asc") orderBy = { price: "asc" };
    else if (sort === "views") orderBy = { viewCount: "desc" };
    else if (sort === "title") orderBy = { title: "asc" };

    const [listings, total] = await Promise.all([
      db.listing.findMany({
        where,
        include: {
          brand: { select: { id: true, name: true, nameEn: true } },
          category: { select: { id: true, name: true, nameEn: true } },
          images: { orderBy: { sortOrder: "asc" } },
        },
        orderBy,
        take: limit,
        skip: offset,
      }),
      db.listing.count({ where }),
    ]);

    // Stats
    const [totalListings, featuredCount, verifiedCount, publishedCount, soldCount, pendingCount] =
      await Promise.all([
        db.listing.count(),
        db.listing.count({ where: { featured: true } }),
        db.listing.count({ where: { verified: true } }),
        db.listing.count({ where: { status: "PUBLISHED" } }),
        db.listing.count({ where: { status: "SOLD" } }),
        db.listing.count({ where: { status: "PENDING" } }),
      ]);

    return NextResponse.json({
      listings: listings.map(serialize),
      total,
      stats: {
        total: totalListings,
        featured: featuredCount,
        verified: verifiedCount,
        published: publishedCount,
        sold: soldCount,
        pending: pendingCount,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* POST /api/admin/listings — bulk actions. (P0-RBAC: requires listing.publish) */
export async function POST(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // STEP 11.32 NEW-C1 FIX: ADMIN-ONLY. Sellers cannot bulk-modify other sellers' listings.
  if (!(await requireAdminRole(sessionUser.id))) {
    return NextResponse.json(
      { error: "Forbidden: admin access required" },
      { status: 403 },
    );
  }
  if (!(await hasPermission(sessionUser.id, "listing.publish"))) {
    return NextResponse.json(
      { error: "Forbidden: missing permission 'listing.publish'" },
      { status: 403 },
    );
  }
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "ids is required" }, { status: 400 });
    }

    const now = new Date();
    const EXTEND_DAYS = 30;
    const extendedAt = new Date(now.getTime() + EXTEND_DAYS * 24 * 60 * 60 * 1000);

    let data: any = {};
    switch (action) {
      case "feature": data = { featured: true }; break;
      case "unfeature": data = { featured: false }; break;
      case "verify": data = { verified: true }; break;
      case "unverify": data = { verified: false }; break;
      case "showInLatest": data = { showInLatest: true }; break;
      case "hideFromLatest": data = { showInLatest: false }; break;
      case "publish": data = { status: "PUBLISHED", publishedAt: now }; break;
      case "pause": data = { status: "PAUSED" }; break;
      case "extend": data = { expiresAt: extendedAt }; break;
      case "markSold": data = { status: "SOLD", soldAt: now }; break;
      case "delete":
        await db.listing.deleteMany({ where: { id: { in: ids } } });
        // STEP 15-B.5.4-C.2-P3: Invalidate Homepage cache
        try { revalidateTag(HOMEPAGE_CACHE_TAGS.listings, 'default'); } catch (e) { console.error('[admin/listings] revalidateTag failed:', e); }

        return NextResponse.json({ ok: true, action, count: ids.length });
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const result = await db.listing.updateMany({
      where: { id: { in: ids } },
      data,
    });
    await logAudit({
      actorId: sessionUser?.id ?? null,
      actorType: 'ADMIN',
      action: 'marketplace.listing.bulk_deleteMany',
      entityType: 'Listing',
      after: { bulk: true },
    });

    await logAudit({
      actorId: sessionUser?.id ?? null,
      actorType: 'ADMIN',
      action: 'marketplace.listing.bulk_updateMany',
      entityType: 'Listing',
      after: { bulk: true },
    });


    // STEP 15-B.5.4-C.2-P3: Invalidate Homepage cache
    try { revalidateTag(HOMEPAGE_CACHE_TAGS.listings, 'default'); } catch (e) { console.error('[admin/listings] revalidateTag failed:', e); }

    return NextResponse.json({ ok: true, action, updated: result.count });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
