import { db } from "@/lib/db";

type RecentListing = {
  id: string;
  title: string;
  viewCount: number;
  featured: boolean;
  createdAt: string;
  brand: { name: string } | null;
  category: { icon: string | null } | null;
};

type RecentRequest = {
  id: string;
  title: string;
  category: string | null;
  city: string | null;
  createdAt: string;
};

type RecentRFQ = {
  id: string;
  title: string;
  machineType: string | null;
  status: string;
  createdAt: string;
};

type RecentOffer = {
  id: string;
  offerAmount: bigint;
  listing: { title: string; slug: string } | null;
};

type DashboardJson = {
  totalListings: number;
  publishedListings: number;
  featuredListings: number;
  totalBrands: number;
  totalCategories: number;
  totalViews: number;
  recentListings: RecentListing[];
  recentRequests: RecentRequest[];
  recentRFQs: RecentRFQ[];
  recentOffers: Array<Omit<RecentOffer, "offerAmount"> & { offerAmount: string }>;
  featureFlags: Array<{ id: string; label: string; enabled: boolean }>;
  aiStats: { _count: number; _avg: { latencyMs: number | null } };
  aiSuccess: number;
  aiFailed: number;
  catalogIssues: number[];
};

export interface AdminDashboardSnapshot {
  totalListings: number;
  publishedListings: number;
  featuredListings: number;
  totalBrands: number;
  totalCategories: number;
  totalViews: { _sum: { viewCount: number } };
  recentListings: RecentListing[];
  recentRequests: RecentRequest[];
  recentRFQs: RecentRFQ[];
  recentOffers: RecentOffer[];
  featureFlags: DashboardJson["featureFlags"];
  aiStats: DashboardJson["aiStats"];
  aiSuccess: number;
  aiFailed: number;
  catalogIssues: number[];
}

/**
 * Read the Admin Command Center in one bounded PostgreSQL round-trip.
 *
 * The former page issued 19 concurrent Prisma operations. On Workers Free,
 * the query fan-out plus RSC serialization made the Admin landing route
 * vulnerable to CPU-limit failures. This snapshot keeps the existing widget
 * contract but computes it in one SQL statement; recent activity is capped.
 */
