/**
 * HEAVIX — Admin upload endpoint (Phase 7 — STEP 3 ghost-endpoint closure).
 *
 * Background: 18 admin call-sites (MediaUploader component + 2 direct
 * fetch callers) POST to `/api/admin/upload`, but until now NO route
 * file existed here — every upload attempt 404'd (only the URL-paste
 * fallback in MediaUploader worked).
 *
 * Design (per Directive 47 STEP 3): this route is a THIN DELEGATE.
 * All upload logic — magic-byte validation, size cap, opaque filename,
 * filesystem write, sidecar metadata, audit logging — lives in
 * `media-service.uploadAsset` (which composes `upload-security`).
 * No logic is duplicated here. Media remains a special-case
 * (filesystem + sidecar JSON); it is NOT wired into the Universal
 * Resource Engine.
 *
 * Response contract: callers read `json.url` at the top level
 * (MediaUploader + AdminListingsClient both do `if (json.url) ...`),
 * so we return `{ ok, url, asset }` (the `asset` block is the full
 * MediaAsset for future callers; the top-level `url` satisfies the
 * existing contract).
 *
 * Permission: media.upload (same as /api/admin/media POST).
 * Audit: media.upload (written by uploadAsset internally + mirrored
 *        here for route-level visibility, matching /api/admin/media).
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { logAudit } from "@/lib/audit";
import { uploadAsset } from "@/lib/media-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* POST /api/admin/upload — multipart/form-data upload delegate. */
export async function POST(req: Request) {
  const [user, error] = await requireAdmin("media.upload");
  if (error) return error;

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "فایل ارسال نشده است." },
        { status: 400 },
      );
    }

    const altText =
      (formData.get("altText") as string | null)?.toString() || undefined;
    const entityType =
      (formData.get("entityType") as string | null)?.toString() || undefined;
    const entityId =
      (formData.get("entityId") as string | null)?.toString() || undefined;

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadAsset({
      file: buffer,
      uploadedBy: user?.id ?? null,
      originalFilename: file.name,
      altText,
      entityType,
      entityId,
    });

    if (!result.ok || !result.asset) {
      return NextResponse.json(
        { ok: false, error: result.error ?? "آپلود ناموفق بود." },
        { status: 400 },
      );
    }

    // Route-level audit mirror (uploadAsset also logs internally —
    // redundant but safe; matches /api/admin/media POST behaviour).
    await logAudit({
      actorId: user?.id ?? null,
      actorType: "ADMIN",
      action: "media.upload",
      entityType: "MediaAsset",
      entityId: result.asset.id,
      after: {
        filename: result.asset.filename,
        url: result.asset.url,
        altText: result.asset.altText,
        entityType: result.asset.entityType,
        entityId: result.asset.entityId,
      },
      reason: "Media asset uploaded via /api/admin/upload delegate",
    });

    // Top-level `url` satisfies MediaUploader + AdminListingsClient
    // contract; `asset` block provides full metadata for future callers.
    return NextResponse.json({
      ok: true,
      url: result.asset.url,
      asset: result.asset,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
