import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authorization";
import { getAsset } from "@/lib/media-service";
import { createB2MediaReadUrl } from "@/lib/b2-media-storage";
import { storeDb } from "@/lib/store-db";
import { parseStoredPartImageUrls } from "@/lib/store-part-media";

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

    // BuyRequest media must follow the request's full public-visibility
    // predicate; a sidecar visibility flag alone must never bypass moderation.
    const isBuyRequestAsset = asset.entityType === "BuyRequest";
    const isPartAsset = asset.entityType === "Part";
    let isPublic = !isBuyRequestAsset && !isPartAsset && asset.visibility === "PUBLIC";
    let listingOwnerId: string | null = null;
    let buyRequestOwnerId: string | null = null;
    let partExists = false;
    if (!isPublic && asset.entityType === "Listing") {
      const listingImage = await db.listingImage.findFirst({
        where: { url: asset.url },
        select: { listing: { select: { sellerId: true, status: true } } },
      });
      if (listingImage?.listing) {
        listingOwnerId = listingImage.listing.sellerId;
        isPublic = listingImage.listing.status === "PUBLISHED";
      }
    }
    // BuyRequest media remains private until its owning request is approved.
    // The sidecar's entity reference is authoritative only after attachAsset
    // has moved the asset to ATTACHED; an unassociated staged upload is never
    // made public by a guessed or client-supplied entityId.
    if (isPartAsset && asset.status === "ATTACHED" && asset.entityId) {
      const part = await storeDb.part.findUnique({
        where: { id: asset.entityId },
        select: { active: true, images: true },
      });
      if (part) {
        partExists = true;
        const referenced = parseStoredPartImageUrls(part.images).includes(asset.url);
        isPublic = part.active === true && referenced;
      }
    } else if (isPartAsset && asset.status === "ACTIVE" && asset.visibility === "PUBLIC") {
      // Backward compatibility for older Part images already stored as public assets.
      const part = await storeDb.part.findFirst({
        where: { images: { contains: asset.url } },
        select: { id: true, active: true },
      });
      partExists = !!part;
      isPublic = part?.active === true;
    }
    if (isBuyRequestAsset && asset.status === "ATTACHED" && asset.entityId) {
      const buyRequest = await db.buyRequest.findUnique({
        where: { id: asset.entityId },
        select: { userId: true, status: true, publishedAt: true, expiresAt: true },
      });
      if (buyRequest) {
        buyRequestOwnerId = buyRequest.userId;
        const now = Date.now();
        const isPublished =
          buyRequest.publishedAt instanceof Date &&
          Number.isFinite(buyRequest.publishedAt.getTime()) &&
          buyRequest.publishedAt.getTime() <= now;
        const isUnexpired =
          buyRequest.expiresAt === null ||
          (buyRequest.expiresAt instanceof Date &&
            Number.isFinite(buyRequest.expiresAt.getTime()) &&
            buyRequest.expiresAt.getTime() > now);
        isPublic = buyRequest.status === "ACTIVE" && isPublished && isUnexpired;
      }
    }

    if (!isPublic) {
      const user = await getCurrentUser();
      const isOwner = !!user && (
        asset.uploadedBy === user.id ||
        listingOwnerId === user.id ||
        buyRequestOwnerId === user.id
      );
      // Request reviewers need to inspect attached BuyRequest images
      // while a request is pending moderation. This is scoped to a real,
      // attached BuyRequest row; staged/unassociated uploads remain private.
      const isRequestReviewer = !!user && isBuyRequestAsset && !!buyRequestOwnerId
        ? await can(user.id, "request.read")
        : false;
      const isStoreReader = !!user && isPartAsset && partExists
        ? await can(user.id, "store.read")
        : false;
      const isMediaAdmin = !!user && !isOwner
        ? await can(user.id, "media.read")
        : false;
      if (!isOwner && !isMediaAdmin && !isRequestReviewer && !isStoreReader) {
        // Avoid leaking the existence of staged/private media.
        return new NextResponse(null, { status: 404 });
      }
    }

    // The asset sidecar is already loaded above; sign its key directly.
    // BuyRequest visibility is lifecycle-controlled (moderation/expiry).
    // Avoid caching redirects and keep signed URLs shorter so a close/reject
    // transition cannot leave a long-lived cached public media capability.
    const signedUrl = await createB2MediaReadUrl(asset.relativePath, isBuyRequestAsset ? 60 : 300);
    if (!signedUrl) return new NextResponse(null, { status: 404 });

    return NextResponse.redirect(signedUrl, {
      status: 302,
      headers: {
        "Cache-Control": isBuyRequestAsset ? "private, no-store" : isPublic ? "public, max-age=60, s-maxage=60" : "private, no-store",
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
