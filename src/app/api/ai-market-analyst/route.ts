import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/auth-helpers/require-admin";
import { preflightAIRequest, recordAICost } from "@/lib/ai-policy";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* POST /api/ai-market-analyst
   Body: { question }
   Admin-only. Aggregates market data and asks AI to analyze it.

   STEP 11.42 GATEWAY PHASE 1: added preflightAIRequest (auth + quota +
   budget + size cap), recordAICost (cost tracking), and AIGatewayLog
   (usage logging). The route keeps its existing logic + output format
   — only Gateway controls are added, no API breaking change.

   DEFENSE-IN-DEPTH: requireAdminPermission("ai.execute") is KEPT. The
   preflight also runs RBAC (checkAIAuth on the policy's allowedRoles)
   and adds the policy/quota/budget gates that requireAdminPermission
   does not provide. Both checks run.
*/
export async function POST(req: Request) {
  // STEP 11.38: defense-in-depth — explicit RBAC permission check.
  const __auth = await requireAdminPermission("ai.execute");
  if (__auth.error) return __auth.error;
  const user = __auth.user;

  const body = await req.json().catch(() => ({}));
  const question = String(body.question ?? "").trim();
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  // STEP 11.42 GATEWAY PHASE 1: pre-flight check (policy + auth + quota + budget)
  const inputLen = Math.min(1_000_000, JSON.stringify(body ?? "").length);
  const preflight = await preflightAIRequest({
    taskType: "MARKET_ANALYST",
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

  try {
    // Gather market context
    const totalListings = await db.listing.count();
    const published = await db.listing.count({ where: { status: "PUBLISHED" } });
    const sold = await db.listing.count({ where: { status: "SOLD" } });
    const avgPrice = await db.listing.aggregate({
      _avg: { price: true },
      where: { price: { not: null }, status: "PUBLISHED" },
    });
    const totalRequests = await db.buyRequest.count({ where: { status: "ACTIVE" } });
    const topBrands = await db.brand.findMany({
      include: { _count: { select: { listings: true } } },
      take: 30,
    });
    const topCategories = await db.category.findMany({
      include: { _count: { select: { listings: true } } },
      take: 30,
    });
    const recentListings = await db.listing.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: { title: true, price: true, province: true, brandId: true, categoryId: true },
    });

    const context = {
      stats: {
        totalListings,
        published,
        sold,
        avgPrice: avgPrice._avg.price
          ? Number(avgPrice._avg.price).toFixed(0)
          : null,
        totalRequests,
      },
      topBrands: topBrands
        .map((b) => ({ name: b.name, count: b._count.listings }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      topCategories: topCategories
        .map((c) => ({ name: c.name, count: c._count.listings }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      recentListings: recentListings.map((l) => ({
        title: l.title,
        price: l.price ? l.price.toString() : null,
        province: l.province,
      })),
    };

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You are HEAVIX market analyst assistant. Answer the admin's question in Persian using the provided market data context. Be concise and data-driven.",
        },
        {
          role: "user",
          content: `MARKET DATA:\n${JSON.stringify(context, null, 2)}\n\nQUESTION: ${question}`,
        },
      ],
      thinking: { type: "disabled" },
    });
    const answer = completion?.choices?.[0]?.message?.content || "";

    // STEP 11.42 GATEWAY PHASE 1: record cost + log to AIGatewayLog
    const latencyMs = Date.now() - startTime;
    const recordedCost = policy.costCeilingUsd;
    try {
      await recordAICost("MARKET_ANALYST", recordedCost, user.id);
    } catch { /* best-effort */ }
    try {
      await db.aIGatewayLog.create({
        data: {
          taskType: "MARKET_ANALYST",
          model: policy.model === "default" ? "z-ai-default" : policy.model,
          input: JSON.stringify(body).substring(0, 500),
          output: JSON.stringify({ answer }).substring(0, 500),
          latencyMs,
          cost: recordedCost || null,
          success: true,
          userId: user.id,
        },
      });
    } catch { /* best-effort */ }

    return NextResponse.json({
      question,
      answer,
      context,
    });
  } catch (err: any) {
    // STEP 11.42 GATEWAY PHASE 1: log failure to AIGatewayLog
    try {
      await db.aIGatewayLog.create({
        data: {
          taskType: "MARKET_ANALYST",
          model: policy?.model === "default" ? "z-ai-default" : (policy?.model ?? "z-ai-default"),
          input: JSON.stringify(body).substring(0, 500),
          output: null,
          latencyMs: Date.now() - startTime,
          cost: 0,
          success: false,
          error: err?.message ?? "unknown",
          userId: user.id,
        },
      });
    } catch { /* best-effort */ }
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
