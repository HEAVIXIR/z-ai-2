import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/authorization";
import { generateAISummary, getComparisonData } from "@/lib/compare-engine";
import { preflightAIRequest, recordAICost } from "@/lib/ai-policy";
import { trackError } from "@/lib/error-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   POST /api/compare/[id]/ai-summary — generate (and cache) a
   Persian AI summary of the comparison. No winner declaration.
   Returns: { summary: string }

   STEP 11.32 R-3 FIX: added getCurrentUser() auth check.
   STEP 11.34 P1-B FIX: added session-ownership check. Previously
   any authenticated user could trigger AI summary generation on
   ANY session ID (cost abuse + the summary is cached on the
   session via aiSummary/aiSummaryAt fields). Now only the session
   owner or an admin can trigger generation.
   ============================================================ */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // STEP 11.32 R-3 FIX: require authentication.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;

    // STEP 11.34 P1-B FIX: session-ownership check. Load the session
    // and verify the authenticated user owns it (or is admin). This
    // prevents cost abuse (triggering LLM calls on other users'
    // sessions) and unauthorized cache mutation (aiSummary/aiSummaryAt
    // are written on the session row).
    const session = await db.comparisonSession.findUnique({
      where: { id },
      select: { id: true, userId: true, aiSummary: true, aiSummaryAt: true },
    });
    if (!session) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const isOwner = session.userId === user.id;
    const is_admin = await isAdmin(user.id);
    if (!isOwner && !is_admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Reuse a recent summary so repeated clicks do not repeatedly invoke the model.
    const cacheFresh =
      session.aiSummary &&
      session.aiSummaryAt &&
      Date.now() - session.aiSummaryAt.getTime() < 60 * 60 * 1000;
    if (cacheFresh) {
      return NextResponse.json({ summary: session.aiSummary, cached: true });
    }

    const comparisonData = await getComparisonData(id);
    if (comparisonData.items.length < 2) {
      return NextResponse.json(
        { summary: "حداقل دو مورد برای خلاصه‌سازی لازم است." },
        { status: 400 },
      );
    }

    // Bound the complete server-derived comparison payload, not a
    // partial projection. generateAISummary includes price ranges and
    // cross-category metadata; omitting those here undercounted the
    // actual model input and could bypass the configured size ceiling.
    const inputLength = JSON.stringify(comparisonData).length;

    const preflight = await preflightAIRequest({
      taskType: "COMPARE_SUMMARY",
      user: { id: user.id },
      inputLength,
    });
    if (!preflight.ok) {
      return NextResponse.json(
        { error: preflight.reason },
        { status: preflight.statusCode },
      );
    }

    const startedAt = Date.now();
    const summary = await generateAISummary(id, comparisonData);
    const latencyMs = Date.now() - startedAt;
    const estimatedCost = preflight.policy.costCeilingUsd;

    try {
      await recordAICost("COMPARE_SUMMARY", estimatedCost, user.id);
    } catch {
      // The summary remains available; budget accounting failures are monitored.
    }
    try {
      await db.aIGatewayLog.create({
        data: {
          taskType: "COMPARE_SUMMARY",
          model: preflight.policy.model === "default" ? "z-ai-default" : preflight.policy.model,
          input: JSON.stringify({ comparisonId: id, inputLength }).slice(0, 500),
          output: summary.slice(0, 500),
          latencyMs,
          cost: estimatedCost,
          success: true,
          userId: user.id,
        },
      });
    } catch {
      // Do not fail a successfully generated/fallback summary due to log failure.
    }

    return NextResponse.json({ summary, cached: false });
  } catch (err: unknown) {
    trackError(err, { endpoint: "POST /api/compare/[id]/ai-summary", userId: user.id });
    // Internal database/provider details must not be returned to callers.
    return NextResponse.json(
      { error: "خلاصه‌سازی در حال حاضر انجام نشد. لطفاً دوباره تلاش کنید." },
      { status: 500 },
    );
  }
}
