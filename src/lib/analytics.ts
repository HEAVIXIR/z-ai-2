import { db } from "@/lib/db";
import crypto from "node:crypto";
import {
  FUNNELS,
  type FunnelName,
  isFunnelName,
} from "@/lib/funnel-definitions";

/* ============================================================
   HEAVIX — Analytics / BI (P1-2 + Phase 11A)
   ------------------------------------------------------------
   Lightweight fire-and-forget event tracker. Every public flow
   (listing view, search, compare, offer, share, contact, etc.)
   calls `trackEvent` so the admin analytics dashboard can
   aggregate trends without coupling user flows to analytics.

   Design rules (NON-NEGOTIABLE):
     • Fire-and-forget — the caller never `await`s the persist.
     • Never throws — all errors are swallowed + console.warn'd.
     • Never blocks — the persist runs on a detached promise so
       the request lifecycle isn't lengthened.
     • Schema additive — only inserts rows into AnalyticsEvent.

   Event types (canonical set — see P1-2 spec):
     LISTING_VIEW | SEARCH | CLICK | FAVORITE | COMPARE |
     CONTACT | SHARE | REGISTER | LOGIN | LISTING_CREATE |
     OFFER_MAKE

   Phase 11A (Growth Analytics) adds:
     • `trackEventWithSession()` — wraps trackEvent with session
       attribution (sessionId stored in metadata.sessionId).
     • `getOrCreateSession()` — returns a stable session ID per
       user (reused if the user was active in the last 30 minutes).
     • `getEventsByFunnel()` — fetches events matching a named
       funnel definition (FUNNELS in src/lib/funnel-definitions.ts).

   The module is server-only (imports Prisma).
   ============================================================ */

export const ANALYTICS_EVENT_TYPES = [
  "LISTING_VIEW",
  "SEARCH",
  "CLICK",
  "FAVORITE",
  "COMPARE",
  "CONTACT",
  "SHARE",
  "REGISTER",
  "LOGIN",
  "LISTING_CREATE",
  "OFFER_MAKE",
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export interface TrackEventParams {
  eventType: string;
  userId?: string | null;
  listingId?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  query?: string | null;
  page?: string | null;
  referrer?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /** Any JSON-serializable metadata. */
  metadata?: Record<string, unknown> | null;
}

/**
 * Persist a single AnalyticsEvent row.
 *
 * CONTRACT:
 *   • Fire-and-forget — returns `void` (not a Promise). The persist
 *     is detached so the caller never waits on it.
 *   • Never throws — all errors are swallowed + logged to
 *     `console.warn` so analytics can never crash the user flow.
 *   • Never blocks — runs on a separate microtask.
 *
 * Usage:
 *   trackEvent({ eventType: "LISTING_VIEW", listingId, ... });
 *   // (no await — fire and forget)
 */
export function trackEvent(params: TrackEventParams): void {
  // Detach the persist promise so the caller's microtask completes
  // before the DB write even starts. Errors are swallowed —
  // analytics MUST NEVER throw into the user flow.
  void persistEvent(params).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[analytics] trackEvent failed:", msg);
  });
}

async function persistEvent(params: TrackEventParams): Promise<void> {
  // Coerce + trim string fields so we never store bloated values.
  const eventType = String(params.eventType ?? "").trim().slice(0, 64);
  if (!eventType) return; // nothing to track

  const query =
    typeof params.query === "string" && params.query.trim()
      ? params.query.trim().slice(0, 500)
      : null;
  const page =
    typeof params.page === "string" && params.page.trim()
      ? params.page.trim().slice(0, 500)
      : null;
  const referrer =
    typeof params.referrer === "string" && params.referrer.trim()
      ? params.referrer.trim().slice(0, 500)
      : null;
  const ip =
    typeof params.ip === "string" && params.ip.trim()
      ? params.ip.trim().slice(0, 64)
      : null;
  const userAgent =
    typeof params.userAgent === "string" && params.userAgent.trim()
      ? params.userAgent.trim().slice(0, 500)
      : null;

  const metadata =
    params.metadata != null ? safeStringify(params.metadata) : null;

  await db.analyticsEvent.create({
    data: {
      eventType,
      userId: params.userId ?? null,
      listingId: params.listingId ?? null,
      categoryId: params.categoryId ?? null,
      brandId: params.brandId ?? null,
      query,
      page,
      referrer,
      ip,
      userAgent,
      metadata,
    },
  });
}

function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    try {
      return String(value);
    } catch {
      return null;
    }
  }
}

/* ============================================================
   Aggregation helpers — used by /admin/analytics dashboard.
   All helpers are pure-read (no writes), server-only.
   ============================================================ */

