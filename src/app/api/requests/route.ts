import { HOMEPAGE_CACHE_TAGS } from '@/lib/homepage-cache-tags';
import { revalidateTag } from 'next/cache';
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { readBoundedJson } from "@/lib/read-bounded-json";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { rateLimitKey } from "@/lib/request-context";
import { REQUEST_CREATE } from "@/lib/rate-limit-presets";
import { createWanted, WantedServiceError } from "@/lib/wanted-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// H.2.4b: body-size ceiling for the legacy /api/requests adapter. Matches
// the canonical /api/wanted ceiling (256 KiB) so the adapter cannot be
// used as an unbounded-body bypass.
const MAX_REQUESTS_BODY_BYTES = 256 * 1024;

function serialize(r: any) {
  return {
    ...r,
    budgetMin: r.budgetMin ? r.budgetMin.toString() : null,
    budgetMax: r.budgetMax ? r.budgetMax.toString() : null,
  };
}

/* GET /api/requests — public list (only ACTIVE). */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(100, Number(url.searchParams.get("limit")) || 30);
    const offset = Number(url.searchParams.get("offset")) || 0;
    const q = url.searchParams.get("q")?.trim() || undefined;
    const category = url.searchParams.get("category") || undefined;
    const province = url.searchParams.get("province") || undefined;

    const where: any = { status: "ACTIVE" };
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { description: { contains: q } },
      ];
    }
    if (category) where.category = category;
    if (province) where.province = province;

    const [items, total] = await Promise.all([
      db.buyRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        // Public DTO: never expose owner IDs, phone numbers, or admin notes.
        select: {
          id: true,
          title: true,
          description: true,
          category: true,
          brandPref: true,
          transaction: true,
          budgetMin: true,
          budgetMax: true,
          city: true,
          province: true,
          deadline: true,
          status: true,
          verified: true,
          createdAt: true,
        },
      }),
      db.buyRequest.count({ where }),
    ]);

    return NextResponse.json({
      requests: items.map(serialize),
      total,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* POST /api/requests — compatibility adapter to canonical BuyRequest service.
 * Authenticated only; the request body never supplies the actor identity.
 *
 * H.2.4b: this legacy adapter previously accepted an UNBOUNDED body with NO
 * CSRF check and NO rate limit — making it the weak twin of the hardened
 * /api/wanted route. It now applies the same CSRF + bounded-body +
 * REQUEST_CREATE rate-limit defenses as the canonical endpoint, so it
 * cannot be used as a bypass. The adapter still funnels into createWanted
 * with a default intent (SALE) for backward compatibility.
 */
export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "برای ثبت درخواست ابتدا وارد شوید" }, { status: 401 });
    }

    // CSRF — state-changing mutation, must be origin-checked.
    if (!checkCsrf(req)) {
      return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
    }

    // Rate limit — user-scoped, mirrors WANTED_CREATE.
    const rl = rateLimit({
      key: rateLimitKey(userId, REQUEST_CREATE.label),
      limit: REQUEST_CREATE.limit,
      windowMs: REQUEST_CREATE.windowMs,
    });
    if (!rl.ok) {
      const retryAfter = retryAfterSeconds(rl.resetAt);
      return NextResponse.json(
        { error: "تعداد درخواست‌ها بیش از حد مجاز است. لطفاً بعداً تلاش کنید." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    // Bounded read BEFORE JSON.parse — caps body size at 256 KiB.
    const parsedBody = await readBoundedJson<Record<string, unknown>>(req, MAX_REQUESTS_BODY_BYTES);
    if (!parsedBody.ok) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
    }
    const body = parsedBody.value;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "بدنه درخواست معتبر نیست." }, { status: 400 });
    }

    const created = await createWanted({
      title: typeof body.title === "string" ? body.title : "",
      description: typeof body.description === "string" ? body.description : null,
      category: typeof body.category === "string" ? body.category : null,
      brandPref: typeof body.brandPref === "string" ? body.brandPref : null,
      transactionType: typeof body.transaction === "string" ? body.transaction : "SALE",
      budgetMin: body.budgetMin as string | number | bigint | null | undefined,
      budgetMax: body.budgetMax as string | number | bigint | null | undefined,
      city: typeof body.city === "string" ? body.city : null,
      province: typeof body.province === "string" ? body.province : null,
      deadline: typeof body.deadline === "string" ? body.deadline : null,
      requesterName: typeof body.requesterName === "string" ? body.requesterName : null,
      requesterPhone: typeof body.requesterPhone === "string" ? body.requesterPhone : null,
      userId,
    });

    try {
      revalidateTag(HOMEPAGE_CACHE_TAGS.requests, "default");
    } catch (e) {
      console.error("[requests] revalidateTag failed:", e);
    }

    return NextResponse.json({ ok: true, id: created.id, status: created.status });
  } catch (err: any) {
    if (err instanceof WantedServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
