import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toEnDigits } from "@/lib/format";
import { parseBig, parseNumber } from "@/lib/api-helpers";
import { checkCsrf } from "@/lib/csrf";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { SELL_IN_7_DAYS_CREATE, SELL_IN_7_DAYS_TRACK } from "@/lib/rate-limit-presets";
import { getClientIp, rateLimitKey } from "@/lib/request-context";
import {
  createSellIn7DaysTrackingCode,
  toPublicSellIn7DaysTracking,
} from "@/lib/sell-in-7-days-public";

/* ============================================================
   /api/sell-in-7-days — public API for the "Sell in 7 Days"
   campaign. (FIX-SALE-ANIM)

   POST          Create a new application (with tracking code).
   GET ?code=    Look up an application by tracking code and
                 return its status + step timeline.
   GET ?trackingCode=   Alias of the above (matches spec).
   ============================================================ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Default prepayment amount (Toman) if SiteSettings is unset. */
const DEFAULT_PREPAYMENT = 500_000n;
async function uniqueTrackingCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = createSellIn7DaysTrackingCode();
    const existing = await db.sellIn7DaysApplication.findUnique({
      where: { trackingCode: code },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new Error("Unable to allocate a unique tracking code");
}

async function getPrepaymentAmount(): Promise<bigint> {
  try {
    const settings = await db.siteSettings.findUnique({ where: { id: "main" } });
    if (settings?.sellIn7DaysPrepaymentAmount) {
      return settings.sellIn7DaysPrepaymentAmount;
    }
  } catch {
    /* ignore — fall back to default */
  }
  return DEFAULT_PREPAYMENT;
}

function normalizeMobile(raw: string): string {
  const en = toEnDigits((raw || "").trim());
  // Strip everything that isn't a digit or leading +.
  const m = en.replace(/[^\d+]/g, "");
  if (m.startsWith("+98")) return "0" + m.slice(3);
  if (m.startsWith("0098")) return "0" + m.slice(4);
  if (m.startsWith("98") && m.length === 12) return "0" + m.slice(2);
  return m;
}

function isValidMobile(raw: string): boolean {
  const m = normalizeMobile(raw);
  return /^09\d{9}$/.test(m);
}

/* ----------------------------- POST ----------------------------- */
export async function POST(req: NextRequest) {
  // F-006: CSRF defense — fail-closed Origin/Referer verification.
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }
  const ip = getClientIp(req);
  const createLimit = rateLimit({
    key: rateLimitKey(ip, SELL_IN_7_DAYS_CREATE.label),
    limit: SELL_IN_7_DAYS_CREATE.limit,
    windowMs: SELL_IN_7_DAYS_CREATE.windowMs,
  });
  if (!createLimit.ok) {
    const retryAfter = retryAfterSeconds(createLimit.resetAt);
    return NextResponse.json(
      { error: "درخواست‌های ثبت کمپین بیش از حد مجاز است. بعداً تلاش کنید." },
      { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "private, no-store" } },
    );
  }

  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 32_768) {
    return NextResponse.json({ error: "حجم درخواست بیش از حد مجاز است." }, { status: 413 });
  }

  let body: any = {};
  try {
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > 32_768) {
      return NextResponse.json({ error: "حجم درخواست بیش از حد مجاز است." }, { status: 413 });
    }
    body = JSON.parse(rawBody);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "ساختار درخواست نامعتبر است." }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "بدنهٔ درخواست نامعتبر است." }, { status: 400 });
  }

  const sellerName = typeof body.sellerName === "string" ? body.sellerName.trim() : "";
  const sellerMobileRaw = typeof body.sellerMobile === "string" ? body.sellerMobile.trim() : "";
  const sellerEmail = typeof body.sellerEmail === "string" ? body.sellerEmail.trim() || null : null;
  const deviceName = typeof body.deviceName === "string" ? body.deviceName.trim() : "";
  const categoryId = typeof body.categoryId === "string" && body.categoryId ? body.categoryId : null;
  const brandId = typeof body.brandId === "string" && body.brandId ? body.brandId : null;
  const modelName = typeof body.modelName === "string" ? body.modelName.trim() || null : null;
  const year = parseNumber(body.year);
  const workingHours = parseNumber(body.workingHours);
  const condition = typeof body.condition === "string" && body.condition ? body.condition : null;
  const province = typeof body.province === "string" ? body.province.trim() || null : null;
  const city = typeof body.city === "string" ? body.city.trim() || null : null;
  const expectedPrice = parseBig(body.expectedPrice);
  const description = typeof body.description === "string" ? body.description.trim() || null : null;

  if (!sellerName || sellerName.length < 3) {
    return NextResponse.json({ error: "نام فروشنده الزامی است." }, { status: 400 });
  }
  if (!isValidMobile(sellerMobileRaw)) {
    return NextResponse.json(
      { error: "شماره موبایل معتبر نیست. (مثال: 09121234567)" },
      { status: 400 },
    );
  }
  if (!deviceName || deviceName.length < 3) {
    return NextResponse.json({ error: "نام دستگاه الزامی است." }, { status: 400 });
  }
  if (
    sellerName.length > 120 ||
    deviceName.length > 160 ||
    (modelName && modelName.length > 160) ||
    (sellerEmail && (sellerEmail.length > 254 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(sellerEmail))) ||
    (province && province.length > 100) ||
    (city && city.length > 100) ||
    (description && description.length > 4_000) ||
    (categoryId && categoryId.length > 100) ||
    (brandId && brandId.length > 100)
  ) {
    return NextResponse.json({ error: "یکی از فیلدها بیش از حد مجاز یا نامعتبر است." }, { status: 400 });
  }
  const currentYear = new Date().getFullYear();
  if (body.year !== undefined && body.year !== null && body.year !== "" && year === null) {
    return NextResponse.json({ error: "سال ساخت معتبر نیست." }, { status: 400 });
  }
  if (body.workingHours !== undefined && body.workingHours !== null && body.workingHours !== "" && workingHours === null) {
    return NextResponse.json({ error: "ساعت کارکرد معتبر نیست." }, { status: 400 });
  }
  if (body.expectedPrice !== undefined && body.expectedPrice !== null && body.expectedPrice !== "" && expectedPrice === null) {
    return NextResponse.json({ error: "قیمت مورد انتظار معتبر نیست." }, { status: 400 });
  }
  if (year !== null && (!Number.isInteger(year) || year < 1900 || year > currentYear + 1)) {
    return NextResponse.json({ error: "سال ساخت معتبر نیست." }, { status: 400 });
  }
  if (workingHours !== null && (!Number.isInteger(workingHours) || workingHours < 0 || workingHours > 2_000_000)) {
    return NextResponse.json({ error: "ساعت کارکرد معتبر نیست." }, { status: 400 });
  }
  if (expectedPrice !== null && (expectedPrice < 0n || expectedPrice > 1_000_000_000_000_000_000n)) {
    return NextResponse.json({ error: "قیمت مورد انتظار معتبر نیست." }, { status: 400 });
  }
  const allowedConditions = new Set(["NEW", "USED", "REFURBISHED", "FOR_PARTS"]);
  if (condition && !allowedConditions.has(condition)) {
    return NextResponse.json({ error: "وضعیت دستگاه معتبر نیست." }, { status: 400 });
  }

  const sellerMobile = normalizeMobile(sellerMobileRaw);

  // Optional validation: categoryId / brandId should exist if provided.
  if (categoryId) {
    const cat = await db.category.findFirst({
      where: { id: categoryId, active: true, layer: "CATALOG" },
      select: { id: true },
    });
    if (!cat) return NextResponse.json({ error: "دسته‌بندی نامعتبر است." }, { status: 400 });
  }
  if (brandId) {
    const brand = await db.brand.findFirst({
      where: { id: brandId, active: true, status: "ACTIVE" },
      select: { id: true },
    });
    if (!brand) return NextResponse.json({ error: "برند نامعتبر است." }, { status: 400 });
  }

  const prepaymentAmount = await getPrepaymentAmount();
  const trackingCode = await uniqueTrackingCode();

  // Public form submission is NOT proof of payment. Until a verified
  // payment callback exists, every public application remains unpaid.
  const prepaymentPaid = false;
  const status = "PENDING_PREPAYMENT";
  const currentStep = 1;

  const application = await db.sellIn7DaysApplication.create({
    data: {
      trackingCode,
      sellerName,
      sellerMobile,
      sellerEmail,
      deviceName,
      categoryId,
      brandId,
      modelName,
      year,
      workingHours,
      condition,
      province,
      city,
      expectedPrice,
      description,
      prepaymentPaid,
      prepaymentAmount,
      status,
      currentStep,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      trackingCode: application.trackingCode,
      prepaymentPaid: false,
      currentStep: application.currentStep,
      status: application.status,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

/* ----------------------------- GET ------------------------------ */
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const lookupLimit = rateLimit({
    key: rateLimitKey(ip, SELL_IN_7_DAYS_TRACK.label),
    limit: SELL_IN_7_DAYS_TRACK.limit,
    windowMs: SELL_IN_7_DAYS_TRACK.windowMs,
  });
  if (!lookupLimit.ok) {
    const retryAfter = retryAfterSeconds(lookupLimit.resetAt);
    return NextResponse.json(
      { error: "تعداد تلاش‌های پیگیری بیش از حد مجاز است. بعداً تلاش کنید." },
      { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "private, no-store" } },
    );
  }

  const url = new URL(req.url);
  const code =
    (url.searchParams.get("trackingCode") ?? "").trim() ||
    (url.searchParams.get("code") ?? "").trim();

  if (!code) {
    return NextResponse.json(
      { error: "کد رهگیری را وارد کنید." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const normalizedCode = code.toUpperCase();
  const isCurrentTrackingCode = /^[A-HJ-NP-Z2-9]{16}$/.test(normalizedCode);
  const isLegacyTrackingCode = /^[A-Z0-9]{8}$/.test(normalizedCode);
  if (!isCurrentTrackingCode && !isLegacyTrackingCode) {
    return NextResponse.json(
      { error: "قالب کد رهگیری معتبر نیست." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const app = await db.sellIn7DaysApplication.findUnique({
    where: { trackingCode: normalizedCode },
    select: {
      trackingCode: true,
      deviceName: true,
      modelName: true,
      year: true,
      workingHours: true,
      condition: true,
      province: true,
      city: true,
      prepaymentPaid: true,
      status: true,
      currentStep: true,
      inspectionDate: true,
      soldAt: true,
      createdAt: true,
      updatedAt: true,
      categoryId: true,
      brandId: true,
    },
  });

  if (!app) {
    return NextResponse.json(
      { error: "درخواستی با این کد رهگیری یافت نشد." },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  // Resolve category + brand labels for nicer display.
  let category: { name: string; slug: string } | null = null;
  let brand: { name: string; slug: string } | null = null;
  if (app.categoryId) {
    category = await db.category.findUnique({
      where: { id: app.categoryId },
      select: { name: true, slug: true },
    });
  }
  if (app.brandId) {
    brand = await db.brand.findUnique({
      where: { id: app.brandId },
      select: { name: true, slug: true },
    });
  }

  return NextResponse.json(
    {
      ok: true,
      application: toPublicSellIn7DaysTracking({
        ...app,
        category,
        brand,
      }),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
