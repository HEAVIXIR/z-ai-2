import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { getAsset, attachAsset } from "@/lib/media-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Args {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/listings/[id]/media
 * Retry attachment for the authenticated seller's own staged listing images.
 * ListingImage rows are the durable retry manifest; no schema migration or
 * client-supplied asset IDs are needed.
 */
export async function POST(req: Request, { params }: Args) {
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "برای ادامه باید وارد شوید." }, { status: 401 });
  }

  try {
    const { id } = await params;
    const listing = await db.listing.findUnique({
      where: { id },
      select: {
        id: true,
        sellerId: true,
        images: { select: { url: true }, orderBy: { sortOrder: "asc" } },
      },
    });
    if (!listing) {
      return NextResponse.json({ error: "آگهی یافت نشد." }, { status: 404 });
    }
    if (listing.sellerId !== user.id) {
      return NextResponse.json({ error: "شما مالک این آگهی نیستید." }, { status: 403 });
    }

    let attachedCount = 0;
    let pendingCount = 0;
    for (const image of listing.images) {
      const match = /^\/api\/media\/([a-f0-9]{24})$/.exec(image.url);
      if (!match) {
        pendingCount++;
        continue;
      }

      let asset;
      try {
        asset = await getAsset(match[1]);
      } catch {
        pendingCount++;
        continue;
      }
      if (!asset || asset.uploadedBy !== user.id || asset.entityType !== "Listing") {
        pendingCount++;
        continue;
      }

      // An already attached asset is accepted only when it points to this
      // exact listing. Never move media from another entity.
      if (asset.status === "ATTACHED") {
        if (asset.entityId === listing.id) attachedCount++;
        else pendingCount++;
        continue;
      }
      if (
        asset.status !== "STAGED" ||
        asset.visibility !== "PRIVATE" ||
        asset.entityId !== null
      ) {
        pendingCount++;
        continue;
      }

      try {
        const result = await attachAsset(asset.id, "Listing", listing.id, user.id);
        if (result.ok) attachedCount++;
        else pendingCount++;
      } catch {
        pendingCount++;
      }
    }

    return NextResponse.json(
      {
        ok: pendingCount === 0,
        attachedCount,
        pendingCount,
        mediaStatus: pendingCount === 0 ? "ATTACHED" : "PENDING",
      },
      {
        status: pendingCount === 0 ? 200 : 202,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    console.error("[listing-media-retry] failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json({ error: "بازیابی تصاویر در حال حاضر کامل نشد." }, { status: 500 });
  }
}
