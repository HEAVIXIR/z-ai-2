import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { preflightAIRequest, recordAICost } from "@/lib/ai-policy";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* POST /api/ai-listing-builder — description → LLM extracts structured data.
   Body: { description, brandName?, categoryName? }
   Returns: { title, brand, model, year, hours, condition, price, location, ... }

   STEP 11.32 R-3 FIX: added getCurrentUser() auth check.
   STEP 11.42 GATEWAY PHASE 1: added preflightAIRequest (auth + quota +
   budget + size cap), recordAICost (cost tracking), and AIGatewayLog
   (usage logging). The route keeps its existing logic + output format
   — only Gateway controls are added, no API breaking change.
*/
export async function POST(req: Request) {
  // STEP 11.32 R-3 FIX: require authentication.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const description = String(body.description ?? "").trim();
  if (!description) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  // STEP 11.42 GATEWAY PHASE 1: pre-flight check (policy + auth + quota + budget)
  const inputLen = Math.min(1_000_000, JSON.stringify(body ?? "").length);
  const preflight = await preflightAIRequest({
    taskType: "LISTING_BUILDER",
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
    const zai = await ZAI.create();
    const sys = `You are HEAVIX listing builder. From a free-text description (often Persian) of a heavy-machinery sale ad, extract structured JSON with these keys (omit if not present):
{
  "title": "concise listing title in Persian",
  "brand": "Persian brand name",
  "model": "model name",
  "year": number,
  "hours": number,
  "condition": "NEW" | "USED" | "REFURBISHED" | "FOR_PARTS",
  "price": number (Toman digits only),
  "priceType": "NEGOTIABLE" | "FIXED" | "CALL_FOR_PRICE",
  "province": "Persian province",
  "city": "Persian city",
  "specs": { "engine": "...", "transmission": "...", ... }
}
Return ONLY JSON.`;
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: description },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion?.choices?.[0]?.message?.content || "";
    const jsonStr = raw.replace(/```json|```/g, "").trim();
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    const extracted: any =
      start >= 0 && end > start ? JSON.parse(jsonStr.slice(start, end + 1)) : {};

    // STEP 11.42 GATEWAY PHASE 1: record cost + log to AIGatewayLog
    const latencyMs = Date.now() - startTime;
    const recordedCost = policy.costCeilingUsd;
    try {
      await recordAICost("LISTING_BUILDER", recordedCost, user.id);
    } catch { /* best-effort */ }
    try {
      await db.aIGatewayLog.create({
        data: {
          taskType: "LISTING_BUILDER",
          model: policy.model === "default" ? "z-ai-default" : policy.model,
          input: JSON.stringify(body).substring(0, 500),
          output: JSON.stringify(extracted).substring(0, 500),
          latencyMs,
          cost: recordedCost || null,
          success: true,
          userId: user.id,
        },
      });
    } catch { /* best-effort */ }

    return NextResponse.json({ extracted, source: description });
  } catch (err: any) {
    // STEP 11.42 GATEWAY PHASE 1: log failure to AIGatewayLog
    try {
      await db.aIGatewayLog.create({
        data: {
          taskType: "LISTING_BUILDER",
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
