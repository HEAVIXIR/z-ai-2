import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { getClientIp } from "@/lib/request-context";
import { enforceRateLimit } from "@/lib/rate-limit-check";
import { UPLOAD } from "@/lib/rate-limit-presets";
import { preflightAIRequest, recordAICost } from "@/lib/ai-policy";
import ZAI from "z-ai-web-dev-sdk";
import path from "path";
import { promises as fs } from "fs";
import crypto from "crypto";
import { logAudit } from "@/lib/audit";

/* ============================================================
   POST /api/admin/categories/[id]/generate-image
   AI arm for Category — generates an industrial image for the
   category using the z-ai-web-dev-sdk image generation API.
   Saves the PNG under /public/uploads/categories/<slug>-<rand>.png
   and updates the category's imageUrl field.

   Body (optional): { prompt?: string }
   If no prompt is provided, one is built from the category's
   name + nameEn + description (English, descriptive, industrial).

   Returns: { ok: true, imageUrl, prompt }
   On AI failure: { error } with status 500 (no crash).

   P0-RBAC: requires `taxonomy.write`. The task brief referenced
   `/api/admin/taxonomy/categories` (POST) which does not exist in
   this codebase — this is the only category-mutating endpoint, so
   the permission is enforced here. See worklog P0-RBAC for details.

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
   pre-parsed body, resolved category, and an AbortController.
   The outer POST wrapper handles Gateway controls. */
async function _doPost(
  category: any,
  body: any,
  sessionUser: { id: string },
  controller: AbortController,
): Promise<NextResponse> {
  const userPrompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";

  const prompt =
    userPrompt ||
    buildCategoryPrompt({
      name: category.name,
      nameEn: category.nameEn,
      description: category.description,
      domain: category.domain,
    });

  // Generate the image via SDK
  let base64: string | null = null;
  try {
    const zai = await ZAI.create();
    const resp = await zai.images.generations.create({
      prompt,
      size: "1344x768", // landscape, suitable for category hero
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

  // Persist under /public/uploads/categories/<slug>-<rand>.png
  const slugPart = (category.slug || "category")
    .toString()
    .replace(/[^\w\-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "category";
  const rand = crypto.randomBytes(4).toString("hex");
  const filename = `${slugPart}-${rand}.png`;
  const dirAbs = path.join(process.cwd(), "public", "uploads", "categories");
  await fs.mkdir(dirAbs, { recursive: true });
  await fs.writeFile(path.join(dirAbs, filename), Buffer.from(base64, "base64"));

  const imageUrl = `/uploads/categories/${filename}`;

  try {
    const before = await db.category.findUnique({ where: { id: category.id }, select: { id: true, slug: true, imageUrl: true } });
    await db.category.update({
      where: { id: category.id },
      data: { imageUrl },
    });
    await logAudit({
      actorId: sessionUser.id,
      actorType: "ADMIN",
      action: "admin.categories.update",
      entityType: "Category",
      entityId: category.id,
      before: before ? { imageUrl: before.imageUrl } : null,
      after: { imageUrl },
      reason: "via admin API",
    });
  } catch (e: any) {
    // The image is saved but DB update failed — still return the URL so
    // the admin can set it manually if needed.
    return NextResponse.json(
      {
        ok: true,
        imageUrl,
        prompt,
        warning: "تصویر ساخته شد اما به‌روزرسانی دیتابیس ناموفق بود.",
      },
      { status: 200 },
    );
  }

  return NextResponse.json({ ok: true, imageUrl, prompt });
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
  if (!(await hasPermission(sessionUser.id, "taxonomy.write"))) {
    return NextResponse.json(
      { error: "Forbidden: missing permission 'taxonomy.write'" },
      { status: 403 },
    );
  }

  // ── Rate limit (UPLOAD preset, 20/h per identity) ──
  const uploadIdentity = sessionUser?.id ?? getClientIp(req);
  const rl = enforceRateLimit(uploadIdentity, UPLOAD);
  if (!rl.ok) return rl.response;

  const { id } = await ctx.params;

  let category: any = null;
  try {
    category = await db.category.findUnique({ where: { id } });
  } catch (e: any) {
    return NextResponse.json(
      { error: "DB lookup failed: " + (e?.message ?? "unknown") },
      { status: 500 },
    );
  }

  if (!category) {
    return NextResponse.json(
      { error: "دسته‌بندی یافت نشد." },
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
    taskType: "IMAGE_GENERATION",
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
    response = await _doPost(category, body, sessionUser, controller);
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
        await recordAICost("IMAGE_GENERATION", policy.costCeilingUsd, sessionUser.id);
      } catch { /* best-effort */ }
    }
    try {
      await db.aIGatewayLog.create({
        data: {
          taskType: "IMAGE_GENERATION",
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

/* Build a descriptive English prompt for industrial photography. */
function buildCategoryPrompt(c: {
  name: string;
  nameEn: string | null;
  description: string | null;
  domain: string | null;
}): string {
  const subject = c.nameEn?.trim() || c.name?.trim() || "industrial machinery";
  const desc = (c.description ?? "").trim();

  // Domain-aware scene hints
  const domainHint = (() => {
    switch ((c.domain ?? "").toUpperCase()) {
      case "MACHINE":
        return "heavy machinery on a construction site";
      case "VEHICLE":
        return "commercial truck or off-highway vehicle";
      case "PART":
        return "industrial spare part, macro product photography";
      case "ATTACHMENT":
        return "industrial attachment accessory for heavy equipment";
      case "MINERAL":
        return "mined mineral raw material, geological close-up";
      case "MATERIAL":
        return "bulk industrial material on site";
      default:
        return "heavy industrial equipment at work";
    }
  })();

  const base = `Professional industrial photography of ${subject}, ${domainHint}`;
  const tail = ", golden hour lighting, sharp focus, high detail, clean composition, professional commercial photograph, wide angle, no text, no watermark";

  if (desc) {
    // Trim description to keep prompt focused
    const d = desc.replace(/\s+/g, " ").slice(0, 180);
    return `${base}. Context: ${d}.${tail}`;
  }
  return `${base}.${tail}`;
}
