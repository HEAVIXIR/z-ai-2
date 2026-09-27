import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   GET /api/admin/categories/without-images — returns categories
   that have no imageUrl. Used by the batch AI image generation
   button on the admin categories page. Auth required.

   Query: ?limit=50&layer=CATALOG  (max 200)
   Returns: { categories: [{ id, name, nameEn, slug, layer }], total }
   ============================================================ */

export async function GET(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "category.read"))) {
    return NextResponse.json(
      { error: "Forbidden: requires category.read" },
      { status: 403 },
    );
  }
  try {
    const url = new URL(req.url);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
    const layer = url.searchParams.get("layer") || undefined;

    const categories = await db.category.findMany({
      where: {
        active: true,
        OR: [{ imageUrl: null }, { imageUrl: "" }],
        ...(layer ? { layer } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: limit,
      select: { id: true, name: true, nameEn: true, slug: true, layer: true },
    });

    return NextResponse.json({ categories, total: categories.length });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
