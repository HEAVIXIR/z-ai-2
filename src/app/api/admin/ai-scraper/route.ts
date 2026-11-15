import { NextResponse } from "next/server";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { slugify, parseBig } from "@/lib/api-helpers";
import { preflightAIRequest, recordAICost } from "@/lib/ai-policy";
import ZAI from "z-ai-web-dev-sdk";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIVAR_HOSTS = ["divar.ir", "divar.com"];
const SHEYPOOR_HOSTS = ["sheypoor.com"];
const ALLOWED_SOURCE_HOSTS = [...DIVAR_HOSTS, ...SHEYPOOR_HOSTS];

function isAllowedSourceUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return ALLOWED_SOURCE_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

interface ScrapeResult {
  url: string;
  title?: string;
  description?: string;
  price?: string | null;
  images: string[];
  phone?: string | null;
  location?: string | null;
  brand?: string | null;
  model?: string | null;
  category?: string | null;
  year?: number | null;
  hours?: number | null;
  condition?: string | null;
}

/** Extract phone numbers (Iran mobile/landline patterns) from text. */
function extractPhones(text: string): string[] {
  const matches = text.match(/0\d{10}|\+98\d{10}|09\d{9}/g) || [];
  return Array.from(new Set(matches));
}

/** Extract image URLs from raw HTML. */
function extractImagesFromHtml(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m;
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
  // Also parse srcset
  const reSrcset = /srcset=["']([^"']+)["']/gi;
  while ((m = reSrcset.exec(html))) {
    const parts = m[1].split(",").map((p) => p.trim().split(/\s+/)[0]);
    for (const p of parts) {
      if (p && !p.startsWith("data:") && /\.(jpg|jpeg|png|webp)/i.test(p) && !seen.has(p)) {
        seen.add(p);
        out.push(p.startsWith("//") ? "https:" + p : p);
      }
    }
  }
  return out.slice(0, 20);
}

function extractPrice(text: string): string | null {
  const m =
    text.match(/(\d[\d٬,.\s]*)\s*(?:تومان|ریال|Toman|Rial|IR|R)/i) ||
    text.match(/قیمت[:\s]*(\d[\d٬,.\s]*)/i) ||
    text.match(/(\d{6,})/);
  if (!m) return null;
  return m[1].replace(/[٬,\s]/g, "");
}

/** Run LLM extraction with structured prompt. */
async function llmExtract(
  zai: any,
  pageText: string,
  url: string,
): Promise<Partial<ScrapeResult>> {
  const sys = `You are HEAVIX listing extractor. Given raw HTML / page text from a Persian classified ad (Divar/Sheypoor), extract structured JSON with these keys:
{
  "title": string,
  "description": string (Persian, 200-600 chars),
  "price": string (digits only, Toman) or null,
  "phone": string (Iran mobile like 09xxxxxxxxx) or null,
  "location": string (province/city) or null,
  "brand": string (Persian brand name) or null,
  "model": string (exact model designation from the ad) or null,
  "category": string (machine type) or null,
  "year": number or null,
  "hours": number or null,
  "condition": "NEW" | "USED" | "REFURBISHED" | "FOR_PARTS" | null
}
Return ONLY the JSON object, no markdown, no explanation.`;
  const truncated = pageText.slice(0, 12000);
  try {
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `URL: ${url}\n\nPAGE:\n${truncated}` },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion?.choices?.[0]?.message?.content || "";
    const jsonStr = raw.replace(/```json|```/g, "").trim();
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    if (start === -1 || end === -1) return {};
    return JSON.parse(jsonStr.slice(start, end + 1));
  } catch {
    return {};
  }
}

