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
        },
      });
      return NextResponse.json({
        success: true,
        data: rows.map((r) => ({
          ...r,
          budgetMin: r.budgetMin ? r.budgetMin.toString() : null,
          budgetMax: r.budgetMax ? r.budgetMax.toString() : null,
        })),
      });
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

    const {
      title,
      description,
      quantity,
      budgetMin,
      budgetMax,
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
      deadline,
    } = body as Record<string, unknown>;

    const requestedProvinceId = provinceId ? String(provinceId) : null;
    const requestedCityId = cityId ? String(cityId) : null;
    const [selectedCity, selectedProvince] = await Promise.all([
      requestedCityId
        ? db.city.findUnique({
            where: { id: requestedCityId },
            select: { id: true, name: true, province: { select: { id: true, name: true } } },
          })
        : Promise.resolve(null),
      requestedProvinceId
        ? db.province.findUnique({
            where: { id: requestedProvinceId },
            select: { id: true, name: true },
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

    const created = await createWanted({
      title: typeof title === "string" ? title : "",
      description: description as string | null | undefined,
      quantity: normalizedQuantity,
      budgetMin: budgetMin as string | number | bigint | null | undefined,
      budgetMax: budgetMax as string | number | bigint | null | undefined,
      categoryId: categoryId as string | null | undefined,
      brandId: brandId as string | null | undefined,
      modelId: modelId as string | null | undefined,
      attributeValues: attributeValues as unknown[] | null | undefined,
      intent: intentStr,
      transactionType: transactionType as string | null | undefined,
      serviceTypeId: serviceTypeId ? String(serviceTypeId) : null,
      province: selectedProvince?.name ?? selectedCity?.province.name ?? (requestedProvinceId ? null : (province as string | null | undefined)),
      city: selectedCity?.name ?? (requestedCityId ? null : (city as string | null | undefined)),
      deadline: normalizedDeadline,
      userId,
    });

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
