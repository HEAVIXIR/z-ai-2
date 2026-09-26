/**
 * HEAVIX — Wanted API (Phase 7 — Wanted/RFQ/Matching)
 * ------------------------------------------------------------
 * Public + authenticated routes for the "Wanted" marketplace
 * domain (BuyRequest). Delegates business logic to
 * src/lib/wanted-service.ts.
 *
 * Routes:
 *   GET  /api/wanted           — list public wanted requests
 *                                  (?mine=true → user's own)
 *   POST /api/wanted           — create a wanted request (auth)
 *
 * Query params (GET, public):
 *   ?status=ACTIVE    (default) — filter by status
 *   ?categoryId=...             — filter by Category.id
 *   ?limit=20 (1..100)          — page size
 *   ?offset=0                   — pagination offset
 *
 * Query params (GET, mine):
 *   ?mine=true                  — list the current user's own
 *                                  requests (any status). Auth
 *                                  required; ignores status filter.
 *
 * Body (POST):
 *   { title, description?, quantity?, budgetMin?, budgetMax?,
 *     categoryId?, brandId?, transactionType?, province?, city? }
 *
 * The POST handler authenticates via getCurrentUserId() (the
 * user cookie). The service writes audit
 * `marketplace.wanted.create` (entityType: BuyRequest).
 */
import { HOMEPAGE_CACHE_TAGS } from "@/lib/homepage-cache-tags";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import {
  createWanted,
  listWanted,
  WantedServiceError,
} from "@/lib/wanted-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/wanted — list public wanted requests (paginated),
 * OR — when ?mine=true — list the current user's own requests
 * (any status). */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mine = url.searchParams.get("mine") === "true";

    // ?mine=true — auth-scoped list of the user's own requests.
    if (mine) {
      const userId = await getCurrentUserId();
      if (!userId) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 },
        );
      }
      const limit = Math.min(
        100,
        Math.max(1, Number(url.searchParams.get("limit")) || 20),
      );
      const rows = await db.buyRequest.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: limit,
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
      });
      return NextResponse.json({
        success: true,
        data: rows.map((r) => ({
          ...r,
          budgetMin: r.budgetMin ? r.budgetMin.toString() : null,
          budgetMax: r.budgetMax ? r.budgetMax.toString() : null,
        })),
      });
    }

    // Public paginated list (default status=ACTIVE).
    const status = url.searchParams.get("status")?.trim() || "ACTIVE";
    const categoryId = url.searchParams.get("categoryId")?.trim() || null;
    const limit = Number(url.searchParams.get("limit")) || 20;
    const offset = Number(url.searchParams.get("offset")) || 0;

    const result = await listWanted({ status, categoryId, limit, offset });

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

/* POST /api/wanted — create a new wanted request (authenticated).
 * Delegates validation + persistence + audit to wanted-service. */
export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "برای ثبت درخواست ابتدا وارد شوید" },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      title,
      description,
      quantity,
      budgetMin,
      budgetMax,
      categoryId,
      brandId,
      transactionType,
      province,
      city,
    } = body;

    const created = await createWanted({
      title,
      description,
      quantity,
      budgetMin,
      budgetMax,
      categoryId,
      brandId,
      transactionType,
      province,
      city,
      userId,
    });

    // Invalidate the homepage "requests" cache tag so the new
    // request shows up in the ActiveRequestsSection immediately.
    try {
      revalidateTag(HOMEPAGE_CACHE_TAGS.requests, "default");
    } catch (e) {
      console.error("[wanted] revalidateTag failed:", e);
    }

    return NextResponse.json({
      success: true,
      id: created.id,
      status: created.status,
    });
  } catch (err: any) {
    if (err instanceof WantedServiceError) {
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
