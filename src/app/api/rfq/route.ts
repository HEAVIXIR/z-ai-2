/**
 * HEAVIX — RFQ API (Phase 7 — Wanted/RFQ/Matching)
 * ------------------------------------------------------------
 * Public + authenticated routes for the RFQ (Request For Quote)
 * B2B procurement domain. Delegates business logic to
 * src/lib/rfq-service.ts.
 *
 * Routes:
 *   GET  /api/rfq         — list open RFQs (paginated)
 *   POST /api/rfq         — create a new RFQ (auth)
 *
 * Query params (GET):
 *   ?status=OPEN           (default OPEN|QUOTING) — filter
 *   ?buyerId=...                                    — filter
 *   ?sellerId=...                                   — RFQs the
 *                                                     seller has
 *                                                     quoted on
 *   ?limit=20 (1..100)     ?offset=0
 *
 * Body (POST):
 *   { title, description?, buyerId, sellerId?, deadline?,
 *     categoryId?, brandId?, specs? }
 *
 * The POST handler authenticates via getCurrentUser(). The
 * service writes audit `marketplace.rfq.create`.
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { readBoundedJson } from "@/lib/read-bounded-json";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { rateLimitKey } from "@/lib/request-context";
import { RFQ_CREATE } from "@/lib/rate-limit-presets";
import { createRFQ, listRFQs, RFQServiceError } from "@/lib/rfq-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// H.2.4b: body-size ceiling for standalone RFQ creation. RFQs carry a
// title/description + optional specs snapshot; 256 KiB is generous.
const MAX_RFQ_BODY_BYTES = 256 * 1024;

/* GET /api/rfq — list open RFQs (paginated). */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status")?.trim() || null;
    const buyerId = searchParams.get("buyerId")?.trim() || null;
    const sellerId = searchParams.get("sellerId")?.trim() || null;
    const limit = Number(searchParams.get("limit")) || 20;
    const offset = Number(searchParams.get("offset")) || 0;

    const result = await listRFQs({ status, buyerId, sellerId, limit, offset });

    return NextResponse.json({
      success: true,
      data: result.items,
      total: result.total,
      limit,
      offset,
    });
  } catch (err: any) {
    // STEP 13.31 P2-C FIX: do not leak raw err.message to client
    // (could expose DB connection strings, internal paths, library
    // internals). Log the real error server-side; return generic message.
    console.error("[api/rfq GET] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/* POST /api/rfq — create a new RFQ (authenticated).
 * Delegates validation + persistence + audit to rfq-service.
 *
 * H.2.4b: previously this route accepted an UNBOUNDED body with NO CSRF
 * check and NO rate limit — a logged-in user could submit unbounded
 * CSRF-free RFQs. It now applies CSRF + bounded-body + RFQ_CREATE rate-
 * limit, matching the security baseline of /api/wanted and /api/listings.
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "برای ثبت استعلام ابتدا وارد شوید" },
        { status: 401 },
      );
    }

    // CSRF — state-changing mutation, must be origin-checked.
    if (!checkCsrf(req)) {
      return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
    }

    // Rate limit — user-scoped, caps RFQ-spam against the quote marketplace.
    const rl = rateLimit({
      key: rateLimitKey(user.id, RFQ_CREATE.label),
      limit: RFQ_CREATE.limit,
      windowMs: RFQ_CREATE.windowMs,
    });
    if (!rl.ok) {
      const retryAfter = retryAfterSeconds(rl.resetAt);
      return NextResponse.json(
        { error: "تعداد درخواست‌ها بیش از حد مجاز است. لطفاً بعداً تلاش کنید." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    // Bounded read BEFORE JSON.parse — caps body size at 256 KiB.
    const parsedBody = await readBoundedJson<Record<string, unknown>>(req, MAX_RFQ_BODY_BYTES);
    if (!parsedBody.ok) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
    }
    const body = parsedBody.value;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "بدنه درخواست معتبر نیست." }, { status: 400 });
    }
    const {
      title,
      description,
      sellerId,
      deadline,
      categoryId,
      brandId,
      specs,
    } = body as Record<string, unknown>;

    // STEP 13.01 P0-5 FIX: buyerId is NEVER accepted from the request
    // body. The authenticated user IS the buyer — always. Previously
    // `buyerId: buyerId ?? user.id` allowed a logged-in attacker to
    // supply another user's id, which caused createRFQ to look up
    // that user's PII (name/phone/email) and persist an RFQ under
    // their identity (impersonation + PII harvest chain).
    //
    // If an admin-creates-on-behalf flow is needed in the future,
    // it must go through a separate RBAC-checked endpoint that
    // explicitly verifies the admin role — not this public route.
    const created = await createRFQ({
      title: title as string,
      description: description as string | null | undefined,
      buyerId: user.id,
      sellerId: sellerId as string | null | undefined,
      deadline: deadline as string | Date | null | undefined,
      categoryId: categoryId as string | null | undefined,
      brandId: brandId as string | null | undefined,
      specs: specs as string | null | undefined,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      id: created.id,
      status: created.status,
    });
  } catch (err: any) {
    if (err instanceof RFQServiceError) {
      // Typed service error — message is controlled/validated, safe to return.
      return NextResponse.json(
        { error: err.message },
        { status: err.status },
      );
    }
    // STEP 13.31 P2-C FIX: unknown error — do not leak err.message.
    console.error("[api/rfq POST] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
