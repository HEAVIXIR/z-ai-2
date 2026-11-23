import { HOMEPAGE_CACHE_TAGS } from '@/lib/homepage-cache-tags';
import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

/* ============================================================
   PUT /api/admin/brands/[id]/logo
   Persists a chosen logo URL on the brand record + BrandMedia.

   Contract:
   - source must be one of: "AI_SEARCH" | "MANUAL" (whitelist)
   - AI-suggested logos NEVER auto-verify the brand
   - Brand.verification is NOT touched by this route
   - BrandMedia is persisted WITHOUT silent error swallowing
   - Brand.logoUrl and BrandMedia.url stay in sync
   - Audit log records before/after logoUrl + source

   Body: { logoUrl: string, source?: "AI_SEARCH" | "MANUAL" }
   Returns: { ok: true, logoUrl, source, mediaId }
   ============================================================ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whitelist of valid logo source values. */
const VALID_LOGO_SOURCES = ["AI_SEARCH", "MANUAL"] as const;
type LogoSource = (typeof VALID_LOGO_SOURCES)[number];

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "brand.update"))) {
    return NextResponse.json(
      { error: "Forbidden: requires brand.update" },
      { status: 403 },
    );
  }

  const { id } = await ctx.params;

  let body: any = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const logoUrl = typeof body?.logoUrl === "string" ? body.logoUrl.trim() : "";

  // HARDENING: validate source against whitelist.
  // Only "AI_SEARCH" and "MANUAL" are accepted; anything else is rejected.
  const rawSource = typeof body?.source === "string" ? body.source.trim().toUpperCase() : "MANUAL";
  if (!VALID_LOGO_SOURCES.includes(rawSource as LogoSource)) {
    return NextResponse.json(
      { error: `source must be one of: ${VALID_LOGO_SOURCES.join(", ")}. Got: "${rawSource}"` },
      { status: 400 },
    );
  }
  const logoSource: LogoSource = rawSource as LogoSource;

  if (!logoUrl) {
    return NextResponse.json(
      { error: "آدرس لوگو الزامی است." },
      { status: 400 },
    );
  }

  try {
    const before = await db.brand.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true, logoUrl: true, verification: true },
    });
    if (!before) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    // 1. Update Brand.logoUrl
    await db.brand.update({
      where: { id },
      data: { logoUrl },
    });

    // 2. Persist BrandMedia record — NO silent error swallowing.
    //    If BrandMedia has a @@unique([brandId, type]) constraint,
    //    upsert works. If not, we use createMany + deleteMany as a
    //    fallback. Either way, errors propagate to the caller.
    let mediaId: string | null = null;
    try {
      // Try upsert first (works if @@unique([brandId, type]) exists)
      const media = await db.brandMedia.upsert({
        where: { brandId_type: { brandId: id, type: "LOGO" } },
        create: {
          brandId: id,
          type: "LOGO",
          url: logoUrl,
          title: `Logo from ${logoSource}`,
        },
        update: {
          url: logoUrl,
          title: `Logo from ${logoSource}`,
        },
      });
      mediaId = media.id;
    } catch {
      // Upsert failed — likely no @@unique([brandId, type]) constraint.
      // Fallback: delete existing LOGO media for this brand, then create new.
      await db.brandMedia.deleteMany({
        where: { brandId: id, type: "LOGO" },
      });
      const media = await db.brandMedia.create({
        data: {
          brandId: id,
          type: "LOGO",
          url: logoUrl,
          title: `Logo from ${logoSource}`,
        },
      });
      mediaId = media.id;
    }

    // 3. Audit log — records source + before/after logoUrl.
    //    Brand.verification is deliberately NOT included in the audit
    //    because this route does NOT change it.
    await logAudit({
      actorId: sessionUser.id,
      actorType: "ADMIN",
      action: "admin.brands.logo.update",
      entityType: "Brand",
      entityId: id,
      before: before ? { logoUrl: before.logoUrl } : null,
      after: { logoUrl, source: logoSource, mediaId },
      reason: `logo ${logoSource === "AI_SEARCH" ? "AI-suggested" : "manually set"} via admin API`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "به‌روزرسانی دیتابیس ناموفق بود: " + (e?.message ?? "unknown") },
      { status: 500 },
    );
  }

  // STEP 15-B.5.4-C.2-P3: Invalidate Homepage cache
  try { revalidateTag(HOMEPAGE_CACHE_TAGS.brands, 'default'); } catch (e) { console.error('[brands/logo] revalidateTag failed:', e); }

  return NextResponse.json({ ok: true, logoUrl, source: logoSource });
}
