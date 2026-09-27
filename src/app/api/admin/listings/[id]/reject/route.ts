import { HOMEPAGE_CACHE_TAGS } from '@/lib/homepage-cache-tags';
import { revalidateTag } from 'next/cache';
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/* POST /api/admin/listings/[id]/reject
   Body: { reason, reasonLabel?, adminNote? }
   Creates a ListingRejection record and sets listing status to REJECTED.
*/
export async function POST(req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'listing.moderate');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires listing.moderate" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = String(body.reason ?? "").trim();
    const adminNote = String(body.adminNote ?? "").trim();

    if (!reason) {
      return NextResponse.json({ error: "reason is required" }, { status: 400 });
    }

    const listing = await db.listing.findUnique({ where: { id } });
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const rejection = await db.listingRejection.create({
      data: {
        listingId: id,
        reason,
        reasonLabel: body.reasonLabel ?? null,
        adminNote,
        status: "OPEN",
      },
    });
    await logAudit({
      actorId: user?.id ?? null,
      actorType: 'ADMIN',
      action: 'marketplace.listing_rejection.create',
      entityType: 'ListingRejection',
      entityId: rejection?.id,
      after: rejection,
    });


    await db.listing.update({
      where: { id },
      data: { status: "REJECTED" },
    });
    await logAudit({
      actorId: user?.id ?? null,
      actorType: 'ADMIN',
      action: 'marketplace.listing.update',
      entityType: 'Listing',
      entityId: id,
      after: { status: 'REJECTED' },
    });

    // Notify seller if registered
    if (listing.sellerId) {
      await db.notification.create({
        data: {
          userId: listing.sellerId,
          type: "LISTING_REJECTED",
          title: "آگهی شما رد شد",
          body: `آگهی «${listing.title}» توسط مدیریت رد شد. دلیل: ${reason}`,
          link: `/listings/${listing.slug}`,
        },
      });
      await logAudit({
        actorId: user?.id ?? null,
        actorType: 'ADMIN',
        action: 'marketplace.notification.create',
        entityType: 'Notification',
        after: { type: 'LISTING_REJECTED', userId: listing.sellerId },
      });
    }

    // STEP 15-B.5.4-C.2-P3: Invalidate Homepage cache
    try { revalidateTag(HOMEPAGE_CACHE_TAGS.listings, 'default'); } catch (e) { console.error('[reject] revalidateTag failed:', e); }

    return NextResponse.json({ ok: true, rejection });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
