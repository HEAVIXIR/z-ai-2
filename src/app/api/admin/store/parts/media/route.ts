import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { checkCsrf } from "@/lib/csrf";
import { enforceRateLimit } from "@/lib/rate-limit-check";
import { UPLOAD } from "@/lib/rate-limit-presets";
import { uploadAsset } from "@/lib/media-service";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_REQUEST_BYTES = MAX_UPLOAD_BYTES + 256 * 1024;

/**
 * POST /api/admin/store/parts/media
 * Store administrators upload private Part media before the Part exists.
 * The asset becomes public only after a Part row references it and attachment
 * succeeds through the dedicated Part media lifecycle.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await requirePermission(user.id, "store.manage");
  } catch {
    return NextResponse.json({ success: false, error: "Forbidden: requires store.manage" }, { status: 403 });
  }

  if (!checkCsrf(request)) {
    return NextResponse.json({ success: false, error: "CSRF check failed" }, { status: 403 });
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
      return NextResponse.json({ success: false, error: "حجم درخواست بیش از حد مجاز است." }, { status: 413 });
    }
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "فایل ارسال نشده است." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ success: false, error: "حجم فایل خالی یا بیش از حد مجاز است." }, { status: 413 });
    }

    const result = await uploadAsset({
      file: Buffer.from(await file.arrayBuffer()),
      uploadedBy: user.id,
      actorType: "ADMIN",
      originalFilename: file.name,
      entityType: "Part",
      visibility: "PRIVATE",
      maxOutputBytes: MAX_UPLOAD_BYTES,
      altText: formData.get("altText")?.toString() || undefined,
    });

    if (!result.ok || !result.asset) {
      return NextResponse.json(
        { success: false, error: result.error ?? "بارگذاری تصویر قطعه ناموفق بود." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      assetId: result.asset.id,
      url: result.asset.url,
      size: result.asset.size,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json(
      { success: false, error: "خطای داخلی هنگام بارگذاری تصویر قطعه." },
      { status: 500 },
    );
  }
}
