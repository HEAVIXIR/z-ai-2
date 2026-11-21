import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { retryBuyRequestMediaAttachments } from "@/lib/wanted-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/wanted/[id]/media
 * Retry private B2 sidecar attachment using the server-owned BuyRequestImage
 * manifest. No client-supplied asset IDs are accepted.
 */
export async function POST(request: Request, { params }: RouteContext) {
  if (!checkCsrf(request)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "برای ادامه باید وارد شوید." }, { status: 401 });
  }

  try {
    const { id } = await params;
    const result = await retryBuyRequestMediaAttachments(id, user.id);

    if (!result.requestFound) {
      return NextResponse.json({ error: "درخواست خرید یافت نشد." }, { status: 404 });
    }
    if (!result.ownerAuthorized) {
      return NextResponse.json({ error: "شما مالک این درخواست نیستید." }, { status: 403 });
    }

    return NextResponse.json(
      {
        ok: result.pendingCount === 0,
        attachedCount: result.attachedCount,
        pendingCount: result.pendingCount,
        mediaStatus: result.pendingCount === 0 ? "ATTACHED" : "PENDING",
      },
      {
        status: result.pendingCount === 0 ? 200 : 202,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    console.error("[wanted-media-retry] failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "بازیابی تصاویر درخواست در حال حاضر کامل نشد." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
