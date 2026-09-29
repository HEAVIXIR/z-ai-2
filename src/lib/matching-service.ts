/**
 * HEAVIX — Matching Service Layer (Wave 2B / Phase Marketplace-Deep)
 * ------------------------------------------------------------
 * Extracted matching business logic from the matching routes/engine.
 *
 * Responsibilities:
 *   - matchBuyRequest(buyRequestId, userId)
 *       Find candidate listings for a BuyRequest using the existing
 *       deterministic matching rubric (src/lib/ai-matching.ts) and
 *       hydrate each result with the listing's display fields.
 *       Audited as `marketplace.matching.run` (actorType: ADMIN, the
 *       human trigger; the SYSTEM-level batch entry is owned by
 *       matchAllRequests inside ai-matching.ts).
 *
 *   - matchRFQ(rfqId, userId)
 *       Find candidate SELLERS for an RFQ by scanning existing RFQQuote
 *       rows + listed sellers with matching brand/category affinity.
 *       Returns a scored candidate list with a transparent reason.
 *       Audited as `marketplace.matching.run` (entityType: RFQ).
 *
 *   - getMatchResults(matchId)
 *       Return a single persisted match-run row (best-effort, from
 *       AuditLog where action='matching.run'). The `matchId` here is
 *       the AuditLog row id.
 *
 * Audit convention:
 *   - Action key: `marketplace.matching.run`
 *   - entityType: `BuyRequest` | `RFQ` | `AuditLog` (the run record)
 *   - actorType: `ADMIN` (the human trigger)
 *   - The `after` field records the scored candidate count + top-N ids
 *     so the audit trail is self-describing without holding the full
 *     scored payload (which can be large).
 *
 * The route handlers stay thin: parse request, enforce RBAC, call the
 * service, map thrown ServiceError → HTTP response. All DB + audit
 * logic lives here. Pattern mirrors src/lib/store-{inventory,returns,
 * shipments,procurement}-service.ts.
 */

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { matchRequestToListings } from "@/lib/ai-matching";

// ── Service error (maps to HTTP status in route handler) ──
export class MatchingServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "MatchingServiceError";
  }
}

// ── Public result types (mirrored from ai-matching + hydrated) ──
export interface BuyRequestMatchCandidate {
  listingId: string;
  score: number; // 0..1
  reason: string;
  // Hydrated display fields (best-effort — null if listing was deleted)
  title: string | null;
  slug: string | null;
  price: string | null;
  city: string | null;
  province: string | null;
  brandName: string | null;
  categoryName: string | null;
  primaryImage: string | null;
}

export interface BuyRequestMatchResult {
  request: {
    id: string;
    title: string;
    status: string;
  } | null;
  candidates: BuyRequestMatchCandidate[];
}

export interface RFQMatchCandidate {
  // Candidate seller identity (userId if linked, else name+phone)
  sellerId: string | null;
  sellerName: string;
  sellerPhone: string | null;
  // The RFQQuote row id (if a quote already exists)
  quoteId: string | null;
  unitPrice: string | null;
  totalPrice: string | null;
  deliveryTime: string | null;
  score: number; // 0..1
  reason: string;
}

export interface RFQMatchResult {
  rfq: {
    id: string;
    title: string;
    status: string;
  } | null;
  candidates: RFQMatchCandidate[];
}

export interface MatchRunRecord {
  id: string;
  action: string;
  actorType: string;
  actorId: string | null;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  createdAt: Date;
  // Parsed from afterJson (best-effort; null if unparseable)
  totalRequests?: number | null;
  totalMatches?: number | null;
  perRequest?: unknown;
}

// ── matchBuyRequest ──────────────────────────────────────────
/**
 * Match a BuyRequest against all PUBLISHED listings.
 *
 * Delegates the scoring to the existing deterministic rubric in
 * src/lib/ai-matching.ts (matchRequestToListings). The service layer
 * adds: (a) human-actor audit logging, (b) best-effort hydration of
 * listing display fields, (c) a clean ServiceError for 404s.
 *
 * @throws MatchingServiceError(404) when the BuyRequest does not exist.
 */
