import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { checkCsrf } from "@/lib/csrf";
import { storeDb } from "@/lib/store-db";
import { attachStagedPartImages, parseStoredPartImageUrls, validatePartImageUrls } from "@/lib/store-part-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** POST /api/admin/store/parts/[id]/media — retry staged image attachment. */
export async function POST(request: Request, { params }: RouteContext) {
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

  try {
    const { id } = await params;
    const part = await storeDb.part.findUnique({
      where: { id },
      select: { id: true, images: true },
    });
    if (!part) {
      return NextResponse.json({ success: false, error: "قطعه یافت نشد." }, { status: 404 });
    }

    const urls = parseStoredPartImageUrls(part.images);
    const managedUrls = urls.filter((url) => url.startsWith("/api/media/") && /^[a-f0-9]{24}$/.test(url.slice("/api/media/".length)));
    const validation = await validatePartImageUrls(managedUrls, user.id, part.id, [], true);
    if (!validation.ok) {
      return NextResponse.json({ success: false, error: validation.error }, { status: validation.status });
    }

    const result = await attachStagedPartImages(validation.staged, part.id, user.id);
    const pendingCount = result.pendingCount;
    return NextResponse.json({
      success: pendingCount === 0,
      attachedCount: result.attachedCount,
      pendingCount,
      mediaStatus: pendingCount === 0 ? "ATTACHED" : "PENDING",
    }, {
      status: pendingCount === 0 ? 200 : 202,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "بازیابی تصاویر قطعه ناموفق بود." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
