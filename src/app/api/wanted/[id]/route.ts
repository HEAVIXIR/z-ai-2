/**
 * HEAVIX — Wanted Detail API (Phase 7 — Wanted/RFQ/Matching)
 * ------------------------------------------------------------
 * Single-record routes for the "Wanted" marketplace domain.
 * Delegates business logic to src/lib/wanted-service.ts.
 *
 * Routes:
 *   GET   /api/wanted/[id]   — fetch a single wanted request
 *                              (includes a best-effort `matchCount`
 *                              from the matching engine)
 *   PATCH /api/wanted/[id]   — close the request (status → CLOSED).
 *                              Auth required; the caller must be
 *                              the request owner (or ADMIN). Body:
 *                              { action: "close" } (or no body —
 *                              close is the only PATCH action
 *                              supported via the service).
 *
 * The legacy PATCH path supported arbitrary field updates; the
 * service-ized version narrows that surface to lifecycle actions
 * only (close). Field-level edits should go through the admin
 * /api/admin/requests/[id] route, which is RBAC-gated.
 */
import { HOMEPAGE_CACHE_TAGS } from "@/lib/homepage-cache-tags";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import {
  closeWanted,
  getWanted,
  WantedServiceError,
} from "@/lib/wanted-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/wanted/[id] — fetch a single wanted request.
 * Returns the request + a `matchCount` (best-effort: number of
 * candidate listings the matching engine would surface). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const request = await getWanted(id);
    const now = Date.now();
    if (
      request.status !== "ACTIVE" ||
      !(request.publishedAt instanceof Date) ||
      request.publishedAt.getTime() > now ||
      (request.expiresAt instanceof Date && request.expiresAt.getTime() <= now)
    ) {
      return NextResponse.json({ error: "درخواست خرید یافت نشد" }, { status: 404 });
    }
    // Never expose internal account identifiers on the public detail API.
    const { userId: _ownerId, ...publicRequest } = request;
    return NextResponse.json({ success: true, data: publicRequest });
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

/* PATCH /api/wanted/[id] — close the request (status → CLOSED).
 * Body: { action: "close" } (default when action is absent).
 * Auth required; the caller must be the request owner. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    // H.2.4a (P0 security): the public PATCH (close) handler is a
    // state-changing mutation that runs on the caller's session cookie.
    // Without an Origin/Referer check, a cross-site request could close
    // the victim's wanted request (and DELETE aliases to PATCH, so the
    // same hole existed there too). checkCsrf is fail-closed and reads
    // only headers, so it is safe to run before the body is parsed.
    if (!checkCsrf(req)) {
      return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "close").toLowerCase();

    if (action !== "close") {
      return NextResponse.json(
        { error: `Unsupported PATCH action: ${action}. Only "close" is supported.` },
        { status: 400 },
      );
    }

    // Ownership check: only the request owner can close it via
    // the public API. Admins use the admin route (RBAC-gated).
    // The service throws a 404 when the request doesn't exist
    // (don't leak existence to non-owners).
    const existing = await getWanted(id).catch(() => null);
    if (!existing) {
      return NextResponse.json(
        { error: "Not found" },
        { status: 404 },
      );
    }
    // Legacy requests with a null owner are not public write targets.
    // Only the exact authenticated owner may close through this endpoint.
    if (existing.userId !== userId) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 },
      );
    }

    const result = await closeWanted(id, userId);

    // Invalidate the homepage "requests" cache tag.
    try {
      revalidateTag(HOMEPAGE_CACHE_TAGS.requests, "default");
    } catch (e) {
      console.error("[wanted/id] revalidateTag failed:", e);
    }

    return NextResponse.json({ success: true, ...result });
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

/* DELETE /api/wanted/[id] — convenience alias for PATCH action=close.
 * Kept for backward compat with the existing client (the WantedCard
 * component calls DELETE). Internally delegates to closeWanted. */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Reuse PATCH semantics — close = soft-delete (status=CLOSED).
  return PATCH(req, { params });
}
