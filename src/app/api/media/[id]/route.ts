import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { adminGuard } from "@/lib/admin-guard";
import { getAsset, getAssetReadUrl } from "@/lib/media-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Stable internal media URL. The bucket stays private; this route checks
 * visibility/ownership before issuing a short-lived signed B2 GET redirect.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const asset = await getAsset(id);
    if (!asset) return new NextResponse(null, { status: 404 });

    const user = await getCurrentUser();
    const admin = await adminGuard("media.read");
    const isAdmin = admin !== null && admin !== false;

    let listingOwnerId: string | null = null;
    let listingIsPublic = false;
    const listingImage = await db.listingImage.findFirst({
      where: { url: asset.url },
      select: { listing: { select: { sellerId: true, status: true } } },
    });
    if (listingImage?.listing) {
      listingOwnerId = listingImage.listing.sellerId;
      listingIsPublic = listingImage.listing.status === "PUBLISHED";
    }

    const isPublic = asset.visibility === "PUBLIC" || listingIsPublic;
    const isOwner =
      !!user &&
      (asset.uploadedBy === user.id || listingOwnerId === user.id);
    if (!isPublic && !isOwner && !isAdmin) {
      // Avoid leaking the existence of staged/private media.
      return new NextResponse(null, { status: 404 });
    }

    const signedUrl = await getAssetReadUrl(id);
    if (!signedUrl) return new NextResponse(null, { status: 404 });

    return NextResponse.redirect(signedUrl, {
      status: 302,
      headers: {
        "Cache-Control": isPublic ? "public, max-age=60, s-maxage=60" : "private, no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "دریافت رسانه ناموفق بود." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