export interface AnalyticsEventCount {
  eventType: string;
  count: number;
}

export interface TopListingView {
  listingId: string;
  title: string;
  slug: string;
  views: number;
}

export interface TopQueryRow {
  query: string;
  count: number;
}

export interface TopBrandRow {
  brandId: string;
  brandName: string;
  count: number;
}

export interface TopCategoryRow {
  categoryId: string;
  categoryName: string;
  count: number;
}

export interface DailyEventRow {
  day: string; // YYYY-MM-DD
  count: number;
}

export interface AnalyticsSummary {
  totalEvents: number;
  byType: AnalyticsEventCount[];
  topListings: TopListingView[];
  topQueries: TopQueryRow[];
  topBrands: TopBrandRow[];
  topCategories: TopCategoryRow[];
  dailyTimeline: DailyEventRow[];
}

/**
 * Compute a complete analytics summary for the last `days` days.
 *
 * Returns all the slices the /admin/analytics dashboard needs in
 * one trip so the page render stays snappy even when the event
 * stream grows into the 100k+ range.
 */
export async function getAnalyticsSummary(days: number): Promise<AnalyticsSummary> {
  const safeDays = Math.min(365, Math.max(1, Math.floor(days)));
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

  // Run the cheap counts in parallel — each is a single SQL pass.
  const [
    totalAgg,
    byTypeRaw,
    topListingsRaw,
    topQueriesRaw,
    topBrandsRaw,
    topCategoriesRaw,
    allRows,
  ] = await Promise.all([
    db.analyticsEvent.aggregate({
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    db.analyticsEvent.groupBy({
      by: ["eventType"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { eventType: "desc" } },
    }),
    // LISTING_VIEW grouped by listingId — top 10
    db.analyticsEvent.groupBy({
      by: ["listingId"],
      where: {
        createdAt: { gte: since },
        eventType: "LISTING_VIEW",
        listingId: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { listingId: "desc" } },
      take: 10,
    }),
    db.analyticsEvent.groupBy({
      by: ["query"],
      where: {
        createdAt: { gte: since },
        eventType: "SEARCH",
        query: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { query: "desc" } },
      take: 10,
    }),
    db.analyticsEvent.groupBy({
      by: ["brandId"],
      where: {
        createdAt: { gte: since },
        brandId: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { brandId: "desc" } },
      take: 10,
    }),
    db.analyticsEvent.groupBy({
      by: ["categoryId"],
      where: {
        createdAt: { gte: since },
        categoryId: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { categoryId: "desc" } },
      take: 10,
    }),
    // Pull all events in the window so we can compute the daily
    // timeline in JS — SQLite has no DATE_TRUNC and the day bucket
    // is a simple `YYYY-MM-DD` slice of the ISO timestamp.
    db.analyticsEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    }),
  ]);

  // ── Resolve listing titles for top-listings table ──
  const topListingIds = topListingsRaw
    .map((r) => r.listingId)
    .filter((x): x is string => x !== null);
  const listingMeta =
    topListingIds.length > 0
      ? await db.listing.findMany({
          where: { id: { in: topListingIds } },
          select: { id: true, title: true, slug: true },
        })
      : [];
  const listingById = new Map(listingMeta.map((l) => [l.id, l]));

  const topListings: TopListingView[] = topListingsRaw
    .map((r) => {
      const meta = r.listingId ? listingById.get(r.listingId) : null;
      if (!meta) return null;
      return {
        listingId: meta.id,
        title: meta.title,
        slug: meta.slug,
        views: r._count._all,
      };
    })
    .filter((x): x is TopListingView => x !== null);

  // ── Resolve brand names ──
  const topBrandIds = topBrandsRaw
    .map((r) => r.brandId)
    .filter((x): x is string => x !== null);
  const brandMeta =
    topBrandIds.length > 0
      ? await db.brand.findMany({
          where: { id: { in: topBrandIds } },
          select: { id: true, name: true },
        })
      : [];
  const brandById = new Map(brandMeta.map((b) => [b.id, b.name]));
  const topBrands: TopBrandRow[] = topBrandsRaw
    .map((r) => {
      const id = r.brandId;
      if (!id) return null;
      return { brandId: id, brandName: brandById.get(id) ?? "—", count: r._count._all };
    })
    .filter((x): x is TopBrandRow => x !== null);

  // ── Resolve category names ──
  const topCategoryIds = topCategoriesRaw
    .map((r) => r.categoryId)
    .filter((x): x is string => x !== null);
  const categoryMeta =
    topCategoryIds.length > 0
      ? await db.category.findMany({
          where: { id: { in: topCategoryIds } },
          select: { id: true, name: true },
        })
      : [];
  const categoryById = new Map(categoryMeta.map((c) => [c.id, c.name]));
  const topCategories: TopCategoryRow[] = topCategoriesRaw
    .map((r) => {
      const id = r.categoryId;
      if (!id) return null;
      return {
        categoryId: id,
        categoryName: categoryById.get(id) ?? "—",
        count: r._count._all,
      };
    })
    .filter((x): x is TopCategoryRow => x !== null);

  // ── Daily timeline — JS-side bucket of createdAt ──
  const dailyMap = new Map<string, number>();
  for (const row of allRows) {
    const iso = row.createdAt.toISOString();
    const day = iso.slice(0, 10); // YYYY-MM-DD
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
  }
  // Fill gaps so the chart shows continuous days (zero on no-activity days).
  const dailyTimeline: DailyEventRow[] = [];
  const now = new Date();
  for (let i = safeDays - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const day = d.toISOString().slice(0, 10);
    dailyTimeline.push({ day, count: dailyMap.get(day) ?? 0 });
  }

  return {
    totalEvents: totalAgg._count._all,
    byType: byTypeRaw.map((r) => ({ eventType: r.eventType, count: r._count._all })),
    topListings,
    topQueries: topQueriesRaw
      .map((r) => ({ query: r.query ?? "", count: r._count._all }))
      .filter((r) => r.query.length > 0),
    topBrands,
    topCategories,
    dailyTimeline,
  };
}