export async function matchBuyRequest(
  buyRequestId: string,
  userId?: string | null,
): Promise<BuyRequestMatchResult> {
  if (!buyRequestId) {
    throw new MatchingServiceError(400, "buyRequestId الزامی است");
  }

  // Validate the BuyRequest exists.
  const req = await db.buyRequest.findUnique({
    where: { id: buyRequestId },
    select: { id: true, title: true, status: true },
  });
  if (!req) {
    throw new MatchingServiceError(404, "درخواست خرید یافت نشد");
  }

  // Run the deterministic scoring rubric.
  const { matches } = await matchRequestToListings(buyRequestId);

  // Hydrate listing display fields in one round-trip (best-effort).
  let candidates: BuyRequestMatchCandidate[] = [];
  if (matches.length > 0) {
    const listingIds = matches.map((m) => m.listingId);
    const listings = await db.listing.findMany({
      where: { id: { in: listingIds } },
      select: {
        id: true,
        title: true,
        slug: true,
        price: true,
        city: true,
        province: true,
        brand: { select: { name: true } },
        category: { select: { name: true } },
        images: { where: { isPrimary: true }, take: 1, select: { url: true } },
      },
    });
    const byId = new Map(listings.map((l) => [l.id, l]));
    candidates = matches
      .map((m) => {
        const l = byId.get(m.listingId);
        if (!l) {
          return {
            listingId: m.listingId,
            score: m.score,
            reason: m.reason,
            title: null,
            slug: null,
            price: null,
            city: null,
            province: null,
            brandName: null,
            categoryName: null,
            primaryImage: null,
          };
        }
        return {
          listingId: l.id,
          score: m.score,
          reason: m.reason,
          title: l.title,
          slug: l.slug,
          price: l.price ? l.price.toString() : null,
          city: l.city,
          province: l.province,
          brandName: l.brand?.name ?? null,
          categoryName: l.category?.name ?? null,
          primaryImage: l.images[0]?.url ?? null,
        };
      });
  }

  // Audit the human-actor trigger (best-effort, never throws — the
  // matching lib also writes its own SYSTEM-level batched entry, but
  // this one records the human actor who triggered the run).
  await logAudit({
    actorId: userId ?? null,
    actorType: "ADMIN",
    action: "marketplace.matching.run",
    entityType: "BuyRequest",
    entityId: buyRequestId,
    after: {
      requestTitle: req.title,
      candidateCount: candidates.length,
      topCandidateIds: candidates.slice(0, 5).map((c) => c.listingId),
    },
    reason: `اجرای تطابق برای درخواست خرید ${buyRequestId} — ${candidates.length} کاندیداد`,
  });

  return {
    request: { id: req.id, title: req.title, status: req.status },
    candidates,
  };
}

// ── matchRFQ ─────────────────────────────────────────────────
/**
 * Match an RFQ against candidate sellers.
 *
 * Candidate pool (sorted by score desc, top 10):
 *   1. Sellers who have already quoted on this RFQ (highest score —
 *      explicit intent signal). Score = 0.80 base, +0.20 if quote is
 *      PENDING (still negotiable), 0.50 if ACCEPTED, 0.30 if REJECTED.
 *   2. Sellers who have an active published listing whose brand OR
 *      category matches the RFQ's brandPref / machineType (we fall
 *      back to this only when no quotes exist OR to fill the top-10).
 *      Score = 0.30 (we know they sell in this space, but haven't
 *      quoted on THIS RFQ).
 *
 * If the RFQ has no quotes AND no matching listings, returns an empty
 * candidates list (the marketplace simply doesn't have a candidate
 * yet — admins should re-run later).
 *
 * @throws MatchingServiceError(404) when the RFQ does not exist.
 */
