import { NextResponse } from "next/server";
import { checkCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { slugify, parseBig } from "@/lib/api-helpers";
import { preflightAIRequest, recordAICost } from "@/lib/ai-policy";
import ZAI from "z-ai-web-dev-sdk";
import { logAudit } from "@/lib/audit";
import { fetchAllowedSourcePage, isAllowedSourceUrl } from "@/lib/server/safe-source-fetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIVAR_HOSTS = ["divar.ir", "divar.com"];
const SHEYPOOR_HOSTS = ["sheypoor.com"];
const MAX_BULK_IMPORT_URLS = 30;

// Provider execution is an explicit per-environment opt-in; the scraper implementation remains available.
// This gate is checked before AI preflight so a disabled environment never reserves budget.


interface ScrapeResult {
  url: string;
  title?: string;
  publishedAt?: string | null;
  selectedCategoryId?: string | null;
  selectedTransactionTypeId?: string | null;
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

function extractPublishedAt(html: string): string | null {
  const candidates = [
    html.match(/article:published_time.{0,120}?content=["']([^"']+)["']/i)?.[1],
    html.match(/datePublished.{0,40}?["']([0-9]{4}-[0-9]{2}-[0-9]{2}[^"']*)["']/i)?.[1],
    html.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1],
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
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
  signal?: AbortSignal,
): Promise<Partial<ScrapeResult>> {
  const sys = `You are HEAVIX listing extractor. Given raw HTML / page text from a Persian classified ad (Divar/Sheypoor), extract structured JSON with these keys:
{
  "title": string,
  "publishedAt": string (ISO 8601 publication date) or null,
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
    // Preserve the gateway timeout contract: optional extraction failures may
    // fall back to page metadata, but a cancelled request must propagate.
    if (signal?.aborted) {
      const error = new Error("استخراج هوشمند به‌دلیل پایان مهلت درخواست لغو شد.");
      error.name = "AbortError";
      throw error;
    }
    return {};
  }
}

/** Use web_search to find ad URLs for a query. */
async function searchAdUrls(zai: any, query: string, num = 10): Promise<string[]> {
  const r = await zai.functions.invoke("web_search", {
    query: `(${query}) (site:divar.ir OR site:sheypoor.com)`,
    num,
  });
  const rows = Array.isArray(r)
    ? r
    : Array.isArray(r?.results)
      ? r.results
      : Array.isArray(r?.data?.results)
        ? r.data.results
        : Array.isArray(r?.items)
          ? r.items
          : [];
  const urls: string[] = rows.flatMap((item: any) => {
    const value = item?.url || item?.link || item?.href;
    return typeof value === "string" && /^https:\/\//i.test(value) ? [value] : [];
  });
  return Array.from(new Set<string>(urls));
}

async function scrapeUrl(zai: any, url: string, signal?: AbortSignal): Promise<ScrapeResult> {
  const base: ScrapeResult = { url, images: [] };
  if (!isAllowedSourceUrl(url)) return { ...base, description: "منبع این آگهی در فهرست دامنه‌های مجاز نیست." };
  try {
    const data = await fetchAllowedSourcePage(url, signal);
    const html = data.html;
    const title = data.title;
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const phones = extractPhones(html + " " + text);

    const llm = await llmExtract(zai, text || html, url, signal);

    return {
      url,
      title: llm.title || title || undefined,
      publishedAt: llm.publishedAt || extractPublishedAt(html),
      description: llm.description || text.slice(0, 600) || undefined,
      price: llm.price || extractPrice(text),
      // Remote third-party image URLs are intentionally not sent to the browser.
      // Image ingestion will use the approved consent + Backblaze B2 pipeline.
      images: [],
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
async function importListing(s: ScrapeResult, actorId: string) {
  if (!isAllowedSourceUrl(s.url)) throw new Error("منبع آگهی مجاز نیست.");
  if (!s.title?.trim() || (s.description || "").startsWith("Error scraping:")) {
    throw new Error("استخراج معتبر آگهی کامل نیست؛ پیش‌نویس ساخته نشد.");
  }
  const title = s.title || "بدون عنوان";
  const selectedTransaction = s.selectedTransactionTypeId
    ? await db.transactionType.findUnique({ where: { id: s.selectedTransactionTypeId }, select: { key: true } })
    : null;
  const validListingTypes = new Set(["SALE", "RENT", "AUCTION", "WANTED", "SERVICE_OFFER", "SERVICE_REQUEST", "QUOTE"]);
  const listingType = selectedTransaction && validListingTypes.has(selectedTransaction.key)
    ? selectedTransaction.key
    : "SALE";
  const toBoundedInteger = (value: unknown, min: number, max: number): number | null => {
    const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
  };
  const normalizedYear = toBoundedInteger(s.year, 1900, new Date().getFullYear() + 1);
  const normalizedHours = toBoundedInteger(s.hours, 0, 1_000_000);
  const normalizedCondition = ["NEW", "USED", "REFURBISHED", "FOR_PARTS"].includes(String(s.condition || "").toUpperCase())
    ? String(s.condition).toUpperCase()
    : null;

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

  let categoryId: string | null = s.selectedCategoryId || null;
  if (!categoryId && s.category) {
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
          && normalizedYear != null
          && numericTypes.has(attribute.type)) {
        value = { numberValue: normalizedYear, unit: attribute.unit || undefined };
      } else if (["operating_hours", "hours", "working_hours", "engine_hours"].includes(key)
          && normalizedHours != null
          && numericTypes.has(attribute.type)) {
        value = { numberValue: normalizedHours, unit: attribute.unit || "ساعت" };
      } else if (["condition", "state"].includes(key) && normalizedCondition) {
        const aliases: Record<string, string[]> = {
          NEW: ["new", "نو"], USED: ["used", "کارکرده"],
          REFURBISHED: ["refurbished", "بازسازی", "بازسازی‌شده", "بازسازی شده"],
          FOR_PARTS: ["for_parts", "for parts", "قطعات", "مخصوص قطعات"],
        };
        const candidates = aliases[normalizedCondition] || [];
        if (["SELECT", "MULTI_SELECT"].includes(attribute.type)) {
          const matches = attribute.options.filter((option) => {
            const values = [option.value, option.label || ""].map(normalizeValue);
            return candidates.some((candidate) => values.includes(normalizeValue(candidate)));
          });
          if (matches.length === 1) value = { optionId: matches[0].id };
        } else if (textTypes.has(attribute.type)) {
          value = { textValue: normalizedCondition };
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
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended(${s.url}, 0))) AS source_lock`;
    const existing = await tx.listing.findFirst({
      where: { sourceUrl: s.url },
      select: { id: true, slug: true, status: true, title: true, sourceUrl: true, sourceSite: true },
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
      listingType,
      price: parseBig(s.price),
      priceType: s.price ? "FIXED" : "NEGOTIABLE",
      condition: normalizedCondition,
      year: normalizedYear,
      workingHours: normalizedHours,
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
      transactionTypeId: s.selectedTransactionTypeId || null,
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
    actorId,
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
      const num = Math.max(1, Math.min(30, Number(body.num) || 15));
      const categoryId = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
      const serviceTypeId = typeof body.serviceTypeId === "string" ? body.serviceTypeId.trim() : "";
      const transactionTypeId = typeof body.transactionTypeId === "string" ? body.transactionTypeId.trim() : "";
      if (!query && !categoryId && !serviceTypeId && !transactionTypeId) {
        return NextResponse.json({ error: "عبارت جستجو یا حداقل یک دسته‌بندی/خدمت را انتخاب کنید." }, { status: 400 });
      }
      const searchTerms: string[] = query ? [query] : [];
      if (categoryId) {
        const category = await db.category.findFirst({
          where: { id: categoryId, active: true },
          select: { name: true, nameEn: true },
        });
        if (category) searchTerms.push(category.name, category.nameEn || "");
      }
      if (serviceTypeId) {
        const service = await db.serviceType.findFirst({
          where: { id: serviceTypeId, active: true },
          select: { nameFa: true, nameEn: true },
        });
        if (service) searchTerms.push(service.nameFa, service.nameEn || "");
      }
      if (transactionTypeId) {
        const transaction = await db.transactionType.findFirst({
          where: { id: transactionTypeId, active: true },
          select: { nameFa: true, nameEn: true },
        });
        if (transaction) searchTerms.push(transaction.nameFa, transaction.nameEn || "");
      }
      const dateDays = Number(body.dateDays);
      if (Number.isInteger(dateDays) && dateDays > 0 && dateDays <= 365) {
        const after = new Date(Date.now() - dateDays * 24 * 60 * 60 * 1000);
        const ymd = after.toISOString().slice(0, 10);
        searchTerms.push(`after:${ymd}`);
      }
      const urls = (await searchAdUrls(zai, searchTerms.filter(Boolean).join(" "), num))
        .filter((url) => isAllowedSourceUrl(url));
      const extracted = await Promise.all(urls.slice(0, num).map(async (u) => ({
        ...(await scrapeUrl(zai, u, controller.signal)),
        selectedCategoryId: categoryId || null,
        selectedTransactionTypeId: transactionTypeId || null,
      })));
      const cutoff = Number.isInteger(dateDays) && dateDays > 0 && dateDays <= 365
        ? Date.now() - dateDays * 24 * 60 * 60 * 1000
        : null;
      const results = cutoff == null ? extracted : extracted.filter((item) => {
        if (!item.publishedAt) return true; // Keep undated source pages visible; date is marked unknown in the UI.
        const published = new Date(item.publishedAt).getTime();
        return Number.isNaN(published) || published >= cutoff;
      });
      return NextResponse.json({ ok: true, results, searched: { query, categoryId: categoryId || null, serviceTypeId: serviceTypeId || null, transactionTypeId: transactionTypeId || null, dateDays: dateDays || null }, dateFilter: cutoff == null ? null : { days: dateDays, cutoff: new Date(cutoff).toISOString(), checked: extracted.length, returned: results.length, unknownDateCount: extracted.filter((item) => !item.publishedAt).length } });
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
      const selectedCategoryId = typeof submitted?.selectedCategoryId === "string" ? submitted.selectedCategoryId : null;
      const selectedTransactionTypeId = typeof submitted?.selectedTransactionTypeId === "string" ? submitted.selectedTransactionTypeId : null;
      if (selectedCategoryId && !(await db.category.findFirst({ where: { id: selectedCategoryId, active: true }, select: { id: true } }))) {
        return NextResponse.json({ error: "دسته‌بندی انتخاب‌شده معتبر یا فعال نیست." }, { status: 400 });
      }
      if (selectedTransactionTypeId && !(await db.transactionType.findFirst({ where: { id: selectedTransactionTypeId, active: true }, select: { id: true } }))) {
        return NextResponse.json({ error: "نوع آگهی انتخاب‌شده معتبر یا فعال نیست." }, { status: 400 });
      }
      const scraped = await scrapeUrl(zai, sourceUrl, controller.signal);
      scraped.selectedCategoryId = selectedCategoryId;
      scraped.selectedTransactionTypeId = selectedTransactionTypeId;
      if (!scraped.title || (scraped.description || "").startsWith("Error scraping:")) {
        return NextResponse.json({ error: "استخراج مجدد سمت سرور ناموفق بود؛ پیش‌نویسی ساخته نشد." }, { status: 502 });
      }
      const listing = await importListing(scraped, user.id);
      return NextResponse.json({ ok: true, id: listing.id, slug: listing.slug, status: listing.status, alreadyExists: Boolean((listing as any).alreadyExists) });
    }

    if (mode === "bulk-import") {
      const urls: string[] = Array.isArray(body.urls) ? body.urls : [];
      if (urls.length === 0) return NextResponse.json({ error: "urls is required" }, { status: 400 });
      if (urls.length > MAX_BULK_IMPORT_URLS) return NextResponse.json({ error: `حداکثر ${MAX_BULK_IMPORT_URLS} آدرس در هر درخواست مجاز است.` }, { status: 413 });
      if (urls.some((u) => typeof u !== "string" || !isAllowedSourceUrl(u))) return NextResponse.json({ error: "همه آدرس‌ها باید از دامنه‌های مجاز باشند." }, { status: 400 });
      const scraped = await Promise.all(urls.map((u) => scrapeUrl(zai, u, controller.signal)));
      const imported: any[] = [];
      for (const s of scraped) {
        try { const l = await importListing(s, user.id); imported.push({ id: l.id, slug: l.slug, sourceUrl: s.url, ok: true }); }
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
  await requirePermission(user.id, "ai.execute");

  // Validate same-origin requests before AI preflight; preflight atomically reserves budget.
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "Invalid CSRF origin" }, { status: 403 });
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