import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/authorization";
import { preflightAIRequest, recordAICost } from "@/lib/ai-policy";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/ai-seller-assistant?listingId=...
   Returns listing improvement suggestions.

   STEP 11.32 R-3 FIX: added getCurrentUser() auth check + ownership
   check (IDOR fix). Previously this route had NO authentication —
   anyone could call it and read any listing's data. Now only the
   listing's owner or an admin can access it.

   STEP 11.42 GATEWAY PHASE 1: added preflightAIRequest (auth + quota +
   budget + size cap), recordAICost (cost tracking), and AIGatewayLog
   (usage logging). The route keeps its existing logic + output format
   — only Gateway controls are added, no API breaking change.

   DEFENSE-IN-DEPTH: the IDOR ownership check (listing.sellerId ===
   user.id OR isAdmin) is KEPT. The preflight does NOT replace
   ownership — it only adds policy/quota/budget controls.
*/
export async function GET(req: Request) {
  // STEP 11.32 R-3 FIX: require authentication.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("listingId");
    if (!id) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }

    const listing = await db.listing.findUnique({
      where: { id },
      include: {
        brand: true,
        category: true,
        images: true,
      },
    });
    if (!listing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // STEP 11.32 R-3 FIX: ownership check (IDOR fix). Only the listing's
    // seller or an admin can access AI suggestions for this listing.
    // STEP 11.42: KEEP this check — the preflight does NOT replace it.
    const isOwner = listing.sellerId === user.id;
    const is_admin = await isAdmin(user.id);
    if (!isOwner && !is_admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Heuristic checks
    const issues: Array<{ field: string; severity: "high" | "medium" | "low"; message: string }> = [];
    if (listing.images.length === 0) {
      issues.push({ field: "images", severity: "high", message: "آگهی تصویر ندارد. حداقل ۳ تصویر اضافه کنید." });
    } else if (listing.images.length < 3) {
      issues.push({ field: "images", severity: "medium", message: `تنها ${listing.images.length} تصویر دارید. افزودن تصاویر بیشتر فروش را افزایش می‌دهد.` });
    }
    if (!listing.description || listing.description.length < 100) {
      issues.push({ field: "description", severity: "high", message: "توضیحات آگهی کوتاه است. جزئیات فنی، وضعیت و تاریخچه ماشین را اضافه کنید." });
    }
    if (!listing.price) {
      issues.push({ field: "price", severity: "high", message: "قیمت وارد نشده است. آگهی‌های دارای قیمت ۴ برابر بیشتر دیده می‌شوند." });
    }
    if (!listing.year) {
      issues.push({ field: "year", severity: "medium", message: "سال تولید را وارد کنید." });
    }
    if (listing.workingHours === null) {
      issues.push({ field: "workingHours", severity: "medium", message: "کارکرد ماشین را وارد کنید." });
    }
    if (!listing.province) {
      issues.push({ field: "province", severity: "low", message: "استان را مشخص کنید." });
    }
    if (!listing.brandId) {
      issues.push({ field: "brand", severity: "medium", message: "برند ماشین را مشخص کنید." });
    }

    // STEP 11.42 GATEWAY PHASE 1: pre-flight check (policy + auth + quota + budget)
    // Synthetic input summary — used for both inputLength and the AIGatewayLog
    // input field (best-effort, truncated). This is a GET route with no body.
    const inputSummary = {
      listingId: listing.id,
      title: listing.title,
      hasDescription: Boolean(listing.description),
      descLength: listing.description?.length ?? 0,
      hasPrice: Boolean(listing.price),
      year: listing.year,
      hours: listing.workingHours,
      brand: listing.brand?.name,
      category: listing.category?.name,
      imageCount: listing.images.length,
      province: listing.province,
      city: listing.city,
      condition: listing.condition,
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

    // STEP 11.43 TIMEOUT HARDENING: abort the LLM call if it exceeds
    // policy.timeoutMs. The signal is passed to zai.chat.completions.create;
    // an AbortError is detected in the catch block and surfaced as 504.
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), policy.timeoutMs);

    // LLM suggestions
    let aiSuggestions: string[] = [];
    try {
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "You are HEAVIX seller coach. Given a listing's data, return 3-5 actionable Persian bullet-point suggestions to improve its saleability. Return ONLY a JSON array of strings.",
          },
          {
            role: "user",
            content: JSON.stringify(inputSummary),
          },
        ],
        thinking: { type: "disabled" },
        signal: controller.signal,
      } as any);
      const raw = completion?.choices?.[0]?.message?.content || "";
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) {
        const arr = JSON.parse(m[0]);
        if (Array.isArray(arr)) aiSuggestions = arr.map(String);
      }

      // STEP 11.42 GATEWAY PHASE 1: record cost + success log
      const latencyMs = Date.now() - startTime;
      const recordedCost = policy.costCeilingUsd;
      clearTimeout(timeoutTimer);
      try {
        await recordAICost("SELLER_ASSISTANT", recordedCost, user.id);
      } catch { /* best-effort */ }
      try {
        await db.aIGatewayLog.create({
          data: {
            taskType: "SELLER_ASSISTANT",
            model: policy.model === "default" ? "z-ai-default" : policy.model,
            input: JSON.stringify(inputSummary).substring(0, 500),
            output: JSON.stringify(aiSuggestions).substring(0, 500),
            latencyMs,
            cost: recordedCost || null,
            success: true,
            userId: user.id,
          },
        });
      } catch { /* best-effort */ }
    } catch (err: any) {
      // STEP 11.43 TIMEOUT HARDENING: detect AbortError. The LLM here
      // has a heuristic fallback (empty array) — on timeout we still
      // return the listing with empty aiSuggestions (existing behavior,
      // API compatibility preserved) but log the timeout to AIGatewayLog
      // so budget/quota tracking stays accurate.
      clearTimeout(timeoutTimer);
      const isTimeout = err?.name === "AbortError" || controller.signal.aborted;
      // ignore (existing behavior — fallback to empty array)
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
            error: isTimeout
              ? `timeout after ${policy?.timeoutMs ?? 30000}ms`
              : (err?.message ?? "unknown"),
            userId: user.id,
          },
        });
      } catch { /* best-effort */ }
    }

    return NextResponse.json({
      listingId: listing.id,
      title: listing.title,
      issues,
      aiSuggestions,
      completeness: Math.max(0, 100 - issues.length * 12),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