export async function matchRFQ(
  rfqId: string,
  userId?: string | null,
): Promise<RFQMatchResult> {
  if (!rfqId) {
    throw new MatchingServiceError(400, "rfqId الزامی است");
  }

  const rfq = await db.rFQ.findUnique({
    where: { id: rfqId },
    select: { id: true, title: true, status: true, brandPref: true, machineType: true },
  });
  if (!rfq) {
    throw new MatchingServiceError(404, "استعلام قیمت یافت نشد");
  }

  // 1. Quotes already on this RFQ → highest-priority candidates.
  const quotes = await db.rFQQuote.findMany({
    where: { rfqId },
    select: {
      id: true,
      sellerId: true,
      sellerName: true,
      sellerPhone: true,
      unitPrice: true,
      totalPrice: true,
      deliveryTime: true,
      notes: true,
      status: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const candidates: RFQMatchCandidate[] = quotes.map((q) => {
    let score = 0.8;
    let reason = "ارائه‌دهندهٔ استعلام فعال";
    if (q.status === "PENDING") {
      score = 0.9;
      reason = "پیشنهاد در انتظار پاسخ";
    } else if (q.status === "ACCEPTED") {
      score = 1.0;
      reason = "پیشنهاد پذیرفته‌شده";
    } else if (q.status === "REJECTED") {
      score = 0.5;
      reason = "پیشنهاد رد‌شده";
    } else if (q.status === "COUNTERED") {
      score = 0.85;
      reason = "پیشنهاد متقابل";
    }
    return {
      sellerId: q.sellerId,
      sellerName: q.sellerName,
      sellerPhone: q.sellerPhone,
      quoteId: q.id,
      unitPrice: q.unitPrice ? q.unitPrice.toString() : null,
      totalPrice: q.totalPrice ? q.totalPrice.toString() : null,
      deliveryTime: q.deliveryTime,
      score,
      reason,
    };
  });

  // 2. If we have fewer than 10 candidates, backfill from listings
  //    whose brand OR category matches the RFQ's preferences.
  if (candidates.length < 10) {
    const have = new Set(
      candidates
        .map((c) => c.sellerId)
        .filter((id): id is string => Boolean(id)),
    );

    // Look up brandId by brandPref name (best-effort).
    let brandId: string | null = null;
    if (rfq.brandPref) {
      const brand = await db.brand.findFirst({
        where: { name: { equals: rfq.brandPref } },
        select: { id: true },
      });
      brandId = brand?.id ?? null;
    }

    // Find published listings with this brandId OR matching the
    // machineType in the title (best-effort text match).
    const listingWhere: { status: string; OR?: unknown[] } = {
      status: "PUBLISHED",
    };
    const orClauses: unknown[] = [];
    if (brandId) orClauses.push({ brandId });
    if (rfq.machineType) {
      orClauses.push({ title: { contains: rfq.machineType, mode: "insensitive" } });
    }
    if (orClauses.length > 0) listingWhere.OR = orClauses;

    const listings = await db.listing.findMany({
      where: listingWhere as never,
      select: {
        id: true,
        sellerName: true,
        sellerPhone: true,
        brand: { select: { name: true } },
        category: { select: { name: true } },
      },
      take: 50,
    });

    // Aggregate by seller (best-effort — sellerId is not on Listing;
    // we group by sellerName+sellerPhone since those are the only
    // seller fields on the listing schema).
    const bySeller = new Map<string, RFQMatchCandidate>();
    for (const l of listings) {
      const key = `${l.sellerName ?? ""}|${l.sellerPhone ?? ""}`;
      if (!key || key === "|") continue;
      const existing = bySeller.get(key);
      if (existing) {
        // Already counted this seller; skip.
        continue;
      }
      bySeller.set(key, {
        sellerId: null,
        sellerName: l.sellerName ?? "—",
        sellerPhone: l.sellerPhone ?? null,
        quoteId: null,
        unitPrice: null,
        totalPrice: null,
        deliveryTime: null,
        score: 0.3,
        reason: `فروشندهٔ فعال در دسته/برند مشابه (${l.brand?.name ?? l.category?.name ?? "—"})`,
      });
    }

    // Add backfill (skip sellers we already have via quotes).
    for (const c of bySeller.values()) {
      if (candidates.length >= 10) break;
      if (c.sellerId && have.has(c.sellerId)) continue;
      candidates.push(c);
    }
  }

  // Sort by score desc.
  candidates.sort((a, b) => b.score - a.score);

  // Audit the human-actor trigger.
  await logAudit({
    actorId: userId ?? null,
    actorType: "ADMIN",
    action: "marketplace.matching.run",
    entityType: "RFQ",
    entityId: rfqId,
    after: {
      rfqTitle: rfq.title,
      candidateCount: candidates.length,
      topCandidateIds: candidates.slice(0, 5).map((c) => c.sellerId ?? c.sellerName),
    },
    reason: `اجرای تطابق برای استعلام قیمت ${rfqId} — ${candidates.length} کاندیداد`,
  });

  return {
    rfq: { id: rfq.id, title: rfq.title, status: rfq.status },
    candidates,
  };
}

// ── getMatchResults ──────────────────────────────────────────
/**
 * Return a single match-run record by id.
 *
 * The `matchId` is the AuditLog row id of the `marketplace.matching.run`
 * (or the older `matching.run` / `matching.admin.trigger`) entry. We
 * parse the afterJson best-effort to surface totalRequests /
 * totalMatches / perRequest.
 *
 * @throws MatchingServiceError(404) when the audit row does not exist
 *   OR is not a matching-run record.
 */
export async function getMatchResults(
  matchId: string,
): Promise<MatchRunRecord> {
  if (!matchId) {
    throw new MatchingServiceError(400, "matchId الزامی است");
  }
  const row = await db.auditLog.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      action: true,
      actorType: true,
      actorId: true,
      entityType: true,
      entityId: true,
      afterJson: true,
      reason: true,
      createdAt: true,
    },
  });
  if (!row) {
    throw new MatchingServiceError(404, "رکورد تطابق یافت نشد");
  }
  // Accept any matching-related action (the run record's action may
  // be either `matching.run` (SYSTEM batch) or
  // `marketplace.matching.run` (per-request human trigger) or
  // `matching.admin.trigger` (the legacy admin trigger).
  const isMatchingAction =
    row.action === "matching.run" ||
    row.action === "matching.admin.trigger" ||
    row.action === "marketplace.matching.run";
  if (!isMatchingAction) {
    throw new MatchingServiceError(
      404,
      "رکورد ممیزی به عملیات تطابق مربوط نیست",
    );
  }

  // Parse afterJson best-effort.
  let totalRequests: number | null = null;
  let totalMatches: number | null = null;
  let perRequest: unknown = null;
  if (row.afterJson) {
    try {
      const parsed = JSON.parse(row.afterJson);
      if (typeof parsed?.totalRequests === "number")
        totalRequests = parsed.totalRequests;
      if (typeof parsed?.totalMatches === "number")
        totalMatches = parsed.totalMatches;
      if (parsed?.perRequest !== undefined) perRequest = parsed.perRequest;
      if (typeof parsed?.candidateCount === "number")
        totalMatches = parsed.candidateCount;
    } catch {
      // ignore — leave as null
    }
  }

  return {
    id: row.id,
    action: row.action,
    actorType: row.actorType,
    actorId: row.actorId,
    entityType: row.entityType,
    entityId: row.entityId,
    reason: row.reason,
    createdAt: row.createdAt,
    totalRequests,
    totalMatches,
    perRequest,
  };
}

