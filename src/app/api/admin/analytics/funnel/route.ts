import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { getFunnelMetrics } from "@/lib/bi-service";
import {
  FUNNELS,
  isFunnelName,
  type FunnelName,
} from "@/lib/funnel-definitions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/analytics/funnel — Phase 11B funnel metrics API.
   ------------------------------------------------------------

   GET (requires analytics.read permission):
     ?funnel=SEARCH_TO_DEAL | WANTED_TO_DEAL | ORDER_TO_REVIEW |
              VISITOR_TO_BUYER | SELLER_ACTIVATION
     ?from=        ISO date — createdAt >=
     ?to=          ISO date — createdAt <=

   Returns:
     {
       success: true,
       funnel: FunnelName,
       dateRange: { from: string | null, to: string | null },
       totalUsersAtStart: number,
       totalUsersAtEnd: number,
       overallConversion: number,
       stages: Array<{
         stage: string,        // event type
         index: number,        // 0-based position
         users: number,        // distinct users reaching stage
         events: number,       // total events at stage
         conversionFromStart: number,
         conversionFromPrevious: number,
         dropOff: number,
         dropOffRate: number,
       }>,
     }

   Pattern: getCurrentUser() → requirePermission(user.id,
   'analytics.read'). The synthetic 'ADMIN' user returned for
   admin-cookie sessions still passes requirePermission() because
   can('ADMIN', ...) short-circuits to true.
   ============================================================ */

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
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

  // ── 2. Parse params ──
  const url = new URL(req.url);
  const sp = url.searchParams;

  const funnelParam = (sp.get("funnel") ?? "").trim().toUpperCase();
  if (!isFunnelName(funnelParam)) {
    return NextResponse.json(
      {
        error: `Invalid funnel. Must be one of: ${Object.keys(FUNNELS).join(", ")}`,
      },
      { status: 400 },
    );
  }
  const funnelName: FunnelName = funnelParam;

  const from = parseDate(sp.get("from"));
  const to = parseDate(sp.get("to"));
  const dateRange = { from: from ?? undefined, to: to ?? undefined };

  // ── 3. Compute ──
  try {
    const metrics = await getFunnelMetrics(funnelName, dateRange);
    return NextResponse.json({ success: true, ...metrics });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg || "Server error" },
      { status: 500 },
    );
  }
}
