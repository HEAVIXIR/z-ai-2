import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { storeDb } from "@/lib/store-db";
import { slugify } from "@/lib/api-helpers";
import { preflightAIRequest, recordAICost } from "@/lib/ai-policy";
import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/admin/store/ai-scraper
   HEAVIX store — AI assistant for scraping Iranian car/machinery
   parts websites, extracting structured part data, and importing
   them into the store DB (with "contact for price" support).

   Actions:
     POST { action: "scrape",      query, category?, brand?, limit? }
          → searches Iranian parts sites, returns preview suggestions
     POST { action: "import",      part }
          → imports a single part into the store DB
     POST { action: "bulk-import", parts: [...] }
          → imports multiple parts at once
   ============================================================ */

interface PartsScrapeSuggestion {
  name: string;
  nameEn: string | null;
  nameFa: string | null;
  priceText: string | null;
  priceUsd: number | null;
  brandName: string | null;
  category: string | null;
  categoryName: string | null;
  description: string | null;
  imageUrl: string | null;
  sourceUrl: string;
  sourceSite: string | null;
  contactForPrice: boolean;
}

interface WebSearchHit {
  url?: string;
  link?: string;
  title?: string;
  snippet?: string;
}

async function getZai(signal?: AbortSignal) {
  const zai = await ZAI.create();
  // STEP 11.43: inject AbortController signal into every chat.completions.create
  // call without refactoring the helpers that take `zai: any` as a parameter.
  if (signal) {
    const origCreate = zai.chat.completions.create.bind(zai.chat.completions);
    (zai as any).chat.completions.create = (body: any) =>
      origCreate({ ...body, signal });
  }
  return zai;
}

/** Extract image URLs from raw HTML. */
function extractImagesFromHtml(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const src = m[1];
    if (!src || src.startsWith("data:")) continue;
    if (/\.(jpg|jpeg|png|webp|gif|avif)/i.test(src) || src.includes("image")) {
      let url = src;
      if (url.startsWith("//")) url = "https:" + url;
      else if (url.startsWith("/")) {
        try {
          const u = new URL(baseUrl);
          url = `${u.origin}${url}`;
        } catch {
          /* skip */
        }
      }
      if (!seen.has(url)) {
        seen.add(url);
        out.push(url);
      }
    }
  }
  return out.slice(0, 6);
}

/** Determine the host label (e.g. "divar.ir") from a URL. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Ask the LLM to parse a page's text content and return a structured
 * part record (Persian name, English name if any, price in IRR, brand,
 * category, description, image URL, etc.). Returns null on failure.
 */
