import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import {
  detectPriceAnomalies,
  detectFraudSignals,
  suggestNextActions,
} from "@/lib/ai-operational";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   GET /api/admin/ai/operational-signals
   ------------------------------------------------------------
   Admin-only. Permission: ai.execute.

   Query params:
     ?windowDays=30   — anomaly window (default 30)
     ?thresholdPct=50 — min |deviation| to flag (default 50)

   Returns: { ok, anomalyReport, source: "AI_SUGGESTED" }.

   Phase 10 / 10E — AI Operational Signals.
   ============================================================ */

export async function GET(req: Request) {
  const [user, error] = await requireAdmin("ai.execute");
  if (error) return error;

  try {
    const url = new URL(req.url, "http://localhost");
    const windowDays = Number(url.searchParams.get("windowDays") ?? 30) || 30;
    const thresholdPct = Number(url.searchParams.get("thresholdPct") ?? 50) || 50;

    const result = await detectPriceAnomalies({
      windowDays,
      thresholdPct,
      userId: user?.id ?? null,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, ok: false },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      anomalyReport: result.report,
      source: "AI_SUGGESTED",
      verified: false,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error", ok: false },
      { status: 500 },
    );
  }
}

/* ============================================================
   POST /api/admin/ai/operational-signals
   ------------------------------------------------------------
   Admin-only. Permission: ai.execute.

   Body (one of two modes):
     { mode: "fraud",   listing, seller? }
     { mode: "suggest", userId }

   Returns: { ok, ... } with source === "AI_SUGGESTED".
   ============================================================ */

export async function POST(req: Request) {
  const [user, error] = await requireAdmin("ai.execute");
  if (error) return error;

  try {
    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode ?? "fraud").toLowerCase();

    if (mode === "fraud") {
      const listing = body.listing;
      if (!listing || typeof listing !== "object") {
        return NextResponse.json(
          { error: "listing object is required", ok: false },
          { status: 400 },
        );
      }
      const seller =
        body.seller && typeof body.seller === "object"
          ? (body.seller as Record<string, unknown>)
          : null;

      const result = await detectFraudSignals({
        listing: listing as Record<string, unknown>,
        seller,
        userId: user?.id ?? null,
      });
      if (!result.success) {
        return NextResponse.json(
          { error: result.error, ok: false },
          { status: 502 },
        );
      }
      return NextResponse.json({
        ok: true,
        fraudReport: result.report,
        source: "AI_SUGGESTED",
        verified: false,
      });
    }

    if (mode === "suggest") {
      const targetUserId = String(body.userId ?? "").trim();
      if (!targetUserId) {
        return NextResponse.json(
          { error: "userId is required", ok: false },
          { status: 400 },
        );
      }
      const context =
        body.context && typeof body.context === "object"
          ? (body.context as Record<string, unknown>)
          : null;

      const result = await suggestNextActions({
        userId: targetUserId,
        context,
      });
      if (!result.success) {
        return NextResponse.json(
          { error: result.error, ok: false },
          { status: 502 },
        );
      }
      return NextResponse.json({
        ok: true,
        suggestion: result.suggestion,
        source: "AI_SUGGESTED",
        verified: false,
      });
    }

    return NextResponse.json(
      { error: "mode must be one of: fraud | suggest", ok: false },
      { status: 400 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error", ok: false },
      { status: 500 },
    );
  }
}