/** Use web_search to find ad URLs for a query. */
async function searchAdUrls(zai: any, query: string, num = 5): Promise<string[]> {
  try {
    const r = await zai.functions.invoke("web_search", {
      query: `${query} site:divar.ir OR site:sheypoor.com`,
      num,
    });
    if (Array.isArray(r)) return r.map((x: any) => x.url || x.link).filter(Boolean);
    if (r?.results) return r.results.map((x: any) => x.url).filter(Boolean);
    return [];
  } catch {
    return [];
  }
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

type SourceFetchResult = { html: string; title: string; redirect?: string };

async function requestPinnedSource(url: URL, address: string, signal?: AbortSignal): Promise<SourceFetchResult> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest({
      protocol: "https:",
      hostname: url.hostname,
      port: 443,
      servername: url.hostname,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; HEAVIX-ListingImporter/1.0)",
        accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.1",
        "accept-language": "fa-IR,fa;q=0.9,en;q=0.7",
        "accept-encoding": "identity",
      },
      lookup: ((_hostname: string, _options: any, callback: any) => callback(null, address, 4)) as any,
    }, (response) => {
      const status = response.statusCode || 0;
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(status) && location) {
        response.resume();
        resolve({ html: "", title: "", redirect: location });
        return;
      }
      const contentType = String(response.headers["content-type"] || "").toLowerCase();
      if (contentType && !/(text\/html|application\/xhtml\+xml|application\/json)/.test(contentType)) {
        response.resume();
        reject(new Error("منبع پاسخ HTML معتبری ارائه نکرد."));
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`منبع با وضعیت HTTP ${status} پاسخ داد.`));
        return;
      }
      const declaredLength = Number(response.headers["content-length"] || 0);
      if (declaredLength > 2_000_000) {
        response.destroy(new Error("حجم صفحه منبع بیش از حد مجاز است."));
        reject(new Error("حجم صفحه منبع بیش از حد مجاز است."));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.length;
        if (total > 2_000_000) {
          response.destroy(new Error("حجم صفحه منبع بیش از حد مجاز است."));
          return;
        }
        chunks.push(buffer);
      });
      response.on("end", () => {
        const html = Buffer.concat(chunks).toString("utf8");
        const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() || "";
        resolve({ html, title });
      });
      response.on("error", reject);
    });
    request.setTimeout(12_000, () => request.destroy(new Error("مهلت دریافت صفحه منبع تمام شد.")));
    if (signal?.aborted) request.destroy(new Error("درخواست دریافت صفحه لغو شد."));
    else signal?.addEventListener("abort", () => request.destroy(new Error("درخواست دریافت صفحه لغو شد.")), { once: true });
    request.on("error", reject);
    request.end();
  });
}

/** Validate every redirect and pin each HTTPS request to a freshly validated public IPv4. */
async function fetchAllowedSourcePage(rawUrl: string, signal?: AbortSignal): Promise<{ html: string; title: string }> {
  let current = new URL(rawUrl);
  for (let hop = 0; hop <= 4; hop++) {
    if (!isAllowedSourceUrl(current.toString()) || (current.port && current.port !== "443")) {
      throw new Error("مسیر انتقال به دامنه یا درگاه غیرمجاز مسدود شد.");
    }
    const resolved = await dnsLookup(current.hostname, { all: true, family: 4, verbatim: true });
    if (!resolved.length || resolved.some((entry) => !isPublicIpv4(entry.address))) {
      throw new Error("نشانی شبکه مقصد عمومی و امن نیست.");
    }
    const result = await requestPinnedSource(current, resolved[0].address, signal);
    if (!result.redirect) return { html: result.html, title: result.title };
    if (hop === 4) throw new Error("تعداد انتقال‌های صفحه از حد مجاز بیشتر است.");
    current = new URL(result.redirect, current);
  }
  throw new Error("دریافت امن صفحه منبع ناموفق بود.");
}

