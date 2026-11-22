import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { checkCsrf } from "@/lib/csrf";
import { readBoundedJson } from "@/lib/read-bounded-json";
import { executeAdminAIWithPolicy } from "@/lib/admin-ai-gateway";
import { detectPriceAnomalies, detectFraudSignals, suggestNextActions } from "@/lib/ai-operational";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET is local median calculation over listing prices; it does not call an AI provider. */
export async function GET(req: Request) {
  const [user, error] = await requireAdmin("ai.execute");
  if (error) return error;
  try {
    const url = new URL(req.url, "http://localhost");
    const windowDays = Number(url.searchParams.get("windowDays") ?? 30) || 30;
    const thresholdPct = Number(url.searchParams.get("thresholdPct") ?? 50) || 50;
    const result = await detectPriceAnomalies({ windowDays, thresholdPct, userId: user?.id ?? null });
    if (!result.success) return NextResponse.json({ error: result.error, ok: false }, { status: 502 });
    return NextResponse.json({ ok: true, anomalyReport: result.report, source: "AI_SUGGESTED", verified: false });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error", ok: false }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const [user, error] = await requireAdmin("ai.execute");
  if (error) return error;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkCsrf(req)) return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  const parsed = await readBoundedJson<unknown>(req, 64 * 1024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const body = parsed.value as Record<string, unknown>;
  const mode = String(body.mode ?? "fraud").toLowerCase();

  if (mode === "fraud") {
    const listing = body.listing;
    if (!listing || typeof listing !== "object" || Array.isArray(listing)) return NextResponse.json({ error: "listing object is required", ok: false }, { status: 400 });
    const seller = body.seller && typeof body.seller === "object" && !Array.isArray(body.seller) ? body.seller as Record<string, unknown> : null;
    const input = { listing, seller };
    const run = await executeAdminAIWithPolicy({ userId: user.id, taskType: "MARKET_ANALYST", input, execute: async () => {
      const result = await detectFraudSignals({ listing: listing as Record<string, unknown>, seller, userId: user.id });
      if (!result.success) throw new Error(result.error);
      return result.report;
    }});
    if (!run.ok) return NextResponse.json({ error: run.error, ok: false }, { status: run.statusCode });
    return NextResponse.json({ ok: true, fraudReport: run.output, source: "AI_SUGGESTED", verified: false });
  }

  if (mode === "suggest") {
    const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!targetUserId) return NextResponse.json({ error: "userId is required", ok: false }, { status: 400 });
    const context = body.context && typeof body.context === "object" && !Array.isArray(body.context) ? body.context as Record<string, unknown> : null;
    const input = { userId: targetUserId, context };
    const run = await executeAdminAIWithPolicy({ userId: user.id, taskType: "MARKET_ANALYST", input, execute: async () => {
      const result = await suggestNextActions({ userId: targetUserId, context });
      if (!result.success) throw new Error(result.error);
      return result.suggestion;
    }});
    if (!run.ok) return NextResponse.json({ error: run.error, ok: false }, { status: run.statusCode });
    return NextResponse.json({ ok: true, suggestion: run.output, source: "AI_SUGGESTED", verified: false });
  }
  return NextResponse.json({ error: "mode must be fraud | suggest" }, { status: 400 });
}