async function llmExtractPart(
  zai: any,
  pageText: string,
  url: string,
  fallbackTitle?: string,
): Promise<PartsScrapeSuggestion | null> {
  const sys = `تو دستیار هوش مصنوعی فروشگاه قطعات هویکس هستی.
محتوای یک صفحهٔ وب از سایت‌های ایرانی فروش قطعات خودرو یا ماشین‌آلات را دریافت می‌کنی.
باید یک قطعه را استخراج کنی و فقط یک JSON برگردانی.

این فیلدها را استخراج کن:
{
  "name": string (نام فارسی قطعه — کامل و دقیق),
  "nameEn": string (نام انگلیسی قطعه اگر موجود بود، در غیر این صورت null),
  "priceText": string (متن خام قیمت مثل "۲٬۵۰۰٬۰۰۰ تومان" یا "تماس بگیرید" یا null),
  "priceIrr": number (قیمت به ریال خالص، فقط عدد — اگر "تماس بگیرید" یا قیمت نبود null),
  "brandName": string (نام برند فارسی یا انگلیسی مثل "تویوتا"، "Bosch"، "ایرانیان خودرو" یا null),
  "category": string (دستهٔ پیشنهادی فارسی مثل "لنت ترمز"، "فیلتر روغن"، "تسمه تایم"، "پیستون" یا null),
  "description": string (توضیحات فارسی کامل ۱-۳ جمله‌ای از صفحه، یا null),
  "imageUrl": string (URL تصویر قطعه از صفحه، یا null)
}

قوانین:
- فقط یک JSON برگردان، بدون markdown یا توضیح اضافه.
- اگر صفحه قیمت ندارد یا "تماس بگیرید" دارد، priceIrr را null و priceText را "تماس بگیرید" بگذار.
- اگر صفحه قطعه نیست (مثلاً صفحه اصلی سایت یا مقاله)، یک JSON با name برابر null برگردان: {"name":null,...}.
- اعداد فارسی را به انگلیسی تبدیل کن.`;

  const truncated = pageText.slice(0, 14000);
  try {
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: sys },
        {
          role: "user",
          content: `URL: ${url}\nTITLE: ${fallbackTitle ?? ""}\n\nPAGE:\n${truncated}`,
        },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion?.choices?.[0]?.message?.content || "";
    const jsonStr = raw.replace(/```json|```/g, "").trim();
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const obj = JSON.parse(jsonStr.slice(start, end + 1));
    if (!obj || obj.name === null || obj.name === undefined) return null;

    const priceIrr = obj.priceIrr != null ? Number(obj.priceIrr) : null;
    const priceText = obj.priceText
      ? String(obj.priceText)
      : priceIrr != null
        ? `${Number(priceIrr).toLocaleString("fa-IR")} ریال`
        : "تماس بگیرید";

    // Convert IRR (Rial) → USD at a generous ~500,000 IRR/USD heuristic,
    // since the store DB stores prices in USD. We expose the raw IRR
    // text too so the admin can correct it before importing.
    const priceUsd =
      priceIrr != null && priceIrr > 0
        ? Math.max(1, Math.round(Number(priceIrr) / 500000))
        : null;
    const contactForPrice =
      priceIrr == null ||
      /تماس|call|contact|استعلام|توافقی/i.test(priceText);

    return {
      name: String(obj.name).trim(),
      nameEn: obj.nameEn ? String(obj.nameEn).trim() : null,
      nameFa: String(obj.name).trim(),
      priceText,
      priceUsd,
      brandName: obj.brandName ? String(obj.brandName).trim() : null,
      category: obj.category ? String(obj.category).trim() : null,
      categoryName: obj.category ? String(obj.category).trim() : null,
      description: obj.description ? String(obj.description).trim() : null,
      imageUrl: obj.imageUrl ? String(obj.imageUrl).trim() : null,
      sourceUrl: url,
      sourceSite: hostOf(url),
      contactForPrice,
    };
  } catch (err) {
    console.error("[store/ai-scraper] llmExtractPart error:", err);
    return null;
  }
}

/** Use web_search to find Iranian parts-site URLs for a query. */
async function searchIranianPartsSites(
  zai: any,
  query: string,
  num: number,
): Promise<WebSearchHit[]> {
  // Two-pronged query: one focused on "سایت قطعات" (parts sites), one
  // focused on "قیمت قطعات خودرو" (prices). Merge results, dedupe.
  const queries = [
    `${query} سایت قطعات`,
    `${query} قیمت قطعات خودرو`,
  ];
  const all: WebSearchHit[] = [];
  const seen = new Set<string>();
  for (const q of queries) {
    try {
      const r = await zai.functions.invoke("web_search", { query: q, num });
      const list: any[] = Array.isArray(r)
        ? r
        : Array.isArray(r?.results)
          ? r.results
          : [];
      for (const item of list) {
        const url: string | undefined = item.url || item.link;
        if (!url || seen.has(url)) continue;
        seen.add(url);
        all.push({ url, title: item.title, snippet: item.snippet });
      }
      if (all.length >= num) break;
    } catch (err) {
      console.error("[store/ai-scraper] web_search error:", err);
    }
  }
  return all.slice(0, num);
}

