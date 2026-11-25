import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { enforceRateLimit } from "@/lib/rate-limit-check";
import { UPLOAD } from "@/lib/rate-limit-presets";
import { uploadAsset } from "@/lib/media-service";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-security";
import { getListingImagePolicy } from "@/lib/listing-image-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_REQUEST_BYTES = MAX_UPLOAD_BYTES + 256 * 1024;

/** GET /api/media/staging — authenticated image entitlement for the uploader UI. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "برای مشاهده محدودیت تصاویر باید وارد شوید." }, { status: 401 });
  }
  try {
    const policy = await getListingImagePolicy(user.id);
    return NextResponse.json({ policy }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "بررسی سطح اشتراک ناموفق بود." }, { status: 503 });
  }
}

/**
 * POST /api/media/staging
 * Authenticated seller upload. Assets remain private and user-owned until
 * POST /api/listings finalizes them into ListingImage associations.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "برای بارگذاری تصویر باید وارد شوید." }, { status: 401 });
  }

  if (!checkCsrf(request)) {
    return NextResponse.json({ error: "درخواست معتبر نیست." }, { status: 403 });
  }

  const rate = enforceRateLimit(user.id, UPLOAD);
  if (!rate.ok) return rate.response;

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (
      !Number.isFinite(declaredBytes) ||
      declaredBytes < 0 ||
      declaredBytes > MAX_UPLOAD_REQUEST_BYTES
    ) {
      return NextResponse.json({ error: "حجم درخواست بیش از حد مجاز است." }, { status: 413 });
    }
  }

  try {
    const policy = await getListingImagePolicy(user.id);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "فایل ارسال نشده است." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "حجم فایل خالی یا بیش از حد مجاز است." }, { status: 413 });
    }

    const requestedEntityType = formData.get("entityType")?.toString() || "Listing";
    if (requestedEntityType !== "Listing" && requestedEntityType !== "BuyRequest") {
      return NextResponse.json({ error: "نوع موجودیت رسانه نامعتبر است." }, { status: 400 });
    }

    const result = await uploadAsset({
      file: Buffer.from(await file.arrayBuffer()),
      uploadedBy: user.id,
      actorType: "USER",
      originalFilename: file.name,
      entityType: requestedEntityType,
      visibility: "PRIVATE",
      maxOutputBytes: policy.maxImageBytes,
      altText: formData.get("altText")?.toString() || undefined,
    });

    if (!result.ok || !result.asset) {
      return NextResponse.json(
        { error: result.error ?? "بارگذاری تصویر ناموفق بود." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      assetId: result.asset.id,
      url: result.asset.url,
      size: result.asset.size,
      policy,
    });
  } catch {
    return NextResponse.json(
      { error: "خطای داخلی هنگام بارگذاری تصویر." },
      { status: 500 },
    );
  }
}
