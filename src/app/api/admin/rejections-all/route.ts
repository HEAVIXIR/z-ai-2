import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/admin/rejections-all — all rejections. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await requirePermission(user.id, "listing.read");
  try {
    const items = await db.listingRejection.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            slug: true,
            sellerPhone: true,
            sellerName: true,
            sellerId: true,
            images: { take: 1, orderBy: { sortOrder: "asc" } },
          },
        },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    return NextResponse.json({ rejections: items });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
