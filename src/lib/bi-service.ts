/**
 * HEAVIX — Phase 11B: Business Intelligence Service
 * ------------------------------------------------------------
 * High-level KPI computations that aggregate raw AnalyticsEvent
 * rows (and a handful of marketplace domain models) into the
 * metric sets rendered on the /admin/growth dashboard.
 *
 * Six exported functions:
 *   1. getFunnelMetrics(funnelName, dateRange)
 *      → stage-by-stage conversion + drop-off for a named funnel.
 *   2. getAcquisitionMetrics(dateRange)
 *      → visits, signups, activation rate (top-of-funnel).
 *   3. getMarketplaceLiquidity(dateRange)
 *      → listings, sellers, buyers, match rate, time-to-match.
 *   4. getRevenueMetrics(dateRange)
 *      → order count, total GMV, avg order value, payment
 *        completion rate.
 *   5. getSearchMetrics(dateRange)
 *      → search count, zero-result rate, CTR, top queries.
 *   6. getRetentionMetrics(dateRange)
 *      → DAU, WAU, MAU, repeat rate, cohort retention.
 *
 * Design rules:
 *   • All functions are pure-read (no writes).
 *   • All functions are server-only (imports Prisma db).
 *   • All functions are resilient: a DB error on any sub-query
 *     degrades gracefully to a zero value, never throws — the
 *     dashboard must always render something.
 *   • Date ranges are inclusive on both ends.
 *
 * NO .env / NO schema / NO migration changes.
 */

import { db } from "@/lib/db";
import {
  FUNNELS,
  type FunnelName,
  isFunnelName,
} from "@/lib/funnel-definitions";

// ── Shared types ─────────────────────────────────────────────

export interface DateRange {
  from?: Date;
  to?: Date;
}

export interface FunnelStageMetric {
  stage: string; // event type
  index: number; // 0-based position in the funnel
  users: number; // distinct userIds who reached this stage
  events: number; // total events at this stage
  conversionFromStart: number; // users / firstStage.users * 100
  conversionFromPrevious: number; // users / prevStage.users * 100
  dropOff: number; // prevStage.users - this.users
  dropOffRate: number; // dropOff / prevStage.users * 100
}

export interface FunnelMetrics {
  funnel: FunnelName;
  dateRange: { from: string | null; to: string | null };
  totalUsersAtStart: number;
  totalUsersAtEnd: number;
  overallConversion: number; // end / start * 100
  stages: FunnelStageMetric[];
}

export interface AcquisitionMetrics {
  visits: number;
  signups: number;
  activationRate: number; // signups / visits * 100
}

export interface MarketplaceLiquidityMetrics {
  listings: number;
  sellers: number;
  buyers: number;
  matchRate: number; // deals / (wanted + listings) * 100
  timeToMatchHours: number | null; // avg hours from listing → deal
  wanted: number;
  deals: number;
}

export interface RevenueMetrics {
  orderCount: number;
  totalGmv: string; // BigInt serialized as string (IRR has no decimals)
  avgOrderValue: string;
  paymentCompletionRate: number; // paid orders / total orders * 100
}

export interface SearchMetrics {
  searchCount: number;
  zeroResultCount: number;
  zeroResultRate: number; // zeroResultCount / searchCount * 100
  listingViewCount: number;
  ctr: number; // listingViewCount / searchCount * 100
  topQueries: { query: string; count: number }[];
}

export interface RetentionMetrics {
  dau: number;
  wau: number;
  mau: number;
  repeatRate: number; // users active on ≥2 distinct days / total active * 100
  cohortRetention: number; // % of signup cohort still active in 7d window
  totalActiveUsers: number;
}

// ── Helpers ──────────────────────────────────────────────────

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function diff(numerator: number, denominator: number): number {
  return Math.max(0, numerator - denominator);
}

function toIso(d: Date | null | undefined): string | null {
  if (!d) return null;
  try {
    return d.toISOString();
  } catch {
    return null;
  }
}

function buildCreatedAtWhere(range: DateRange) {
  const w: { gte?: Date; lte?: Date } = {};
  if (range.from) w.gte = range.from;
  if (range.to) w.lte = range.to;
  return Object.keys(w).length > 0 ? w : undefined;
}

/**
 * Coerce the dateRange `to` to "end of today" if neither bound is
 * provided. Used by the dashboard's default "last 30 days" range
 * so the page can pass `{}` and still get a sane window.
 */
