import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import {
  enhanceMatchScore,
  generateMatchExplanation,
  type BuyRequestInput,
  type CandidateListingInput,
} from "@/lib/ai-matching-enhanced";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   POST /api/admin/ai/match-enhance
   ------------------------------------------------------------
   Admin-only. Permission: ai.execute.

   Body (one of two modes):
     Mode A — score candidates:
       {
         mode: "score",
         buyRequest: BuyRequestInput,
         candidateListings: CandidateListingInput[]
       }
     Mode B — explain a single match:
       {
         mode: "explain",
         buyRequest: BuyRequestInput,
         listing: CandidateListingInput,
         matchScore?: number
       }

   Returns: { ok, ... } with source === "AI_SUGGESTED".

   Phase 10 / 10C — AI Matching Enhancement.
   ============================================================ */

export async function POST(req: Request) {
  const [user, error] = await requireAdmin("ai.execute");
  if (error) return error;

  try {
    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode ?? "score").toLowerCase();

    const buyRequest = body.buyRequest as BuyRequestInput | undefined;
    if (!buyRequest || !buyRequest.id || !buyRequest.title) {
      return NextResponse.json(
        { error: "buyRequest { id, title } is required", ok: false },
        { status: 400 },
      );
    }

    if (mode === "explain") {
      const listing = body.listing as CandidateListingInput | undefined;
      if (!listing || !listing.id || !listing.title) {
        return NextResponse.json(
          { error: "listing { id, title } is required for explain mode", ok: false },
          { status: 400 },
        );
      }
      const result = await generateMatchExplanation({
        buyRequest,
        listing,
        matchScore:
          typeof body.matchScore === "number" ? body.matchScore : undefined,
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
        explanation: result.explanation,
        source: "AI_SUGGESTED",
        verified: false,
      });
    }

    // Default: score candidates.
    const candidateListings = Array.isArray(body.candidateListings)
      ? (body.candidateListings as CandidateListingInput[])
      : [];
    if (candidateListings.length === 0) {
      return NextResponse.json(
        { error: "candidateListings[] is required for score mode", ok: false },
        { status: 400 },
      );
    }
    if (candidateListings.length > 50) {
      return NextResponse.json(
        { error: "candidateListings max 50 per call", ok: false },
        { status: 400 },
      );
    }

    const result = await enhanceMatchScore({
      buyRequest,
      candidateListings,
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
      matches: result.matches,
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