/* ============================================================
   Phase 11A — Session attribution + funnel query helpers
   ------------------------------------------------------------
   These functions support the BI dashboard (/admin/growth) and the
   events query API (/api/analytics/events). All fire-and-forget
   rules from `trackEvent` apply — the caller never awaits the
   write. Session IDs are stored in the `metadata` JSON column
   under the `sessionId` key (schema is unchanged: `metadata` is
   a free-form JSON string column on AnalyticsEvent).
   ============================================================ */

/**
 * Inactivity gap after which a user is considered to have started a
 * new session. Industry standard (Google Analytics, PostHog) is 30
 * minutes — we mirror that so per-user session counts are comparable
 * to other analytics platforms the operator may have used.
 */
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export interface SessionInfo {
  sessionId: string;
  isNew: boolean;
}

/**
 * Returns the user's current session ID. If the user's most recent
 * tracked event was within `SESSION_TIMEOUT_MS` (30 min), that
 * event's sessionId is reused. Otherwise a fresh UUIDv4 is minted.
 *
 * This is a read-then-decide function — it does NOT persist. The
 * sessionId is persisted on the next `trackEventWithSession` call
 * (which writes it to `metadata.sessionId` on the new event row).
 *
 * Anonymous users (userId = null / empty) get a fresh ephemeral
 * session ID per call since we can't correlate their history. The
 * caller should stash it in a cookie to reuse it across requests.
 *
 * NEVER throws — DB errors fall back to a fresh UUID so the caller's
 * tracking call never crashes.
 */
