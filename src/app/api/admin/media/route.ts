import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { checkCsrf } from "@/lib/csrf";
import { listAssets, uploadAsset } from "@/lib/media-service";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keep the multipart envelope below Vercel's 4.5 MB function request limit.
const MAX_UPLOAD_REQUEST_BYTES = MAX_UPLOAD_BYTES + 256 * 1024;

async function readBoundedMultipartRequest(req: Request): Promise<Request | NextResponse> {
  const declaredLength = req.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) {
      return NextResponse.json({ ok: false, error: "طول درخواست نامعتبر است." }, { status: 400 });
    }
    if (Number(declaredLength) > MAX_UPLOAD_REQUEST_BYTES) {
      return NextResponse.json({ ok: false, error: "حجم درخواست بیش از حد مجاز است." }, { status: 413 });
    }
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;.*boundary=/i.test(contentType)) {
    return NextResponse.json({ ok: false, error: "نوع محتوای درخواست نامعتبر است." }, { status: 415 });
  }

  const reader = req.body?.getReader();
  if (!reader) {
    return NextResponse.json({ ok: false, error: "بدنه درخواست خالی است." }, { status: 400 });
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_UPLOAD_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        return NextResponse.json({ ok: false, error: "حجم درخواست بیش از حد مجاز است." }, { status: 413 });
      }
      chunks.push(value);
    }
  } catch {
    return NextResponse.json({ ok: false, error: "خواندن درخواست ناموفق بود." }, { status: 400 });
  } finally {
    reader.releaseLock();
  }

  const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
  const headers = new Headers(req.headers);
  headers.set("content-length", String(total));
  return new Request(req.url, { method: "POST", headers, body });
}

/* ============================================================
   /api/admin/media — Wave 3A media library endpoints
   GET  ?entityType=&entityId=&limit=   — list assets
   POST multipart/form-data             — upload a new asset
   Permission: media.upload (POST) / media.read (GET)
   ============================================================ */

export async function GET(req: Request) {
  const [user, error] = await requireAdmin("media.read");
  if (error) return error;
  try {
    const url = new URL(req.url);
    const entityType = url.searchParams.get("entityType")?.trim() || undefined;
    const entityId = url.searchParams.get("entityId")?.trim() || undefined;
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    const assets = await listAssets({
      entityType,
      entityId,
      limit: Number.isFinite(limit) ? (limit as number) : undefined,
    });
    return NextResponse.json({ ok: true, assets, count: assets.length });
  } catch (err) {
    console.error("[api/admin/media GET] failed", err);
    return NextResponse.json({ ok: false, error: "دریافت فهرست رسانه ناموفق بود." }, { status: 500 });
  } finally {
    void user;
  }
}

export async function POST(req: Request) {
  if (!checkCsrf(req)) {
    return NextResponse.json({ ok: false, error: "CSRF check failed" }, { status: 403 });
  }
  const [user, error] = await requireAdmin("media.upload");
  if (error) return error;

  try {
    const boundedRequest = await readBoundedMultipartRequest(req);
    if (boundedRequest instanceof NextResponse) return boundedRequest;
    const formData = await boundedRequest.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "فایل ارسال نشده است." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ ok: false, error: "حجم فایل خالی یا بیش از حد مجاز است." }, { status: 413 });
    }

    const altText = (formData.get("altText") as string | null)?.toString() || undefined;
    const entityType = (formData.get("entityType") as string | null)?.toString() || undefined;
    const entityId = (formData.get("entityId") as string | null)?.toString() || undefined;
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadAsset({
      file: buffer,
      uploadedBy: user?.id ?? null,
      actorType: "ADMIN",
      originalFilename: file.name,
      altText,
      entityType,
      entityId,
    });

    if (!result.ok || !result.asset) {
      return NextResponse.json({ ok: false, error: result.error ?? "آپلود ناموفق بود." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, asset: result.asset });
  } catch (err) {
    console.error("[api/admin/media POST] failed", err);
    return NextResponse.json({ ok: false, error: "آپلود رسانه ناموفق بود." }, { status: 500 });
  }
}
