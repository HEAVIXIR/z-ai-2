import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseNumber } from "@/lib/api-helpers";
import { preflightAIRequest, recordAICost } from "@/lib/ai-policy";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* POST /api/ai-price-suggestion
   Body: { brandId?, categoryId?, year?, condition?, workingHours?, province?, description? }
   Returns: { min, max, suggested, currency, samples, confidence }

   STEP 11.32 R-3 FIX: added getCurrentUser() auth check.
   STEP 11.42 GATEWAY PHASE 1: added preflightAIRequest (auth + quota +
   budget + size cap), recordAICost (cost tracking), and AIGatewayLog
   (usage logging). The route keeps its existing logic + output format
   — only Gateway controls are added, no API breaking change.

   NOTE: the LLM call here is OPTIONAL — it refines the median estimate.
   If the LLM fails, the route falls back to the median (existing
   behavior). We still log both success and failure of the LLM call to
   AIGatewayLog so budget/quota tracking stays accurate.
*/
export async function POST(req: Request) {
  // STEP 11.32 R-3 FIX: require authentication.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));

    const where: any = { status: "PUBLISHED", price: { not: null } };
    if (body.brandId) where.brandId = body.brandId;
    if (body.categoryId) where.categoryId = body.categoryId;
    if (body.condition) where.condition = body.condition;
    if (body.province) where.province = { contains: body.province };
    if (body.year) {
      const y = parseNumber(body.year);
      if (y) where.year = { gte: y - 3, lte: y + 3 };
    }

    const samples = await db.listing.findMany({
      where,
      select: {
        price: true,
        year: true,
        workingHours: true,
        condition: true,
        province: true,
        brand: { select: { name: true } },
      },
      take: 50,
    });

    if (samples.length === 0) {
      return NextResponse.json({
        suggested: null,
        min: null,
        max: null,
        samples: 0,
        confidence: "LOW",
        message: "نمونه کافی برای پیشنهاد قیمت وجود ندارد",
      });
    }

    const prices = samples
      .map((s) => Number(s.price))
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const median = prices[Math.floor(prices.length / 2)];
    const min = prices[0];
    const max = prices[prices.length - 1];

    // STEP 11.42 GATEWAY PHASE 1: pre-flight check (policy + auth + quota + budget)
    // Run before invoking the LLM (the LLM is optional but still gated).
    const inputLen = Math.min(1_000_000, JSON.stringify(body ?? "").length);
    const preflight = await preflightAIRequest({
      taskType: "PRICE_ANALYSIS",
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

    // STEP 11.43 TIMEOUT HARDENING: abort the LLM call if it exceeds
    // policy.timeoutMs. The signal is passed to zai.chat.completions.create;
    // an AbortError is detected in the inner catch block and surfaced as 504.
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), policy.timeoutMs);

    // LLM refinement (optional, falls back to median if AI fails)
    let suggested = Math.round(median);
    let aiNote = "";
    try {
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "You are a heavy-machinery pricing assistant. Given stats about similar listings and the user's machine specs, suggest a fair asking price (Toman, digits only). Return JSON {price:number,note:string}.",
          },
          {
            role: "user",
            content: JSON.stringify({
              samples: {
                count: prices.length,
                avg: Math.round(avg),
                median,
                min,
                max,
              },
              machine: {
                brandId: body.brandId,
                categoryId: body.categoryId,
                year: body.year,
                condition: body.condition,
                hours: body.workingHours,
                province: body.province,
                description: body.description,
              },
            }),
          },
        ],
        thinking: { type: "disabled" },
        signal: controller.signal,
      } as any);
      const raw = completion?.choices?.[0]?.message?.content || "";
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (parsed.price) suggested = Math.round(Number(parsed.price));
        if (parsed.note) aiNote = String(parsed.note);
      }

      // STEP 11.42 GATEWAY PHASE 1: record cost + success log
      const latencyMs = Date.now() - startTime;
      const recordedCost = policy.costCeilingUsd;
      clearTimeout(timeoutTimer);
      try {
        await recordAICost("PRICE_ANALYSIS", recordedCost, user.id);
      } catch { /* best-effort */ }
      try {
        await db.aIGatewayLog.create({
          data: {
            taskType: "PRICE_ANALYSIS",
            model: policy.model === "default" ? "z-ai-default" : policy.model,
            input: JSON.stringify(body).substring(0, 500),
            output: JSON.stringify({ suggested, aiNote }).substring(0, 500),
            latencyMs,
            cost: recordedCost || null,
            success: true,
            userId: user.id,
          },
        });
      } catch { /* best-effort */ }
    } catch (err: any) {
      // STEP 11.43 TIMEOUT HARDENING: detect AbortError. The LLM here is
      // OPTIONAL — on timeout we still fall back to the median (existing
      // behavior, API compatibility preserved) but log the timeout to
      // AIGatewayLog so budget/quota tracking stays accurate.
      clearTimeout(timeoutTimer);
      const isTimeout = err?.name === "AbortError" || controller.signal.aborted;
      // fallback (existing behavior) — but log the LLM failure
      try {
        await db.aIGatewayLog.create({
          data: {
            taskType: "PRICE_ANALYSIS",
            model: policy?.model === "default" ? "z-ai-default" : (policy?.model ?? "z-ai-default"),
            input: JSON.stringify(body).substring(0, 500),
            output: null,
            latencyMs: Date.now() - startTime,
            cost: 0,
            success: false,
            error: isTimeout
              ? `timeout after ${policy?.timeoutMs ?? 30000}ms`
              : (err?.message ?? "unknown"),
            userId: user.id,
          },
        });
      } catch { /* best-effort */ }
    }

    const confidence =
      prices.length >= 15 ? "HIGH" : prices.length >= 5 ? "MEDIUM" : "LOW";

    return NextResponse.json({
      suggested: suggested.toString(),
      min: min.toString(),
      max: max.toString(),
      avg: Math.round(avg).toString(),
      median: median.toString(),
      samples: prices.length,
      confidence,
      aiNote: aiNote || undefined,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
