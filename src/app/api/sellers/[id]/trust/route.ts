import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkPublicApiRateLimit } from "@/lib/public-api-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/sellers/[id]/trust — public seller trust profile.
 * Returns verification signals + listing stats + response metrics.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rateLimit = checkPublicApiRateLimit(req, "seller-trust");
  const noStoreHeaders = { "Cache-Control": "private, no-store" };
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { ...noStoreHeaders, "Retry-After": String(rateLimit.retryAfter) } },
    );
  }

  try {
    const { id } = await params;

    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        emailVerified: true,
        mobileVerified: true,
        status: true,
        avgRating: true,
        reviewCount: true,
        company: {
          select: { id: true, name: true, slug: true, verified: true, avgRating: true, reviewCount: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Seller not found" }, { status: 404, headers: noStoreHeaders });
    }

    // Public reputation responses must not disclose draft, rejected, or
    // hidden inventory counts. All listing metrics are scoped to PUBLISHED.
    const publishedListings = await db.listing.count({
      where: { sellerId: id, status: "PUBLISHED" },
    });
    const totalListings = publishedListings;
    const verifiedListings = await db.listing.count({
      where: { sellerId: id, status: "PUBLISHED", verified: true },
    });

    // Build trust signals
    const trustSignals: any[] = [
      { type: "PHONE", label: "شماره تماس", status: user.mobileVerified ? "VERIFIED" : "UNVERIFIED" },
      { type: "EMAIL", label: "ایمیل", status: user.emailVerified ? "VERIFIED" : "UNVERIFIED" },
    ];

    if (user.company) {
      trustSignals.push({
        type: "COMPANY",
        label: "شرکت",
        status: user.company.verified ? "VERIFIED" : "UNVERIFIED",
        detail: user.company.name,
      });

      // Add company verification details
      const companyVerifs = await db.companyVerification.findMany({
        where: { companyId: user.company.id, status: "VERIFIED" },
        select: { verificationType: true, expiresAt: true },
      });

      const typeLabels: Record<string, string> = {
        PHONE: "تلفن شرکت",
        EMAIL: "ایمیل شرکت",
        BUSINESS: "کسب‌وکار",
        DOCUMENT: "مدارک",
        INSPECTION: "بازرسی",
      };

      for (const v of companyVerifs) {
        trustSignals.push({
          type: v.verificationType,
          label: typeLabels[v.verificationType] || v.verificationType,
          status: "VERIFIED",
          expiresAt: v.expiresAt,
        });
      }
    }

    return NextResponse.json({
      seller: {
        id: user.id,
        name: `${user.firstName} ${user.lastName}`.trim(),
        status: user.status,
      },
      trustSignals,
      stats: {
        totalListings,
        publishedListings,
        verifiedListings,
        avgRating: user.avgRating,
        reviewCount: user.reviewCount,
      },
      company: user.company ? {
        id: user.company.id,
        name: user.company.name,
        slug: user.company.slug,
        verified: user.company.verified,
        avgRating: user.company.avgRating,
        reviewCount: user.company.reviewCount,
      } : null,
    }, { headers: noStoreHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: "Server error" }, { status: 500, headers: noStoreHeaders });
  }
}
