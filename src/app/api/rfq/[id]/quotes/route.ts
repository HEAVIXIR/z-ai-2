/**
 * HEAVIX — RFQ Quotes API (Phase 7 — Wanted/RFQ/Matching)
 * ------------------------------------------------------------
 * Routes for managing quotes (RFQQuote) on an RFQ. Delegates
 * business logic to src/lib/rfq-service.ts.
 *
 * Routes:
 *   GET  /api/rfq/[id]/quotes   — list quotes for an RFQ
 *   POST /api/rfq/[id]/quotes   — submit a quote (auth, seller)
 *
 * Body (POST):
 *   { price, deliveryTime?, validity?, notes? }
 *
 * The POST handler authenticates via getCurrentUser(). The
 * service resolves the seller's identity from the User record
 * (firstName/lastName/mobile) and writes audit
 * `marketplace.rfq.quote.submit`.
 *
 * Quote accept/reject are NOT exposed here — they're lifecycle
 * actions owned by the buyer (rfq.buyerId). They live under
 * /api/rfq/[id]/quotes/[quoteId] (PATCH action=accept|reject)
 * for fine-grained RBAC; this file deliberately stays narrow.
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { readBoundedJson } from "@/lib/read-bounded-json";
import { rateLimit, retryAfterSeconds } from "@/lib/rate-limit";
import { rateLimitKey } from "@/lib/request-context";
import { QUOTE_SUBMIT } from "@/lib/rate-limit-presets";
import {
  getRFQ,
  submitQuote,
  RFQServiceError,
} from "@/lib/rfq-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// H.2.4b: body-size ceiling for quote submission. A quote carries a price,
// delivery time, validity and notes — 64 KiB is generous.
const MAX_QUOTE_BODY_BYTES = 64 * 1024;

/* GET /api/rfq/[id]/quotes — list quotes for an RFQ.
 * The RFQ details are also returned so the client can render
 * the quote form without a second round-trip.
 *
 * STEP 13.01-R1 P0-2 FIX v2: auth required + viewer context passed
 * to getRFQ so PII is redacted for non-buyer viewers. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "برای مشاهده پیشنهادها وارد شوید" },
        { status: 401 },
      );
    }

    const { id } = await params;
    const rfq = await getRFQ(id, user.id);
    return NextResponse.json({
      success: true,
      data: rfq.quotes,
      rfq: {
        id: rfq.id,
        title: rfq.title,
        status: rfq.status,
        deadline: rfq.deadline,
        quantity: rfq.quantity,
        budgetMin: rfq.budgetMin,
        budgetMax: rfq.budgetMax,
        brandPref: rfq.brandPref,
        machineType: rfq.machineType,
      },
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
    console.error("[api/rfq/[id]/quotes GET] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/* POST /api/rfq/[id]/quotes — submit a quote (authenticated
 * seller). Body: { price, deliveryTime?, validity?, notes? }.
 *
 * H.2.4b: previously this route accepted an UNBOUNDED body with NO CSRF
 * check and NO rate limit. It now applies CSRF + bounded-body +
 * QUOTE_SUBMIT rate-limit so a logged-in seller cannot quote-spam an RFQ
 * or submit via a cross-site request.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "برای ثبت پیشنهاد ابتدا وارد شوید" },
        { status: 401 },
      );
    }

    // CSRF — state-changing mutation, must be origin-checked.
    if (!checkCsrf(req)) {
      return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
    }

    // Rate limit — user-scoped, caps quote-spam.
    const rl = rateLimit({
      key: rateLimitKey(user.id, QUOTE_SUBMIT.label),
      limit: QUOTE_SUBMIT.limit,
      windowMs: QUOTE_SUBMIT.windowMs,
    });
    if (!rl.ok) {
      const retryAfter = retryAfterSeconds(rl.resetAt);
      return NextResponse.json(
        { error: "تعداد درخواست‌ها بیش از حد مجاز است. لطفاً بعداً تلاش کنید." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    // Bounded read BEFORE JSON.parse — caps body size at 64 KiB.
    const parsedBody = await readBoundedJson<Record<string, unknown>>(req, MAX_QUOTE_BODY_BYTES);
    if (!parsedBody.ok) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status });
    }
    const body = parsedBody.value;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "بدنه درخواست معتبر نیست." }, { status: 400 });
    }
    const { price, deliveryTime, validity, notes } = body as Record<string, unknown>;

    const quote = await submitQuote(id, user.id, {
      price: price as string | number | bigint,
      deliveryTime: deliveryTime as string | null | undefined,
      validity: validity as string | null | undefined,
      notes: notes as string | null | undefined,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      id: quote.id,
      status: quote.status,
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
    console.error("[api/rfq/[id]/quotes POST] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
