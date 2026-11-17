import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { preflightAIRequest, recordAICost } from "@/lib/ai-policy";
import ZAI from "z-ai-web-dev-sdk";
import { checkCsrf } from "@/lib/csrf";
import { readBoundedJson } from "@/lib/read-bounded-json";
import {
  validateLLMJson,
  listingBuilderSchema,
  MAX_LISTING_BUILDER_OUTPUT_CHARS,
} from "@/lib/ai-gateway-validation";

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

  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }

  const parsedBody = await readBoundedJson<unknown>(req, 64 * 1024);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: parsedBody.error },
      { status: parsedBody.status },
    );
  }
  if (!parsedBody.value || typeof parsedBody.value !== "object" || Array.isArray(parsedBody.value)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = parsedBody.value as Record<string, unknown>;
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!description) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }
  if (description.length > 20_000) {
    return NextResponse.json({ error: "description is too long" }, { status: 400 });
  }

  // STEP 11.42 GATEWAY PHASE 1: pre-flight check (policy + auth + quota + budget)
  const inputLen = JSON.stringify(body).length;
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

  // STEP 11.43 TIMEOUT HARDENING: abort the LLM call if it exceeds
  // policy.timeoutMs. The signal is passed to zai.chat.completions.create;
  // an AbortError is detected in the catch block and surfaced as 504.
  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => controller.abort(), policy.timeoutMs);

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
      signal: controller.signal,
    } as any);
    const raw = completion?.choices?.[0]?.message?.content || "";
    const validated = validateLLMJson(
      raw,
      listingBuilderSchema,
      MAX_LISTING_BUILDER_OUTPUT_CHARS,
    );
    if (!validated.success) {
      const validationError = new Error("AI output validation failed") as Error & { code?: string };
      validationError.code = "AI_OUTPUT_INVALID";
      throw validationError;
    }
    const extracted = validated.data;

    // STEP 11.42 GATEWAY PHASE 1: record cost + log to AIGatewayLog
    const latencyMs = Date.now() - startTime;
    const recordedCost = policy.costCeilingUsd;
    clearTimeout(timeoutTimer);
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
    // STEP 11.43 TIMEOUT HARDENING: detect AbortError → 504 Gateway Timeout
    if (err?.name === "AbortError" || controller.signal.aborted) {
      clearTimeout(timeoutTimer);
      const latencyMs = Date.now() - startTime;
      try {
        await db.aIGatewayLog.create({
          data: {
            taskType: "LISTING_BUILDER",
            model: policy?.model === "default" ? "z-ai-default" : (policy?.model ?? "z-ai-default"),
            input: JSON.stringify(body).substring(0, 500),
            output: null,
            latencyMs,
            cost: 0,
            success: false,
            error: `timeout after ${policy?.timeoutMs ?? 30000}ms`,
            userId: user.id,
          },
        });
      } catch { /* best-effort */ }
      return NextResponse.json(
        { error: "Gateway Timeout" },
        { status: 504 },
      );
    }
    // STEP 11.42 GATEWAY PHASE 1: log failure to AIGatewayLog
    clearTimeout(timeoutTimer);
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
    if (err?.code === "AI_OUTPUT_INVALID") {
      return NextResponse.json(
        { error: "AI returned an invalid listing structure" },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: "Unable to build listing from description" },
      { status: 500 },
    );
  }
}
