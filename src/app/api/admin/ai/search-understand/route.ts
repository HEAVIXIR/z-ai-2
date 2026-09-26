import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { understandQuery } from "@/lib/ai-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   POST /api/admin/ai/search-understand
   ------------------------------------------------------------
   Admin-only. Permission: ai.execute.
   Body: { query }
   Returns: { ok, understanding } where understanding.source === "AI_SUGGESTED".

   Phase 10 / 10B — AI Search Enhancement.
   ============================================================ */

export async function POST(req: Request) {
  const [user, error] = await requireAdmin("ai.execute");
  if (error) return error;

  try {
    const body = await req.json().catch(() => ({}));
    const query = String(body.query ?? "").trim();

    if (!query) {
      return NextResponse.json(
        { error: "query is required" },
        { status: 400 },
      );
    }
    if (query.length > 1000) {
      return NextResponse.json(
        { error: "query is too long (max 1000 chars)" },
        { status: 400 },
      );
    }

    const result = await understandQuery({
      query,
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
      understanding: result.understanding,
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