async function scrapeUrl(zai: any, url: string, signal?: AbortSignal): Promise<ScrapeResult> {
  const base: ScrapeResult = { url, images: [] };
  if (!isAllowedSourceUrl(url)) return { ...base, description: "منبع این آگهی در فهرست دامنه‌های مجاز نیست." };
  try {
    const data = await fetchAllowedSourcePage(url, signal);
    const html = data.html;
    const title = data.title;
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const images = extractImagesFromHtml(html, url);
    const phones = extractPhones(html + " " + text);

    const llm = await llmExtract(zai, text || html, url);

    return {
      url,
      title: llm.title || title || undefined,
      description: llm.description || text.slice(0, 600) || undefined,
      price: llm.price || extractPrice(text),
      images,
      phone: llm.phone || phones[0] || null,
      location: llm.location || null,
      brand: llm.brand || null,
      model: llm.model || null,
      category: llm.category || null,
      year: llm.year ?? null,
      hours: llm.hours ?? null,
      condition: llm.condition || null,
    };
  } catch (err: any) {
    return { ...base, description: `Error scraping: ${err?.message}` };
  }
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

/** Convert a scraped result into a HEAVIX listing draft in DB. */
async function importListing(s: ScrapeResult) {
  if (!isAllowedSourceUrl(s.url)) throw new Error("منبع آگهی مجاز نیست.");
  if (!s.title?.trim() || (s.description || "").startsWith("Error scraping:")) {
    throw new Error("استخراج معتبر آگهی کامل نیست؛ پیش‌نویس ساخته نشد.");
  }
  const title = s.title || "بدون عنوان";

  // Conservative catalog matching: exact normalized matches only. Ambiguous AI guesses
  // remain unmapped for manager review rather than being attached to the wrong entity.
  const normalize = (value: string) => value.trim().toLocaleLowerCase("fa-IR").replace(/[\u200c\s_-]+/g, "");
  let brandId: string | null = null;
  if (s.brand) {
    const candidates = await db.brand.findMany({
      where: { OR: [{ name: { equals: s.brand, mode: "insensitive" } }, { nameEn: { equals: s.brand, mode: "insensitive" } }] },
      select: { id: true, name: true, nameEn: true },
      take: 3,
    });
    const exact = candidates.filter((b) => normalize(b.name) === normalize(s.brand!) || (!!b.nameEn && normalize(b.nameEn) === normalize(s.brand!)));
    if (exact.length === 1) brandId = exact[0].id;
  }

  let categoryId: string | null = null;
  if (s.category) {
    const candidates = await db.category.findMany({
      where: { OR: [{ name: { equals: s.category, mode: "insensitive" } }, { nameEn: { equals: s.category, mode: "insensitive" } }, { slug: { equals: slugify(s.category) } }] },
      select: { id: true, name: true, nameEn: true, slug: true },
      take: 3,
    });
    const exact = candidates.filter((c) => normalize(c.name) === normalize(s.category!) || (!!c.nameEn && normalize(c.nameEn) === normalize(s.category!)) || c.slug === slugify(s.category!));
    if (exact.length === 1) categoryId = exact[0].id;
  }

  let modelId: string | null = null;
  if (brandId && s.model) {
    const candidates = await db.productModel.findMany({
      where: { brandId, OR: [{ name: { equals: s.model, mode: "insensitive" } }, { nameEn: { equals: s.model, mode: "insensitive" } }, { slug: { equals: slugify(s.model) } }] },
      select: { id: true, categoryId: true, modelCategories: { select: { categoryId: true } } },
      take: 3,
    });
    if (candidates.length === 1) {
      modelId = candidates[0].id;
      const modelCategoryIds = [candidates[0].categoryId, ...candidates[0].modelCategories.map((x) => x.categoryId)].filter(Boolean) as string[];
      if (!categoryId && modelCategoryIds.length === 1) categoryId = modelCategoryIds[0];
      else if (categoryId && modelCategoryIds.length > 0 && !modelCategoryIds.includes(categoryId)) modelId = null;
    }
  }

  const url2 = (() => {
    try {
      return new URL(s.url).hostname;
    } catch {
      return s.url;
    }
  })();

  // Map only structured extraction fields into attributes configured for the exact matched category.
  // Unsupported or ambiguous fields remain for manager review.
  const extractedAttributeValues: Array<{
    attributeId: string; textValue?: string | null; numberValue?: number | null;
    optionId?: string | null; unit?: string | null; sourceType: string;
    confidence: number | null; sourceReference: string;
  }> = [];
  if (categoryId) {
    const categoryAttributes = await db.categoryAttribute.findMany({
      where: { categoryId },
      include: { attribute: { include: { options: true } } },
    });
    const numericTypes = new Set(["INTEGER", "DECIMAL", "YEAR"]);
    const textTypes = new Set(["TEXT", "LONG_TEXT", "LOCATION"]);
    const normalizeValue = (value: string) => value.trim().toLocaleLowerCase("fa-IR")
      .replace(/[ي]/g, "ی").replace(/[ك]/g, "ک").replace(/[\u200c\s_-]+/g, "");
    for (const link of categoryAttributes) {
      const attribute = link.attribute;
      const key = (attribute.key || "").trim().toLowerCase();
      let value: { textValue?: string; numberValue?: number; optionId?: string; unit?: string } | null = null;
      if (["year", "manufacturing_year", "model_year", "production_year"].includes(key)
          && s.year != null && Number.isInteger(Number(s.year))
          && Number(s.year) >= 1900 && Number(s.year) <= new Date().getFullYear() + 1
          && numericTypes.has(attribute.type)) {
        value = { numberValue: Number(s.year), unit: attribute.unit || undefined };
      } else if (["operating_hours", "hours", "working_hours", "engine_hours"].includes(key)
          && s.hours != null && Number.isFinite(Number(s.hours))
          && Number(s.hours) >= 0 && Number(s.hours) <= 1_000_000
          && numericTypes.has(attribute.type)) {
        value = { numberValue: Number(s.hours), unit: attribute.unit || "ساعت" };
      } else if (["condition", "state"].includes(key) && s.condition) {
        const aliases: Record<string, string[]> = {
          NEW: ["new", "نو"], USED: ["used", "کارکرده"],
          REFURBISHED: ["refurbished", "بازسازی", "بازسازی‌شده", "بازسازی شده"],
          FOR_PARTS: ["for_parts", "for parts", "قطعات", "مخصوص قطعات"],
        };
        const candidates = aliases[s.condition] || [];
        if (["SELECT", "MULTI_SELECT"].includes(attribute.type)) {
          const matches = attribute.options.filter((option) => {
            const values = [option.value, option.label || ""].map(normalizeValue);
            return candidates.some((candidate) => values.includes(normalizeValue(candidate)));
          });
          if (matches.length === 1) value = { optionId: matches[0].id };
        } else if (textTypes.has(attribute.type)) {
          value = { textValue: s.condition };
        }
      } else if (["city", "location", "location_city"].includes(key)
          && s.location?.trim() && textTypes.has(attribute.type)) {
        value = { textValue: s.location.trim() };
      }
      if (value) extractedAttributeValues.push({
        attributeId: attribute.id, ...value, sourceType: "AI_EXTRACTION",
        confidence: null, sourceReference: s.url,
      });
    }
  }

  // Serialize imports for this exact source URL across all app instances.
  // PostgreSQL transaction-scoped advisory locks avoid a schema migration while preventing
  // concurrent imports through this route from creating duplicate source records.
  const outcome = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${s.url}, 0))`;
    const existing = await tx.listing.findFirst({
      where: { sourceUrl: s.url },
      select: { id: true, slug: true, status: true },
    });
    if (existing) return { listing: existing, alreadyExists: true };

    let slug = slugify(title);
    let i = 1;
    while (await tx.listing.findUnique({ where: { slug } })) {
      slug = `${slugify(title)}-${i++}`;
    }

    const listing = await tx.listing.create({
    data: {
      slug,
      title,
      description: s.description,
      shortDesc: s.description?.slice(0, 150),
      price: parseBig(s.price),
      priceType: s.price ? "FIXED" : "NEGOTIABLE",
      condition: s.condition || "USED",
      year: s.year ?? null,
      workingHours: s.hours ?? null,
      province: s.location || null,
      sellerName: null,
      // Imported phone numbers are never persisted before separate consent verification.
      sellerPhone: null,
      sourceUrl: s.url,
      sourceSite: DIVAR_HOSTS.some((h) => url2 === h || url2.endsWith(`.${h}`))
        ? "DIVAR"
        : SHEYPOOR_HOSTS.some((h) => url2 === h || url2.endsWith(`.${h}`))
          ? "SHEYPOOR"
          : url2,
      brandId,
      categoryId,
      modelId,
      ...(extractedAttributeValues.length ? { attributeValues: { create: extractedAttributeValues } } : {}),
      status: "PENDING",
      verified: false,
      featured: false,
    },
    });
    return { listing, alreadyExists: false };
  });
  const listing = outcome.listing;
  if (!outcome.alreadyExists) await logAudit({
    actorId: null,
    actorType: "ADMIN",
    action: "admin.listings.create",
    entityType: "Listing",
    entityId: listing.id,
    after: { slug: listing.slug, title: listing.title, sourceUrl: listing.sourceUrl, sourceSite: listing.sourceSite, status: listing.status },
    reason: "via admin API",
  });

  // Third-party images remain visible only in the admin extraction preview until rights review
  // and the approved Backblaze B2 ingestion flow are implemented.

  return { ...listing, alreadyExists: outcome.alreadyExists };
}

/* POST /api/admin/ai-scraper
   Supports only the real-source mode interface:
   { mode: "search", query, num? }    → web search + scrape
   { mode: "scrape", url }            → scrape a single URL
   { mode: "import", scraped }        → import a scraped result
   { mode: "bulk-import", urls: [] }  → scrape + import all

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
*/

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
  const mode = String(body.mode ?? "");

  // Legacy action endpoints generated synthetic listings and could publish them directly.
  // Keep them disabled; the supported mode interface only imports scraped source records as PENDING.
  if (action) return NextResponse.json({ error: "رابط قدیمی تولید نمونه غیرفعال است؛ از جستجوی آگهی واقعی استفاده کنید." }, { status: 410 });

  try {
    // ════════════════════════════════════════════════
    // B) DIRECT "mode" FORMAT (programmatic)
    // ════════════════════════════════════════════════
    const zai = await getZai(controller.signal);

    if (mode === "search") {
      const query = String(body.query ?? "").trim();
      if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 });
      const num = Math.max(1, Math.min(10, Number(body.num) || 5));
      const urls = (await searchAdUrls(zai, query, num)).filter(isAllowedSourceUrl);
      const results = await Promise.all(urls.slice(0, num).map((u) => scrapeUrl(zai, u, controller.signal)));
      return NextResponse.json({ ok: true, results });
    }

    if (mode === "scrape") {
      const url = String(body.url ?? "").trim();
      if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });
      if (!isAllowedSourceUrl(url)) return NextResponse.json({ error: "دامنه این آگهی در فهرست منابع مجاز نیست." }, { status: 400 });
      const result = await scrapeUrl(zai, url, controller.signal);
      return NextResponse.json({ ok: true, result });
    }

    if (mode === "import") {
      // Browser-submitted extraction fields are untrusted. Re-fetch the source and
      // perform extraction on the server; only the validated source URL is accepted.
      const submitted = body.scraped as Partial<ScrapeResult> | undefined;
      const sourceUrl = String(submitted?.url ?? "").trim();
      if (!sourceUrl) return NextResponse.json({ error: "scraped.url is required" }, { status: 400 });
      if (!isAllowedSourceUrl(sourceUrl)) return NextResponse.json({ error: "دامنه این آگهی در فهرست منابع مجاز نیست." }, { status: 400 });
      const scraped = await scrapeUrl(zai, sourceUrl, controller.signal);
      if (!scraped.title || (scraped.description || "").startsWith("Error scraping:")) {
        return NextResponse.json({ error: "استخراج مجدد سمت سرور ناموفق بود؛ پیش‌نویسی ساخته نشد." }, { status: 502 });
      }
      const listing = await importListing(scraped);
      return NextResponse.json({ ok: true, id: listing.id, slug: listing.slug, status: listing.status, alreadyExists: Boolean((listing as any).alreadyExists) });
    }

    if (mode === "bulk-import") {
      const urls: string[] = Array.isArray(body.urls) ? body.urls : [];
      if (urls.length === 0) return NextResponse.json({ error: "urls is required" }, { status: 400 });
      if (urls.some((u) => !isAllowedSourceUrl(u))) return NextResponse.json({ error: "همه آدرس‌ها باید از دامنه‌های مجاز باشند." }, { status: 400 });
      const scraped = await Promise.all(urls.map((u) => scrapeUrl(zai, u, controller.signal)));
      const imported: any[] = [];
      for (const s of scraped) {
        try { const l = await importListing(s); imported.push({ id: l.id, slug: l.slug, sourceUrl: s.url, ok: true }); }
        catch (err: any) { imported.push({ sourceUrl: s.url, ok: false, error: err?.message }); }
      }
      return NextResponse.json({ ok: true, count: imported.length, results: imported });
    }

    return NextResponse.json({ error: "Unknown action or mode" }, { status: 400 });
  } catch (err: any) {
    // STEP 11.43: detect AbortError → 504 Gateway Timeout. The signal
    // is injected via getZai(controller.signal), so an aborted LLM call
    // surfaces here. (Helpers like llmExtract swallow errors internally,
    // so a true timeout may not always reach this point — but if it
    // does, we honor the contract.)
    if (err?.name === "AbortError" || controller.signal.aborted) {
      return NextResponse.json(
        { error: `Gateway Timeout: timeout after ${controller.signal.aborted ? "policy timeout" : "unknown"}ms` },
        { status: 504 },
      );
    }
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
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
  await requirePermission(user.id, "ai.scraper.execute");

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
