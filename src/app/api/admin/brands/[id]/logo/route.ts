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
   - ALL database changes (Brand.logoUrl + BrandMedia) are in ONE
     transaction — if either fails, BOTH are rolled back
   - Audit log runs AFTER transaction success; it is NOT inside
     the transaction because logAudit writes to a separate AuditLog
     table and should not block the logo update if the audit DB
     is unavailable. Audit failure is best-effort (caught + logged).
   - Brand.logoUrl and BrandMedia.url stay in sync

   Body: { logoUrl: string, source?: "AI_SEARCH" | "MANUAL" }
   Returns: { ok: true, logoUrl, source }
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
    // Read the current state BEFORE the transaction so we can audit it.
    const before = await db.brand.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true, logoUrl: true, verification: true },
    });
    if (!before) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    // ATOMIC LOGO UPDATE: Brand.logoUrl + BrandMedia in ONE transaction.
    // If BrandMedia.create fails, Brand.update is rolled back too.
    // If Brand.update fails, BrandMedia.deleteMany + create never run.
    await db.$transaction(async (tx) => {
      // 1. Update Brand.logoUrl
      await tx.brand.update({
        where: { id },
        data: { logoUrl },
      });

      // 2. Replace BrandMedia LOGO record
      await tx.brandMedia.deleteMany({
        where: { brandId: id, type: "LOGO" },
      });
      await tx.brandMedia.create({
        data: {
          brandId: id,
          type: "LOGO",
          url: logoUrl,
          title: `Logo from ${logoSource}`,
        },
      });
    });

    // 3. Audit log — runs AFTER transaction commits.
    //    NOT inside the transaction because AuditLog is a separate
    //    table and audit failure should not roll back the logo update.
    //    Audit failure is best-effort (caught + logged to console).
    try {
      await logAudit({
        actorId: sessionUser.id,
        actorType: "ADMIN",
        action: "admin.brands.logo.update",
        entityType: "Brand",
        entityId: id,
        before: before ? { logoUrl: before.logoUrl } : null,
        after: { logoUrl, source: logoSource },
        reason: `logo ${logoSource === "AI_SEARCH" ? "AI-suggested" : "manually set"} via admin API`,
      });
    } catch (auditErr) {
      console.error("[brands/logo] audit log failed (logo was saved):", auditErr);
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: "به‌روزرسانی دیتابیس ناموفق بود: " + (e?.message ?? "unknown") },
      { status: 500 },
    );
  }

  try { revalidateTag(HOMEPAGE_CACHE_TAGS.brands, 'default'); } catch (e) { console.error('[brands/logo] revalidateTag failed:', e); }

  return NextResponse.json({ ok: true, logoUrl, source: logoSource });
}
