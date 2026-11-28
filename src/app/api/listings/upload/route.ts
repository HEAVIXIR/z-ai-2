import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { uploadAsset } from "@/lib/media-service";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SELLER_UPLOAD_BYTES = Math.min(MAX_UPLOAD_BYTES, 4 * 1024 * 1024);
const MAX_UPLOAD_REQUEST_BYTES = MAX_SELLER_UPLOAD_BYTES + 256 * 1024;

/** POST /api/listings/upload — authenticated seller image upload. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "برای بارگذاری تصویر باید وارد شوید." }, { status: 401 });
  }

  const contentLength = req.headers.get("content-length");
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
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "فایل ارسال نشده است." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_SELLER_UPLOAD_BYTES) {
      return NextResponse.json({ error: "حجم فایل خالی یا بیش از ۴ مگابایت است." }, { status: 413 });
    }

    const result = await uploadAsset({
      file: Buffer.from(await file.arrayBuffer()),
      uploadedBy: user.id,
      originalFilename: file.name,
      altText: formData.get("altText")?.toString().slice(0, 500) || undefined,
      entityType: "Generic",
      entityId: user.id,
      actorType: "USER",
    });
    if (!result.ok || !result.asset) {
      return NextResponse.json({ error: result.error ?? "آپلود تصویر ناموفق بود." }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      asset: {
        id: result.asset.id,
        url: result.asset.url,
        mimeType: result.asset.mimeType,
        size: result.asset.size,
      },
    });
  } catch {
    return NextResponse.json({ error: "خطای داخلی هنگام آپلود تصویر." }, { status: 500 });
  }
}
