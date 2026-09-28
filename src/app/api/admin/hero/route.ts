import { HOMEPAGE_CACHE_TAGS } from '@/lib/homepage-cache-tags';
import { revalidateTag } from 'next/cache';
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/admin/hero */
export async function GET() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "admin.homepage.manage"))) {
    return NextResponse.json(
      { error: "Forbidden: requires admin.homepage.manage" },
      { status: 403 },
    );
  }
  try {
    let hero = await db.heroConfig.findUnique({ where: { id: "main" } });
    if (!hero) hero = await db.heroConfig.create({ data: { id: "main" } });
    return NextResponse.json({ hero });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* PUT /api/admin/hero */
export async function PUT(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "admin.homepage.manage"))) {
    return NextResponse.json(
      { error: "Forbidden: requires admin.homepage.manage" },
      { status: 403 },
    );
  }
  try {
    const body = await req.json().catch(() => ({}));
    const allowed = [
      "badge", "title1", "highlight", "subtitle", "buttonText", "buttonLink",
      "secondBtnText", "secondBtnLink", "slide1", "slide2", "slide3",
      "cardServicesImg", "cardFeaturedImg", "cardExclusiveImg", "animationType",
      // FIX-LISTINGS-HERO — optional Listing IDs (overrides the static card images).
      "cardServicesListingId", "cardFeaturedListingId", "cardExclusiveListingId",
      "statsWidth", "cardHeight", "cardWidth", "titleFontSize", "badgeAlign",
      "titleAlign", "highlightAlign", "subtitleAlign", "buttonAlign",
      "statsWidthCustom", "statsPaddingCustom", "statsGapCustom",
      "cardWidthCustom", "cardHeightCustom", "cardGapCustom", "cardRadiusCustom",
      "titleFontSizeCustom", "subtitleFontSizeCustom", "badgeFontSizeCustom",
      "buttonPaddingYCustom", "buttonPaddingXCustom",
      "heroMinHeightCustom", "contentMaxWidthCustom", "contentGapCustom",
      "slideOpacityCustom", "slideIntervalCustom", "overlayColorCustom",
    ];
    const data: any = {};
    for (const k of allowed) if (k in body) data[k] = body[k] === undefined ? null : body[k];

    const hero = await db.heroConfig.upsert({
      where: { id: "main" },
      create: { id: "main", ...data },
      update: data,
    });
    // STEP 15-B.5.4-C.2-P3: Invalidate Homepage cache
    try { revalidateTag(HOMEPAGE_CACHE_TAGS.hero, 'default'); } catch (e) { console.error('[hero] revalidateTag failed:', e); }

    return NextResponse.json({ ok: true, hero });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
