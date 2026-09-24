/**
 * HEAVIX — STEP 15-B.5.4-C.2: Homepage Cache Tag Constants
 *
 * Single source of truth for all Homepage cache tags.
 *
 * Two exports:
 *   1. HOMEPAGE_CACHE_TAGS — typed const object with individual tag strings
 *      (used by direct API routes in P3: revalidateTag(HOMEPAGE_CACHE_TAGS.listings, 'default'))
 *
 *   2. getHomepageCacheTags(resourceKey) — helper for Universal Resource API / Action Engine
 *      (used by P1/P2: returns string[] of tags for a given resource key)
 *
 * Per Cache Contract (15-B.5.4-B):
 *   T3 listings — NO premature full-page ISR, but tag exists for mutation invalidation
 *   T2 brands/categories/requests — TTL=300s + tag invalidation
 *   T1 settings/sections/hero/cat-config/articles/hot-searches — TTL=3600s + tag invalidation
 */

// ── Typed tag constants (for direct API routes in P3) ──────
// Usage in direct routes:
//   import { HOMEPAGE_CACHE_TAGS } from '@/lib/homepage-cache-tags';
//   revalidateTag(HOMEPAGE_CACHE_TAGS.listings, 'default');
//
export const HOMEPAGE_CACHE_TAGS = {
  listings: 'home:listings',
  brands: 'home:brands',
  categories: 'home:categories',
  requests: 'home:requests',
  settings: 'home:settings',
  sections: 'home:sections',
  hero: 'home:hero',
  catConfig: 'home:cat-config',
  articles: 'home:articles',
  hotSearches: 'home:hot-searches',
} as const;

// ── Resource key → tag array mapping (for Universal API / Action Engine) ──
// Used by getHomepageCacheTags(resourceKey) — keeps P1/P2 contract unchanged.
//
const RESOURCE_TAG_MAP: Record<string, string[]> = {
  // T3 Listings — freshness-sensitive, tag exists for invalidation
  listings: ['home:listings'],

  // T2 Brands — semi-dynamic, 5min TTL + tag invalidation
  brands: ['home:brands'],

  // T2 BuyRequests — semi-dynamic, 5min TTL + tag invalidation
  'buy-requests': ['home:requests'],
};

/**
 * Get the cache tags to invalidate for a given Universal API resource key.
 * Returns an empty array if the resource has no Homepage impact.
 *
 * Used by P1 (Universal Resource API) and P2 (Action Engine).
 */
export function getHomepageCacheTags(resourceKey: string): string[] {
  return RESOURCE_TAG_MAP[resourceKey] ?? [];
}
