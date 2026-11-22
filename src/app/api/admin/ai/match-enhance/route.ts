import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { checkCsrf } from "@/lib/csrf";
import { readBoundedJson } from "@/lib/read-bounded-json";
import { executeAdminAIWithPolicy } from "@/lib/admin-ai-gateway";
import { enhanceMatchScore, generateMatchExplanation, type BuyRequestInput, type CandidateListingInput } from "@/lib/ai-matching-enhanced";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const [user, error] = await requireAdmin("ai.execute");
  if (error) return error;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkCsrf(req)) return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  const parsed = await readBoundedJson<unknown>(req, 64 * 1024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  const body = parsed.value as Record<string, unknown>;
  const mode = String(body.mode ?? "score").toLowerCase();
  const buyRequest = body.buyRequest as BuyRequestInput | undefined;
  if (!buyRequest?.id || !buyRequest.title) return NextResponse.json({ error: "buyRequest { id, title } is required", ok: false }, { status: 400 });

  if (mode === "explain") {
    const listing = body.listing as CandidateListingInput | undefined;
    if (!listing?.id || !listing.title) return NextResponse.json({ error: "listing { id, title } is required for explain mode", ok: false }, { status: 400 });
    const input = { buyRequest, listing, matchScore: typeof body.matchScore === "number" ? body.matchScore : undefined };
    const run = await executeAdminAIWithPolicy({ userId: user.id, taskType: "MARKET_ANALYST", input, execute: async () => {
      const result = await generateMatchExplanation({ ...input, userId: user.id });
      if (!result.success) throw new Error(result.error);
      return result.explanation;
    }});
    if (!run.ok) return NextResponse.json({ error: run.error, ok: false }, { status: run.statusCode });
    return NextResponse.json({ ok: true, explanation: run.output, source: "AI_SUGGESTED", verified: false });
  }

  if (mode === "score") {
    const candidateListings = Array.isArray(body.candidateListings) ? body.candidateListings as CandidateListingInput[] : [];
    if (!candidateListings.length) return NextResponse.json({ error: "candidateListings[] is required for score mode", ok: false }, { status: 400 });
    if (candidateListings.length > 50) return NextResponse.json({ error: "candidateListings max 50 per call", ok: false }, { status: 400 });
    const input = { buyRequest, candidateListings };
    const run = await executeAdminAIWithPolicy({ userId: user.id, taskType: "MARKET_ANALYST", input, execute: async () => {
      const result = await enhanceMatchScore({ ...input, userId: user.id });
      if (!result.success) throw new Error(result.error);
      return result.matches;
    }});
    if (!run.ok) return NextResponse.json({ error: run.error, ok: false }, { status: run.statusCode });
    return NextResponse.json({ ok: true, matches: run.output, source: "AI_SUGGESTED", verified: false });
  }
  return NextResponse.json({ error: "mode must be score | explain" }, { status: 400 });
}