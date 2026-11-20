import { HOMEPAGE_CACHE_TAGS } from '@/lib/homepage-cache-tags';
import { revalidateTag } from 'next/cache';
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseBool } from "@/lib/api-helpers";
import { hasPermission } from "@/lib/rbac";
import { requireAdmin } from "@/lib/admin-guard";
import { logAudit } from "@/lib/audit";
import { checkCsrf } from "@/lib/csrf";
import { bulkTransitionWanted, WantedServiceError } from "@/lib/wanted-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serialize(r: any) {
  return {
    ...r,
    budgetMin: r.budgetMin ? r.budgetMin.toString() : null,
    budgetMax: r.budgetMax ? r.budgetMax.toString() : null,
  };
}

/* GET /api/admin/requests — admin list + stats. */
export async function GET(req: Request) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "request.read"))) {
    return NextResponse.json(
      { error: "Forbidden: requires request.read" },
      { status: 403 },
    );
  }
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || undefined;
    const verified = url.searchParams.get("verified");
    const q = url.searchParams.get("q")?.trim() || undefined;
    const limit = Number(url.searchParams.get("limit")) || 100;
    const offset = Number(url.searchParams.get("offset")) || 0;

    const where: any = {};
    if (status) where.status = status;
    if (verified !== null && verified !== undefined && verified !== "")
      where.verified = parseBool(verified);
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { description: { contains: q } },
        { requesterName: { contains: q } },
        { requesterPhone: { contains: q } },
      ];
    }

    const [items, total, stats] = await Promise.all([
      db.buyRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          images: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, url: true, alt: true, isPrimary: true, sortOrder: true },
          },
        },
      }),
      db.buyRequest.count({ where }),
      {
        total: await db.buyRequest.count(),
        active: await db.buyRequest.count({ where: { status: "ACTIVE" } }),
        pending: await db.buyRequest.count({ where: { status: "PENDING" } }),
        closed: await db.buyRequest.count({ where: { status: "CLOSED" } }),
        fulfilled: await db.buyRequest.count({ where: { status: "FULFILLED" } }),
        verified: await db.buyRequest.count({ where: { verified: true } }),
      },
    ]);

    const data = items.map(serialize);
    // Keep the historical `requests` field while satisfying the current
    // AdminRequestsPage contract (`success` + `data`). Both aliases point
    // to the same serialized rows so consumers cannot drift.
    return NextResponse.json({
      success: true,
      data,
      requests: data,
      total,
      stats,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* POST /api/admin/requests — bulk actions. */
export async function POST(req: Request) {
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
  // P0-1: CSRF check — bulk mutations (approve/close/fulfill/verify) are
  // state-changing and MUST be CSRF-protected, mirroring the single-row
  // PATCH route. Without this, a cross-site POST could approve/close
  // requests on the admin's behalf.
  if (!checkCsrf(req)) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "ids is required" }, { status: 400 });
    }

    let data: any = {};
    switch (action) {
      case "verify": data = { verified: true }; break;
      case "unverify": data = { verified: false }; break;
      case "approve":
      case "close":
      case "fulfill":
      case "reject": {
        // P0-B + P0-C + P0-D: delegate to the canonical
        // bulkTransitionWanted service function, which:
        //  - deduplicates + validates + caps ids at 100 (P0-B)
        //  - reads the eligible set BEFORE the update (P0-B: rejected
        //    computation is accurate — just-transitioned rows are NOT
        //    misclassified as rejected)
        //  - uses compare-and-set per-status-group (P0-C: concurrency-safe)
        //  - enforces the transition matrix (P0-D: only valid
        //    transitions proceed; terminal states rejected)
        //  - returns approved count + rejected ids with their status
        // H.2.6: "reject" is now a first-class action (REJECTED was a
        // recognized terminal status but previously unreachable).
        try {
          const result = await bulkTransitionWanted(
            action as "approve" | "close" | "fulfill" | "reject",
            ids,
            sessionUser.id,
          );
          // STEP 15-B.5.4-C.2-P3: Invalidate Homepage cache
          try { revalidateTag(HOMEPAGE_CACHE_TAGS.requests, 'default'); } catch (e) { console.error('[admin/requests] revalidateTag failed:', e); }
          return NextResponse.json({
            ok: true,
            action,
            approved: result.approved,
            rejected: result.rejected.length,
            rejectedIds: result.rejected,
            requested: result.requested,
          });
        } catch (err: any) {
          if (err instanceof WantedServiceError) {
            return NextResponse.json({ error: err.message }, { status: err.status });
          }
          throw err;
        }
      }
      case "delete": {
        // Preserve marketplace and audit history: the legacy "delete"
        // action is now a bulk soft-close, never a destructive DB delete.
        // P0-D: route through the canonical bulkTransitionWanted (close)
        // so the state machine applies (terminal states are NOT re-closed).
        try {
          const result = await bulkTransitionWanted("close", ids, sessionUser.id);
          await logAudit({
            actorId: sessionUser.id,
            actorType: "ADMIN",
            action: "admin.buyRequests.closeMany",
            entityType: "BuyRequest",
            entityId: null,
            before: { ids, requestedAction: "delete" },
            after: { status: "CLOSED", count: result.approved, rejected: result.rejected },
            reason: "Legacy bulk delete safely mapped to soft close via admin API",
          });
          try { revalidateTag(HOMEPAGE_CACHE_TAGS.requests, 'default'); } catch (e) { console.error('[admin/requests] revalidateTag failed:', e); }
          return NextResponse.json({ ok: true, action: "close", count: result.approved, rejected: result.rejected.length });
        } catch (err: any) {
          if (err instanceof WantedServiceError) {
            return NextResponse.json({ error: err.message }, { status: err.status });
          }
          throw err;
        }
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const result = await db.buyRequest.updateMany({
      where: { id: { in: ids } },
      data,
    });
    await logAudit({
      actorId: sessionUser.id,
      actorType: "ADMIN",
      action: "admin.buyRequests.updateMany",
      entityType: "BuyRequest",
      entityId: null,
      before: { ids, action },
      after: { action, count: result.count, data },
      reason: "via admin API",
    });
    // STEP 15-B.5.4-C.2-P3: Invalidate Homepage cache
    try { revalidateTag(HOMEPAGE_CACHE_TAGS.requests, 'default'); } catch (e) { console.error('[admin/requests] revalidateTag failed:', e); }

    return NextResponse.json({ ok: true, action, updated: result.count });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