/** Read a page and extract structured part data via LLM. */
async function scrapePartFromUrl(
  zai: any,
  hit: WebSearchHit,
): Promise<PartsScrapeSuggestion | null> {
  const url = hit.url!;
  try {
    const result = await zai.functions.invoke("page_reader", { url });
    const data = result?.data || result || {};
    const html: string = data.html || "";
    const title: string = data.title || "";
    const text = (html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") || title).trim();

    // If LLM extract fails, try to use the raw page title + first image.
    let suggestion = await llmExtractPart(zai, text || html, url, title);

    if (!suggestion) {
      const imgs = extractImagesFromHtml(html, url);
      // Build a minimal suggestion from raw page metadata.
      suggestion = {
        name: title?.trim() || hit.title?.trim() || "قطعه بدون عنوان",
        nameEn: null,
        nameFa: title?.trim() || hit.title?.trim() || "قطعه بدون عنوان",
        priceText: "تماس بگیرید",
        priceUsd: null,
        brandName: null,
        category: null,
        categoryName: null,
        description: hit.snippet?.trim() || text.slice(0, 300) || null,
        imageUrl: imgs[0] ?? null,
        sourceUrl: url,
        sourceSite: hostOf(url),
        contactForPrice: true,
      };
    } else if (!suggestion.imageUrl) {
      // Fall back to the first <img> in the HTML if the LLM didn't supply one.
      const imgs = extractImagesFromHtml(html, url);
      if (imgs[0]) suggestion.imageUrl = imgs[0];
    }

    return suggestion;
  } catch (err) {
    console.error("[store/ai-scraper] page_reader error for", url, err);
    return null;
  }
}

/**
 * Find or create a Brand by name. Uses slugify so "Bosch" and "بوش"
 * each get their own slug. Returns the brand id.
 */
async function findOrCreateBrand(name: string, userId?: string | null): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) {
    // Fall back to a generic "سایر" brand so we always have a valid id.
    const generic = await storeDb.brand.findUnique({ where: { slug: "سایر" } });
    if (generic) return generic.id;
    const created = await storeDb.brand.create({
      data: { name: "سایر", slug: "سایر" },
    });
    await logAudit({
      actorId: userId ?? null,
      actorType: 'ADMIN',
      action: 'store.brand.create',
      entityType: 'Brand',
      entityId: created.id,
      after: created,
    });
    return created.id;
  }
  const slug = slugify(trimmed) || slugify("brand-" + trimmed);
  const existing = await storeDb.brand.findUnique({ where: { slug } });
  if (existing) return existing.id;
  const created = await storeDb.brand.create({
    data: { name: trimmed, slug },
  });
  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.brand.create',
    entityType: 'Brand',
    entityId: created.id,
    after: created,
  });
  return created.id;
}

/** Find or create a Category by name. Returns the category id. */
async function findOrCreateCategory(name: string, userId?: string | null): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) {
    const generic = await storeDb.category.findUnique({ where: { slug: "سایر" } });
    if (generic) return generic.id;
    const created = await storeDb.category.create({
      data: { name: "سایر", slug: "سایر" },
    });
    await logAudit({
      actorId: userId ?? null,
      actorType: 'ADMIN',
      action: 'store.category.create',
      entityType: 'Category',
      entityId: created.id,
      after: created,
    });
    return created.id;
  }
  const slug = slugify(trimmed) || slugify("cat-" + trimmed);
  const existing = await storeDb.category.findUnique({ where: { slug } });
  if (existing) return existing.id;
  const created = await storeDb.category.create({
    data: { name: trimmed, slug },
  });
  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.category.create',
    entityType: 'Category',
    entityId: created.id,
    after: created,
  });
  return created.id;
}

