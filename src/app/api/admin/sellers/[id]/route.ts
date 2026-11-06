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
    console.error("[admin/sellers] GET failed:", err);
    return NextResponse.json(
      { error: "Unable to load seller" },
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
 * The service layer writes the canonical marketplace.seller.*
 * AuditLog event through the same Prisma transaction as each mutation.
 * This route does not duplicate mutation audits; actor attribution is
 * supplied from the authenticated session.
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
    const contentType = req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (contentType !== "application/json") {
      return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
    }

    const maxBodyBytes = 16 * 1024;
    const declaredLength = Number(req.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }

    // Enforce the limit while streaming so chunked requests cannot force
    // an unbounded req.text() allocation before the size check.
    const reader = req.body?.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBodyBytes) {
          await reader.cancel();
          return NextResponse.json({ error: "Request body too large" }, { status: 413 });
        }
        chunks.push(value);
      }
    }
    const bodyBytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bodyBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const rawBody = new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes);

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "JSON object required" }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
    const allowedFields = new Set(["action", "reason", "companyId"]);
    if (Object.keys(payload).some((key) => !allowedFields.has(key))) {
      return NextResponse.json({ error: "Unknown request field" }, { status: 400 });
    }

    if (typeof payload.action !== "string" ||
        !["verify", "suspend", "register"].includes(payload.action)) {
      return NextResponse.json(
        { error: "Invalid action. Allowed: verify | suspend | register" },
        { status: 400 },
      );
    }
    if (payload.reason !== undefined &&
        (typeof payload.reason !== "string" || payload.reason.length > 2000)) {
      return NextResponse.json({ error: "reason must be a string of at most 2000 characters" }, { status: 400 });
    }
    if (payload.companyId !== undefined &&
        (typeof payload.companyId !== "string" || payload.companyId.length > 128)) {
      return NextResponse.json({ error: "companyId must be a string of at most 128 characters" }, { status: 400 });
    }

    const action = payload.action;
    const reason = typeof payload.reason === "string" ? payload.reason : null;
    const companyId = typeof payload.companyId === "string" && payload.companyId.trim()
      ? payload.companyId.trim()
      : null;

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
    console.error("[admin/sellers] PATCH failed:", err);
    return NextResponse.json(
      { error: "Unable to update seller" },
      { status: 500 },
    );
  }
}
