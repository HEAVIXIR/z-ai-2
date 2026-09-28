import { HOMEPAGE_CACHE_TAGS } from '@/lib/homepage-cache-tags';
import { revalidateTag } from 'next/cache';
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/admin/homepage-sections */
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
    const sections = await db.homePageSection.findMany({
      orderBy: { order: "asc" },
    });
    return NextResponse.json({ sections });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

function sectionData(body: any) {
  const data: any = {};
  const allowed = ["key", "title", "subtitle", "description", "order", "active", "config"];
  for (const k of allowed) if (k in body) data[k] = body[k];
  if (typeof data.active === "string")
    data.active = ["1", "true", "yes"].includes(data.active);
  if (typeof data.order === "string") data.order = Number(data.order) || 0;
  if (data.config && typeof data.config === "object")
    data.config = JSON.stringify(data.config);
  return data;
}

/* PUT /api/admin/homepage-sections — bulk update. */
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
    if (Array.isArray(body.sections)) {
      await Promise.all(
        body.sections.map((s: any) =>
          db.homePageSection.update({
            where: { id: String(s.id) },
            data: sectionData(s),
          }),
        ),
      );
      const sections = await db.homePageSection.findMany({
        orderBy: { order: "asc" },
      });
      // STEP 15-B.5.4-C.2-P3: Invalidate Homepage cache
      try { revalidateTag(HOMEPAGE_CACHE_TAGS.sections, 'default'); } catch (e) { console.error('[homepage-sections] revalidateTag failed:', e); }

      return NextResponse.json({ ok: true, sections });
    }
    const data = sectionData(body);
    if (!data.key) {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }
    const section = await db.homePageSection.upsert({
      where: { key: data.key },
      create: data,
      update: data,
    });
    // STEP 15-B.5.4-C.2-P3: Invalidate Homepage cache
    try { revalidateTag(HOMEPAGE_CACHE_TAGS.sections, 'default'); } catch (e) { console.error('[homepage-sections] revalidateTag failed:', e); }

    return NextResponse.json({ ok: true, section });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* POST /api/admin/homepage-sections — create new section. */
export async function POST(req: Request) {
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
    const data = sectionData(body);
    if (!data.key) {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }
    const existing = await db.homePageSection.findUnique({
      where: { key: data.key },
    });
    if (existing) {
      return NextResponse.json(
        { error: "key already exists" },
        { status: 409 },
      );
    }
    const section = await db.homePageSection.create({ data });
    // STEP 15-B.5.4-C.2-P3: Invalidate Homepage cache
    try { revalidateTag(HOMEPAGE_CACHE_TAGS.sections, 'default'); } catch (e) { console.error('[homepage-sections] revalidateTag failed:', e); }

    return NextResponse.json({ ok: true, section });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
