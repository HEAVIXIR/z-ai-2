import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import ZAI from "z-ai-web-dev-sdk";
import { hasPermission } from "@/lib/rbac";
import { preflightAIRequest, recordAICost } from "@/lib/ai-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   POST /api/admin/ai-content-factory
   Body: { topic, category }
   Returns: { title, excerpt, content (markdown), tags, category }

   Admin-only. Generates an article draft using the LLM.
   The returned draft can then be reviewed and published via
   the existing /api/admin/articles endpoint.

   STEP 11.44 GATEWAY PHASE 3: added preflightAIRequest
   (auth + quota + budget + size cap), recordAICost (cost
   tracking), AIGatewayLog (usage logging), and
   AbortController timeout. The existing auth checks
   (getCurrentUser + hasPermission) are KEPT (defense-in-depth).
   The route's business logic is unchanged — only Gateway
   controls are added in a thin wrapper. Output format UNCHANGED.
   ============================================================ */

const ALLOWED_CATEGORIES = [
  "GUIDE",
  "COMPARISON",
  "REVIEW",
  "NEWS",
  "TUTORIAL",
] as const;

const CATEGORY_HINTS: Record<string, string> = {
  GUIDE: "راهنمای خرید/انتخاب",
  COMPARISON: "مقایسهٔ مدل‌ها یا برندها",
  REVIEW: "نقد و بررسی تخصصی",
  NEWS: "خبر صنعت ماشین‌آلات",
  TUTORIAL: "آموزش گام‌به‌گام",
};

/* Inner POST — runs the existing business logic with a
   pre-parsed body and an AbortController. The outer POST
   wrapper handles Gateway controls (preflight + cost +
   logging + timeout) so this function stays focused on the
   article generation. */
async function _doPost(
  body: any,
  _user: { id: string },
  controller: AbortController,
): Promise<NextResponse> {
  const topic = String(body.topic ?? "").trim();
  const rawCategory = String(body.category ?? "GUIDE").toUpperCase();
  const category = (ALLOWED_CATEGORIES as readonly string[]).includes(
    rawCategory,
  )
    ? (rawCategory as (typeof ALLOWED_CATEGORIES)[number])
    : "GUIDE";

  if (!topic) {
    return NextResponse.json(
      { error: "topic is required" },
      { status: 400 },
    );
  }
  if (topic.length > 300) {
    return NextResponse.json(
      { error: "topic is too long (max 300 chars)" },
      { status: 400 },
    );
  }

  const categoryHint = CATEGORY_HINTS[category] ?? "مقاله عمومی";

  const systemPrompt = `You are the HEAVIX AI Content Factory — a senior Persian industrial-machinery journalist. Generate a high-quality Persian article draft about the requested topic.

Topic: ${topic}
Article type: ${categoryHint}

Output STRICT JSON only (no markdown fences, no commentary):
{
  "title": "عنوان جذاب فارسی (حداکثر ۸۰ کاراکتر)",
  "excerpt": "خلاصهٔ ۱-۲ جمله‌ای فارسی برای لیست مقالات",
  "content": "محتوای کامل به فرمت Markdown\n\n## مقدمه\n...\n\n## بخش‌های اصلی\n...\n\n## نتیجه‌گیری\n...",
  "tags": ["برچسب۱", "برچسب۲", "برچسب۳"]
}

Content rules:
- All text in Persian (Farsi) script.
- Length: 600-1100 words.
- Use Markdown: # for main title (omit — title is separate), ## for sections, ### for sub-sections, - for lists, **bold** for key terms.
- Be factual, technical, and helpful. Cite category/brand names if relevant.
- Do NOT fabricate phone numbers, URLs, or prices.
- Tags: 3-6 short Persian keywords.
- Never include an H1 (#) at the start — start with ## directly.
- Include a short conclusion section at the end.`;

  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: topic },
    ],
    thinking: { type: "disabled" },
    signal: controller.signal,
  } as any);

  const raw = completion?.choices?.[0]?.message?.content || "";
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start < 0 || end <= start) {
    return NextResponse.json(
      { error: "AI returned an invalid response — please try again." },
      { status: 502 },
    );
  }

  let parsed: any = null;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return NextResponse.json(
      { error: "AI returned malformed JSON — please try again." },
      { status: 502 },
    );
  }

  const title = String(parsed.title ?? "").trim();
  const excerpt = String(parsed.excerpt ?? "").trim();
  const content = String(parsed.content ?? "").trim();
  const tagsRaw = Array.isArray(parsed.tags) ? parsed.tags : [];
  const tags = tagsRaw
    .map((t: any) => String(t ?? "").trim())
    .filter(Boolean)
    .slice(0, 8);

  if (!title || !content) {
    return NextResponse.json(
      { error: "AI response was incomplete — please try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    draft: {
      title,
      excerpt: excerpt || null,
      content,
      tags: tags.length > 0 ? tags.join(", ") : null,
      category,
    },
  });
}

/* Outer POST — wraps _doPost with Gateway controls:
   1. Existing auth (getCurrentUser + hasPermission) — defense-in-depth
   2. preflightAIRequest (policy + RBAC + quota + budget + size cap)
   3. AbortController + setTimeout(policy.timeoutMs)
   4. _doPost runs the existing business logic
   5. On success: recordAICost + AIGatewayLog(success)
   6. On failure: AIGatewayLog(failure) — including AbortError → 504
*/
export async function POST(req: Request) {
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

  // ── Parse body once (used for both preflight inputLength + downstream) ──
  const body = await req.json().catch(() => ({}));

  // ── STEP 11.44 GATEWAY PHASE 3: pre-flight check ──
  const inputLen = Math.min(1_000_000, JSON.stringify(body ?? "").length);
  const preflight = await preflightAIRequest({
    taskType: "CONTENT_FACTORY",
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
    response = await _doPost(body, sessionUser, controller);
    // Best-effort: extract result summary from the response body for logging.
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
        await recordAICost("CONTENT_FACTORY", policy.costCeilingUsd, sessionUser.id);
      } catch { /* best-effort */ }
    }
    try {
      await db.aIGatewayLog.create({
        data: {
          taskType: "CONTENT_FACTORY",
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
