import { HOMEPAGE_CACHE_TAGS } from '@/lib/homepage-cache-tags';
import { revalidateTag } from 'next/cache';
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { checkCsrf } from "@/lib/csrf";
import { logAudit, logAuditStrict } from "@/lib/audit";
import { categoryLayerForTransactionType, isRequestTransactionType, requiresListingImage, requiresListingPrice, SUPPLY_LISTING_TYPES } from "@/lib/transaction-type-routing";
import { getCurrentUser } from "@/lib/auth";
import { toPublicListingDTO } from "@/lib/public-listing-dto";
import { parseBig, parseNumber, slugify, uniqueSlug } from "@/lib/api-helpers";
import {
  normalizeSearchQuery,
  buildSearchWhere,
  searchListings,
} from "@/lib/search";
import { logSearchQuery } from "@/lib/demand-engine";
import { getClientIp } from "@/lib/request-context";
import { trackEvent } from "@/lib/analytics";
import { trackError } from "@/lib/error-tracking";
import { getAsset, attachAsset } from "@/lib/media-service";
import { validateListingAttributeValues } from "@/lib/listing-attributes";
import { readBoundedJson } from "@/lib/read-bounded-json";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { rateLimitKey } from "@/lib/request-context";
import { LISTING_CREATE } from "@/lib/rate-limit-presets";
import { extractIdempotencyKey, findIdempotentResult } from "@/lib/idempotency";
import { createHash } from "node:crypto";
import { getListingImagePolicy } from "@/lib/listing-image-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LISTING_REQUEST_BODY_BYTES = 512 * 1024;

