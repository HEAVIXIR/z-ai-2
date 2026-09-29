import { HOMEPAGE_CACHE_TAGS } from '@/lib/homepage-cache-tags';
import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

/* ============================================================
   PUT /api/admin/brands/[id]/logo
   Persists a chosen logo URL (typically picked from the
   AI search-logo candidates) on the brand record.

   Body: { logoUrl: string }
   Returns: { ok: true, logoUrl }
   ============================================================ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  if (!logoUrl) {
    return NextResponse.json(
      { error: "آدرس لوگو الزامی است." },
      { status: 400 },
    );
  }

  try {
    const before = await db.brand.findUnique({ where: { id }, select: { id: true, name: true, slug: true, logoUrl: true } });
    await db.brand.update({
      where: { id },
      data: { logoUrl },
    });
    await logAudit({
      actorId: sessionUser.id,
      actorType: "ADMIN",
      action: "admin.brands.update",
      entityType: "Brand",
      entityId: id,
      before: before ? { logoUrl: before.logoUrl } : null,
      after: { logoUrl },
      reason: "via admin API",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "به‌روزرسانی دیتابیس ناموفق بود: " + (e?.message ?? "unknown") },
      { status: 500 },
    );
  }

  // STEP 15-B.5.4-C.2-P3: Invalidate Homepage cache
  try { revalidateTag(HOMEPAGE_CACHE_TAGS.brands, 'default'); } catch (e) { console.error('[brands/logo] revalidateTag failed:', e); }

  return NextResponse.json({ ok: true, logoUrl });
}
