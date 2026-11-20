/**
 * HEAVIX — Wanted API (Phase 7 — Wanted/RFQ/Matching)
 * ------------------------------------------------------------
 * Public + authenticated routes for the "Wanted" marketplace
 * domain (BuyRequest). Delegates business logic to
 * src/lib/wanted-service.ts.
 *
 * Routes:
 *   GET  /api/wanted           — list public wanted requests
 *                                  (?mine=true → user's own)
 *   POST /api/wanted           — create a wanted request (auth)
 *
 * Query params (GET, public):
 *   ?status=ACTIVE    (default) — filter by status
 *   ?categoryId=...             — filter by Category.id
 *   ?limit=20 (1..100)          — page size
 *   ?offset=0                   — pagination offset
 *
 * Query params (GET, mine):
 *   ?mine=true                  — list the current user's own
 *                                  requests (any status). Auth
 *                                  required; ignores status filter.
 *
 * Body (POST):
 *   { title, description?, quantity?, budgetMin?, budgetMax?,
 *     categoryId?, brandId?, transactionType?, province?, city? }
 *
 * The POST handler authenticates via getCurrentUserId() (the
 * user cookie). The service writes audit
 * `marketplace.wanted.create` (entityType: BuyRequest).
 */
import { HOMEPAGE_CACHE_TAGS } from "@/lib/homepage-cache-tags";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAsset } from "@/lib/media-service";
import { retryBuyRequestMediaAttachments } from "@/lib/wanted-media";
import { getListingImagePolicy } from "@/lib/listing-image-policy";
import { getCurrentUserId } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { readBoundedJson } from "@/lib/read-bounded-json";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { rateLimitKey } from "@/lib/request-context";
import { WANTED_CREATE } from "@/lib/rate-limit-presets";
import {
  createWanted,
  listWanted,
  WantedServiceError,
} from "@/lib/wanted-service";
import { extractIdempotencyKey, findIdempotentResult } from "@/lib/idempotency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// P0-A: body-size ceiling for the wanted-request endpoint. Wanted
// requests carry title/description + optional structured-spec snapshot
// (attributeValues). 256 KiB is generous for that payload while
// blocking oversized bodies outright.
const MAX_WANTED_REQUEST_BODY_BYTES = 256 * 1024;

