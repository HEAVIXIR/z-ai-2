import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { preflightAIRequest, recordAICost } from "@/lib/ai-policy";
import { getAIProviderConfigPublic } from "@/lib/ai-provider-router";
import { analyzeListing } from "@/lib/ai-listing-builder";
import { checkCsrf } from "@/lib/csrf";
import { readBoundedJson } from "@/lib/read-bounded-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/ai/listing-analyze
 * Admin-only AI listing analysis. Uses the same task policy, quota,
 * budget reservation, timeout and gateway log contract as the public
 * listing-builder endpoint. AI output remains AI_SUGGESTED/unverified.
 */
export async function POST(req: Request) {
  const [user, error] = await requireAdmin("ai.execute");
  if (error) return error;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }

  const parsed = await readBoundedJson<unknown>(req, 64 * 1024);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const body = parsed.value as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description : null;
  const images = Array.isArray(body.images)
    ? body.images.filter((value): value is string => typeof value === "string").slice(0, 5)
    : undefined;
  const price = typeof body.price === "number" || typeof body.price === "string" ? body.price : null;

  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (title.length > 500) return NextResponse.json({ error: "title is too long (max 500 chars)" }, { status: 400 });
  if (description && description.length > 4000) return NextResponse.json({ error: "description is too long" }, { status: 400 });
  if (images?.some((image) => image.length > 2048)) {
    return NextResponse.json({ error: "image reference is too long" }, { status: 400 });
  }

  const input = { title, description, images, price };
  const inputLength = JSON.stringify(input).length;
  const preflight = await preflightAIRequest({
    taskType: "LISTING_BUILDER",
    user: { id: user.id },
    inputLength,
  });
  if (!preflight.ok) {
    return NextResponse.json({ error: preflight.reason }, { status: preflight.statusCode });
  }

  const { policy } = preflight;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), policy.timeoutMs);
  const config = getAIProviderConfigPublic();
  const model = `${config.provider}:${policy.model === "default" ? config.model : policy.model}`;

  try {
    const result = await analyzeListing({
      ...input,
      userId: user.id,
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;

    if (!result.success) {
      await db.aIGatewayLog.create({
        data: {
          taskType: "LISTING_BUILDER",
          model,
          input: JSON.stringify(input).slice(0, 500),
          output: null,
          latencyMs,
          tokensUsed: result.tokensUsed ?? null,
          cost: 0,
          success: false,
          error: result.error.slice(0, 500),
          userId: user.id,
        },
      }).catch(() => undefined);

      if (controller.signal.aborted) {
        return NextResponse.json({ error: "Gateway Timeout", ok: false }, { status: 504 });
      }
      return NextResponse.json({ error: result.error, ok: false }, { status: 502 });
    }

    await recordAICost("LISTING_BUILDER", policy.costCeilingUsd, user.id).catch(() => undefined);
    await db.aIGatewayLog.create({
      data: {
        taskType: "LISTING_BUILDER",
        model,
        input: JSON.stringify(input).slice(0, 500),
        output: JSON.stringify(result.analysis).slice(0, 500),
        latencyMs,
        tokensUsed: result.tokensUsed ?? null,
        // This is the reserved per-call ceiling, not provider-reported actual cost.
        cost: policy.costCeilingUsd > 0 ? policy.costCeilingUsd : null,
        success: true,
        userId: user.id,
      },
    }).catch(() => undefined);

    return NextResponse.json({
      ok: true,
      analysis: result.analysis,
      source: "AI_SUGGESTED",
      verified: false,
    });
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    await db.aIGatewayLog.create({
      data: {
        taskType: "LISTING_BUILDER",
        model,
        input: JSON.stringify(input).slice(0, 500),
        output: null,
        latencyMs,
        cost: 0,
        success: false,
        error: err instanceof Error ? err.message.slice(0, 500) : "Unknown AI listing analysis error",
        userId: user.id,
      },
    }).catch(() => undefined);

    if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
      return NextResponse.json({ error: "Gateway Timeout", ok: false }, { status: 504 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error", ok: false },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