/* GET /api/listings — PUBLIC listing search. No auth required.
   Query:
     ?q=&page=&limit=&category=&brand=&city=
     ?priceMin=&priceMax=         (Phase 4 deepening — price range, BigInt-able)
     ?condition=NEW|USED|REFURBISHED
     ?yearMin=&yearMax=           (Int year range)
     ?sort=newest|oldest|price-asc|price-desc|featured
     ?attr.KEY_min=&attr.KEY_max=   (numeric range on attribute value)
     ?attr.KEY=val                  (SELECT optionId OR TEXT exact match;
                                     can repeat for multi-select)
   Returns: { success: true, count, data }
   - Only PUBLISHED listings, capped at 20 (default 20).
   - Each item: flat listing fields + nested brand/category/images.

   P1-18: free-text + brand + category + city clauses now route
   through `normalizeSearchQuery` / `buildSearchWhere` (src/lib/search.ts)
   so Persian normalization (ي→ی, ك→ک, ZWNJ strip, Arabic→Persian
   digits, lowercase, collapse spaces) is applied uniformly. When no
   dynamic attribute filters are present we delegate the whole fetch
   to `searchListings`; when attribute filters ARE present we keep
   the local Prisma query (so the `attributeValues: { some: ... }`
   AND clauses can be composed) but still use the normalized helpers
   for the text/brand/category parts.

   Phase 4 deepening (P4-SEARCH-DISCOVERY): the new `priceMin` /
   `priceMax` / `condition` / `yearMin` / `yearMax` / `sort` filters
   are applied in BOTH paths — they get forwarded to `searchListings`
   in the fast path and are AND-claused locally in the slow path.
*/
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit")) || 20));
    const category = (url.searchParams.get("category") ?? "").trim();
    const brand = (url.searchParams.get("brand") ?? "").trim();
    const city = (url.searchParams.get("city") ?? "").trim();

    // ── Phase 4 deepening — faceted filters (P4-SEARCH-DISCOVERY) ──
    const priceMin = (url.searchParams.get("priceMin") ?? "").trim() || null;
    const priceMax = (url.searchParams.get("priceMax") ?? "").trim() || null;
    const conditionRaw = (url.searchParams.get("condition") ?? "").trim().toUpperCase();
    const condition =
      conditionRaw === "NEW" || conditionRaw === "USED" || conditionRaw === "REFURBISHED"
        ? conditionRaw
        : null;
    const yearMinRaw = url.searchParams.get("yearMin");
    const yearMaxRaw = url.searchParams.get("yearMax");
    const yearMin = yearMinRaw ? Number(yearMinRaw) : null;
    const yearMax = yearMaxRaw ? Number(yearMaxRaw) : null;
    const sortRaw = (url.searchParams.get("sort") ?? "").trim().toLowerCase();
    const sort: "newest" | "oldest" | "price-asc" | "price-desc" | "featured" | null =
      sortRaw === "newest" || sortRaw === "oldest" || sortRaw === "price-asc" ||
      sortRaw === "price-desc" || sortRaw === "featured"
        ? sortRaw
        : null;

    /* ── Dynamic attribute filters ──
       Parse `attr.KEY_min`, `attr.KEY_max`, `attr.KEY` (latter may repeat)
       from the URL and add a separate `attributeValues: { some: ... }`
       clause per attribute, joined by AND. */
    const attrKeys = new Set<string>();
    for (const k of url.searchParams.keys()) {
      if (!k.startsWith("attr.")) continue;
      const stripped = k.slice(5);
      const base = stripped.replace(/_(min|max)$/, "");
      if (base) attrKeys.add(base);
    }

    // Fast path: no attribute filters → delegate to searchListings which
    // already returns the flat shape the client expects.
    if (attrKeys.size === 0) {
      const { results, total } = await searchListings({
        q,
        category,
        brand,
        city,
        // Phase 4 deepening — forward faceted filters + sort.
        priceMin,
        priceMax,
        condition,
        yearMin: yearMin !== null && Number.isFinite(yearMin) ? yearMin : null,
        yearMax: yearMax !== null && Number.isFinite(yearMax) ? yearMax : null,
        sort,
        limit,
        offset: (page - 1) * limit,
      });

      // Re-shape to match the legacy /api/listings contract so the
      // existing client doesn't break: top-level `success` + `count` +
      // `data` array with brand/category/images nested objects.
      const data = results.map(toPublicListingDTO);

      // P2-23 Demand Engine — log the search (fire-and-forget).
      if (q) {
        Promise.resolve()
          .then(async () => {
            await logSearchQuery({
              query: q,
              resultCount: total,
              ip: getClientIp(req),
              categorySlug: category || null,
              brandSlug: brand || null,
            });
          })
          .catch(() => {
            /* demand logging must never break search */
          });

        // P1-2 — track as AnalyticsEvent (fire-and-forget).
        trackEvent({
          eventType: "SEARCH",
          query: q,
          page: "/api/listings",
          ip: getClientIp(req),
        });
      }

      return NextResponse.json({ success: true, count: total, data });
    }

    // Slow path: attribute filters present — keep the local Prisma query
    // (so the `attributeValues: { some: ... }` AND clauses can be
    // composed) but route text/brand/category through the normalized
    // search helpers.
    const where: any = {
      status: "PUBLISHED",
      // Keep the attribute-filter path consistent with searchListings:
      // public catalog results are supply listings only.
      listingType: { in: [...SUPPLY_LISTING_TYPES] },
    };

    if (q) {
      const textClause = buildSearchWhere(
        ["title", "shortDesc", "description"],
        q,
      );
      if (textClause) where.OR = textClause.OR;
    }
    if (city) where.city = { contains: normalizeSearchQuery(city) };
    if (category) {
      const catClause: any = {
        OR: [
          { category: { slug: category } },
          { category: { name: { contains: normalizeSearchQuery(category) } } },
        ],
      };
      where.OR = where.OR
        ? [...where.OR, ...catClause.OR]
        : catClause.OR;
    }
    if (brand) {
      const brandClause: any = [
        { brand: { slug: brand } },
        { brand: { name: { contains: normalizeSearchQuery(brand) } } },
        { brand: { nameEn: { contains: normalizeSearchQuery(brand) } } },
      ];
      where.OR = where.OR ? [...where.OR, ...brandClause] : brandClause;
    }

    // Phase 4 deepening — apply the same faceted filters in the slow path.
    if (priceMin || priceMax) {
      const priceFilter: any = {};
      const minBi = parseBig(priceMin);
      const maxBi = parseBig(priceMax);
      if (minBi !== null && minBi >= 0n) priceFilter.gte = minBi;
      if (maxBi !== null && maxBi >= 0n) priceFilter.lte = maxBi;
      if (Object.keys(priceFilter).length > 0) {
        where.AND = (where.AND as any[] | undefined) ?? [];
        where.AND.push({ price: priceFilter });
      }
    }
    if (condition) {
      where.AND = (where.AND as any[] | undefined) ?? [];
      where.AND.push({ condition });
    }
    if ((yearMin !== null && Number.isFinite(yearMin)) || (yearMax !== null && Number.isFinite(yearMax))) {
      const yearFilter: any = {};
      if (yearMin !== null && Number.isFinite(yearMin)) yearFilter.gte = yearMin;
      if (yearMax !== null && Number.isFinite(yearMax)) yearFilter.lte = yearMax;
      where.AND = (where.AND as any[] | undefined) ?? [];
      where.AND.push({ year: yearFilter });
    }

    // Build attribute AND clauses
    const keys = Array.from(attrKeys);
    const defs = await db.attributeDefinition.findMany({
      where: { OR: [{ key: { in: keys } }, { id: { in: keys } }] },
      select: { id: true, key: true },
    });
    const idByKey = new Map<string, string>();
    for (const d of defs) {
      if (d.key) idByKey.set(d.key, d.id);
      idByKey.set(d.id, d.id);
    }
    const andClauses: any[] = [];
    for (const key of keys) {
      const attrId = idByKey.get(key);
      if (!attrId) continue;
      const minRaw = url.searchParams.get(`attr.${key}_min`);
      const maxRaw = url.searchParams.get(`attr.${key}_max`);
      const equals = url.searchParams.getAll(`attr.${key}`).filter((x) => x !== "");
      const min = minRaw ? Number(minRaw) : NaN;
      const max = maxRaw ? Number(maxRaw) : NaN;
      if (isNaN(min) && isNaN(max) && equals.length === 0) continue;
      const clause: any = { attributeId: attrId };
      if (!isNaN(min) || !isNaN(max)) {
        const nv: any = {};
        if (!isNaN(min)) nv.gte = min;
        if (!isNaN(max)) nv.lte = max;
        clause.numberValue = nv;
      }
      if (equals.length > 0) {
        clause.OR = equals.flatMap((val) => [{ optionId: val }, { textValue: val }]);
      }
      andClauses.push({ attributeValues: { some: clause } });
    }
    if (andClauses.length > 0) {
      where.AND = (where.AND as any[] | undefined) ?? [];
      where.AND.push(...andClauses);
    }

    // Phase 4 deepening — sort: same mapping as the fast path
    // (`searchListings`); falls back to featured+newest when no sort
    // was supplied.
    const orderBy: any =
      sort === "oldest"
        ? [{ createdAt: "asc" }]
        : sort === "price-asc"
          ? [{ price: "asc" }, { createdAt: "desc" }]
          : sort === "price-desc"
            ? [{ price: "desc" }, { createdAt: "desc" }]
            : sort === "newest"
              ? [{ createdAt: "desc" }]
              : [{ featured: "desc" }, { createdAt: "desc" }];

    const [total, rows] = await Promise.all([
      db.listing.count({ where }),
      db.listing.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        include: {
          brand: {
            select: { id: true, name: true, nameEn: true, slug: true, country: true },
          },
          category: {
            select: { id: true, name: true, nameEn: true, slug: true, icon: true },
          },
          images: { take: 1, orderBy: { sortOrder: "asc" } },
        },
      }),
    ]);

    const data = rows.map(toPublicListingDTO);

    // P2-23 Demand Engine — log the search (fire-and-forget).
    if (q) {
      Promise.resolve()
        .then(async () => {
          await logSearchQuery({
            query: q,
            resultCount: total,
            ip: getClientIp(req),
            categorySlug: category || null,
            brandSlug: brand || null,
          });
        })
        .catch(() => {
          /* demand logging must never break search */
        });

      // P1-2 — track as AnalyticsEvent (fire-and-forget).
      trackEvent({
        eventType: "SEARCH",
        query: q,
        page: "/api/listings",
        ip: getClientIp(req),
      });
    }

    return NextResponse.json({ success: true, count: total, data });
  } catch (err: any) {
    trackError(err, { endpoint: "GET /api/listings" });
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* POST /api/listings — create listing with validation.
   W-03 SECURITY FIX: Requires authenticated user. sellerId is ALWAYS derived
   from the authenticated session — never from the request body. Anonymous
   listing creation is rejected with 401. */
export async function POST(req: Request) {
  let durableIdempotencyKey: string | null = null;
  let listingCreateActorId: string | null = null;
  let duplicateReviewRequired = false;
  try {
    // W-03 FIX: Authenticate FIRST, before any data processing.
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "برای ایجاد آگهی باید وارد شوید" },
        { status: 401 },
      );
    }
    listingCreateActorId = user.id;

    if (!checkCsrf(req)) {
      return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
    }

    // H.2.4e: rate limit — user-scoped, caps listing-create spam against
    // the moderation queue (mirrors WANTED_CREATE on the demand side).
    {
      const rl = rateLimit({
        key: rateLimitKey(user.id, LISTING_CREATE.label),
        limit: LISTING_CREATE.limit,
        windowMs: LISTING_CREATE.windowMs,
      });
      if (!rl.ok) {
        const retryAfter = retryAfterSeconds(rl.resetAt);
        return NextResponse.json(
          { error: "تعداد درخواست‌ها بیش از حد مجاز است. لطفاً بعداً تلاش کنید." },
          { status: 429, headers: { "Retry-After": String(retryAfter) } },
        );
      }
    }

    const parsedBody = await readBoundedJson<Record<string, any>>(
      req,
      MAX_LISTING_REQUEST_BODY_BYTES,
    );
    if (!parsedBody.ok) {
      return NextResponse.json(
        { error: parsedBody.error },
        { status: parsedBody.status },
      );
    }
    const body = parsedBody.value;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "بدنه درخواست معتبر نیست." }, { status: 400 });
    }

    // Reject malformed technical-attribute payloads instead of silently
    // coercing objects/strings to an empty list. Otherwise optional values
    // could be discarded without the seller noticing.
    if (
      body.attributeValues !== undefined &&
      body.attributeValues !== null &&
      !Array.isArray(body.attributeValues)
    ) {
      return NextResponse.json(
        { error: "ساختار مشخصات فنی معتبر نیست؛ لطفاً فرم را دوباره بررسی کنید." },
        { status: 400 },
      );
    }

    // H.2.4e: idempotency. If the client sent an Idempotency-Key header,
    // resolve to the prior listing result on retry instead of creating a
    // duplicate listing (which would mint a fresh slug). The check runs
    // before field validation so a retry short-circuits fast.
    const idempotencyKey = extractIdempotencyKey(req);
    // AuditLog currently has a globally unique delivery key. Namespace the
    // caller key by authenticated owner before storing/looking it up, so
    // identical client keys from different sellers cannot collide.
    durableIdempotencyKey = idempotencyKey
      ? createHash("sha256").update(`${user.id}:${idempotencyKey}`).digest("hex")
      : null;
    if (durableIdempotencyKey) {
      const prior = await findIdempotentResult({
        key: durableIdempotencyKey,
        action: "marketplace.listing.create",
        actorId: user.id,
      });
      if (prior) {
        // The cached result carries the listing id; fetch the slug so the
        // client can navigate to the listing detail page on replay.
        const cached = await db.listing.findUnique({
          where: { id: prior.id },
          select: { id: true, slug: true, status: true },
        });
        if (cached) {
          return NextResponse.json({
            ok: true,
            id: cached.id,
            slug: cached.slug,
            status: cached.status,
            idempotentReplay: true,
          });
        }
      }
    }

    const title = String(body.title ?? "").trim();
    if (body.modelName !== undefined && body.modelName !== null && typeof body.modelName !== "string") {
      return NextResponse.json({ error: "نام مدل باید متن باشد." }, { status: 400 });
    }
    const modelName = typeof body.modelName === "string" ? body.modelName.trim() : "";
    if (modelName.length > 120) {
      return NextResponse.json({ error: "نام مدل نباید بیش از ۱۲۰ نویسه باشد." }, { status: 400 });
    }
    if (!title || title.length < 3) {
      return NextResponse.json({ error: "عنوان آگهی معتبر نیست" }, { status: 400 });
    }

    const rawTransactionType = body.transactionType ?? body.listingType;
    if (!rawTransactionType) {
      return NextResponse.json({ error: "نوع معامله الزامی است." }, { status: 400 });
    }
    const transactionTypeKey = String(rawTransactionType).trim().toUpperCase();
    const transactionType = await db.transactionType.findUnique({
      where: { key: transactionTypeKey },
      select: { id: true, key: true, active: true },
    });
    if (!transactionType || !transactionType.active) {
      return NextResponse.json({ error: "نوع معامله معتبر یا فعال نیست." }, { status: 400 });
    }

    // The listings route materializes SUPPLY listings only. A demand-side
    // BuyRequest (WANTED) is its own domain — a standalone entity with a
    // dedicated canonical entry point (POST /api/wanted → wanted-service
    // → createWanted). Accepting it here would materialize a supply
    // Listing for a demand post, which contaminates the matching engine's
    // candidate pool (a demand post would become a supply candidate).
    // QUOTE is handled inline below as an RFQ attached to a listing (the
    // RFQ domain), so it is the one request type this route keeps.
    if (isRequestTransactionType(transactionType.key) && transactionType.key !== "QUOTE") {
      return NextResponse.json(
        {
          error:
            "ثبت تقاضای خرید از مسیر اختصاصی /api/wanted انجام می‌شود؛ این مسیر فقط آگهی عرضه می‌سازد.",
        },
        { status: 400 },
      );
    }

    if (!body.categoryId) {
      return NextResponse.json(
        { error: "دسته‌بندی الزامی است؛ انتخاب برند اختیاری است." },
        { status: 400 },
      );
    }

    const isServiceTransaction = ["SERVICE_REQUEST", "SERVICE_OFFER"].includes(transactionType.key);
    let selectedServiceType: { id: string; key: string } | null = null;
    if (isServiceTransaction) {
      if (!body.serviceTypeId) {
        return NextResponse.json({ error: "انتخاب نوع خدمت الزامی است." }, { status: 400 });
      }
      selectedServiceType = await db.serviceType.findFirst({
        where: { id: String(body.serviceTypeId), active: true },
        select: { id: true, key: true },
      });
      if (!selectedServiceType) {
        return NextResponse.json({ error: "نوع خدمت انتخاب‌شده معتبر یا فعال نیست." }, { status: 400 });
      }
    } else if (body.serviceTypeId) {
      return NextResponse.json({ error: "نوع خدمت فقط برای ثبت خدمات قابل استفاده است." }, { status: 400 });
    }

    if (body.categoryId) {
      const expectedLayer = categoryLayerForTransactionType(transactionType.key);
      const category = await db.category.findFirst({
        where: { id: String(body.categoryId), active: true },
        select: {
          id: true,
          layer: true,
          children: { where: { active: true }, select: { id: true }, take: 1 },
        },
      });
      if (!category) {
        return NextResponse.json({ error: "دسته‌بندی انتخاب‌شده معتبر یا فعال نیست." }, { status: 400 });
      }
      if (category.children.length > 0) {
        return NextResponse.json(
          { error: "فقط انتخاب آخرین زیرشاخه برای ثبت آگهی مجاز است." },
          { status: 400 },
        );
      }
      if (category.layer !== expectedLayer) {
        return NextResponse.json(
          { error: "دسته‌بندی با نوع آگهی انتخاب‌شده سازگار نیست." },
          { status: 400 },
        );
      }
    }

    if (body.brandId) {
      const brand = await db.brand.findUnique({
        where: { id: String(body.brandId) },
        select: { id: true, active: true, status: true },
      });
      if (!brand || !brand.active || brand.status !== "ACTIVE") {
        return NextResponse.json({ error: "برند انتخاب‌شده معتبر یا فعال نیست." }, { status: 400 });
      }
    }

    if (body.modelId) {
      const model = await db.productModel.findUnique({
        where: { id: String(body.modelId) },
        select: {
          id: true,
          brandId: true,
          categoryId: true,
          status: true,
          modelCategories: { select: { categoryId: true } },
        },
      });
      if (!model || model.status !== "ACTIVE") {
        return NextResponse.json({ error: "مدل انتخاب‌شده معتبر یا فعال نیست." }, { status: 400 });
      }
      if (!body.brandId || model.brandId !== String(body.brandId)) {
        return NextResponse.json({ error: "مدل انتخاب‌شده به برند انتخابی تعلق ندارد." }, { status: 400 });
      }
    }

    // Image entitlements are resolved from the authenticated subscription.
    // Never trust client tier fields or silently truncate a submitted list.
    const imagePolicy = await getListingImagePolicy(user.id);
    // Active listings include moderation-pending, published, and scheduled supply posts.
    // WANTED requests are stored separately and never consume this Listing quota.
    const activeListingWhere = {
      sellerId: user.id,
      listingType: { in: [...SUPPLY_LISTING_TYPES] },
      status: { in: ["PENDING", "PUBLISHED", "SCHEDULED"] },
    };
    if (imagePolicy.maxListings > 0) {
      const activeListingCount = await db.listing.count({ where: activeListingWhere });
      if (activeListingCount >= imagePolicy.maxListings) {
        return NextResponse.json(
          { error: `سقف ${imagePolicy.maxListings} آگهی فعال پلن شما تکمیل شده است. برای ثبت آگهی جدید، ابتدا یکی از آگهی‌های فعال را ببندید یا پلن خود را ارتقا دهید.`, code: "ACTIVE_LISTING_LIMIT_REACHED", limit: imagePolicy.maxListings, current: activeListingCount },
          { status: 403 },
        );
      }
    }
    const rawImages = Array.isArray(body.images) ? body.images : [];
    const rawAssetIds = Array.isArray(body.assetIds) ? body.assetIds : [];
    if (
      rawImages.length > imagePolicy.maxImages ||
      rawAssetIds.length > imagePolicy.maxImages ||
      (rawImages.length > 0 && rawAssetIds.length > 0)
    ) {
      return NextResponse.json(
        { error: `حداکثر ${imagePolicy.maxImages} تصویر برای هر آگهی در پلن فعلی شما مجاز است.` },
        { status: 400 },
      );
    }

    if (
      requiresListingImage(transactionType.key) &&
      rawImages.length === 0 &&
      rawAssetIds.length === 0
    ) {
      return NextResponse.json({ error: "حداقل یک تصویر برای این نوع آگهی الزامی است." }, { status: 400 });
    }

    const imageUrlsAreStableB2Urls = rawImages.every((image: any) =>
      /^\/api\/media\/[a-f0-9]{24}$/.test(String(image?.url ?? image))
    );
    if (rawImages.length && !imageUrlsAreStableB2Urls) {
      return NextResponse.json(
        { error: "تصاویر آگهی باید ابتدا از مسیر امن بارگذاری رسانه ثبت شوند." },
        { status: 400 },
      );
    }

    const parsedPrice = parseBig(body.price);
    if (requiresListingPrice(transactionType.key) && (parsedPrice === null || parsedPrice <= 0n)) {
      return NextResponse.json({ error: "برای فروش و اجاره، قیمت معتبر و بیشتر از صفر الزامی است." }, { status: 400 });
    }

    const imageAssetIds: string[] = rawAssetIds.length
      ? rawAssetIds.map((value: unknown) => String(value))
      : rawImages.map((image: any) => String(image?.url ?? image).slice("/api/media/".length));

    const stagedAssets: NonNullable<Awaited<ReturnType<typeof getAsset>>>[] = [];
    if (new Set(imageAssetIds).size !== imageAssetIds.length) {
      return NextResponse.json({ error: "تصویر تکراری در فهرست ارسال شده است." }, { status: 400 });
    }
    for (const assetId of imageAssetIds) {
      const asset = await getAsset(assetId);
      if (
        !asset ||
        asset.uploadedBy !== user.id ||
        asset.visibility !== "PRIVATE" ||
        asset.status !== "STAGED" ||
        asset.entityType !== "Listing" ||
        asset.entityId !== null
      ) {
        return NextResponse.json(
          { error: "یکی از تصاویر متعلق به حساب شما نیست یا قبلاً استفاده شده است." },
          { status: 403 },
        );
      }
      if (asset.size > imagePolicy.maxImageBytes) {
        return NextResponse.json(
          { error: `حجم یکی از تصاویر از سقف ${imagePolicy.maxImageBytes / (1024 * 1024)} مگابایت پلن فعلی بیشتر است؛ تصویر را دوباره بارگذاری کنید.` },
          { status: 400 },
        );
      }
      stagedAssets.push(asset);
    }

    // Resolve canonical location IDs and verify the hierarchy instead of
    // persisting opaque IDs into the legacy province/city text columns.
    const requestedProvinceId = body.provinceId ? String(body.provinceId) : null;
    const requestedCityId = body.cityId ? String(body.cityId) : null;
    const requestedCountryId = body.countryId ? String(body.countryId) : null;

    const selectedCity = requestedCityId
      ? await db.city.findUnique({
          where: { id: requestedCityId },
          select: {
            id: true,
            name: true,
            province: { select: { id: true, name: true, countryId: true } },
          },
        })
      : null;
    if (requestedCityId && !selectedCity) {
      return NextResponse.json({ error: "شهر انتخاب‌شده معتبر نیست." }, { status: 400 });
    }

    const selectedProvince = requestedProvinceId
      ? await db.province.findUnique({
          where: { id: requestedProvinceId },
          select: { id: true, name: true, countryId: true },
        })
      : selectedCity?.province ?? null;
    if (requestedProvinceId && !selectedProvince) {
      return NextResponse.json({ error: "استان انتخاب‌شده معتبر نیست." }, { status: 400 });
    }
    if (selectedCity && selectedProvince?.id !== selectedCity.province.id) {
      return NextResponse.json({ error: "شهر با استان انتخاب‌شده مطابقت ندارد." }, { status: 400 });
    }
    if (!selectedProvince) {
      return NextResponse.json({ error: "انتخاب کشور و استان برای ثبت آگهی الزامی است." }, { status: 400 });
    }

    // Exact equipment coordinates are independent from city centroids.
    // Accept only a complete numeric WGS84 pair, and require a canonical city
    // selection so the exact point remains attached to the selected hierarchy.
    const hasLocationLatitude =
      body.locationLatitude !== undefined &&
      body.locationLatitude !== null &&
      body.locationLatitude !== "";
    const hasLocationLongitude =
      body.locationLongitude !== undefined &&
      body.locationLongitude !== null &&
      body.locationLongitude !== "";
    if (hasLocationLatitude !== hasLocationLongitude) {
      return NextResponse.json({ error: "برای ثبت موقعیت دقیق، عرض و طول جغرافیایی باید با هم ارسال شوند." }, { status: 400 });
    }
    let locationLatitude: number | null = null;
    let locationLongitude: number | null = null;
    if (hasLocationLatitude && hasLocationLongitude) {
      if (
        !selectedCity ||
        typeof body.locationLatitude !== "number" ||
        typeof body.locationLongitude !== "number" ||
        !Number.isFinite(body.locationLatitude) ||
        !Number.isFinite(body.locationLongitude) ||
        body.locationLatitude < -90 ||
        body.locationLatitude > 90 ||
        body.locationLongitude < -180 ||
        body.locationLongitude > 180
      ) {
        return NextResponse.json({ error: "مختصات باید عدد معتبر در محدودهٔ WGS84 و همراه با انتخاب شهر باشند." }, { status: 400 });
      }
      locationLatitude = body.locationLatitude;
      locationLongitude = body.locationLongitude;
    }

    const resolvedCountryId = selectedProvince?.countryId ?? requestedCountryId;
    if (requestedCountryId && selectedProvince && requestedCountryId !== selectedProvince.countryId) {
      return NextResponse.json({ error: "استان با کشور انتخاب‌شده مطابقت ندارد." }, { status: 400 });
    }
    if (resolvedCountryId) {
      const country = await db.country.findUnique({
        where: { id: resolvedCountryId },
        select: { id: true },
      });
      if (!country) {
        return NextResponse.json({ error: "کشور انتخاب‌شده معتبر نیست." }, { status: 400 });
      }
    }

    // A caller may associate a listing with a company only when that company
    // is active and the authenticated user is actually linked to it.
    const companyId = body.companyId ? String(body.companyId) : null;
    if (companyId) {
      const membership = await db.company.findFirst({
        where: {
          id: companyId,
          status: "ACTIVE",
          users: { some: { id: user.id } },
        },
        select: { id: true },
      });
      if (!membership) {
        return NextResponse.json({ error: "شما مجاز به ثبت آگهی برای این شرکت نیستید." }, { status: 403 });
      }
    }

    const serialNumber = String(body.serialNumber ?? "").trim();

    const attributeValidation = await validateListingAttributeValues(
      db,
      {
        categoryId: body.categoryId ? String(body.categoryId) : null,
        modelId: body.modelId ? String(body.modelId) : null,
      },
      Array.isArray(body.attributeValues) ? body.attributeValues : [],
      false,
      true,
    );
    if (!attributeValidation.ok) {
      return NextResponse.json({ error: attributeValidation.error }, { status: 400 });
    }


    // Domain-specific records are validated before opening the transaction and
    // created atomically with the Listing below.
    let auctionData: null | {
      title: string;
      description: string | null;
      startPrice: bigint;
      reservePrice: bigint | null;
      minIncrement: bigint;
      startDate: Date;
      endDate: Date;
      status: string;
    } = null;
    if (transactionType.key === "AUCTION") {
      const auctionInput = body.auction && typeof body.auction === "object" ? body.auction : {};
      const startPrice = parseBig(auctionInput.startPrice);
      const minIncrement = parseBig(auctionInput.minIncrement);
      const reservePrice = auctionInput.reservePrice === undefined || auctionInput.reservePrice === ""
        ? null
        : parseBig(auctionInput.reservePrice);
      const startDate = auctionInput.startDate ? new Date(String(auctionInput.startDate)) : null;
      const endDate = auctionInput.endDate ? new Date(String(auctionInput.endDate)) : null;
      if (startPrice === null || startPrice <= 0n || minIncrement === null || minIncrement <= 0n) {
        return NextResponse.json({ error: "قیمت پایه و حداقل افزایش مزایده باید اعداد مثبت باشند." }, { status: 400 });
      }
      if (auctionInput.reservePrice !== undefined && auctionInput.reservePrice !== "" && (reservePrice === null || reservePrice < startPrice)) {
        return NextResponse.json({ error: "قیمت ذخیره مزایده باید خالی یا حداقل برابر قیمت پایه باشد." }, { status: 400 });
      }
      if (!startDate || Number.isNaN(startDate.getTime()) || !endDate || Number.isNaN(endDate.getTime())) {
        return NextResponse.json({ error: "زمان شروع و پایان مزایده معتبر نیست." }, { status: 400 });
      }
      if (startDate.getTime() < Date.now() - 60_000 || endDate <= startDate) {
        return NextResponse.json({ error: "شروع مزایده نباید در گذشته باشد و پایان باید بعد از شروع باشد." }, { status: 400 });
      }
      auctionData = {
        title,
        description: body.description ? String(body.description).slice(0, 5000) : null,
        startPrice,
        reservePrice,
        minIncrement,
        startDate,
        endDate,
        status: "SCHEDULED",
      };
    } else if (body.auction) {
      return NextResponse.json({ error: "اطلاعات مزایده فقط برای نوع معامله AUCTION قابل استفاده است." }, { status: 400 });
    }

    let rfqData: null | {
      title: string;
      description: string | null;
      machineType: string | null;
      brandPref: string | null;
      quantity: number;
      specJson: string;
      budgetMin: bigint | null;
      budgetMax: bigint | null;
      location: string | null;
      deadline: Date | null;
      terms: string | null;
      status: string;
      buyerName: string | null;
      buyerPhone: string;
      buyerEmail: string | null;
      buyerId: string;
    } = null;
    if (transactionType.key === "QUOTE") {
      const rfqInput = body.rfq && typeof body.rfq === "object" ? body.rfq : {};
      const quantity = Number(rfqInput.quantity ?? 1);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
        return NextResponse.json({ error: "تعداد موردنیاز باید عدد صحیح بین ۱ تا ۱۰۰۰۰ باشد." }, { status: 400 });
      }
      const budgetMin = rfqInput.budgetMin === undefined || rfqInput.budgetMin === "" ? null : parseBig(rfqInput.budgetMin);
      const budgetMax = rfqInput.budgetMax === undefined || rfqInput.budgetMax === "" ? null : parseBig(rfqInput.budgetMax);
      if ((rfqInput.budgetMin !== undefined && rfqInput.budgetMin !== "" && budgetMin === null) ||
          (rfqInput.budgetMax !== undefined && rfqInput.budgetMax !== "" && budgetMax === null) ||
          (budgetMin !== null && budgetMin < 0n) || (budgetMax !== null && budgetMax < 0n) ||
          (budgetMin !== null && budgetMax !== null && budgetMin > budgetMax)) {
        return NextResponse.json({ error: "بازه بودجه استعلام معتبر نیست." }, { status: 400 });
      }
      let deadline: Date | null = null;
      if (rfqInput.deadline) {
        deadline = new Date(String(rfqInput.deadline));
        if (Number.isNaN(deadline.getTime()) || deadline <= new Date()) {
          return NextResponse.json({ error: "مهلت استعلام باید یک تاریخ معتبر در آینده باشد." }, { status: 400 });
        }
      }
      const [buyer, rfqCategory, rfqBrand] = await Promise.all([
        db.user.findUnique({
          where: { id: user.id },
          select: { firstName: true, lastName: true, mobile: true, email: true },
        }),
        db.category.findUnique({ where: { id: String(body.categoryId) }, select: { name: true } }),
        body.brandId ? db.brand.findUnique({ where: { id: String(body.brandId) }, select: { name: true } }) : Promise.resolve(null),
      ]);
      if (!buyer?.mobile) {
        return NextResponse.json({ error: "شماره همراه معتبر برای ثبت استعلام در حساب شما ثبت نشده است." }, { status: 400 });
      }
      rfqData = {
        title,
        description: body.description ? String(body.description).slice(0, 5000) : null,
        machineType: rfqCategory?.name ?? null,
        brandPref: rfqBrand?.name ?? null,
        quantity,
        specJson: JSON.stringify({
          categoryId: String(body.categoryId),
          brandId: body.brandId ? String(body.brandId) : null,
          modelId: body.modelId ? String(body.modelId) : null,
          modelName: modelName || null,
          attributeValues: Array.isArray(body.attributeValues) ? body.attributeValues : [],
        }),
        budgetMin,
        budgetMax,
        location: selectedCity?.name ?? selectedProvince?.name ?? null,
        deadline,
        terms: rfqInput.terms ? String(rfqInput.terms).trim().slice(0, 3000) : null,
        status: "OPEN",
        buyerName: [buyer.firstName, buyer.lastName].filter(Boolean).join(" ").trim() || null,
        buyerPhone: buyer.mobile,
        buyerEmail: buyer.email ?? null,
        buyerId: user.id,
      };
    } else if (body.rfq) {
      return NextResponse.json({ error: "اطلاعات RFQ فقط برای نوع معامله QUOTE قابل استفاده است." }, { status: 400 });
    }

    const slug = await uniqueSlug(db.listing, body.slug || title);
    // W-03 FIX: sellerId is derived ONLY from the authenticated session.
    // Any sellerId value in the request body is deliberately ignored.

    const data: any = {
      slug,
      title,
      description: body.description ?? null,
      shortDesc: body.shortDesc ?? null,
      price: parsedPrice,
      priceType: body.priceType || "NEGOTIABLE",
      listingType: transactionType.key,
      transactionTypeId: transactionType.id,
      serviceTypeId: selectedServiceType?.id ?? null,
      condition: body.condition || "USED",
      province: selectedProvince?.name ?? (requestedProvinceId ? null : body.province ?? null),
      city: selectedCity?.name ?? (requestedCityId ? null : body.city ?? null),
      countryId: resolvedCountryId,
      provinceId: selectedProvince?.id ?? null,
      cityId: selectedCity?.id ?? null,
      locationLatitude,
      locationLongitude,
      locationAccuracyMeters: null,
      locationUpdatedAt: locationLatitude !== null ? new Date() : null,
      year: body.year ? parseNumber(body.year) : null,
      workingHours: body.workingHours ? parseNumber(body.workingHours) : null,
      status: "PENDING",
      featured: false,
      verified: false,
      showInLatest: true,
      sellerPhone: body.sellerPhone ?? null,
      sellerName: body.sellerName ?? null,
      brandId: body.brandId || null,
      categoryId: body.categoryId || null,
      modelId: body.modelId || null,
      modelName: modelName || null,
      sellerId: user.id, // W-03 FIX: from authenticated session only (never null, never from body)
      companyId,
      // A pending moderation record is not published and its lifetime has
      // not started. Publication code sets both timestamps when approved.
      publishedAt: null,
      expiresAt: null,
    };

    // H.2.4d: server-side RENT validation. The client enforces these in
    // canProceed, but a direct API caller can bypass the wizard. Fail
    // closed on: rentalPeriod required + enum; deposit >= 0;
    // minimumRentalPeriod integer >= 1; availabilityEnd > availabilityStart.
    if ((body.listingType || body.transactionType) === "RENT") {
      const RENTAL_PERIODS = new Set(["HOURLY", "DAILY", "WEEKLY", "MONTHLY", "PROJECT"]);
      const rp = body.rentalPeriod ? String(body.rentalPeriod) : "";
      if (!rp || !RENTAL_PERIODS.has(rp)) {
        return NextResponse.json({ error: "دوره اجاره معتبر نیست." }, { status: 400 });
      }
      if (body.deposit !== undefined && body.deposit !== "") {
        const dep = parseBig(body.deposit);
        if (dep === null || dep < 0n) {
          return NextResponse.json({ error: "مبلغ ودیعه نمی‌تواند منفی باشد." }, { status: 400 });
        }
      }
      if (body.minimumRentalPeriod !== undefined && body.minimumRentalPeriod !== "") {
        const minP = parseNumber(body.minimumRentalPeriod);
        if (minP === null || !Number.isInteger(minP) || minP < 1) {
          return NextResponse.json({ error: "حداقل دوره اجاره باید عدد صحیح مثبت باشد." }, { status: 400 });
        }
      }
      if (body.availabilityStart && body.availabilityEnd) {
        const s = new Date(body.availabilityStart);
        const e = new Date(body.availabilityEnd);
        if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && e.getTime() <= s.getTime()) {
          return NextResponse.json({ error: "پایان دسترس‌پذیری باید پس از شروع آن باشد." }, { status: 400 });
        }
      }
    }

    // P2-5b — Rental fields (additive; only stored when listingType=RENT).
    if ((body.listingType || body.transactionType) === "RENT") {
      if (body.rentalPeriod) data.rentalPeriod = String(body.rentalPeriod);
      if (body.deposit !== undefined && body.deposit !== "") {
        const dep = parseBig(body.deposit);
        if (dep !== null) data.deposit = dep;
      }
      if (body.minimumRentalPeriod !== undefined && body.minimumRentalPeriod !== "") {
        const minP = parseNumber(body.minimumRentalPeriod);
        if (minP !== null) data.minimumRentalPeriod = minP;
      }
      if (body.operatorIncluded !== undefined) data.operatorIncluded = !!body.operatorIncluded;
      if (body.fuelIncluded !== undefined) data.fuelIncluded = !!body.fuelIncluded;
      if (body.transportIncluded !== undefined) data.transportIncluded = !!body.transportIncluded;
      if (body.availabilityStart) {
        const d = new Date(body.availabilityStart);
        if (!isNaN(d.getTime())) data.availabilityStart = d;
      }
      if (body.availabilityEnd) {
        const d = new Date(body.availabilityEnd);
        if (!isNaN(d.getTime())) data.availabilityEnd = d;
      }
    }

    // Listing, optional machine passport, and image rows commit together.
    // This prevents orphan listings when nested media-row creation fails.
    const listingResult = await db.$transaction(async (tx) => {
      // Re-read the current category/model policy inside the same serializable
      // transaction as the listing write. The earlier validation provides a
      // fast response, while this check closes the admin-policy update race:
      // the listing cannot commit against a stale required/active snapshot.
      const currentAttributeValidation = await validateListingAttributeValues(
        tx,
        {
          categoryId: body.categoryId ? String(body.categoryId) : null,
          modelId: body.modelId ? String(body.modelId) : null,
        },
        Array.isArray(body.attributeValues) ? body.attributeValues : [],
        false,
        true,
      );
      if (!currentAttributeValidation.ok) {
        throw Object.assign(new Error(currentAttributeValidation.error), {
          code: "LISTING_ATTRIBUTE_POLICY_INVALID",
        });
      }

      // Recheck within the write transaction to reduce races between parallel creates.
      if (imagePolicy.maxListings > 0) {
        const currentActiveCount = await tx.listing.count({ where: activeListingWhere });
        if (currentActiveCount >= imagePolicy.maxListings) return null;
      }
      // Deterministic duplicate signal: an exact machine serial match against
      // an existing non-terminal listing is never auto-rejected or merged.
      // It is recorded for human moderation so shared/fleet serial formats
      // and legitimate relistings remain recoverable.
      if (serialNumber) {
        const serialMatches = await tx.machinePassport.findMany({
          where: {
            serialNumber: { equals: serialNumber, mode: "insensitive" },
            listing: { status: { in: ["PENDING", "PUBLISHED", "ACTIVE"] } },
          },
          select: { listingId: true },
          take: 5,
        });
        if (serialMatches.length > 0) {
          duplicateReviewRequired = true;
          data.adminNotes = [
            "AUTO_DUPLICATE_REVIEW: exact machine serial match; human review required.",
            `Candidate listing IDs: ${serialMatches.map((item: { listingId: string }) => item.listingId).join(", ")}`,
          ].join("\\n");
        }
      }

      const created = await tx.listing.create({
        data: {
          ...data,
          ...(serialNumber ? { passport: { create: { serialNumber } } } : {}),
          ...(auctionData ? { auctions: { create: auctionData } } : {}),
          ...(rfqData ? { rfq: { create: rfqData } } : {}),
          ...(stagedAssets.length
            ? {
                images: {
                  create: stagedAssets.map((asset, idx) => ({
                    url: asset.url,
                    alt: asset.altText,
                    isPrimary: idx === 0,
                    sortOrder: idx,
                  })),
                },
              }
            : {}),
        },
        include: {
          auctions: { select: { id: true } },
          rfq: { select: { id: true, title: true, status: true, quantity: true } },
        },
      });

      // createMany uses scalar foreign keys and stays inside this same
      // transaction, so an attribute write failure rolls the listing back.
      if (currentAttributeValidation.values.length) {
        await tx.listingAttributeValue.createMany({
          data: currentAttributeValidation.values.map((value) => ({
            ...value,
            listingId: created.id,
          })),
        });
      }

      // The idempotency receipt is part of the SAME transaction as the
      // Listing, images, children and typed attributes. If this insert fails
      // (including a concurrent replay hitting the unique key), the entire
      // listing transaction rolls back instead of leaving an un-replayable
      // committed listing behind.
      if (durableIdempotencyKey) {
        await logAuditStrict({
          actorId: user.id,
          actorType: "USER",
          action: "marketplace.listing.create",
          entityType: "Listing",
          entityId: created.id,
          idempotencyKey: durableIdempotencyKey,
          after: {
            id: created.id,
            slug: created.slug,
            title: created.title,
            listingType: created.listingType,
            status: created.status,
            categoryId: created.categoryId ?? null,
            brandId: created.brandId ?? null,
            modelId: created.modelId ?? null,
            modelName: created.modelName ?? null,
            serviceTypeId: created.serviceTypeId ?? null,
          },
          reason: `ثبت آگهی: ${created.title}`,
        }, tx);
      }
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!listingResult) {
      return NextResponse.json(
        { error: `سقف ${imagePolicy.maxListings} آگهی فعال پلن شما تکمیل شده است.`, code: "ACTIVE_LISTING_LIMIT_REACHED", limit: imagePolicy.maxListings },
        { status: 403 },
      );
    }
    const listing = listingResult;

    // For requests with an Idempotency-Key, the durable audit receipt was
    // already committed atomically with the listing above. Keep legacy
    // best-effort audit behavior only for clients that omit the header.
    if (!durableIdempotencyKey) {
      await logAudit({
        actorId: user.id,
        actorType: "USER",
        action: "marketplace.listing.create",
        entityType: "Listing",
        entityId: listing.id,
        after: {
          id: listing.id,
          slug: listing.slug,
          title: listing.title,
          listingType: listing.listingType,
          status: listing.status,
          categoryId: listing.categoryId ?? null,
          brandId: listing.brandId ?? null,
          modelId: listing.modelId ?? null,
          modelName: listing.modelName ?? null,
          serviceTypeId: listing.serviceTypeId ?? null,
        },
        reason: `ثبت آگهی: ${listing.title}`,
      });
    }

    if (listing.rfq) {
      try {
        await logAudit({
          actorId: user.id,
          actorType: "USER",
          action: "marketplace.rfq.create",
          entityType: "RFQ",
          entityId: listing.rfq.id,
          after: { listingId: listing.id, title: listing.rfq.title, status: listing.rfq.status, quantity: listing.rfq.quantity },
          reason: `ثبت استعلام قیمت مرتبط با آگهی ${listing.title}`,
        });
      } catch (auditError) {
        console.error("[listings] RFQ audit deferred", auditError instanceof Error ? auditError.message : "unknown");
      }
    }
    for (const auction of listing.auctions) {
      try {
        await logAudit({
          actorId: user.id,
          actorType: "USER",
          action: "marketplace.auction.create",
          entityType: "Auction",
          entityId: auction.id,
          after: { listingId: listing.id, status: "SCHEDULED" },
          reason: `ایجاد مزایده برای آگهی ${listing.title}`,
        });
      } catch (auditError) {
        console.error("[listings] Auction audit deferred", auditError instanceof Error ? auditError.message : "unknown");
      }
    }

    const mediaPendingIds: string[] = [];
    if (stagedAssets.length) {
      // ListingImage is the durable relationship. A B2/sidecar failure must
      // never turn a committed listing into an HTTP failure (which invites
      // duplicate submissions); keep the staged asset discoverable for retry.
      for (const asset of stagedAssets) {
        try {
          const attached = await attachAsset(asset.id, "Listing", listing.id, user.id);
          if (!attached.ok) mediaPendingIds.push(asset.id);
        } catch (mediaError) {
          mediaPendingIds.push(asset.id);
          console.error("[listings] media attachment deferred for retry", {
            assetId: asset.id,
            listingId: listing.id,
            error: mediaError instanceof Error ? mediaError.message : "unknown",
          });
        }
      }
    }

    // P1-2 — track LISTING_CREATE (fire-and-forget).
    trackEvent({
      eventType: "LISTING_CREATE",
      listingId: listing.id,
      userId: user?.id ?? null,
      categoryId: listing.categoryId ?? null,
      brandId: listing.brandId ?? null,
      page: "/api/listings",
    });

    // STEP 15-B.5.4-C.2-P3: Invalidate Homepage cache
    try { revalidateTag(HOMEPAGE_CACHE_TAGS.listings, 'default'); } catch (e) { console.error('[listings] revalidateTag failed:', e); }

    return NextResponse.json({
      ok: true,
      id: listing.id,
      slug: listing.slug,
      status: listing.status,
      mediaStatus: mediaPendingIds.length ? "PENDING" : "ATTACHED",
      mediaPendingCount: mediaPendingIds.length,
      duplicateReviewRequired,
      auctionId: listing.auctions[0]?.id ?? null,
      rfqId: listing.rfq?.id ?? null,
    });
  } catch (err: any) {
    if (err?.code === "LISTING_ATTRIBUTE_POLICY_INVALID") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if ((err?.code === "P2034" || err?.code === "P2002") && durableIdempotencyKey && listingCreateActorId) {
      // A concurrent request may win the unique receipt race. Resolve the
      // winner rather than surfacing a generic conflict to a valid replay.
      try {
        const prior = await findIdempotentResult({
          key: durableIdempotencyKey,
          action: "marketplace.listing.create",
          actorId: listingCreateActorId,
        });
        if (prior) {
          const cached = await db.listing.findUnique({
            where: { id: prior.id },
            select: { id: true, slug: true, status: true },
          });
          if (cached) {
            return NextResponse.json({
              ok: true,
              id: cached.id,
              slug: cached.slug,
              status: cached.status,
              idempotentReplay: true,
            });
          }
        }
      } catch {
        // Preserve the original conflict response if replay resolution fails.
      }
    }
    if (err?.code === "P2034") {
      return NextResponse.json(
        { error: "درخواست هم‌زمان دیگری در حال ثبت است؛ لطفاً دوباره تلاش کنید.", code: "LISTING_CREATE_CONFLICT" },
        { status: 409 },
      );
    }
    trackError(err, { endpoint: "POST /api/listings" });
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
