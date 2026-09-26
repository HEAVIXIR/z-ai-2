/**
 * HEAVIX — Phase 11A: Funnel Definitions
 * ------------------------------------------------------------
 * Standard funnel definitions used by the BI service
 * (src/lib/bi-service.ts) and the growth dashboard
 * (src/app/admin/growth/page.tsx) to compute stage-by-stage
 * conversion rates + drop-off.
 *
 * A funnel is an ordered list of event types from the canonical
 * EVENT_TYPES taxonomy (src/lib/event-taxonomy.ts). Stage N's
 * conversion is the count of users who reached stage N divided by
 * the count who reached stage N-1.
 *
 * Funnel membership model:
 *   • Stage 1 = users with at least one event of types[0] in the range
 *   • Stage 2 = users with at least one event of types[1] AFTER the
 *     first occurrence of types[0]
 *   • ...and so on.
 *   • Drop-off = previous stage count - current stage count.
 *
 * The BI service implements the strict time-ordered membership check
 * in `getFunnelMetrics()` (src/lib/bi-service.ts). These definitions
 * are pure data — no DB access — so they can be imported in tests
 * and the dashboard alike.
 *
 * NO .env / NO schema / NO migration changes.
 */

export const FUNNELS = {
  /**
   * Discovery → Conversion funnel.
   * User searches, views a listing, starts a conversation, makes an
   * offer, and a deal is created.
   */
  SEARCH_TO_DEAL: [
    'search',
    'listing_view',
    'conversation_started',
    'offer_created',
    'deal_created',
  ],

  /**
   * Wanted (buy request) → Deal funnel.
   * User creates a wanted, gets matched to RFQ, receives a quote,
   * and a deal is created from the quote.
   */
  WANTED_TO_DEAL: [
    'wanted_created',
    'rfq_created',
    'quote_received',
    'deal_created',
  ],

  /**
   * Order → Review funnel.
   * Post-purchase reputation loop: order created → payment completed →
   * review left by the buyer.
   */
  ORDER_TO_REVIEW: [
    'order_created',
    'payment_completed',
    'review_created',
  ],

  /**
   * Anonymous visitor → first-time buyer funnel.
   * Top-of-funnel acquisition: page view → signup → first search →
   * first order.
   */
  VISITOR_TO_BUYER: [
    'page_view',
    'signup',
    'search',
    'order_created',
  ],

  /**
   * Seller activation funnel.
   * New seller signup → completes profile → gets verified → first
   * listing view (proxy for "first listing published" since publish
   * is a tracked listing_view proxy).
   */
  SELLER_ACTIVATION: [
    'signup',
    'profile_updated',
    'seller_verified',
    'listing_view',
  ],
} as const;

export type FunnelName = keyof typeof FUNNELS;

/**
 * Ordered list of funnel names — used by the dashboard to render all
 * funnels in a stable order.
 */
export const FUNNEL_NAMES = Object.keys(FUNNELS) as FunnelName[];

/**
 * Human-readable labels for the funnel selector.
 */
export const FUNNEL_LABELS: Readonly<Record<FunnelName, string>> = {
  SEARCH_TO_DEAL: 'Search → Deal',
  WANTED_TO_DEAL: 'Wanted → Deal',
  ORDER_TO_REVIEW: 'Order → Review',
  VISITOR_TO_BUYER: 'Visitor → Buyer',
  SELLER_ACTIVATION: 'Seller Activation',
};

/**
 * Persian labels for the dashboard UI.
 */
export const FUNNEL_LABELS_FA: Readonly<Record<FunnelName, string>> = {
  SEARCH_TO_DEAL: 'جستجو → معامله',
  WANTED_TO_DEAL: 'درخواست خرید → معامله',
  ORDER_TO_REVIEW: 'سفارش → نظر',
  VISITOR_TO_BUYER: 'بازدیدکننده → خریدار',
  SELLER_ACTIVATION: 'فعال‌سازی فروشنده',
};

/**
 * Returns the ordered list of event types for a given funnel name.
 * Throws if the funnel name is not defined (defensive — bi-service
 * and the API both validate before calling this).
 */
export function getFunnelStages(name: FunnelName): readonly string[] {
  return FUNNELS[name];
}

/**
 * Returns true if the given string is a defined funnel name.
 */
export function isFunnelName(s: string | undefined | null): s is FunnelName {
  if (typeof s !== 'string') return false;
  return Object.prototype.hasOwnProperty.call(FUNNELS, s);
}
