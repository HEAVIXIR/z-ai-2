import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import ZAI from "z-ai-web-dev-sdk";
import { hasPermission } from "@/lib/rbac";
import { preflightAIRequest, recordAICost } from "@/lib/ai-policy";

/* ============================================================
   POST /api/admin/brands/[id]/search-logo
   AI arm for Brand — searches the web for brand logo image
   candidates via the z-ai-web-dev-sdk image search API.
   Returns up to 5 candidates so the admin can pick one in a
   modal grid.

   Body (optional): { query?: string }
   If no query is provided, one is built from the brand's
   nameEn + name (e.g. "Caterpillar logo").

   Returns: { ok: true, results: [{ url, title, source }] }
   On AI failure: { error } with status 502 (no crash).

   STEP 11.44 GATEWAY PHASE 3: added preflightAIRequest
   (auth + quota + budget + size cap), recordAICost (cost
   tracking), AIGatewayLog (usage logging), and
   AbortController timeout. The existing auth checks
   (getCurrentUser + hasPermission) are KEPT (defense-in-depth).
   Output format UNCHANGED.
   ============================================================ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Inner POST — runs the existing business logic with a
   pre-parsed body, resolved brand, and an AbortController.
   The outer POST wrapper handles Gateway controls. */
async function _doPost(
  brand: any,
  body: any,
  controller: AbortController,
): Promise<NextResponse> {
  const userQuery = typeof body?.query === "string" ? body.query.trim() : "";

  const subject =
    (brand.nameEn ?? "").trim() ||
    (brand.name ?? "").trim() ||
    "industrial brand";
  const query = userQuery || `${subject} official logo transparent png`;

  // Search for logo candidates via SDK
  let rawResults: any[] = [];
  try {
    const zai = await ZAI.create();
    const resp = await zai.images.search.create({
      query,
      count: 5,
      rank: true,
      signal: controller.signal,
    } as any);
    rawResults = Array.isArray(resp?.results) ? resp.results : [];
  } catch (e: any) {
    return NextResponse.json(
      {
        error:
          "سرویس هوش مصنوعی در حال حاضر در دسترس نیست. لطفاً بعداً تلاش کنید یا لوگو را به‌صورت دستی بارگذاری کنید.",
        detail: e?.message ?? "unknown",
      },
      { status: 502 },
    );
  }

  // Normalize to { url, title, source }
  const results = rawResults
    .map((r: any) => ({
      url: r?.original_url ?? r?.url ?? "",
      title: r?.caption ?? r?.title ?? brand.nameEn ?? brand.name ?? "",
      source: r?.source ?? r?.host ?? "",
    }))
    .filter((r) => typeof r.url === "string" && r.url.length > 0);

  return NextResponse.json({ ok: true, results, query });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  // ── Existing auth (KEPT — defense-in-depth) ──
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "brand.read"))) {
    return NextResponse.json(
      { error: "Forbidden: requires brand.read" },
      { status: 403 },
    );
  }

  const { id } = await ctx.params;

  let brand: any = null;
  try {
    brand = await db.brand.findUnique({ where: { id } });
  } catch (e: any) {
    return NextResponse.json(
      { error: "DB lookup failed: " + (e?.message ?? "unknown") },
      { status: 500 },
    );
  }

  if (!brand) {
    return NextResponse.json(
      { error: "برند یافت نشد." },
      { status: 404 },
    );
  }

  // ── Parse body once (used for preflight inputLength + downstream) ──
  let body: any = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  // ── STEP 11.44 GATEWAY PHASE 3: pre-flight check ──
  const inputLen = Math.min(1_000_000, JSON.stringify(body ?? "").length);
  const preflight = await preflightAIRequest({
    taskType: "LOGO_SEARCH",
    user: { id: sessionUser.id },
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

  // ── AbortController timeout ──
  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => controller.abort(), policy.timeoutMs);

  let response: NextResponse = NextResponse.json(
    { error: "Server error" },
    { status: 500 },
  );
  let __resultSummary: any = null;
  let __errorMsg: string | null = null;
  try {
    response = await _doPost(brand, body, controller);
    try { __resultSummary = await response.clone().json(); } catch { /* non-JSON */ }
  } catch (err: any) {
    if (err?.name === "AbortError" || controller.signal.aborted) {
      __errorMsg = `timeout after ${policy.timeoutMs}ms`;
      response = NextResponse.json(
        { error: "Gateway Timeout" },
        { status: 504 },
      );
    } else {
      __errorMsg = err?.message ?? "unknown";
      response = NextResponse.json(
        { error: err?.message ?? "Server error" },
        { status: 500 },
      );
    }
  } finally {
    clearTimeout(timeoutTimer);
    const latencyMs = Date.now() - startTime;
    const success = response.status >= 200 && response.status < 300;
    if (success) {
      try {
        await recordAICost("LOGO_SEARCH", policy.costCeilingUsd, sessionUser.id);
      } catch { /* best-effort */ }
    }
    try {
      await db.aIGatewayLog.create({
        data: {
          taskType: "LOGO_SEARCH",
          model: policy.model === "default" ? "z-ai-default" : policy.model,
          input: JSON.stringify(body).substring(0, 500),
          output: __resultSummary ? JSON.stringify(__resultSummary).substring(0, 500) : null,
          latencyMs,
          cost: success ? policy.costCeilingUsd : 0,
          success,
          error: success ? null : (__errorMsg ?? `HTTP ${response.status}`),
          userId: sessionUser.id,
        },
      });
    } catch { /* best-effort */ }
  }
  return response;
}
