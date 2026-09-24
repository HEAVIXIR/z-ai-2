/**
 * HEAVIX — STEP 15-B.5.4-C.2-P1: Homepage Cache Tag Mapping
 *
 * Central mapping of Universal Resource API resource keys to Homepage cache tags.
 * When a resource is mutated (create/update/delete) via the Universal Resource API,
 * the corresponding cache tags are invalidated via `revalidateTag`.
 *
 * Only resources that affect Homepage data are mapped. Resources with no
 * Homepage impact (e.g., users, products, orders, payments) have no entry
 * and are silently skipped.
 *
 * Per Cache Contract (15-B.5.4-B):
 *   T3 listings — NO premature full-page ISR, but tag exists for mutation invalidation
 *   T2 brands — TTL=300s + tag invalidation
 *   T2 buy-requests — TTL=300s + tag invalidation
 *
 * NOTE: `categories` is NOT a registered Universal Resource — category mutations
 * go through direct API routes (/api/taxonomy/categories/*) and need P3 hooks.
 */

export const HOMEPAGE_CACHE_TAGS: Record<string, string[]> = {
  // T3 Listings — freshness-sensitive, tag exists for invalidation
  listings: ['home:listings'],

  // T2 Brands — semi-dynamic, 5min TTL + tag invalidation
  brands: ['home:brands'],

  // T2 BuyRequests — semi-dynamic, 5min TTL + tag invalidation
  'buy-requests': ['home:requests'],
};

/**
 * Get the cache tags to invalidate for a given resource key.
 * Returns an empty array if the resource has no Homepage impact.
 */
export function getHomepageCacheTags(resourceKey: string): string[] {
  return HOMEPAGE_CACHE_TAGS[resourceKey] ?? [];
}
