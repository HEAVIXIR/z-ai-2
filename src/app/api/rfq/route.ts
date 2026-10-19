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
import { createRFQ, listRFQs, RFQServiceError } from "@/lib/rfq-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
 * Delegates validation + persistence + audit to rfq-service. */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "برای ثبت استعلام ابتدا وارد شوید" },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      title,
      description,
      sellerId,
      deadline,
      categoryId,
      brandId,
      specs,
    } = body;

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
      title,
      description,
      buyerId: user.id,
      sellerId,
      deadline,
      categoryId,
      brandId,
      specs,
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