function defaultRangeTo(range: DateRange, daysBack = 30): DateRange {
  const to = range.to ?? new Date();
  const from = range.from ?? new Date(to.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return { from, to };
}

// ── 1. Funnel metrics ────────────────────────────────────────

/**
 * Compute stage-by-stage conversion for a named funnel.
 *
 * Strict funnel membership (time-ordered):
 *   • Stage 0 = users with at least one stage[0] event in range.
 *   • Stage N = subset of stage N-1 users who have a stage[N]
 *     event occurring AFTER their first stage[N-1] event.
 *
 * The walk is done in JS after a single DB fetch of all funnel-
 * matching events for the range. Cap of 50k rows per funnel
 * computation to keep memory bounded; for the BI dashboard's
 * default 30-day window this is plenty (typical marketplace
 * volume is well under 10k events / funnel / month).
 */
export async function getFunnelMetrics(
  funnelName: FunnelName,
  dateRange: DateRange = {},
): Promise<FunnelMetrics> {
  const range = defaultRangeTo(dateRange, 30);

  if (!isFunnelName(funnelName)) {
    throw new Error(`Unknown funnel: ${funnelName}`);
  }
  const stages: string[] = [...FUNNELS[funnelName]];

  const empty: FunnelMetrics = {
    funnel: funnelName,
    dateRange: { from: toIso(range.from), to: toIso(range.to) },
    totalUsersAtStart: 0,
    totalUsersAtEnd: 0,
    overallConversion: 0,
    stages: stages.map((stage, index) => ({
      stage,
      index,
      users: 0,
      events: 0,
      conversionFromStart: 0,
      conversionFromPrevious: index === 0 ? 100 : 0,
      dropOff: 0,
      dropOffRate: 0,
    })),
  };

  if (stages.length === 0) return empty;

  try {
    const rows = await db.analyticsEvent.findMany({
      where: {
        eventType: { in: stages },
        createdAt: buildCreatedAtWhere(range),
        userId: { not: null },
      },
      select: { eventType: true, userId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 50000,
    });

    // Group events per user, in arrival order.
    const perUser = new Map<string, { eventType: string; t: number }[]>();
    const eventCountByStage = new Map<string, number>();
    for (const stage of stages) eventCountByStage.set(stage, 0);

    for (const r of rows) {
      if (!r.userId) continue;
      const list = perUser.get(r.userId) ?? [];
      list.push({ eventType: r.eventType, t: r.createdAt.getTime() });
      perUser.set(r.userId, list);
      const c = eventCountByStage.get(r.eventType) ?? 0;
      eventCountByStage.set(r.eventType, c + 1);
    }

    // Walk each user through the funnel: track the earliest
    // timestamp at which they completed each stage.
    const stageUserCounts = stages.map(() => 0);
    for (const [, events] of perUser) {
      let cursor = -Infinity;
      let completedTo = -1;
      for (let i = 0; i < stages.length; i++) {
        const target = stages[i];
        // Find the earliest event of `target` type occurring at
        // or after `cursor`.
        let earliest: number | null = null;
        for (const e of events) {
          if (e.eventType === target && e.t >= cursor) {
            if (earliest === null || e.t < earliest) earliest = e.t;
          }
        }
        if (earliest === null) break;
        cursor = earliest;
        completedTo = i;
        stageUserCounts[i] += 1;
      }
      void completedTo;
    }

    const startUsers = stageUserCounts[0] ?? 0;
    const endUsers = stageUserCounts[stages.length - 1] ?? 0;

    const stageMetrics: FunnelStageMetric[] = stages.map((stage, index) => {
      const users = stageUserCounts[index] ?? 0;
      const events = eventCountByStage.get(stage) ?? 0;
      const prevUsers = index > 0 ? stageUserCounts[index - 1] ?? 0 : users;
      const dropOff = index > 0 ? diff(prevUsers, users) : 0;
      return {
        stage,
        index,
        users,
        events,
        conversionFromStart: pct(users, startUsers),
        conversionFromPrevious:
          index === 0 ? 100 : pct(users, prevUsers),
        dropOff,
        dropOffRate: index === 0 ? 0 : pct(dropOff, prevUsers),
      };
    });

    return {
      funnel: funnelName,
      dateRange: { from: toIso(range.from), to: toIso(range.to) },
      totalUsersAtStart: startUsers,
      totalUsersAtEnd: endUsers,
      overallConversion: pct(endUsers, startUsers),
      stages: stageMetrics,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[bi-service] getFunnelMetrics failed:", msg);
    return empty;
  }
}

// ── 2. Acquisition metrics ───────────────────────────────────

/**
 * Visits = distinct events of type 'page_view' in the range.
 * Signups = events of type 'signup' in the range.
 * Activation rate = signups / visits * 100.
 */
export async function getAcquisitionMetrics(
  dateRange: DateRange = {},
): Promise<AcquisitionMetrics> {
  const range = defaultRangeTo(dateRange, 30);
  const where = { createdAt: buildCreatedAtWhere(range) };
  const zero: AcquisitionMetrics = {
    visits: 0,
    signups: 0,
    activationRate: 0,
  };
  try {
    const [visits, signups] = await Promise.all([
      db.analyticsEvent.count({
        where: { ...where, eventType: "page_view" },
      }),
      db.analyticsEvent.count({
        where: { ...where, eventType: "signup" },
      }),
    ]);
    return {
      visits,
      signups,
      activationRate: pct(signups, visits),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[bi-service] getAcquisitionMetrics failed:", msg);
    return zero;
  }
}

// ── 3. Marketplace liquidity ─────────────────────────────────

/**
 * listings         = Listing rows created in the range.
 * sellers         = distinct sellerId across those listings.
 * buyers          = distinct buyerId on deals created in range.
 * wanted          = BuyRequest rows created in range.
 * deals           = Deal rows created in range.
 * matchRate       = deals / (wanted + listings) * 100
 * timeToMatchHours = avg hours between a deal's listing.createdAt
 *                    and the deal's createdAt, for deals that
 *                    carry a listingId.
 */
export async function getMarketplaceLiquidity(
  dateRange: DateRange = {},
): Promise<MarketplaceLiquidityMetrics> {
  const range = defaultRangeTo(dateRange, 30);
  const where = buildCreatedAtWhere(range);
  const zero: MarketplaceLiquidityMetrics = {
    listings: 0,
    sellers: 0,
    buyers: 0,
    matchRate: 0,
    timeToMatchHours: null,
    wanted: 0,
    deals: 0,
  };
  try {
    const [listingsCount, wantedCount, dealsCount] = await Promise.all([
      db.listing.count({ where: where ? { createdAt: where } : undefined }),
      db.buyRequest.count({
        where: where ? { createdAt: where } : undefined,
      }),
      db.deal.count({ where: where ? { createdAt: where } : undefined }),
    ]);

    // Distinct sellers on listings in range.
    const listingRows = await db.listing.findMany({
      where: where ? { createdAt: where } : undefined,
      select: { sellerId: true },
      take: 50000,
    });
    const sellerSet = new Set<string>();
    for (const r of listingRows) {
      if (r.sellerId) sellerSet.add(r.sellerId);
    }

    // Distinct buyers on deals in range + time-to-match.
    const dealRows = await db.deal.findMany({
      where: where ? { createdAt: where } : undefined,
      select: { buyerId: true, listingId: true, createdAt: true },
      take: 50000,
    });
    const buyerSet = new Set<string>();
    for (const r of dealRows) {
      if (r.buyerId) buyerSet.add(r.buyerId);
    }

    // Time-to-match: avg hours from listing.createdAt → deal.createdAt
    // for deals that carry a listingId.
    const dealListingIds = Array.from(
      new Set(dealRows.map((d) => d.listingId).filter((x): x is string => !!x)),
    );
    let timeToMatchHours: number | null = null;
    if (dealListingIds.length > 0) {
      const listings = await db.listing.findMany({
        where: { id: { in: dealListingIds } },
        select: { id: true, createdAt: true },
      });
      const listingCreatedById = new Map(
        listings.map((l) => [l.id, l.createdAt.getTime()]),
      );
      let sumMs = 0;
      let n = 0;
      for (const d of dealRows) {
        if (!d.listingId) continue;
        const createdMs = listingCreatedById.get(d.listingId);
        if (typeof createdMs === "number") {
          const dt = d.createdAt.getTime() - createdMs;
          if (dt >= 0) {
            sumMs += dt;
            n += 1;
          }
        }
      }
      if (n > 0) {
        timeToMatchHours = Math.round((sumMs / n) / (60 * 60 * 1000));
      }
    }

    const denominator = listingsCount + wantedCount;
    return {
      listings: listingsCount,
      sellers: sellerSet.size,
      buyers: buyerSet.size,
      matchRate: pct(dealsCount, denominator),
      timeToMatchHours,
      wanted: wantedCount,
      deals: dealsCount,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[bi-service] getMarketplaceLiquidity failed:", msg);
    return zero;
  }
}

// ── 4. Revenue metrics ───────────────────────────────────────

/**
 * orderCount              = Order rows created in range.
 * totalGmv                = sum of Order.priceSnapshot (BigInt).
 * avgOrderValue           = totalGmv / orderCount (BigInt).
 * paymentCompletionRate   = paid orders / total orders * 100.
 *
 * BigInts are returned as string (JSON cannot serialize BigInt natively
 * and the dashboard formats with toFa for Persian display).
 */
export async function getRevenueMetrics(
  dateRange: DateRange = {},
): Promise<RevenueMetrics> {
  const range = defaultRangeTo(dateRange, 30);
  const where = buildCreatedAtWhere(range);
  const zero: RevenueMetrics = {
    orderCount: 0,
    totalGmv: "0",
    avgOrderValue: "0",
    paymentCompletionRate: 0,
  };
  try {
    const [orderCount, gmvAgg, paidCount] = await Promise.all([
      db.order.count({ where: where ? { createdAt: where } : undefined }),
      db.order.aggregate({
        where: where ? { createdAt: where } : undefined,
        _sum: { priceSnapshot: true },
      }),
      db.payment.count({
        where: {
          status: "PAID",
          ...(where ? { createdAt: where } : {}),
        },
      }),
    ]);

    const totalGmv = gmvAgg._sum.priceSnapshot ?? 0n;
    const avg =
      orderCount > 0 ? totalGmv / BigInt(orderCount) : 0n;

    // Payment completion rate = paid payments / order count * 100.
    // (We use order count as the denominator because Order ↔ Payment
    // is a 1:1 in practice, and an order with no payment row is
    // treated as unpaid by the BI view.)
    return {
      orderCount,
      totalGmv: totalGmv.toString(),
      avgOrderValue: avg.toString(),
      paymentCompletionRate: pct(paidCount, orderCount),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[bi-service] getRevenueMetrics failed:", msg);
    return zero;
  }
}

// ── 5. Search metrics ────────────────────────────────────────

/**
 * searchCount     = events of type 'search' in range.
 * zeroResultCount = events of type 'search_zero_result' in range.
 * zeroResultRate  = zeroResultCount / searchCount * 100.
 * listingViewCount = events of type 'listing_view' in range
 *                    (CTR denominator is search; numerator is
 *                    listing_view events that followed a search
 *                    — we approximate with raw listing_view count
 *                    since session-joined CTR is heavier than the
 *                    dashboard needs at this stage).
 * ctr             = listingViewCount / searchCount * 100.
 * topQueries      = top 10 SearchQuery.query by count in range.
 */
export async function getSearchMetrics(
  dateRange: DateRange = {},
): Promise<SearchMetrics> {
  const range = defaultRangeTo(dateRange, 30);
  const where = buildCreatedAtWhere(range);
  const zero: SearchMetrics = {
    searchCount: 0,
    zeroResultCount: 0,
    zeroResultRate: 0,
    listingViewCount: 0,
    ctr: 0,
    topQueries: [],
  };
  try {
    const [searchCount, zeroResultCount, listingViewCount, topRaw] =
      await Promise.all([
        db.analyticsEvent.count({
          where: {
            ...(where ? { createdAt: where } : {}),
            eventType: "search",
          },
        }),
        db.analyticsEvent.count({
          where: {
            ...(where ? { createdAt: where } : {}),
            eventType: "search_zero_result",
          },
        }),
        db.analyticsEvent.count({
          where: {
            ...(where ? { createdAt: where } : {}),
            eventType: "listing_view",
          },
        }),
        db.searchQuery.groupBy({
          by: ["query"],
          where: where ? { createdAt: where } : undefined,
          _count: { _all: true },
          orderBy: { _count: { query: "desc" } },
          take: 10,
        }),
      ]);

    return {
      searchCount,
      zeroResultCount,
      zeroResultRate: pct(zeroResultCount, searchCount),
      listingViewCount,
      ctr: pct(listingViewCount, searchCount),
      topQueries: topRaw.map((r) => ({
        query: r.query,
        count: r._count._all,
      })),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[bi-service] getSearchMetrics failed:", msg);
    return zero;
  }
}

// ── 6. Retention metrics ─────────────────────────────────────

/**
 * dau      = distinct userIds with at least one event in the last 1 day of the range.
 * wau      = distinct userIds with at least one event in the last 7 days.
 * mau      = distinct userIds with at least one event in the last 30 days.
 * repeatRate = users active on ≥2 distinct calendar days / total active users * 100.
 * cohortRetention = % of users who signed up in the first half of the range and
 *                   were still active in the second half (lightweight cohort proxy).
 * totalActiveUsers = distinct userIds in the full range.
 */
export async function getRetentionMetrics(
  dateRange: DateRange = {},
): Promise<RetentionMetrics> {
  const range = defaultRangeTo(dateRange, 30);
  const to = range.to ?? new Date();
  const day = 24 * 60 * 60 * 1000;

  const dauFrom = new Date(to.getTime() - 1 * day);
  const wauFrom = new Date(to.getTime() - 7 * day);
  const mauFrom = new Date(to.getTime() - 30 * day);

  const zero: RetentionMetrics = {
    dau: 0,
    wau: 0,
    mau: 0,
    repeatRate: 0,
    cohortRetention: 0,
    totalActiveUsers: 0,
  };

  try {
    // Pull all events in the full range with userId + createdAt.
    // 50k cap keeps memory bounded for the dashboard's default 30-day view.
    const rows = await db.analyticsEvent.findMany({
      where: {
        userId: { not: null },
        createdAt: {
          gte: mauFrom,
          lte: to,
        },
      },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 50000,
    });

    const dauSet = new Set<string>();
    const wauSet = new Set<string>();
    const mauSet = new Set<string>();
    const dayBuckets = new Map<string, Set<string>>(); // userId → set of day keys

    for (const r of rows) {
      if (!r.userId) continue;
      const t = r.createdAt.getTime();
      if (t >= dauFrom.getTime()) dauSet.add(r.userId);
      if (t >= wauFrom.getTime()) wauSet.add(r.userId);
      if (t >= mauFrom.getTime()) mauSet.add(r.userId);
      const dayKey = r.createdAt.toISOString().slice(0, 10);
      const bucket = dayBuckets.get(r.userId) ?? new Set<string>();
      bucket.add(dayKey);
      dayBuckets.set(r.userId, bucket);
    }

    const totalActive = dayBuckets.size;
    let multiDay = 0;
    for (const [, days] of dayBuckets) {
      if (days.size >= 2) multiDay += 1;
    }

    // Cohort retention proxy: users with a 'signup' event in the
    // first half of the range who have ANY event in the second half.
    const rangeStart = range.from ?? mauFrom;
    const midpoint = new Date((rangeStart.getTime() + to.getTime()) / 2);
    let cohortSize = 0;
    let cohortRetained = 0;

    // Fetch signups in first half + any activity in second half.
    const [signupsFirstHalf, anyActivitySecondHalf] = await Promise.all([
      db.analyticsEvent.findMany({
        where: {
          eventType: "signup",
          userId: { not: null },
          createdAt: { gte: rangeStart, lte: midpoint },
        },
        select: { userId: true },
        take: 50000,
      }),
      db.analyticsEvent.findMany({
        where: {
          userId: { not: null },
          createdAt: { gt: midpoint, lte: to },
        },
        select: { userId: true },
        take: 50000,
      }),
    ]);

    const secondHalfActive = new Set(
      anyActivitySecondHalf
        .map((r) => r.userId)
        .filter((x): x is string => !!x),
    );
    const cohortUserIds = new Set<string>();
    for (const r of signupsFirstHalf) {
      if (r.userId) cohortUserIds.add(r.userId);
    }
    cohortSize = cohortUserIds.size;
    for (const id of cohortUserIds) {
      if (secondHalfActive.has(id)) cohortRetained += 1;
    }

    return {
      dau: dauSet.size,
      wau: wauSet.size,
      mau: mauSet.size,
      repeatRate: pct(multiDay, totalActive),
      cohortRetention: pct(cohortRetained, cohortSize),
      totalActiveUsers: totalActive,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[bi-service] getRetentionMetrics failed:", msg);
    return zero;
  }
}
