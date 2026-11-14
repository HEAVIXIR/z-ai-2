// @ts-nocheck — HEAVIX Legacy: Owner=Migration, Scope=OldAdmin, Ticket=STEP-14.6-LEGACY
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/auth-helpers/require-admin";
import { checkCsrf } from "@/lib/csrf";

/* ============================================================
   /api/taxonomy/brands/[id]/categories
   POST   (admin) → link brand to category
   DELETE (admin) → unlink brand from category (?categoryId=...)
   GET    (public) → list brand's categories
   ============================================================ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const links = await db.brandCategory.findMany({
    where: { brandId: id },
    include: { category: true },
    orderBy: { category: { name: "asc" } },
  });
  return NextResponse.json({ success: true, data: links });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const __auth = await requireAdminPermission("taxonomy.write"); if (__auth.error) return __auth.error;
  if (!checkCsrf(req)) return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });

  try {
    const { id } = await params;
    const brand = await db.brand.findUnique({ where: { id }, select: { id: true } });
    if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    const body = await req.json();
    const categoryId = String(body.categoryId ?? "");
    if (!categoryId) return NextResponse.json({ error: "categoryId required" }, { status: 400 });

    const category = await db.category.findFirst({
      where: { id: categoryId, active: true },
      select: { id: true },
    });
    if (!category) return NextResponse.json({ error: "دسته‌بندی معتبر یا فعال نیست." }, { status: 404 });

    // BrandCategory is a pure many-to-many link in the current Prisma schema.
    const link = await db.brandCategory.upsert({
      where: { brandId_categoryId: { brandId: id, categoryId } },
      update: {},
      create: { brandId: id, categoryId },
    });
    return NextResponse.json({ success: true, data: link });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const __auth = await requireAdminPermission("taxonomy.write"); if (__auth.error) return __auth.error;
  if (!checkCsrf(req)) return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });

  try {
    const { id } = await params;
    const url = new URL(req.url);
    const categoryId = url.searchParams.get("categoryId");
    if (!categoryId) return NextResponse.json({ error: "categoryId required" }, { status: 400 });

    await db.brandCategory.deleteMany({
      where: { brandId: id, categoryId },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
