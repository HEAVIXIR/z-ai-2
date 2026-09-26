import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/analytics/events — Phase 11A event query endpoint.
   ------------------------------------------------------------

   GET (requires analytics.read permission):
     ?eventType=       filter by single event type (exact match).
                       Accepts comma-separated list for OR.
     ?eventType[]=     repeat for multiple event types (OR)
     ?userId=          filter by userId (exact match)
     ?from=            ISO date — createdAt >=
     ?to=              ISO date — createdAt <=
     ?limit=           page size (1..500, default 100)
     ?offset=          pagination offset

   Returns:
     { success, total, data: [...] }
   Sorted by createdAt DESC.

   The canonical event types are defined in
   `src/lib/event-taxonomy.ts` (EVENT_TYPES const). This endpoint
   accepts both the new snake_case taxonomy (page_view, listing_view,
   ...) and the legacy UPPERCASE set (LISTING_VIEW, SEARCH, ...) for
   backward compat — both are valid strings stored in the same
   `eventType` column on AnalyticsEvent (P1-ANALYTICS-MODERATION-
   ALERTS, schema line ~2217).

   Auth pattern matches the audit-log reader
   (src/app/api/admin/audit-log/route.ts): getCurrentUser() →
   requirePermission(user.id, 'analytics.read'). The synthetic
   'ADMIN' user returned for admin-cookie sessions still passes
   requirePermission() because can('ADMIN', ...) short-circuits to
   true (see src/lib/authorization/index.ts).
   ============================================================ */

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function parseEventTypeParams(sp: URLSearchParams): string[] {
  const out: string[] = [];
  const single = sp.get("eventType");
  if (single) {
    for (const part of single.split(",")) {
      const t = part.trim();
      if (t) out.push(t);
    }
  }
  const multi = sp.getAll("eventType[]");
  for (const part of multi) {
    const t = part.trim();
    if (t) out.push(t);
  }
  return Array.from(new Set(out));
}

type AnalyticsEventRow = {
  id: string;
  eventType: string;
  userId: string | null;
  listingId: string | null;
  categoryId: string | null;
  brandId: string | null;
  query: string | null;
  page: string | null;
  referrer: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: string | null;
  createdAt: Date;
};

function serialize(row: AnalyticsEventRow) {
  return {
    id: row.id,
    eventType: row.eventType,
    userId: row.userId,
    listingId: row.listingId,
    categoryId: row.categoryId,
    brandId: row.brandId,
    query: row.query,
    page: row.page,
    referrer: row.referrer,
    ip: row.ip,
    userAgent: row.userAgent,
    metadata: row.metadata,
    createdAt: row.createdAt,
  };
}

export async function GET(req: Request) {
  // ── 1. Auth + RBAC ──
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, "analytics.read");
  } catch {
    return NextResponse.json(
      { error: "Forbidden: requires analytics.read" },
      { status: 403 },
    );
  }

  try {
    const url = new URL(req.url);
    const sp = url.searchParams;

    // ── 2. Parse filters ──
    const eventTypes = parseEventTypeParams(sp);
    const userId = (sp.get("userId") ?? "").trim() || null;
    const from = parseDate(sp.get("from"));
    const to = parseDate(sp.get("to"));
    const limit = Math.min(500, Math.max(1, Number(sp.get("limit")) || 100));
    const offset = Math.max(0, Number(sp.get("offset")) || 0);

    const where: {
      eventType?: { in: string[] };
      userId?: string;
      createdAt?: { gte?: Date; lte?: Date };
    } = {};
    if (eventTypes.length > 0) where.eventType = { in: eventTypes };
    if (userId) where.userId = userId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }

    // ── 3. Run query + count in parallel ──
    const [rows, total] = await Promise.all([
      db.analyticsEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      db.analyticsEvent.count({ where }),
    ]);

    const data = rows.map((r) => serialize(r as AnalyticsEventRow));

    return NextResponse.json({ success: true, total, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg || "Server error" },
      { status: 500 },
    );
  }
}
