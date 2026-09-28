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

function serialize(r: any) {
  return {
    ...r,
    budgetMin: r.budgetMin ? r.budgetMin.toString() : null,
    budgetMax: r.budgetMax ? r.budgetMax.toString() : null,
  };
}

/* PATCH /api/admin/requests/[id] — update + actions. */
export async function PATCH(req: Request, { params }: Params) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "request.manage"))) {
    return NextResponse.json(
      { error: "Forbidden: requires request.manage" },
      { status: 403 },
    );
  }
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const existing = await db.buyRequest.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: any = {};
    const allowed = [
      "title", "description", "category", "brandPref", "transaction",
      "city", "province", "deadline", "status", "verified",
      "requesterName", "requesterPhone", "adminNotes",
    ];
    for (const k of allowed) {
      if (k in body) {
        if (k === "verified") data[k] = Boolean(body[k]);
        else data[k] = body[k] === undefined ? null : body[k];
      }
    }

    // Actions
    if (body.action === "verify") data.verified = true;
    else if (body.action === "unverify") data.verified = false;
    else if (body.action === "close") data.status = "CLOSED";
    else if (body.action === "fulfill") data.status = "FULFILLED";
    else if (body.action === "activate") data.status = "ACTIVE";

    const r = await db.buyRequest.update({ where: { id }, data });
    // STEP 15-B.5.4-C.2-P3: Invalidate Homepage cache
    try { revalidateTag(HOMEPAGE_CACHE_TAGS.requests, 'default'); } catch (e) { console.error('[admin/requests/id] revalidateTag failed:', e); }

    return NextResponse.json({ ok: true, request: serialize(r) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* DELETE /api/admin/requests/[id] */
export async function DELETE(_req: Request, { params }: Params) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "request.manage"))) {
    return NextResponse.json(
      { error: "Forbidden: requires request.manage" },
      { status: 403 },
    );
  }
  try {
    const { id } = await params;
    await db.buyRequest.delete({ where: { id } });
    // STEP 15-B.5.4-C.2-P3: Invalidate Homepage cache
    try { revalidateTag(HOMEPAGE_CACHE_TAGS.requests, 'default'); } catch (e) { console.error('[admin/requests/id] revalidateTag failed:', e); }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
