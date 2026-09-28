import { HOMEPAGE_CACHE_TAGS } from '@/lib/homepage-cache-tags';
import { revalidateTag } from 'next/cache';
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/* PATCH /api/admin/hot-searches/[id] */
export async function PATCH(req: Request, { params }: Params) {
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
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const data: any = {};
    const allowed = ["term", "link", "count", "active", "sortOrder"];
    for (const k of allowed) {
      if (k in body) {
        if (k === "active") data[k] = Boolean(body[k]);
        else if (k === "count" || k === "sortOrder") data[k] = Number(body[k]) || 0;
        else data[k] = body[k] === undefined ? null : body[k];
      }
    }
    const hs = await db.hotSearch.update({ where: { id }, data });
    // STEP 15-B.5.4-C.2-P3: Invalidate Homepage cache
    try { revalidateTag(HOMEPAGE_CACHE_TAGS.hotSearches, 'default'); } catch (e) { console.error('[hot-searches/id] revalidateTag failed:', e); }

    return NextResponse.json({ ok: true, hotSearch: hs });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* DELETE /api/admin/hot-searches/[id] */
export async function DELETE(_req: Request, { params }: Params) {
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
    const { id } = await params;
    await db.hotSearch.delete({ where: { id } });
    // STEP 15-B.5.4-C.2-P3: Invalidate Homepage cache
    try { revalidateTag(HOMEPAGE_CACHE_TAGS.hotSearches, 'default'); } catch (e) { console.error('[hot-searches/id] revalidateTag failed:', e); }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
