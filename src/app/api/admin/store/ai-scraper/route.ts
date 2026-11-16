import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { checkCsrf } from "@/lib/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AI-powered scraping is intentionally fail-closed while HEAVIX runs under
 * the free-infrastructure policy. No provider SDK, gateway request, quota
 * mutation, or paid external search is permitted from this route.
 *
 * Deterministic/manual catalog workflows remain separate from this endpoint.
 */
const AI_SCRAPER_DISABLED_BY_FREE_INFRA_POLICY = true;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await requirePermission(user.id, "store.manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "Invalid CSRF origin" }, { status: 403 });
  }

  if (AI_SCRAPER_DISABLED_BY_FREE_INFRA_POLICY) {
    return NextResponse.json(
      {
        ok: false,
        code: "AI_SCRAPER_DISABLED_BY_FREE_INFRA_POLICY",
        error: "اسکرپر هوشمند فروشگاه تا زمان فراهم‌شدن زیرساخت رایگان غیرفعال است.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ error: "Unavailable" }, { status: 503 });
}
