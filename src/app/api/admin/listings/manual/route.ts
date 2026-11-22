import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/auth-helpers/require-admin";
import { isAdmin } from "@/lib/authorization";
import { checkCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { parseBig, slugify } from "@/lib/api-helpers";
import { readBoundedJson } from "@/lib/read-bounded-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LISTING_TYPES = new Set(["SALE", "RENT", "AUCTION", "WANTED", "SERVICE_OFFER", "SERVICE_REQUEST", "QUOTE"]);
const CONDITIONS = new Set(["NEW", "USED", "REFURBISHED", "FOR_PARTS"]);

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > max ? null : trimmed;
}

export async function POST(req: Request) {
  const auth = await requireAdminPermission("listing.create");
  if (auth.error || !auth.user) return auth.error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(auth.user.id))) return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  if (!checkCsrf(req)) return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });

  const parsed = await readBoundedJson<Record<string, unknown>>(req, 1_000_000);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
  const body = parsed.value;
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const title = boundedText(body.title, 200);
  const description = boundedText(body.description ?? "", 6000);
  const categoryId = boundedText(body.categoryId, 128);
  const transactionTypeId = boundedText(body.transactionTypeId, 128);
  const serviceTypeId = body.serviceTypeId ? boundedText(body.serviceTypeId, 128) : null;
  const province = body.province ? boundedText(body.province, 100) : null;
  const city = body.city ? boundedText(body.city, 100) : null;
  const sellerName = body.sellerName ? boundedText(body.sellerName, 120) : null;
  const sellerPhone = body.sellerPhone ? boundedText(body.sellerPhone, 40) : null;
  const sourceUrl = body.sourceUrl ? boundedText(body.sourceUrl, 2000) : null;
  if (!title || title.length < 3 || description === null || !categoryId || !transactionTypeId) return NextResponse.json({ error: "عنوان (حداقل ۳ حرف)، توضیحات معتبر، دسته‌بندی و نوع معامله الزامی است." }, { status: 400 });
  if ((body.serviceTypeId && !serviceTypeId) || (body.province && !province) || (body.city && !city) || (body.sellerName && !sellerName) || (body.sellerPhone && !sellerPhone) || (body.sourceUrl && !sourceUrl)) return NextResponse.json({ error: "یکی از فیلدهای اختیاری از حد مجاز طولانی‌تر است." }, { status: 400 });
  if (sourceUrl) {
    try { const u = new URL(sourceUrl); if (!["https:", "http:"].includes(u.protocol) || u.username || u.password) throw new Error(); }
    catch { return NextResponse.json({ error: "آدرس منبع معتبر نیست." }, { status: 400 }); }
  }

  const category = await db.category.findFirst({ where: { id: categoryId, active: true }, select: { id: true } });
  if (!category) return NextResponse.json({ error: "دسته‌بندی فعال و معتبر نیست." }, { status: 400 });
  const transaction = await db.transactionType.findFirst({ where: { id: transactionTypeId, active: true }, select: { id: true, key: true } });
  if (!transaction || !LISTING_TYPES.has(transaction.key)) return NextResponse.json({ error: "نوع معامله فعال یا پشتیبانی‌شده نیست." }, { status: 400 });
  const serviceType = serviceTypeId ? await db.serviceType.findFirst({ where: { id: serviceTypeId, active: true }, select: { id: true } }) : null;
  if (serviceTypeId && !serviceType) return NextResponse.json({ error: "نوع خدمت معتبر یا فعال نیست." }, { status: 400 });
  if (["SERVICE_OFFER", "SERVICE_REQUEST"].includes(transaction.key) && !serviceType) return NextResponse.json({ error: "برای آگهی خدماتی انتخاب نوع خدمت الزامی است." }, { status: 400 });

  const rawPrice = typeof body.price === "string" || typeof body.price === "number" ? String(body.price).trim() : "";
  const price = rawPrice ? parseBig(rawPrice) : null;
  if (rawPrice && (!price || price <= 0n || rawPrice.replace(/[^0-9]/g, "").length > 18)) return NextResponse.json({ error: "قیمت باید عدد مثبت و معتبر باشد." }, { status: 400 });
  const year = body.year === "" || body.year == null ? null : Number(body.year);
  const workingHours = body.workingHours === "" || body.workingHours == null ? null : Number(body.workingHours);
  if (year !== null && (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 1)) return NextResponse.json({ error: "سال ساخت معتبر نیست." }, { status: 400 });
  if (workingHours !== null && (!Number.isInteger(workingHours) || workingHours < 0 || workingHours > 1_000_000)) return NextResponse.json({ error: "کارکرد معتبر نیست." }, { status: 400 });
  const condition = body.condition == null || body.condition === "" ? null : String(body.condition).toUpperCase();
  if (condition && !CONDITIONS.has(condition)) return NextResponse.json({ error: "وضعیت دستگاه معتبر نیست." }, { status: 400 });

  const sourceSite = sourceUrl ? new URL(sourceUrl).hostname.toLowerCase() : "MANUAL";
  const baseSlug = slugify(title) || "manual-listing";
  let slug = baseSlug, suffix = 1;
  while (await db.listing.findUnique({ where: { slug }, select: { id: true } })) slug = baseSlug + "-" + suffix++;
  const listing = await db.listing.create({ data: {
    slug, title, description: description || null, shortDesc: description ? description.slice(0, 150) : null,
    listingType: transaction.key, transactionTypeId: transaction.id, categoryId, serviceTypeId: serviceType?.id ?? null,
    price, priceType: price ? "FIXED" : "NEGOTIABLE", condition, year, workingHours, province, city, sellerName, sellerPhone, sourceUrl,
    sourceSite, adminNotes: "MANUAL_ENTRY", status: "PENDING", publishedAt: null, verified: false, featured: false, showInLatest: false,
  } });
  await logAudit({ actorId: auth.user.id, actorType: "ADMIN", action: "admin.listings.create", entityType: "Listing", entityId: listing.id, after: { slug: listing.slug, title: listing.title, sourceSite, status: listing.status, sourceUrl }, reason: "manual admin listing entry" });
  return NextResponse.json({ ok: true, id: listing.id, slug: listing.slug, status: listing.status, sourceSite }, { status: 201 });
}
