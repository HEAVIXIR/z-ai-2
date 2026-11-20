import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { getAsset, attachAsset } from "@/lib/media-service";

type RouteArgs = { params: Promise<{ id: string }> };

/**
 * POST /api/listings/[id]/media-retry
 * Retry B2 sidecar/object finalization for images already durably linked
 * to the seller's listing. Does not create ListingImage rows or delete media.
 */
export async function POST(request: Request, { params }: RouteArgs) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "برای بازیابی تصاویر باید وارد شوید." }, { status: 401 });
  if (!checkCsrf(request)) return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: 403 });

  try {
    const { id } = await params;
    const listing = await db.listing.findUnique({
      where: { id },
      select: { id: true, sellerId: true, images: { select: { url: true } } },
    });
    if (!listing) return NextResponse.json({ error: "آگهی یافت نشد." }, { status: 404 });
    if (listing.sellerId !== user.id) return NextResponse.json({ error: "دسترسی مجاز نیست." }, { status: 403 });

    const pending: string[] = [];
    let retried = 0;
    for (const image of listing.images) {
      const match = /^\/api\/media\/([a-f0-9]{24})$/.exec(image.url);
      if (!match) continue;
      const assetId = match[1];
      const asset = await getAsset(assetId);
      if (!asset) {
        pending.push(assetId);
        continue;
      }
      // Already finalized for this listing is a successful idempotent retry.
      if (asset.status === "ATTACHED" && asset.entityType === "Listing" && asset.entityId === listing.id) {
        retried += 1;
        continue;
      }
      if (
        asset.uploadedBy !== user.id ||
        asset.visibility !== "PRIVATE" ||
        asset.status !== "STAGED" ||
        asset.entityType !== "Listing" ||
        asset.entityId !== null
      ) {
        pending.push(assetId);
        continue;
      }
      const result = await attachAsset(assetId, "Listing", listing.id, user.id, "USER");
      if (result.ok) retried += 1;
      else pending.push(assetId);
    }

    return NextResponse.json({
      ok: pending.length === 0,
      listingId: listing.id,
      retried,
      pendingCount: pending.length,
      pendingAssetIds: pending,
      mediaStatus: pending.length ? "PENDING" : "ATTACHED",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "بازیابی تصاویر آگهی ناموفق بود." }, { status: 500 });
  }
}
