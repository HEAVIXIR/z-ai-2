/**
 * HEAVIX — Phase 11A: Event Taxonomy
 * ------------------------------------------------------------
 * Canonical event-type strings used across the analytics stream
 * (AnalyticsEvent.eventType column) and the funnel definitions.
 *
 * Why a centralized const array:
 *   • The /api/analytics/track ingest endpoint hard-validates against
 *     this set so junk event types can never reach the DB.
 *   • The BI service queries events by these names to compute funnel
 *     conversion, retention cohorts, and acquisition metrics.
 *   • The growth dashboard uses the labels map for human-readable
 *     stage names in the funnel visualization.
 *
 * Naming convention: snake_case to match the broader analytics
 * ecosystem (Amplitude/PostHog/Mixpanel all use snake_case). The
 * existing UPPERCASE legacy event types in `ANALYTICS_EVENT_TYPES`
 * (src/lib/analytics.ts) remain valid for backward compatibility;
 * this taxonomy is the canonical set for new flows.
 *
 * NO .env / NO schema / NO migration changes — `eventType` is a free
 * string column in the AnalyticsEvent table (P1-ANALYTICS-MODERATION-
 * ALERTS, schema line ~2217). Adding new canonical strings is purely
 * additive at the row level.
 */

export const EVENT_TYPES = [
  // ── Discovery ──────────────────────────────────────────────
  'page_view',
  'search',
  'search_zero_result',
  'listing_view',
  'listing_compare',
  'category_browse',
  'brand_browse',
  'article_view',
  'cta_click',

  // ── Intent capture ─────────────────────────────────────────
  'saved_search',
  'wanted_created',
  'rfq_created',
  'quote_received',
  'conversation_started',

  // ── Transactional ──────────────────────────────────────────
  'offer_created',
  'deal_created',
  'order_created',
  'payment_completed',
  'rental_booked',
  'service_requested',

  // ── Reputation & identity ──────────────────────────────────
  'review_created',
  'signup',
  'login',
  'profile_updated',
  'seller_verified',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Runtime Set for O(1) "is this a canonical event type?" membership
 * checks. Used by the ingest route and bi-service validation paths.
 */
export const EVENT_TYPE_SET: ReadonlySet<string> = new Set(EVENT_TYPES);

/**
 * Returns true if the given string is a canonical event type.
 * Case-sensitive (event types are snake_case per the taxonomy).
 */
export function isCanonicalEventType(t: string | undefined | null): boolean {
  if (typeof t !== 'string') return false;
  return EVENT_TYPE_SET.has(t);
}

/**
 * Human-readable labels for the funnel visualization + dashboard.
 * English keys are stable; the dashboard maps these to Persian where
 * needed (the canonical event-type string is the source of truth).
 */
export const EVENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  page_view: 'Page View',
  search: 'Search',
  search_zero_result: 'Search Zero Result',
  listing_view: 'Listing View',
  listing_compare: 'Listing Compare',
  saved_search: 'Saved Search',
  wanted_created: 'Wanted Created',
  rfq_created: 'RFQ Created',
  quote_received: 'Quote Received',
  conversation_started: 'Conversation Started',
  offer_created: 'Offer Created',
  deal_created: 'Deal Created',
  order_created: 'Order Created',
  payment_completed: 'Payment Completed',
  rental_booked: 'Rental Booked',
  service_requested: 'Service Requested',
  review_created: 'Review Created',
  signup: 'Signup',
  login: 'Login',
  profile_updated: 'Profile Updated',
  seller_verified: 'Seller Verified',
  category_browse: 'Category Browse',
  brand_browse: 'Brand Browse',
  article_view: 'Article View',
  cta_click: 'CTA Click',
};

/**
 * Persian labels for the growth dashboard UI.
 */
export const EVENT_TYPE_LABELS_FA: Readonly<Record<string, string>> = {
  page_view: 'بازدید صفحه',
  search: 'جستجو',
  search_zero_result: 'جستجوی بدون نتیجه',
  listing_view: 'بازدید آگهی',
  listing_compare: 'مقایسه آگهی',
  saved_search: 'ذخیرهٔ جستجو',
  wanted_created: 'درخواست خرید',
  rfq_created: 'درخواست پیش‌فاکتور',
  quote_received: 'دریافت پیشنهاد',
  conversation_started: 'شروع گفتگو',
  offer_created: 'ثبت پیشنهاد',
  deal_created: 'ایجاد معامله',
  order_created: 'ساخت سفارش',
  payment_completed: 'پرداخت کامل',
  rental_booked: 'رزرو اجاره',
  service_requested: 'درخواست سرویس',
  review_created: 'ثبت نظر',
  signup: 'ثبت‌نام',
  login: 'ورود',
  profile_updated: 'به‌روزرسانی پروفایل',
  seller_verified: 'تأیید فروشنده',
  category_browse: 'مرور دسته',
  brand_browse: 'مرور برند',
  article_view: 'بازدید مقاله',
  cta_click: 'کلیک CTA',
};
