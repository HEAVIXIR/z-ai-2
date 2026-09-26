import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-context";
import {
  getSellerProfile,
  verifySeller,
  suspendSeller,
  registerSeller,
  SellerServiceError,
} from "@/lib/seller-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/admin/sellers/[id] — seller profile detail.
 *
 * Returns the User row (must be a SELLER) with company,
 * foundingStatus, and _count.listings (the marketplace-depth
 * detail payload for /admin/sellers/[id]).
 *
 * Permission: user.read (canonical admin read gate for the
 * sellers domain — the /admin/sellers list page already uses
 * user.read implicitly via the admin layout).
 *
 * Audit: best-effort marketplace.seller.detail_view.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, "user.read");
  } catch {
    return NextResponse.json(
      { error: "Forbidden: requires user.read" },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;
    const profile = await getSellerProfile(id);

    // Best-effort audit (the service call is the source of truth
    // for the actual mutation; this is just a view audit).
    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "marketplace.seller.detail_view",
      entityType: "FoundingSeller",
      entityId: profile.foundingStatus?.id ?? profile.id,
      reason: `viewed seller profile ${id}`,
      ip: getClientIp(req),
      userAgent: req.headers.get("user-agent"),
    }).catch(() => {});

    return NextResponse.json({ seller: profile });
  } catch (err: any) {
    if (err instanceof SellerServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* PATCH /api/admin/sellers/[id] — verify / suspend / register
 *
 * Body: { action: "verify" | "suspend" | "register", reason?, companyId? }
 *
 *   verify   — flip FoundingSeller.active=true + User.status=ACTIVE
 *              + audit marketplace.seller.verify
 *   suspend  — flip FoundingSeller.active=false + User.status=BLOCKED
 *              + audit marketplace.seller.suspend (reason required)
 *   register — set User.role=SELLER + create FoundingSeller
 *              (PENDING) + audit marketplace.seller.register
 *
 * Permission: user.update (canonical admin write gate for user
 *   lifecycle — verify + suspend mutate user state; register
 *   also flips User.role which is a user-level mutation).
 *
 * The service layer calls logAudit with the canonical action keys
 * (marketplace.seller.verify / marketplace.seller.suspend /
 * marketplace.seller.register). This route handler does not
 * duplicate those audits — they are the contract-required audits
 * and live in the service so the same logic is reusable from
 * server actions or other callers.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, "user.update");
  } catch {
    return NextResponse.json(
      { error: "Forbidden: requires user.update" },
      { status: 403 },
    );
  }

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "").toLowerCase();
    const reason = body?.reason ? String(body.reason) : null;
    const companyId = body?.companyId ? String(body.companyId) : null;

    let result: Record<string, unknown> = {};

    if (action === "verify") {
      result = await verifySeller(id, user.id);
    } else if (action === "suspend") {
      if (!reason || !reason.trim()) {
        return NextResponse.json(
          { error: "reason is required for suspend" },
          { status: 400 },
        );
      }
      result = await suspendSeller(id, reason, user.id);
    } else if (action === "register") {
      result = await registerSeller({
        userId: id,
        companyId: companyId ?? null,
        userId_operator: user.id,
      });
    } else {
      return NextResponse.json(
        {
          error: "Invalid action. Allowed: verify | suspend | register",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    if (err instanceof SellerServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
