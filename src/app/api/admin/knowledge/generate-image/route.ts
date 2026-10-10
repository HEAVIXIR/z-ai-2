import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getClientIp } from "@/lib/request-context";
import { enforceRateLimit } from "@/lib/rate-limit-check";
import { UPLOAD } from "@/lib/rate-limit-presets";
import path from "path";
import { promises as fs } from "fs";
import crypto from "crypto";
import { hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { preflightAIRequest, recordAICost } from "@/lib/ai-policy";

/* ============================================================
   POST /api/admin/knowledge/generate-image
   AI cover image generator for an existing Article. Uses
   z-ai-web-dev-sdk image generation API. Saves the PNG to
   /public/uploads/articles/<slug>-<rand>.png and updates the
   article's coverImage field. Auth required.

   Body: { articleId: string, prompt?: string }
   Returns: { ok, coverImage, prompt }

   STEP 11.44 GATEWAY PHASE 3: added preflightAIRequest
   (auth + quota + budget + size cap), recordAICost (cost
   tracking), AIGatewayLog (usage logging), and
   AbortController timeout. Existing auth (getCurrentUser +
   hasPermission + rate limit) KEPT (defense-in-depth).
   Output format UNCHANGED.
   ============================================================ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Inner POST — runs the existing business logic with a
   pre-parsed body, resolved article, and an AbortController.
   The outer POST wrapper handles Gateway controls. */
async function _doPost(
  article: any,
  body: any,
  sessionUser: { id: string },
  controller: AbortController,
): Promise<NextResponse> {
  const userPrompt =
    typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const prompt =
    userPrompt ||
    buildCoverPrompt(article.title, article.excerpt, article.tags);

  // Lazy-load ZAI
  let base64: string | null = null;
  try {
    const ZAIModule = await import("z-ai-web-dev-sdk");
    const ZAI = (ZAIModule as any).default ?? ZAIModule;
    const zai = await ZAI.create();
    const resp = await zai.images.generations.create({
      prompt,
      size: "1344x768",
      signal: controller.signal,
    } as any);
    base64 = resp?.data?.[0]?.base64 ?? null;
  } catch (e: any) {
    return NextResponse.json(
      {
        error:
          "سرویس هوش مصنوعی در حال حاضر در دسترس نیست. لطفاً بعداً تلاش کنید یا تصویر را به‌صورت دستی بارگذاری کنید.",
        detail: e?.message ?? "unknown",
      },
      { status: 502 },
    );
  }

  if (!base64) {
    return NextResponse.json(
      { error: "پاسخ خالی از سرویس تصویرسازی." },
      { status: 502 },
    );
  }

  // Persist
  const slugPart = (article.slug || "article")
    .toString()
    .replace(/[^\w\-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "article";
  const rand = crypto.randomBytes(4).toString("hex");
  const filename = `${slugPart}-${rand}.png`;
  const dirAbs = path.join(process.cwd(), "public", "uploads", "articles");
  await fs.mkdir(dirAbs, { recursive: true });
  await fs.writeFile(path.join(dirAbs, filename), Buffer.from(base64, "base64"));
  const coverImage = `/uploads/articles/${filename}`;

  try {
    await db.article.update({
      where: { id: article.id },
      data: { coverImage },
    });
    await logAudit({
      actorId: sessionUser.id,
      actorType: "ADMIN",
      action: "admin.articles.update",
      entityType: "Article",
      entityId: article.id,
      before: { coverImage: article.coverImage },
      after: { coverImage },
      reason: "via admin API",
    });
  } catch {
    // The image is saved but DB update failed — still return the URL.
    return NextResponse.json({
      ok: true,
      coverImage,
      prompt,
      warning: "تصویر ساخته شد اما به‌روزرسانی دیتابیس ناموفق بود.",
    });
  }

  return NextResponse.json({ ok: true, coverImage, prompt });
}

export async function POST(req: NextRequest) {
  // ── Existing auth (KEPT — defense-in-depth) ──
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "ai.execute"))) {
    return NextResponse.json(
      { error: "Forbidden: requires ai.execute" },
      { status: 403 },
    );
  }

  // ── Rate limit (UPLOAD preset, 20/h per IP) ──
  const rl = enforceRateLimit(getClientIp(req), UPLOAD);
  if (!rl.ok) return rl.response;

  // ── Parse body once (used for preflight inputLength + downstream) ──
  const body = await req.json().catch(() => ({}));
  const articleId = typeof body?.articleId === "string" ? body.articleId : "";
  if (!articleId) {
    return NextResponse.json(
      { error: "articleId is required" },
      { status: 400 },
    );
  }

  let article: any = null;
  try {
    article = await db.article.findUnique({ where: { id: articleId } });
  } catch (e: any) {
    return NextResponse.json(
      { error: "DB lookup failed: " + (e?.message ?? "unknown") },
      { status: 500 },
    );
  }
  if (!article) {
    return NextResponse.json({ error: "مقاله یافت نشد." }, { status: 404 });
  }

  // ── STEP 11.44 GATEWAY PHASE 3: pre-flight check ──
  const inputLen = Math.min(1_000_000, JSON.stringify(body ?? "").length);
  const preflight = await preflightAIRequest({
    taskType: "KNOWLEDGE_IMAGE",
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
    response = await _doPost(article, body, sessionUser, controller);
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
        await recordAICost("KNOWLEDGE_IMAGE", policy.costCeilingUsd, sessionUser.id);
      } catch { /* best-effort */ }
    }
    try {
      await db.aIGatewayLog.create({
        data: {
          taskType: "KNOWLEDGE_IMAGE",
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

function buildCoverPrompt(
  title: string,
  excerpt: string | null,
  tags: string | null,
): string {
  const subject = (title || "industrial machinery").slice(0, 100);
  const ctx = (excerpt ?? tags ?? "").slice(0, 150);
  return `Professional industrial photography for an article titled "${subject}".${ctx ? ` Context: ${ctx}.` : ""} Heavy machinery, construction site or industrial setting, golden hour lighting, sharp focus, cinematic wide angle, no text, no watermark, no people faces visible.`;
}
