import { HOMEPAGE_CACHE_TAGS } from '@/lib/homepage-cache-tags';
import { revalidateTag } from 'next/cache';
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { checkCsrf } from "@/lib/csrf";
import { hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { publishWanted, fulfillWanted, closeWantedByAdmin, rejectWanted, WantedServiceError } from "@/lib/wanted-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

function serialize(r: any) {
  return {
    ...r,
    budgetMin: r.budgetMin ? r.budgetMin.toString() : null,
    budgetMax: r.budgetMax ? r.budgetMax.toString() : null,
  };
}

/* PATCH /api/admin/requests/[id] — update + actions. */
export async function PATCH(req: Request, { params }: Params) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "request.manage"))) {
    return NextResponse.json(
      { error: "Forbidden: requires request.manage" },
      { status: 403 },
    );
  }

  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const existing = await db.buyRequest.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: any = {};
    // P0-2: status is intentionally NOT in the editable list. Status
    // transitions must go through the controlled state-machine actions
    // (approve/close/fulfill), not free-form PATCH editing — otherwise
    // the moderation gate can be bypassed by setting status=ACTIVE
    // directly. The edit modal's status <select> is display-only now.
    const allowed = [
      "title", "description", "category", "brandPref", "transaction",
      "city", "province", "deadline", "verified",
      "requesterName", "requesterPhone", "adminNotes",
    ];
    for (const k of allowed) {
      if (k in body) {
        if (k === "verified") data[k] = Boolean(body[k]);
        else data[k] = body[k] === undefined ? null : body[k];
      }
    }

    // Actions
    if (body.action === "verify") data.verified = true;
    else if (body.action === "unverify") data.verified = false;
    // P0-D: close + fulfill go through the canonical service functions
    // (state machine + CAS), NOT the generic update below.
    else if (body.action === "close" || body.action === "fulfill" || body.action === "reject") {
      try {
        // H.2.6: "reject" routes through rejectWanted (REJECTED terminal
        // state, audited as marketplace.wanted.reject). close/fulfill keep
        // their canonical service functions. All three use the state
        // machine + CAS + audit; none fall through to the generic update.
        const result =
          body.action === "close" ? await closeWantedByAdmin(id, sessionUser.id)
          : body.action === "fulfill" ? await fulfillWanted(id, sessionUser.id)
          : await rejectWanted(id, sessionUser.id);
        try { revalidateTag(HOMEPAGE_CACHE_TAGS.requests, 'default'); } catch (e) { console.error('[admin/requests/id] revalidateTag failed:', e); }
        return NextResponse.json({ ok: true, request: result });
      } catch (err: any) {
        if (err instanceof WantedServiceError) {
          return NextResponse.json({ error: err.message }, { status: err.status });
        }
        throw err;
      }
    }

    // Moderation gate: "approve" publishes a PENDING request (status →
    // ACTIVE + publishedAt → now) via the canonical service function,
    // which owns its own audit (marketplace.wanted.publish) AND enforces
    // the state machine (only PENDING can be approved; CLOSED/FULFILLED/
    // EXPIRED/REJECTED are rejected with 409). Delegated rather than
    // inlined so the publish transition + audit + state-machine are
    // single-sourced and testable. Returns early (skips the generic
    // update below).
    //
    // P0-2: the legacy "activate" action (which set status=ACTIVE without
    // publishedAt and without the state machine) is redirected to the
    // same publishWanted gate — so existing callers that send
    // action=activate now go through the controlled transition. A
    // CLOSED/FULFILLED request sent via activate will now correctly 409.
    if (body.action === "approve" || body.action === "activate") {
      try {
        const published = await publishWanted(id, sessionUser.id);
        // Invalidate Homepage cache so the newly-published request surfaces.
        try { revalidateTag(HOMEPAGE_CACHE_TAGS.requests, 'default'); } catch (e) { console.error('[admin/requests/id] revalidateTag failed:', e); }
        return NextResponse.json({ ok: true, request: { id: published.id, status: published.status, publishedAt: published.publishedAt } });
      } catch (err: any) {
        if (err instanceof WantedServiceError) {
          return NextResponse.json({ error: err.message }, { status: err.status });
        }
        throw err;
      }
    }

    const r = await db.buyRequest.update({ where: { id }, data });
    await logAudit({
      actorId: sessionUser.id,
      actorType: "ADMIN",
      action: "admin.buyRequests.update",
      entityType: "BuyRequest",
      entityId: r.id,
      before: { title: existing.title, status: existing.status, verified: existing.verified },
      after: { title: r.title, status: r.status, verified: r.verified, action: body.action ?? null },
      reason: "via admin API",
    });
    // STEP 15-B.5.4-C.2-P3: Invalidate Homepage cache
    try { revalidateTag(HOMEPAGE_CACHE_TAGS.requests, 'default'); } catch (e) { console.error('[admin/requests/id] revalidateTag failed:', e); }

    return NextResponse.json({ ok: true, request: serialize(r) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* DELETE /api/admin/requests/[id]
 *
 * P0 audit (D1): the single-row DELETE previously did a HARD physical
 * removal of the BuyRequest row — orphaning
 * marketplace/offer history, and bypassing the state machine + audit
 * trail. This was inconsistent with the bulk-delete path (which soft-
 * closes via bulkTransitionWanted("close")).
 *
 * Fix: single-row DELETE is now a soft-close via closeWantedByAdmin
 * (the canonical state machine + CAS + audit). The row is preserved
 * with status=CLOSED; the audit records both the requested "delete"
 * intent AND the resulting close transition. A true hard-delete (for
 * moderation/PITI removal) would be a separate gated action with its
 * own permission + retention policy — NOT this endpoint.
 */
export async function DELETE(req: Request, { params }: Params) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "request.manage"))) {
    return NextResponse.json(
      { error: "Forbidden: requires request.manage" },
      { status: 403 },
    );
  }

  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const before = await db.buyRequest.findUnique({
      where: { id },
      select: { id: true, title: true, status: true, verified: true },
    });
    if (!before) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Soft-close via the canonical service (state machine + CAS + audit).
    // closeWantedByAdmin is idempotent on already-CLOSED rows.
    await closeWantedByAdmin(id, sessionUser.id);
    // Record the legacy "delete" intent in the audit trail (the close
    // audit is written by closeWantedByAdmin as marketplace.wanted.close;
    // this entry records that the admin requested a delete, mapped to close).
    await logAudit({
      actorId: sessionUser.id,
      actorType: "ADMIN",
      action: "admin.buyRequests.delete",
      entityType: "BuyRequest",
      entityId: id,
      before: { title: before.title, status: before.status, verified: before.verified },
      after: { mappedAction: "soft-close", reason: "Legacy single-row delete safely mapped to soft close" },
      reason: "Legacy single-row delete mapped to soft close via admin API (no physical removal)",
    });
    // STEP 15-B.5.4-C.2-P3: Invalidate Homepage cache
    try { revalidateTag(HOMEPAGE_CACHE_TAGS.requests, 'default'); } catch (e) { console.error('[admin/requests/id] revalidateTag failed:', e); }

    return NextResponse.json({ ok: true, action: "close" });
  } catch (err: any) {
    // E.1.1: map WantedServiceError to its HTTP status (404/409/400),
    // NOT a blanket 500. The service throws 409 for terminal states
    // (CLOSED/FULFILLED cannot be re-closed), 404 for missing, 400 for
    // empty id — the route must preserve these so the admin UI can
    // show the correct error + the row stays in its real state.
    if (err instanceof WantedServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
