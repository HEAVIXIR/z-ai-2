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
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
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
      buyerId,
      sellerId,
      deadline,
      categoryId,
      brandId,
      specs,
    } = body;

    // Use the authenticated user's id as buyerId when not
    // explicitly provided (the typical case — a buyer creates
    // their own RFQ). sellerId is optional — when present, the
    // RFQ is addressed to a specific seller.
    const created = await createRFQ({
      title,
      description,
      buyerId: buyerId ?? user.id,
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
      return NextResponse.json(
        { error: err.message },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