export async function getAdminDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
  const rows = await db.$queryRaw<Array<{ dashboard: unknown }>>`
    WITH listing_stats AS (
      SELECT
        COUNT(*)::int AS total_listings,
        COUNT(*) FILTER (WHERE status = 'PUBLISHED')::int AS published_listings,
        COUNT(*) FILTER (WHERE status = 'PUBLISHED' AND featured = true)::int AS featured_listings,
        COALESCE(SUM("viewCount"), 0)::double precision AS total_views
      FROM "Listing"
    ),
    ai_stats AS (
      SELECT
        COUNT(*)::int AS total_count,
        COUNT(*) FILTER (WHERE success = true)::int AS success_count,
        COUNT(*) FILTER (WHERE success = false)::int AS failed_count,
        AVG("latencyMs")::double precision AS avg_latency
      FROM "AIGatewayLog"
    ),
    catalog_issues AS (
      SELECT
        COUNT(*) FILTER (
          WHERE NOT EXISTS (
            SELECT 1 FROM "ListingImage" image WHERE image."listingId" = listing.id
          )
        )::int AS missing_image,
        COUNT(*) FILTER (WHERE listing.price IS NULL)::int AS missing_price,
        COUNT(*) FILTER (WHERE listing."brandId" IS NULL)::int AS missing_brand,
        COUNT(*) FILTER (WHERE listing."categoryId" IS NULL)::int AS missing_category,
        COUNT(*) FILTER (WHERE listing.description IS NULL OR listing.description = '')::int AS missing_description
      FROM "Listing" listing
      WHERE listing.status = 'PUBLISHED'
    )
    SELECT jsonb_build_object(
      'totalListings', listing_stats.total_listings,
      'publishedListings', listing_stats.published_listings,
      'featuredListings', listing_stats.featured_listings,
      'totalBrands', (SELECT COUNT(*)::int FROM "Brand"),
      'totalCategories', (SELECT COUNT(*)::int FROM "Category" WHERE "parentId" IS NULL),
      'totalViews', listing_stats.total_views,
      'recentListings', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', recent.id,
          'title', recent.title,
          'viewCount', recent."viewCount",
          'featured', recent.featured,
          'createdAt', recent."createdAt",
          'brand', CASE WHEN recent.brand_name IS NULL THEN NULL ELSE jsonb_build_object('name', recent.brand_name) END,
          'category', CASE WHEN recent.category_icon IS NULL THEN NULL ELSE jsonb_build_object('icon', recent.category_icon) END
        ) ORDER BY recent."createdAt" DESC)
        FROM (
          SELECT listing.id, listing.title, listing."viewCount", listing.featured, listing."createdAt",
            brand.name AS brand_name, category.icon AS category_icon
          FROM "Listing" listing
          LEFT JOIN "Brand" brand ON brand.id = listing."brandId"
          LEFT JOIN "Category" category ON category.id = listing."categoryId"
          ORDER BY listing."createdAt" DESC
          LIMIT 6
        ) recent
      ), '[]'::jsonb),
      'recentRequests', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', recent.id, 'title', recent.title, 'category', recent.category,
          'city', recent.city, 'createdAt', recent."createdAt"
        ) ORDER BY recent."createdAt" DESC)
        FROM (
          SELECT id, title, category, city, "createdAt"
          FROM "BuyRequest" ORDER BY "createdAt" DESC LIMIT 5
        ) recent
      ), '[]'::jsonb),
      'recentRFQs', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', recent.id, 'title', recent.title, 'machineType', recent."machineType",
          'status', recent.status, 'createdAt', recent."createdAt"
        ) ORDER BY recent."createdAt" DESC)
        FROM (
          SELECT id, title, "machineType", status, "createdAt"
          FROM "RFQ" ORDER BY "createdAt" DESC LIMIT 5
        ) recent
      ), '[]'::jsonb),
      'recentOffers', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', recent.id, 'offerAmount', recent.offer_amount,
          'listing', CASE WHEN recent.listing_title IS NULL THEN NULL ELSE jsonb_build_object('title', recent.listing_title, 'slug', recent.listing_slug) END
        ) ORDER BY recent.created_at DESC)
        FROM (
          SELECT offer.id, offer."offerAmount"::text AS offer_amount, offer."createdAt" AS created_at,
            listing.title AS listing_title, listing.slug AS listing_slug
          FROM "ListingOffer" offer
          LEFT JOIN "Listing" listing ON listing.id = offer."listingId"
          ORDER BY offer."createdAt" DESC
          LIMIT 5
        ) recent
      ), '[]'::jsonb),
      'featureFlags', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', id, 'label', label, 'enabled', enabled) ORDER BY "createdAt" ASC)
        FROM "FeatureFlag"
      ), '[]'::jsonb),
      'aiStats', jsonb_build_object(
        '_count', ai_stats.total_count,
        '_avg', jsonb_build_object('latencyMs', ai_stats.avg_latency)
      ),
      'aiSuccess', ai_stats.success_count,
      'aiFailed', ai_stats.failed_count,
      'catalogIssues', jsonb_build_array(
        catalog_issues.missing_image,
        catalog_issues.missing_price,
        catalog_issues.missing_brand,
        catalog_issues.missing_category,
        catalog_issues.missing_description
      )
    ) AS dashboard
    FROM listing_stats, ai_stats, catalog_issues
  `;

  const dashboard = rows[0]?.dashboard as DashboardJson | undefined;
  if (!dashboard) {
    throw new Error("Admin dashboard snapshot query returned no row.");
  }

  return {
    ...dashboard,
    totalViews: { _sum: { viewCount: Number(dashboard.totalViews) } },
    recentOffers: dashboard.recentOffers.map((offer) => ({
      ...offer,
      offerAmount: BigInt(offer.offerAmount),
    })),
  };
}