// ── listRecentMatchRuns ──────────────────────────────────────
/**
 * Return the most recent match-run AuditLog rows (limit 50, best-effort).
 *
 * Used by the GET /api/admin/matching/results route to populate the
 * admin "match results" table. Returns rows in descending createdAt
 * order, including any of the three matching action keys.
 */
export async function listRecentMatchRuns(
  limit = 50,
): Promise<MatchRunRecord[]> {
  const safeLimit = Math.max(1, Math.min(200, limit));
  const rows = await db.auditLog.findMany({
    where: {
      action: {
        in: [
          "matching.run",
          "matching.admin.trigger",
          "marketplace.matching.run",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take: safeLimit,
    select: {
      id: true,
      action: true,
      actorType: true,
      actorId: true,
      entityType: true,
      entityId: true,
      afterJson: true,
      reason: true,
      createdAt: true,
    },
  });

  return rows.map((row) => {
    let totalRequests: number | null = null;
    let totalMatches: number | null = null;
    let perRequest: unknown = null;
    if (row.afterJson) {
      try {
        const parsed = JSON.parse(row.afterJson);
        if (typeof parsed?.totalRequests === "number")
          totalRequests = parsed.totalRequests;
        if (typeof parsed?.totalMatches === "number")
          totalMatches = parsed.totalMatches;
        if (parsed?.perRequest !== undefined) perRequest = parsed.perRequest;
        if (typeof parsed?.candidateCount === "number")
          totalMatches = parsed.candidateCount;
      } catch {
        // ignore
      }
    }
    return {
      id: row.id,
      action: row.action,
      actorType: row.actorType,
      actorId: row.actorId,
      entityType: row.entityType,
      entityId: row.entityId,
      reason: row.reason,
      createdAt: row.createdAt,
      totalRequests,
      totalMatches,
      perRequest,
    };
  });
}
