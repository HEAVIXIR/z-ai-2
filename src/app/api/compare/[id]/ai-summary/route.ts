import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/authorization";
import { generateAISummary } from "@/lib/compare-engine";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { COMPARE_AI_SUMMARY } from "@/lib/rate-limit-presets";
import { rateLimitKey } from "@/lib/request-context";

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
  const limited = rateLimit({
    key: rateLimitKey(user.id, COMPARE_AI_SUMMARY.label),
    limit: COMPARE_AI_SUMMARY.limit,
    windowMs: COMPARE_AI_SUMMARY.windowMs,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "تعداد درخواست‌های خلاصه هوش مصنوعی بیش از حد مجاز است." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limited.resetAt)), "Cache-Control": "private, no-store" } },
    );
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
      select: { id: true, userId: true, status: true },
    });
    if (!session) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (session.status === "ARCHIVED") {
      return NextResponse.json({ error: "Session archived" }, { status: 410 });
    }
    const isOwner = session.userId === user.id;
    const is_admin = await isAdmin(user.id);
    if (!isOwner && !is_admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const summary = await generateAISummary(id);
    return NextResponse.json({ summary }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: any) {
    const msg = err?.message ?? "Server error";
    const status = msg.includes("not found") ? 404 : msg.includes("حداقل") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