/** Generate a unique SKU for an AI-imported part. */
function generateSku(): string {
  return `AI-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
}

/** Import a single part suggestion into the store DB. */
async function importPartIntoStore(
  input: PartsScrapeSuggestion & { stock?: number },
  userId?: string | null,
): Promise<{ id: string; sku: string; name: string }> {
  const name = (input.name || input.nameFa || "قطعه بدون عنوان").trim();
  const categoryName =
    input.categoryName || input.category || "سایر قطعات";
  const brandName = input.brandName || "سایر";

  const [categoryId, brandId] = await Promise.all([
    findOrCreateCategory(categoryName, userId),
    findOrCreateBrand(brandName, userId),
  ]);

  const contactForPrice =
    input.contactForPrice === true || input.priceUsd == null;
  const priceUsd = contactForPrice ? 0 : Number(input.priceUsd) || 0;
  // Generate a unique SKU. Very small retry loop in case of collision.
  let sku = generateSku();
  for (let i = 0; i < 3; i++) {
    const dup = await storeDb.part.findUnique({ where: { sku } });
    if (!dup) break;
    sku = generateSku();
  }

  const images = input.imageUrl ? JSON.stringify([input.imageUrl]) : "[]";

  const part = await storeDb.part.create({
    data: {
      name,
      nameFa: input.nameFa || name,
      sku,
      categoryId,
      brandId,
      description: input.description || null,
      priceUsd,
      contactForPrice,
      stock: Number(input.stock) || 0,
      lowStockThreshold: 5,
      images,
      compatibleCars: "[]",
      sourceUrl: input.sourceUrl || null,
      active: true,
      featured: false,
    },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: 'ADMIN',
    action: 'store.part.create',
    entityType: 'Part',
    entityId: part.id,
    after: part,
  });

  return { id: part.id, sku: part.sku, name: part.name };
}

/* ============================================================
   POST handler

   STEP 11.43 GATEWAY PHASE 2 (SCRAPER MIGRATION): added
   preflightAIRequest (auth + quota + budget + size cap),
   recordAICost (cost tracking), AIGatewayLog (usage logging),
   and AbortController timeout. The existing auth checks
   (getCurrentUser + requirePermission) are KEPT (defense-in-depth).
   The route's business logic is unchanged — only Gateway controls
   are added in a thin wrapper. The preflight is run AFTER the
   existing auth check so unauthorized requests don't consume
   budget/quota. The signal is injected into chat.completions.create
   calls via a wrapped zai instance (see getZai above).
   ============================================================ */

// Inner POST handler — runs the existing business logic with a
// pre-parsed body and an AbortController-aware zai instance. The
// outer POST wrapper handles Gateway controls (preflight + cost +
// logging + timeout) so this function stays focused on the scrape.
async function _doPost(
  body: any,
  user: { id: string },
  controller: AbortController,
): Promise<NextResponse> {
  const action = String(body.action ?? "");

  try {
    // ─────────────────────────────────────────────
    // SCRAPE — search + preview suggestions
    // ─────────────────────────────────────────────
    if (action === "scrape") {
      const query = String(body.query ?? "").trim();
      if (!query) {
        return NextResponse.json(
          { ok: false, error: "query الزامی است" },
          { status: 400 },
        );
      }
      const limit = Math.max(1, Math.min(15, Number(body.limit) || 8));
      const zai = await getZai(controller.signal);

      const hits = await searchIranianPartsSites(zai, query, limit + 4);

      // Scrape each hit sequentially (parallel page_reader calls can
      // hit rate limits on the AI provider). Stop early when we have
      // enough valid suggestions.
      const suggestions: PartsScrapeSuggestion[] = [];
      for (const hit of hits) {
        if (suggestions.length >= limit) break;
        const s = await scrapePartFromUrl(zai, hit);
        if (s) suggestions.push(s);
      }

      return NextResponse.json({
        ok: true,
        suggestions,
        totalFound: suggestions.length,
        query,
      });
    }

    // ─────────────────────────────────────────────
    // IMPORT — import a single part
    // ─────────────────────────────────────────────
    if (action === "import") {
      const part = body.part;
      if (!part || !part.name) {
        return NextResponse.json(
          { ok: false, error: "part.name الزامی است" },
          { status: 400 },
        );
      }
      const created = await importPartIntoStore(part, user.id);
      await logAudit({
        actorId: user.id,
        actorType: 'ADMIN',
        action: 'store.ai_scraper.import',
        entityType: 'Part',
        entityId: created.id,
        after: created,
      });
      return NextResponse.json({
        ok: true,
        part: created,
        message: "قطعه با موفقیت در فروشگاه ثبت شد.",
      });
    }

    // ─────────────────────────────────────────────
    // BULK IMPORT — import multiple parts at once
    // ─────────────────────────────────────────────
    if (action === "bulk-import") {
      const parts = Array.isArray(body.parts) ? body.parts : [];
      if (parts.length === 0) {
        return NextResponse.json(
          { ok: false, error: "parts[] الزامی است" },
          { status: 400 },
        );
      }
      const results: Array<{
        name: string;
        ok: boolean;
        id?: string;
        sku?: string;
        error?: string;
      }> = [];
      let imported = 0;
      for (const p of parts) {
        try {
          if (!p?.name) {
            results.push({ name: p?.name ?? "(بدون نام)", ok: false, error: "نام قطعه خالی است" });
            continue;
          }
          const created = await importPartIntoStore(p, user.id);
          await logAudit({
            actorId: user.id,
            actorType: 'ADMIN',
            action: 'store.ai_scraper.import',
            entityType: 'Part',
            entityId: created.id,
            after: created,
          });
          results.push({
            name: created.name,
            ok: true,
            id: created.id,
            sku: created.sku,
          });
          imported++;
        } catch (e: any) {
          results.push({
            name: p?.name ?? "(بدون نام)",
            ok: false,
            error: e?.message ?? "خطا",
          });
        }
      }
      return NextResponse.json({
        ok: true,
        imported,
        total: parts.length,
        results,
      });
    }

    return NextResponse.json(
      { ok: false, error: "action نامعتبر است (scrape | import | bulk-import)" },
      { status: 400 },
    );
  } catch (err: any) {
    // STEP 11.43: detect AbortError → 504 Gateway Timeout.
    if (err?.name === "AbortError" || controller.signal.aborted) {
      return NextResponse.json(
        { error: "Gateway Timeout" },
        { status: 504 },
      );
    }
    console.error("[store/ai-scraper POST] error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* Outer POST — wraps _doPost with Gateway controls:
   1. Existing auth (getCurrentUser + requirePermission) — defense-in-depth
   2. preflightAIRequest (policy + RBAC + quota + budget + size cap)
   3. AbortController + setTimeout(policy.timeoutMs)
   4. _doPost runs the existing business logic
   5. On success: recordAICost + AIGatewayLog(success)
   6. On failure: AIGatewayLog(failure) — including AbortError → 504
*/
export async function POST(req: Request) {
  // ── Existing auth (KEPT — defense-in-depth) ──
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, 'store.manage');
  } catch {
    return NextResponse.json({ error: "Forbidden: requires store.manage" }, { status: 403 });
  }

  // ── Parse body once (used for both preflight inputLength + downstream) ──
  const body = await req.json().catch(() => ({}));

  // ── STEP 11.43 GATEWAY PHASE 2: pre-flight check ──
  const inputLen = Math.min(1_000_000, JSON.stringify(body ?? "").length);
  const preflight = await preflightAIRequest({
    taskType: "SCRAPER",
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

  // ── STEP 11.43: AbortController timeout ──
  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => controller.abort(), policy.timeoutMs);

  let response: NextResponse = NextResponse.json(
    { error: "Server error" },
    { status: 500 },
  );
  let __resultSummary: any = null;
  let __errorMsg: string | null = null;
  try {
    response = await _doPost(body, user, controller);
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
        await recordAICost("SCRAPER", policy.costCeilingUsd, user.id);
      } catch { /* best-effort */ }
    }
    try {
      await db.aIGatewayLog.create({
        data: {
          taskType: "SCRAPER",
          model: policy.model === "default" ? "z-ai-default" : policy.model,
          input: JSON.stringify(body).substring(0, 500),
          output: __resultSummary ? JSON.stringify(__resultSummary).substring(0, 500) : null,
          latencyMs,
          cost: success ? policy.costCeilingUsd : 0,
          success,
          error: success ? null : (__errorMsg ?? `HTTP ${response.status}`),
          userId: user.id,
        },
      });
    } catch { /* best-effort */ }
  }
  return response;
}