export async function getOrCreateSession(
  userId?: string | null,
): Promise<SessionInfo> {
  // Anonymous user → can't correlate, always fresh.
  if (!userId || typeof userId !== "string") {
    return { sessionId: newSessionId(), isNew: true };
  }

  try {
    // Find the most recent event with a sessionId for this user.
    // We read all metadata-bearing rows in the last 24h and look
    // for one with sessionId. Prisma can't filter on JSON keys
    // portably, so we filter in JS.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await db.analyticsEvent.findMany({
      where: {
        userId,
        createdAt: { gte: since },
        metadata: { not: null },
      },
      select: { metadata: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const cutoff = Date.now() - SESSION_TIMEOUT_MS;
    for (const r of rows) {
      const sid = parseSessionId(r.metadata);
      if (sid && r.createdAt.getTime() >= cutoff) {
        return { sessionId: sid, isNew: false };
      }
      if (r.createdAt.getTime() < cutoff) break; // rows are DESC
    }

    return { sessionId: newSessionId(), isNew: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[analytics] getOrCreateSession failed, minting fresh:", msg);
    return { sessionId: newSessionId(), isNew: true };
  }
}

/**
 * Track an event with session attribution. Wraps the canonical
 * `trackEvent` so callers can attach a sessionId + source channel
 * (web | app | bot | api) without repeating boilerplate.
 *
 * If `sessionId` is omitted, `getOrCreateSession(userId)` is called
 * first to resolve one (async). The persist itself remains
 * fire-and-forget — this function returns void like `trackEvent`.
 *
 * entityId is stored in the most appropriate existing column based on
 * a simple convention:
 *   • If eventType contains "listing"  → listingId
 *   • If eventType contains "brand"    → brandId
 *   • If eventType contains "category"  → categoryId
 *   • Otherwise entityId is stored in metadata.entityId
 */
export interface TrackEventWithSessionParams {
  eventType: string;
  userId?: string | null;
  entityId?: string | null;
  properties?: Record<string, unknown> | null;
  sessionId?: string | null;
  source?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  page?: string | null;
  referrer?: string | null;
  query?: string | null;
}

export function trackEventWithSession(
  params: TrackEventWithSessionParams,
): void {
  void (async () => {
    try {
      const sessionId =
        params.sessionId ||
        (await getOrCreateSession(params.userId ?? null)).sessionId;

      const mergedProperties: Record<string, unknown> = {
        ...(params.properties ?? {}),
        sessionId,
        source: params.source ?? null,
      };
      if (params.entityId) {
        mergedProperties.entityId = params.entityId;
      }

      // Route entityId to the best-fit column when possible so the
      // existing top-listings / top-brands / top-categories queries
      // still work without changes.
      const et = (params.eventType ?? "").toLowerCase();
      const listingId = et.includes("listing")
        ? params.entityId ?? null
        : null;
      const brandId = et.includes("brand")
        ? params.entityId ?? null
        : null;
      const categoryId = et.includes("category")
        ? params.entityId ?? null
        : null;

      trackEvent({
        eventType: params.eventType,
        userId: params.userId ?? null,
        listingId,
        categoryId,
        brandId,
        query: params.query ?? null,
        page: params.page ?? null,
        referrer: params.referrer ?? null,
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
        metadata: mergedProperties,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[analytics] trackEventWithSession failed:", msg);
    }
  })();
}

/**
 * Fetch events matching a named funnel definition. Returns all
 * AnalyticsEvent rows whose eventType is in the funnel's stage
 * list, optionally scoped to a single user.
 *
 * Use this for ad-hoc funnel analysis (the BI service's
 * `getFunnelMetrics` is the high-level KPI computation; this is
 * the lower-level row fetch for custom analyses).
 *
 * Sorted by createdAt ASC so the caller can walk the user journey
 * in order.
 */
export interface FunnelEventRow {
  id: string;
  eventType: string;
  userId: string | null;
  listingId: string | null;
  categoryId: string | null;
  brandId: string | null;
  page: string | null;
  query: string | null;
  metadata: string | null;
  createdAt: Date;
}

export async function getEventsByFunnel(
  funnelName: FunnelName,
  userId?: string | null,
  dateRange?: { from?: Date; to?: Date },
): Promise<FunnelEventRow[]> {
  if (!isFunnelName(funnelName)) {
    throw new Error(`Unknown funnel: ${funnelName}`);
  }
  const stages: string[] = [...FUNNELS[funnelName]];
  if (stages.length === 0) return [];

  try {
    const where: {
      eventType: { in: string[] };
      userId?: string;
      createdAt?: { gte?: Date; lte?: Date };
    } = { eventType: { in: stages } };
    if (userId) where.userId = userId;
    if (dateRange?.from || dateRange?.to) {
      where.createdAt = {};
      if (dateRange.from) where.createdAt.gte = dateRange.from;
      if (dateRange.to) where.createdAt.lte = dateRange.to;
    }

    const rows = await db.analyticsEvent.findMany({
      where,
      select: {
        id: true,
        eventType: true,
        userId: true,
        listingId: true,
        categoryId: true,
        brandId: true,
        page: true,
        query: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
      take: 5000, // safety cap so a runaway query never OOMs the page
    });

    return rows as unknown as FunnelEventRow[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[analytics] getEventsByFunnel failed:", msg);
    return [];
  }
}

// ── Internal helpers ────────────────────────────────────────

function newSessionId(): string {
  // crypto.randomUUID is available on Node 19+ (we target ES2020).
  // Fall back to randomBytes for older runtimes.
  try {
    if (typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return (
    crypto.randomBytes(8).toString("hex") +
    "-" +
    crypto.randomBytes(4).toString("hex")
  );
}

/**
 * Parse the `sessionId` key out of a JSON-encoded metadata string.
 * Returns null if the metadata is not valid JSON or has no
 * sessionId key.
 */
function parseSessionId(metadata: string | null): string | null {
  if (!metadata || typeof metadata !== "string") return null;
  try {
    const obj = JSON.parse(metadata) as unknown;
    if (obj && typeof obj === "object") {
      const sid = (obj as Record<string, unknown>).sessionId;
      if (typeof sid === "string" && sid.length > 0) return sid;
    }
  } catch {
    /* not JSON or malformed — ignore */
  }
  return null;
}
