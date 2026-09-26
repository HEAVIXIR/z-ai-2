import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { analyzeListing } from "@/lib/ai-listing-builder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   POST /api/admin/ai/listing-analyze
   ------------------------------------------------------------
   Admin-only. Permission: ai.execute.
   Body: { title, description?, images?, price? }
   Returns: { ok, analysis } where analysis.source === "AI_SUGGESTED".

   Phase 10 / 10A — AI Listing Builder Service.
   ============================================================ */

export async function POST(req: Request) {
  const [user, error] = await requireAdmin("ai.execute");
  if (error) return error;

  try {
    const body = await req.json().catch(() => ({}));
    const title = String(body.title ?? "").trim();
    const description =
      typeof body.description === "string" ? body.description : null;
    const images = Array.isArray(body.images) ? body.images : undefined;
    const price = body.price ?? null;

    if (!title) {
      return NextResponse.json(
        { error: "title is required" },
        { status: 400 },
      );
    }
    if (title.length > 500) {
      return NextResponse.json(
        { error: "title is too long (max 500 chars)" },
        { status: 400 },
      );
    }

    const result = await analyzeListing({
      title,
      description,
      images,
      price,
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
      analysis: result.analysis,
      // Re-flag at the top level for clients that don't inspect the
      // inner object — every AI response is AI_SUGGESTED, never verified.
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
