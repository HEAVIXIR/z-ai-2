import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/admin/offers-all — admin view of all offers. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'listing.read');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires listing.read" }, { status: 403 });
  }
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || undefined;
    const limit = Number(url.searchParams.get("limit")) || 100;

    const where: any = {};
    if (status) where.status = status;

    const offers = await db.listingOffer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        listing: {
          select: { id: true, title: true, slug: true, sellerName: true, sellerPhone: true },
        },
      },
    });

    return NextResponse.json({
      offers: offers.map((o) => ({
        ...o,
        offerAmount: o.offerAmount ? o.offerAmount.toString() : null,
        counterAmount: o.counterAmount ? o.counterAmount.toString() : null,
      })),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
