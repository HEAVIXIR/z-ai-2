import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   GET /api/admin/home/verified-machines — read the verified-machines
   section config from SiteSettings. Auth required.
   Returns:
     { config: { title, subtitle, limit, animation, verifiedOnly } }
   ============================================================ */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const s = await db.siteSettings.findUnique({ where: { id: "main" } });
    return NextResponse.json({
      config: {
        title: s?.verifiedSectionTitle ?? null,
        subtitle: s?.verifiedSectionSubtitle ?? null,
        limit: s?.verifiedSectionLimit ?? 8,
        animation: s?.verifiedSectionAnimation ?? "marquee",
        verifiedOnly: s?.verifiedSectionVerifiedOnly ?? true,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* ============================================================
   PUT /api/admin/home/verified-machines — upsert the verified-machines
   section config in SiteSettings.
   Body: { title?, subtitle?, limit?, animation?, verifiedOnly? }
   ============================================================ */
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await requirePermission(user.id, "admin.homepage.manage");
  try {
    const body = await req.json().catch(() => ({}));

    const title =
      typeof body.title === "string" && body.title.trim().length > 0
        ? body.title.trim().slice(0, 200)
        : null;
    const subtitle =
      typeof body.subtitle === "string" && body.subtitle.trim().length > 0
        ? body.subtitle.trim().slice(0, 200)
        : null;
    const limitRaw = Number(body.limit);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 30
        ? Math.floor(limitRaw)
        : 8;
    const animationRaw = String(body.animation ?? "marquee");
    const animation = ["marquee", "grid", "fade"].includes(animationRaw)
      ? animationRaw
      : "marquee";
    const verifiedOnly =
      body.verifiedOnly === true || body.verifiedOnly === undefined
        ? true
        : Boolean(body.verifiedOnly);

    const updated = await db.siteSettings.upsert({
      where: { id: "main" },
      create: {
        id: "main",
        verifiedSectionTitle: title,
        verifiedSectionSubtitle: subtitle,
        verifiedSectionLimit: limit,
        verifiedSectionAnimation: animation,
        verifiedSectionVerifiedOnly: verifiedOnly,
      },
      update: {
        verifiedSectionTitle: title,
        verifiedSectionSubtitle: subtitle,
        verifiedSectionLimit: limit,
        verifiedSectionAnimation: animation,
        verifiedSectionVerifiedOnly: verifiedOnly,
      },
    });
    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "admin.siteSettings.upsert",
      entityType: "SiteSettings",
      entityId: updated.id,
      after: { verifiedSectionTitle: updated.verifiedSectionTitle, verifiedSectionLimit: updated.verifiedSectionLimit, verifiedSectionAnimation: updated.verifiedSectionAnimation, verifiedSectionVerifiedOnly: updated.verifiedSectionVerifiedOnly },
      reason: "via admin API",
    });

    return NextResponse.json({
      ok: true,
      config: {
        title: updated.verifiedSectionTitle,
        subtitle: updated.verifiedSectionSubtitle,
        limit: updated.verifiedSectionLimit,
        animation: updated.verifiedSectionAnimation,
        verifiedOnly: updated.verifiedSectionVerifiedOnly,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
