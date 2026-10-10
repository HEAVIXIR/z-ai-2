import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { preflightAIRequest, recordAICost } from "@/lib/ai-policy";
import ZAI from "z-ai-web-dev-sdk";

/* ============================================================
   GET /api/ai-sales-agent (Priority #39)
   AI classifies seller's leads and suggests responses.

   STEP 11.42 GATEWAY PHASE 1: added preflightAIRequest (auth + quota +
   budget + size cap), recordAICost (cost tracking), and AIGatewayLog
   (usage logging). The route keeps its existing logic + output format
   — only Gateway controls are added, no API breaking change.

   NOTE: this is a GET route with no request body. The "input" logged
   to AIGatewayLog is a synthetic summary of the leads/offers passed
   to the LLM (best-effort, truncated). The LLM call is wrapped in a
   try/catch with a heuristic fallback — on LLM failure the route
   still returns success:true with the fallback classification, but
   we log the failure to AIGatewayLog for budget/quota tracking.
   ============================================================ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get user's listings + leads + offers
  const userListings = await db.listing.findMany({
    where: { sellerId: user.id },
    select: { id: true, title: true, slug: true, price: true, viewCount: true },
    take: 20,
  });
  const listingIds = userListings.map((l) => l.id);

  const [leads, offers] = await Promise.all([
    db.lead.findMany({
      where: { listingId: { in: listingIds } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { listing: { select: { title: true } } },
    }),
    db.listingOffer.findMany({
      where: { listingId: { in: listingIds } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { listing: { select: { title: true, price: true } } },
    }),
  ]);

  // STEP 11.42 GATEWAY PHASE 1: pre-flight check (policy + auth + quota + budget)
  // Synthetic input summary — used for both inputLength and the AIGatewayLog
  // input field (best-effort, truncated). No real req body on a GET.
  const inputSummary = {
    listingCount: userListings.length,
    leadCount: leads.length,
    offerCount: offers.length,
  };
  const inputLen = Math.min(1_000_000, JSON.stringify(inputSummary).length);
  const preflight = await preflightAIRequest({
    taskType: "SELLER_ASSISTANT",
    user: { id: user.id },
    inputLength: inputLen,
  });
  if (!preflight.ok) {
    return NextResponse.json(
      { error: preflight.reason },
      { status: preflight.statusCode },
    );
  }
  const { policy } = preflight;
  const startTime = Date.now();

  // Classify leads using AI
  let classification: any = { highPriority: [], mediumPriority: [], lowPriority: [], suggestions: [] };

  try {
    const zai = await ZAI.create();
    const leadSummary = leads.slice(0, 10).map((l) => ({
      type: l.leadType,
      listing: l.listing?.title,
      note: l.note,
      viewerPhone: l.viewerPhone,
    }));
    const offerSummary = offers.slice(0, 5).map((o) => ({
      amount: o.offerAmount?.toString(),
      status: o.status,
      listing: o.listing?.title,
      listingPrice: o.listing?.price?.toString(),
    }));

    const llmRes = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `تو دستیار فروش هویکس هستی. سرنخ‌های فروشنده را تحلیل کن و:
1. سرنخ‌های با اولویت بالا/متوسط/پایین را دسته‌بندی کن
2. ۳ پیشنهاد عملی برای بهبود فروش بده
فقط JSON برگردان: {"highPriority":[],"mediumPriority":[],"lowPriority":[],"suggestions":["","",""]}`,
        },
        {
          role: "user",
          content: `سرنخ‌ها: ${JSON.stringify(leadSummary)}\nپیشنهادها: ${JSON.stringify(offerSummary)}`,
        },
      ],
      thinking: { type: "disabled" },
    });

    const content = llmRes.choices?.[0]?.message?.content ?? "";
    const m = content.match(/\{[\s\S]*\}/);
    if (m) classification = JSON.parse(m[0]);

    // STEP 11.42 GATEWAY PHASE 1: record cost + success log
    const latencyMs = Date.now() - startTime;
    const recordedCost = policy.costCeilingUsd;
    try {
      await recordAICost("SELLER_ASSISTANT", recordedCost, user.id);
    } catch { /* best-effort */ }
    try {
      await db.aIGatewayLog.create({
        data: {
          taskType: "SELLER_ASSISTANT",
          model: policy.model === "default" ? "z-ai-default" : policy.model,
          input: JSON.stringify(inputSummary).substring(0, 500),
          output: JSON.stringify(classification).substring(0, 500),
          latencyMs,
          cost: recordedCost || null,
          success: true,
          userId: user.id,
        },
      });
    } catch { /* best-effort */ }
  } catch (err: any) {
    // Fallback classification (existing behavior)
    classification = {
      highPriority: offers.filter((o) => o.status === "PENDING").map((o) => `پیشنهاد قیمت برای ${o.listing?.title}`),
      mediumPriority: leads.filter((l) => l.leadType === "OFFER" || l.leadType === "CONTACT").map((l) => `تماس برای ${l.listing?.title}`),
      lowPriority: leads.filter((l) => l.leadType === "VIEW").map((l) => `بازدید ${l.listing?.title}`),
      suggestions: [
        "به پیشنهادهای قیمت معوق پاسخ دهید",
        "آگهی‌های با بازدید کم را ویژه کنید",
        "تصاویر آگهی‌ها را بهبود دهید",
      ],
    };

    // STEP 11.42 GATEWAY PHASE 1: log failure to AIGatewayLog
    try {
      await db.aIGatewayLog.create({
        data: {
          taskType: "SELLER_ASSISTANT",
          model: policy?.model === "default" ? "z-ai-default" : (policy?.model ?? "z-ai-default"),
          input: JSON.stringify(inputSummary).substring(0, 500),
          output: null,
          latencyMs: Date.now() - startTime,
          cost: 0,
          success: false,
          error: err?.message ?? "unknown",
          userId: user.id,
        },
      });
    } catch { /* best-effort */ }
  }

  return NextResponse.json({
    success: true,
    stats: {
      totalLeads: leads.length,
      totalOffers: offers.length,
      pendingOffers: offers.filter((o) => o.status === "PENDING").length,
      totalViews: userListings.reduce((s, l) => s + (l.viewCount || 0), 0),
    },
    classification,
  });
}
