import { NextResponse } from "next/server";
import { getSessionByShareToken, getComparisonData } from "@/lib/compare-engine";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { toPublicComparisonDTO } from "@/lib/public-compare-dto";
import { COMPARE_READ } from "@/lib/rate-limit-presets";
import { getClientIp, rateLimitKey } from "@/lib/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   GET /api/compare/shared/[token] — public shared comparison.
   No auth required. Respects the share token's expiry.
   Returns:
     {
       session: { id, name, shareExpiresAt },
       data: { items, rows, attributes, differences, crossCategoryWarning, categories }
     }
   ============================================================ */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const limited = rateLimit({
    key: rateLimitKey(getClientIp(req), COMPARE_READ.label),
    limit: COMPARE_READ.limit,
    windowMs: COMPARE_READ.windowMs,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "تعداد درخواست‌های اشتراک مقایسه بیش از حد مجاز است." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(limited.resetAt)), "Cache-Control": "private, no-store" } },
    );
  }
  try {
    const { token } = await params;
    const session = await getSessionByShareToken(token);
    if (!session) {
      return NextResponse.json({ error: "لینک اشتراک‌گذاری نامعتبر یا منقضی است" }, { status: 404 });
    }

    const data = toPublicComparisonDTO(await getComparisonData(session.id));

    return NextResponse.json({
      session: {
        id: session.id,
        name: session.name,
        shareExpiresAt: session.shareExpiresAt,
      },
      data,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
