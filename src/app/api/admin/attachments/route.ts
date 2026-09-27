import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/admin/attachments */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const url = new URL(req.url);
    const productId = url.searchParams.get("productId") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 200, 1), 500);

    const where: any = {};
    if (productId) where.productId = productId;
    if (status) where.status = status;

    const attachments = await db.attachment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        product: {
          select: { id: true, canonicalName: true, slug: true },
          include: { brand: { select: { id: true, name: true } } },
        },
      },
    });

    return NextResponse.json({ attachments });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* POST /api/admin/attachments */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await requirePermission(user.id, "media.upload");
  try {
    const body = await req.json().catch(() => ({}));

    if (body.productId) {
      const product = await db.product.findUnique({ where: { id: String(body.productId) } });
      if (!product) return NextResponse.json({ error: "Product not found" }, { status: 400 });
    }

    const attachment = await db.attachment.create({
      data: {
        productId: body.productId || null,
        attachmentType: body.attachmentType ?? null,
        capacity: body.capacity ?? null,
        condition: body.condition ?? null,
        status: body.status ?? "ACTIVE",
      },
      include: {
        product: { select: { id: true, canonicalName: true, slug: true } },
      },
    });

    return NextResponse.json({ ok: true, attachment });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
