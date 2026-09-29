import { HOMEPAGE_CACHE_TAGS } from '@/lib/homepage-cache-tags';
import { revalidateTag } from 'next/cache';
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/admin/hot-searches */
export async function GET() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "hot-search.read"))) {
    return NextResponse.json(
      { error: "Forbidden: requires hot-search.read" },
      { status: 403 },
    );
  }
  try {
    const items = await db.hotSearch.findMany({
      orderBy: [{ sortOrder: "asc" }, { count: "desc" }],
    });
    return NextResponse.json({ hotSearches: items });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* POST /api/admin/hot-searches — create + bulk actions. */
export async function POST(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "hot-search.manage"))) {
    return NextResponse.json(
      { error: "Forbidden: requires hot-search.manage" },
      { status: 403 },
    );
  }
  try {
    const body = await req.json().catch(() => ({}));

    // Bulk
    if (body.action && Array.isArray(body.ids)) {
      const ids: string[] = body.ids;
      if (body.action === "delete") {
        await db.hotSearch.deleteMany({ where: { id: { in: ids } } });
        await logAudit({
          actorId: sessionUser.id,
          actorType: "ADMIN",
          action: "admin.hotSearches.deleteMany",
          entityType: "HotSearch",
          entityId: null,
          before: { ids },
          after: { count: ids.length },
          reason: "via admin API",
        });
        // STEP 15-B.5.4-C.2-P3: Invalidate Homepage cache
        try { revalidateTag(HOMEPAGE_CACHE_TAGS.hotSearches, 'default'); } catch (e) { console.error('[hot-searches] revalidateTag failed:', e); }

        return NextResponse.json({ ok: true, action: body.action, count: ids.length });
      }
      let data: any = {};
      if (body.action === "activate") data.active = true;
      else if (body.action === "deactivate") data.active = false;
      else return NextResponse.json({ error: "Unknown action" }, { status: 400 });
      const r = await db.hotSearch.updateMany({
        where: { id: { in: ids } },
        data,
      });
      await logAudit({
        actorId: sessionUser.id,
        actorType: "ADMIN",
        action: "admin.hotSearches.updateMany",
        entityType: "HotSearch",
        entityId: null,
        before: { ids },
        after: { action: body.action, active: data.active, count: r.count },
        reason: "via admin API",
      });
      // STEP 15-B.5.4-C.2-P3: Invalidate Homepage cache
      try { revalidateTag(HOMEPAGE_CACHE_TAGS.hotSearches, 'default'); } catch (e) { console.error('[hot-searches] revalidateTag failed:', e); }

      return NextResponse.json({ ok: true, action: body.action, updated: r.count });
    }

    // Create
    if (!body.term) {
      return NextResponse.json({ error: "term is required" }, { status: 400 });
    }
    const hs = await db.hotSearch.create({
      data: {
        term: String(body.term),
        link: body.link ?? null,
        count: Number(body.count) || 0,
        active: body.active !== false,
        sortOrder: Number(body.sortOrder) || 0,
      },
    });
    await logAudit({
      actorId: sessionUser.id,
      actorType: "ADMIN",
      action: "admin.hotSearches.create",
      entityType: "HotSearch",
      entityId: hs.id,
      after: { term: hs.term, link: hs.link, count: hs.count, active: hs.active, sortOrder: hs.sortOrder },
      reason: "via admin API",
    });
    // STEP 15-B.5.4-C.2-P3: Invalidate Homepage cache
    try { revalidateTag(HOMEPAGE_CACHE_TAGS.hotSearches, 'default'); } catch (e) { console.error('[hot-searches] revalidateTag failed:', e); }

    return NextResponse.json({ ok: true, hotSearch: hs });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
