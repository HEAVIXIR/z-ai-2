import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { checkCsrf } from "@/lib/csrf";
import { cleanupStalePartMedia } from "@/lib/store-part-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/store/parts/media/cleanup — clean stale or unreferenced Part assets. */
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

  try {
    const result = await cleanupStalePartMedia(user.id);
    return NextResponse.json({
      success: result.pendingCount === 0,
      ...result,
    }, {
      status: result.pendingCount === 0 ? 200 : 202,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "پاکسازی رسانه‌های موقت یا بدون مرجع ناموفق بود." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
