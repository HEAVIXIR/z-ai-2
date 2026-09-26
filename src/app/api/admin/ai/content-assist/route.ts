import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import {
  generateArticleOutline,
  optimizeForSEO,
  checkListingQuality,
} from "@/lib/ai-content-assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   POST /api/admin/ai/content-assist
   ------------------------------------------------------------
   Admin-only. Permission: ai.execute.

   Body (one of three modes):
     { mode: "outline",  topic, keywords? }
     { mode: "seo",      title, content }
     { mode: "quality",  listing }

   Returns: { ok, ... } with source === "AI_SUGGESTED".

   Phase 10 / 10D — AI Content Assistant.
   ============================================================ */

export async function POST(req: Request) {
  const [user, error] = await requireAdmin("ai.execute");
  if (error) return error;

  try {
    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode ?? "outline").toLowerCase();

    if (mode === "outline") {
      const topic = String(body.topic ?? "").trim();
      if (!topic) {
        return NextResponse.json(
          { error: "topic is required", ok: false },
          { status: 400 },
        );
      }
      const result = await generateArticleOutline({
        topic,
        keywords: Array.isArray(body.keywords) ? body.keywords : [],
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
        outline: result.outline,
        source: "AI_SUGGESTED",
        verified: false,
      });
    }

    if (mode === "seo") {
      const title = String(body.title ?? "").trim();
      const content = String(body.content ?? "").trim();
      if (!title) {
        return NextResponse.json(
          { error: "title is required", ok: false },
          { status: 400 },
        );
      }
      const result = await optimizeForSEO({
        title,
        content,
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
        seo: result.seo,
        source: "AI_SUGGESTED",
        verified: false,
      });
    }

    if (mode === "quality") {
      const listing = body.listing;
      if (!listing || typeof listing !== "object") {
        return NextResponse.json(
          { error: "listing object is required", ok: false },
          { status: 400 },
        );
      }
      const result = await checkListingQuality({
        listing: listing as Record<string, unknown>,
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
        report: result.report,
        source: "AI_SUGGESTED",
        verified: false,
      });
    }

    return NextResponse.json(
      {
        error: "mode must be one of: outline | seo | quality",
        ok: false,
      },
      { status: 400 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error", ok: false },
      { status: 500 },
    );
  }
}