/* GET /api/wanted — list public wanted requests (paginated),
 * OR — when ?mine=true — list the current user's own requests
 * (any status). */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mine = url.searchParams.get("mine") === "true";

    // ?mine=true — auth-scoped list of the user's own requests.
    if (mine) {
      const userId = await getCurrentUserId();
      if (!userId) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 },
        );
      }
      const limit = Math.min(
        100,
        Math.max(1, Number(url.searchParams.get("limit")) || 20),
      );
      const rows = await db.buyRequest.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          title: true,
          description: true,
          category: true,
          brandPref: true,
          transaction: true,
          budgetMin: true,
          budgetMax: true,
          city: true,
          province: true,
          deadline: true,
          status: true,
          verified: true,
          createdAt: true,
          // H.3 structured-spec fields (canonical, for owner dashboard display).
          quantity: true,
          categoryId: true,
          brandId: true,
          modelId: true,
          serviceTypeId: true,
          intent: true,
          // H.3 resolved taxonomy names (single round-trip).
          categoryRef: { select: { name: true } },
          brandRef: { select: { name: true } },
          modelRef: { select: { name: true } },
          serviceTypeRef: { select: { nameFa: true } },
          images: { orderBy: { sortOrder: "asc" }, select: { id: true, url: true, alt: true, isPrimary: true, sortOrder: true } },
        },
      });
      return NextResponse.json({
        success: true,
        data: rows.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          category: r.category,
          brandPref: r.brandPref,
          transaction: r.transaction,
          budgetMin: r.budgetMin ? r.budgetMin.toString() : null,
          budgetMax: r.budgetMax ? r.budgetMax.toString() : null,
          city: r.city,
          province: r.province,
          deadline: r.deadline,
          status: r.status,
          verified: r.verified,
          createdAt: r.createdAt,
          // H.3 structured-spec fields.
          quantity: r.quantity,
          categoryId: r.categoryId,
          brandId: r.brandId,
          modelId: r.modelId,
          serviceTypeId: r.serviceTypeId,
          intent: r.intent,
          categoryName: r.categoryRef?.name ?? null,
          brandName: r.brandRef?.name ?? null,
          modelName: r.modelRef?.name ?? null,
          serviceTypeName: r.serviceTypeRef?.nameFa ?? null,
          images: r.images,
        })),
      }, { headers: { "Cache-Control": "private, no-store" } });
    }

    // Public callers may only enumerate active requests. Non-active
    // lifecycle states are available through the authenticated ?mine=true path.
    const status = "ACTIVE";
    const categoryId = url.searchParams.get("categoryId")?.trim() || null;
    const limit = Number(url.searchParams.get("limit")) || 20;
    const offset = Number(url.searchParams.get("offset")) || 0;

    const result = await listWanted({ status, categoryId, limit, offset });

    return NextResponse.json({
      success: true,
      data: result.items,
      total: result.total,
      limit,
      offset,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* POST /api/wanted — create a new wanted request (authenticated).
 * Delegates validation + persistence + audit to wanted-service.
 *
 * P0-A security: CSRF check runs BEFORE the body is parsed (checkCsrf
 * only reads headers). A bounded read caps the body size at
 * MAX_WANTED_REQUEST_BODY_BYTES before JSON.parse, returning 413 on
 * overflow. The parsed body is validated to be a plain object (not an
 * array/primitive) — malformed input gets a 400. A user-scoped rate
 * limit (WANTED_CREATE: 10/hour) caps duplicate-submit storms.
 */
export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "برای ثبت درخواست ابتدا وارد شوید" },
        { status: 401 },
      );
    }

    // P0-A: CSRF — state-changing mutation, must be origin-checked.
    if (!checkCsrf(req)) {
      return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
    }

    // P0-A: rate limit — user-scoped, in-process (per-isolate).
    // A distributed limiter is a tracked follow-up; this blocks the
    // common duplicate-submit / low-effort spam case.
    const rl = rateLimit({
      key: rateLimitKey(userId, WANTED_CREATE.label),
      limit: WANTED_CREATE.limit,
      windowMs: WANTED_CREATE.windowMs,
    });
    if (!rl.ok) {
      const retryAfter = retryAfterSeconds(rl.resetAt);
      return NextResponse.json(
        { error: "تعداد درخواست‌ها بیش از حد مجاز است. لطفاً بعداً تلاش کنید." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    // P0-A: bounded read BEFORE JSON.parse — caps body size, rejects
    // oversized payloads with 413 rather than OOM-ing the parse.
    const parsedBody = await readBoundedJson<Record<string, unknown>>(
      req,
      MAX_WANTED_REQUEST_BODY_BYTES,
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

    // H.2.4e: idempotency. If the client sent an Idempotency-Key header,
    // look up a prior successful submission with the same key+actor. A
    // retry (network blip, double-click) resolves to the cached result
    // instead of creating a duplicate BuyRequest. The check runs BEFORE
    // field validation so a retry short-circuits fast.
    const idempotencyKey = extractIdempotencyKey(req);
    if (idempotencyKey) {
      const prior = await findIdempotentResult({
        key: idempotencyKey,
        action: "marketplace.wanted.create",
        actorId: userId,
      });
      if (prior) {
        // A successful request may have committed its relational image manifest
        // while a B2 sidecar attachment was temporarily unavailable. Replays
        // must reconcile that manifest rather than returning a false success.
        let mediaResult = { attachedCount: 0, pendingCount: 1 };
        try {
          const result = await retryBuyRequestMediaAttachments(prior.id, userId);
          mediaResult = {
            attachedCount: result.attachedCount,
            pendingCount: result.pendingCount,
          };
        } catch {
          // The BuyRequest already exists. Keep the idempotent response
          // successful while accurately reporting media as pending.
        }
        return NextResponse.json({
          ok: true,
          success: true,
          id: prior.id,
          status: prior.status,
          idempotentReplay: true,
          mediaStatus: mediaResult.pendingCount ? "PENDING" : "ATTACHED",
          mediaPendingCount: mediaResult.pendingCount,
        });
      }
    }

    const {
      title,
      description,
      quantity,
      budgetMin,
      budgetMax,
      price,
      sellerName,
      sellerPhone,
      categoryId,
      brandId,
      modelId,
      attributeValues,
      intent,
      transactionType,
      serviceTypeId,
      province,
      city,
      provinceId,
      cityId,
      countryId,
      deadline,
      assetIds: rawAssetIds,
    } = body as Record<string, unknown>;

    if (rawAssetIds !== undefined && !Array.isArray(rawAssetIds)) {
      return NextResponse.json({ error: "assetIds باید یک آرایه باشد." }, { status: 400 });
    }
    const assetIds = Array.isArray(rawAssetIds) ? rawAssetIds.map((value) => String(value)) : [];
    const imagePolicy = await getListingImagePolicy(userId);
    if (assetIds.length > imagePolicy.maxImages) {
      return NextResponse.json({ error: `حداکثر ${imagePolicy.maxImages} تصویر برای هر درخواست مجاز است.` }, { status: 400 });
    }
    if (new Set(assetIds).size !== assetIds.length) {
      return NextResponse.json({ error: "تصویر تکراری در فهرست ارسال شده است." }, { status: 400 });
    }
    const stagedAssets: Array<{ assetId: string; url: string; alt: string | null }> = [];
    for (const assetId of assetIds) {
      const asset = await getAsset(assetId);
      if (!asset || asset.status !== "STAGED" || asset.visibility !== "PRIVATE" ||
          asset.entityType !== "BuyRequest" || asset.entityId !== null ||
          asset.uploadedBy !== userId || !asset.relativePath.includes("/staging/")) {
        return NextResponse.json({ error: "مالکیت یا وضعیت یکی از تصاویر معتبر نیست." }, { status: 400 });
      }
      stagedAssets.push({ assetId: asset.id, url: asset.url, alt: asset.altText });
    }

    const requestedProvinceId = provinceId ? String(provinceId) : null;
    const requestedCityId = cityId ? String(cityId) : null;
    const requestedCountryId = countryId ? String(countryId) : null;
    const [selectedCity, selectedProvince] = await Promise.all([
      requestedCityId
        ? db.city.findUnique({
            where: { id: requestedCityId },
            select: { id: true, name: true, province: { select: { id: true, name: true, countryId: true } } },
          })
        : Promise.resolve(null),
      requestedProvinceId
        ? db.province.findUnique({
            where: { id: requestedProvinceId },
            select: { id: true, name: true, countryId: true },
          })
        : Promise.resolve(null),
    ]);
    if (requestedCityId && !selectedCity) {
      return NextResponse.json({ error: "شهر انتخاب‌شده معتبر نیست." }, { status: 400 });
    }
    if (requestedProvinceId && !selectedProvince) {
      return NextResponse.json({ error: "استان انتخاب‌شده معتبر نیست." }, { status: 400 });
    }
    if (selectedCity && selectedProvince && selectedCity.province.id !== selectedProvince.id) {
      return NextResponse.json({ error: "شهر با استان انتخاب‌شده مطابقت ندارد." }, { status: 400 });
    }

    // Resolve and validate the complete canonical hierarchy once. When only a
    // city is supplied, its province/country are derived from the City relation.
    const resolvedProvince = selectedProvince ?? selectedCity?.province ?? null;
    if (!resolvedProvince) {
      return NextResponse.json({ error: "انتخاب کشور و استان برای ثبت درخواست الزامی است." }, { status: 400 });
    }
    if (requestedCountryId && resolvedProvince && resolvedProvince.countryId !== requestedCountryId) {
      return NextResponse.json({ error: "استان انتخاب‌شده با کشور انتخاب‌شده مطابقت ندارد." }, { status: 400 });
    }
    const resolvedCountryId = resolvedProvince?.countryId ?? requestedCountryId;
    if (resolvedCountryId) {
      const country = await db.country.findUnique({
        where: { id: resolvedCountryId },
        select: { id: true },
      });
      if (!country) {
        return NextResponse.json({ error: "کشور انتخاب‌شده معتبر نیست." }, { status: 400 });
      }
    }

    const normalizedQuantity = quantity === undefined || quantity === null || quantity === ""
      ? null
      : Number(quantity);
    if (normalizedQuantity !== null &&
        (!Number.isInteger(normalizedQuantity) || normalizedQuantity < 1 || normalizedQuantity > 10000)) {
      return NextResponse.json({ error: "تعداد باید عدد صحیح بین ۱ تا ۱۰۰۰۰ باشد." }, { status: 400 });
    }

    let normalizedDeadline: string | null = null;
    if (deadline !== undefined && deadline !== null && String(deadline).trim()) {
      // P1-9: if the deadline is a date-only string (YYYY-MM-DD, length 10),
      // interpret it as END-OF-DAY (T23:59:59) rather than midnight UTC —
      // otherwise a buyer picking "today" or "tomorrow" would see their
      // request expire at 00:00 UTC (03:30 Tehran) of that day, which is
      // before they even submitted it. Appending T23:59:59 makes the
      // request live through the end of the selected calendar day.
      let deadlineStr = String(deadline).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(deadlineStr)) {
        deadlineStr = `${deadlineStr}T23:59:59`;
      }
      const parsedDeadline = new Date(deadlineStr);
      if (Number.isNaN(parsedDeadline.getTime()) || parsedDeadline.getTime() <= Date.now()) {
        return NextResponse.json({ error: "مهلت درخواست باید یک تاریخ معتبر در آینده باشد." }, { status: 400 });
      }
      normalizedDeadline = parsedDeadline.toISOString();
    }
    // P1-9 policy: a request with NO deadline has expiresAt=null (no
    // expiration) — it stays matchable until explicitly closed. This is
    // the documented behavior (parseDeadlineToExpiresAt returns null
    // for empty/unparseable input).

    // P1-10: intent is REQUIRED on the canonical /api/wanted endpoint.
    // Legacy compat (intent optional, defaults to SALE) lives ONLY in the
    // /api/requests adapter. An empty/whitespace/missing intent here is
    // a 400 — fail-closed at the API boundary.
    const intentStr = intent !== undefined && intent !== null ? String(intent).trim() : "";
    if (!intentStr) {
      return NextResponse.json({ error: "نوع تقاضا (intent) الزامی است. مقادیر مجاز: SALE, RENT, SALE_AND_RENT, SERVICE_REQUEST." }, { status: 400 });
    }

    // WANTED's optional suggested price is an exact budget when no range is supplied.
    // Never silently discard it or ambiguously combine it with a min/max range.
    const hasSuggestedPrice = price !== undefined && price !== null && String(price).trim() !== "";
    if (hasSuggestedPrice && ((budgetMin !== undefined && budgetMin !== null && budgetMin !== "") || (budgetMax !== undefined && budgetMax !== null && budgetMax !== ""))) {
      return NextResponse.json({ error: "قیمت پیشنهادی را جداگانه وارد کنید یا از بازه حداقل/حداکثر بودجه استفاده کنید؛ هر دو هم‌زمان مجاز نیستند." }, { status: 400 });
    }
    const effectiveBudgetMin = hasSuggestedPrice ? price : budgetMin;
    const effectiveBudgetMax = hasSuggestedPrice ? price : budgetMax;

    const normalizedRequesterName = typeof sellerName === "string" ? sellerName.trim() : "";
    const normalizedRequesterPhone = typeof sellerPhone === "string" ? sellerPhone.trim() : "";
    if (normalizedRequesterName.length > 120 || normalizedRequesterPhone.length > 40) {
      return NextResponse.json({ error: "اطلاعات تماس بیش از حد طولانی است." }, { status: 400 });
    }

    // P0 #3: server-side budget range validation. The client enforces
    // (canProceed) but a direct API caller can bypass. Mirror the QUOTE
    // checks from /api/listings/route.ts:689-696.
    {
      const parseBudget = (v: unknown): bigint | null => {
        if (v === null || v === undefined || v === "") return null;
        const s = String(v).replace(/[^\d-]/g, "");
        if (!s || s === "-") return null;
        try { return BigInt(s); } catch { return null; }
      };
      const bMin = parseBudget(effectiveBudgetMin);
      const bMax = parseBudget(effectiveBudgetMax);
      if (hasSuggestedPrice && bMin === null) {
        return NextResponse.json({ error: "قیمت پیشنهادی باید یک مبلغ عددی معتبر باشد." }, { status: 400 });
      }
      if (bMin !== null && bMin < 0n) {
        return NextResponse.json({ error: "حداقل بودجه نمی‌تواند منفی باشد." }, { status: 400 });
      }
      if (bMax !== null && bMax < 0n) {
        return NextResponse.json({ error: "حداکثر بودجه نمی‌تواند منفی باشد." }, { status: 400 });
      }
      if (bMin !== null && bMax !== null && bMin > bMax) {
        return NextResponse.json({ error: "حداقل بودجه نباید بیش از حداکثر بودجه باشد." }, { status: 400 });
      }
    }

    // H.2/H.3 (P0 data integrity): fail-closed taxonomy validation.
    // Every supplied Category/Brand/ProductModel/ServiceType ID is checked
    // against active canonical rows and mismatched brand/model/category
    // combinations are rejected before createWanted writes the real FKs.
    // The service then validates category/model attribute membership and
    // typed values before the atomic BuyRequest + attribute transaction.
    const requestedCategoryId = typeof categoryId === "string" ? categoryId.trim() : "";
    if (!requestedCategoryId) {
      return NextResponse.json({ error: "انتخاب دسته‌بندی برای ثبت درخواست الزامی است." }, { status: 400 });
    }
    const requestedBrandId = brandId ? String(brandId) : null;
    const requestedModelId = modelId ? String(modelId) : null;
    const requestedServiceTypeId = serviceTypeId ? String(serviceTypeId) : null;

    // A service-demand request must carry an active ServiceType; conversely,
    // non-service demand intents must not accidentally persist a service type.
    if (intentStr === "SERVICE_REQUEST" && !requestedServiceTypeId) {
      return NextResponse.json({ error: "برای درخواست خدمات، نوع خدمت الزامی است." }, { status: 400 });
    }
    if (intentStr !== "SERVICE_REQUEST" && requestedServiceTypeId) {
      return NextResponse.json({ error: "نوع خدمت فقط برای تقاضای خدمات مجاز است." }, { status: 400 });
    }

    const [categoryRow, brandRow, modelRow, serviceTypeRow, brandCategoryRow] = await Promise.all([
      requestedCategoryId
        ? db.category.findUnique({
            where: { id: requestedCategoryId },
            select: { id: true, active: true, name: true, layer: true },
          })
        : Promise.resolve(null),
      requestedBrandId
        ? db.brand.findUnique({
            where: { id: requestedBrandId },
            select: { id: true, active: true, status: true, name: true },
          })
        : Promise.resolve(null),
      requestedModelId
        ? db.productModel.findUnique({
            where: { id: requestedModelId },
            select: { id: true, status: true, brandId: true, categoryId: true, name: true },
          })
        : Promise.resolve(null),
      requestedServiceTypeId
        ? db.serviceType.findFirst({
            where: { id: requestedServiceTypeId, active: true },
            select: { id: true, key: true },
          })
        : Promise.resolve(null),
      requestedCategoryId && requestedBrandId
        ? db.brandCategory.findUnique({
            where: { brandId_categoryId: { brandId: requestedBrandId, categoryId: requestedCategoryId } },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    if (requestedCategoryId && (!categoryRow || !categoryRow.active)) {
      return NextResponse.json({ error: "دسته‌بندی انتخاب‌شده معتبر یا فعال نیست." }, { status: 400 });
    }
    // A wanted request must target a selectable leaf, not a navigation parent.
    // This is enforced server-side even if a client bypasses the wizard.
    if (requestedCategoryId) {
      const expectedLayer = intentStr === "SERVICE_REQUEST" ? "SERVICE" : "MARKETPLACE";
      if (categoryRow && categoryRow.layer !== expectedLayer) {
        return NextResponse.json({ error: intentStr === "SERVICE_REQUEST" ? "برای درخواست خدمات، دسته‌بندی خدمات را انتخاب کنید." : "برای درخواست کالا، دسته‌بندی بازار را انتخاب کنید." }, { status: 400 });
      }
      const activeChild = await db.category.findFirst({
        where: { parentId: requestedCategoryId, active: true },
        select: { id: true },
      });
      if (activeChild) {
        return NextResponse.json({ error: "برای ثبت درخواست، دسته‌بندی نهایی و بدون زیرشاخه فعال را انتخاب کنید." }, { status: 400 });
      }
    }
    if (requestedBrandId && (!brandRow || !brandRow.active || brandRow.status !== "ACTIVE")) {
      return NextResponse.json({ error: "برند انتخاب‌شده معتبر یا فعال نیست." }, { status: 400 });
    }
    if (requestedCategoryId && requestedBrandId && !brandCategoryRow) {
      return NextResponse.json({ error: "برند انتخاب‌شده به این دسته‌بندی متصل نیست." }, { status: 400 });
    }
    if (requestedModelId) {
      if (!modelRow || modelRow.status !== "ACTIVE") {
        return NextResponse.json({ error: "مدل انتخاب‌شده معتبر یا فعال نیست." }, { status: 400 });
      }
      // Brand/model compatibility: if a brand was also supplied, the model
      // must belong to that brand. A mismatched pair is rejected closed.
      if (requestedBrandId && modelRow.brandId !== requestedBrandId) {
        return NextResponse.json(
          { error: "مدل انتخاب‌شده متعلق به برند انتخاب‌شده نیست." },
          { status: 400 },
        );
      }
      // The wizard's model selector is category-scoped through
      // ProductModel.categoryId; require the exact same canonical category
      // at the API boundary rather than accepting an unlinked model.
      if (requestedCategoryId && modelRow.categoryId !== requestedCategoryId) {
        return NextResponse.json(
          { error: "مدل انتخاب‌شده با دسته‌بندی انتخاب‌شده سازگار نیست." },
          { status: 400 },
        );
      }
    }
    if (requestedServiceTypeId && !serviceTypeRow) {
      return NextResponse.json({ error: "نوع خدمت انتخاب‌شده معتبر یا فعال نیست." }, { status: 400 });
    }

    // H.3: basic attribute payload shape validation at the API boundary.
    // createWanted performs authoritative type, option-ownership,
    // category/model-membership and required-field validation, then stores
    // normalized values in canonical parent/child relational tables.
    if (attributeValues !== undefined && attributeValues !== null) {
      if (!Array.isArray(attributeValues)) {
        return NextResponse.json({ error: "attributeValues باید یک آرایه باشد." }, { status: 400 });
      }
      if (attributeValues.length > 100) {
        return NextResponse.json({ error: "تعداد ویژگی‌ها نمی‌تواند بیش از ۱۰۰ مورد باشد." }, { status: 400 });
      }
      for (const av of attributeValues) {
        if (!av || typeof av !== "object" || Array.isArray(av)) {
          return NextResponse.json({ error: "هر ویژگی باید یک شیء باشد." }, { status: 400 });
        }
        const obj = av as Record<string, unknown>;
        if (typeof obj.attributeId !== "string" || !obj.attributeId) {
          return NextResponse.json({ error: "هر ویژگی باید شامل attributeId معتبر باشد." }, { status: 400 });
        }
      }
    }

    const created = await createWanted({
      title: typeof title === "string" ? title : "",
      description: description as string | null | undefined,
      quantity: normalizedQuantity,
      budgetMin: effectiveBudgetMin as string | number | bigint | null | undefined,
      budgetMax: effectiveBudgetMax as string | number | bigint | null | undefined,
      categoryId: requestedCategoryId,
      brandId: brandId as string | null | undefined,
      modelId: modelId as string | null | undefined,
      attributeValues: attributeValues as unknown[] | null | undefined,
      images: stagedAssets,
      intent: intentStr,
      transactionType: transactionType as string | null | undefined,
      serviceTypeId: serviceTypeId ? String(serviceTypeId) : null,
      province: resolvedProvince?.name ?? (requestedProvinceId ? null : (province as string | null | undefined)),
      city: selectedCity?.name ?? (requestedCityId ? null : (city as string | null | undefined)),
      countryId: resolvedCountryId,
      provinceId: resolvedProvince?.id ?? null,
      cityId: selectedCity?.id ?? null,
      deadline: normalizedDeadline,
      requesterName: normalizedRequesterName || null,
      requesterPhone: normalizedRequesterPhone || null,
      userId,
      idempotencyKey,
    });

    // Reconcile only the database-owned image manifest. This is important
    // for concurrent idempotent submissions: a losing request must never
    // attach its unpersisted staged assets to the winner's BuyRequest.
    let mediaResult = { attachedCount: 0, pendingCount: stagedAssets.length };
    try {
      const result = await retryBuyRequestMediaAttachments(created.id, userId);
      mediaResult = {
        attachedCount: result.attachedCount,
        pendingCount: result.pendingCount,
      };
    } catch (mediaError) {
      console.error("[wanted] media attachment deferred for retry", {
        buyRequestId: created.id,
        error: mediaError instanceof Error ? mediaError.message : "unknown",
      });
    }

    // Invalidate the homepage "requests" cache tag so the new
    // request shows up in the ActiveRequestsSection immediately.
    try {
      revalidateTag(HOMEPAGE_CACHE_TAGS.requests, "default");
    } catch (e) {
      console.error("[wanted] revalidateTag failed:", e);
    }

    return NextResponse.json({
      ok: true,
      success: true,
      id: created.id,
      status: created.status,
      mediaStatus: mediaResult.pendingCount ? "PENDING" : "ATTACHED",
      mediaPendingCount: mediaResult.pendingCount,
    });
  } catch (err: any) {
    if (err instanceof WantedServiceError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
