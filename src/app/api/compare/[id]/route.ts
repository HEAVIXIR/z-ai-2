import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/authorization";
import { getComparisonData } from "@/lib/compare-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   /api/compare/[id] — seller-scoped comparison session endpoint.

   STEP 11.35 IDOR FIX: previously ALL 3 handlers (GET/DELETE/PATCH)
   had NO auth check and NO ownership check. Anyone with a session ID
   could read (incl. shareToken + userId), archive, rename, or refresh
   the shareToken of ANY session.

   Fix model (respects the product contract):
   - GET: session ID is a capability token (if you know it, you can
     view). This preserves the anonymous-compare feature. BUT: the
     `userId` field is redacted from the response (PII protection).
   - PATCH + DELETE: require auth + ownership (or admin). This
     prevents token hijack (refreshShareToken) and unauthorized
     archival. Anonymous-created sessions (userId=null) require
     admin for these destructive operations.
   ============================================================ */

/**
 * Authorize a mutating operation on a comparison session.
 * Returns { ok: true, session } if the user is the owner or admin.
 * Returns { ok: false, status, error } otherwise.
 */
async function authorizeMutation(
  sessionId: string,
): Promise<
  | { ok: true; session: { id: string; userId: string | null } }
  | { ok: false; status: number; error: string }
> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const session = await db.comparisonSession.findUnique({
    where: { id: sessionId },
    select: { id: true, userId: true },
  });
  if (!session) {
    return { ok: false, status: 404, error: "Session not found" };
  }
  // Owner check: session.userId === user.id
  const isOwner = session.userId === user.id;
  const is_admin = await isAdmin(user.id);
  if (!isOwner && !is_admin) {
    // For null-userId sessions (anonymous-created), only admin can mutate.
    // For owned sessions, only the owner or admin can mutate.
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true, session };
}

/* ============================================================
   GET /api/compare/[id] — fetch a comparison session + its
   full comparison table.
   Returns:
     {
       session: { id, name, status, shareToken, createdAt, aiSummary, aiSummaryAt },
       data: { items, rows, attributes, differences, crossCategoryWarning, categories }
     }
   ============================================================ */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await db.comparisonSession.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        shareToken: true,
        shareExpiresAt: true,
        createdAt: true,
        updatedAt: true,
        aiSummary: true,
        aiSummaryAt: true,
        userId: true,
      },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (session.status === "ARCHIVED") {
      return NextResponse.json({ error: "Session archived" }, { status: 410 });
    }

    const data = await getComparisonData(id);

    return NextResponse.json({
      session: {
        id: session.id,
        name: session.name,
        status: session.status,
        shareToken: session.shareToken,
        shareExpiresAt: session.shareExpiresAt,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        aiSummary: session.aiSummary,
        aiSummaryAt: session.aiSummaryAt,
        // STEP 11.35: userId redacted from response (PII protection).
        // The frontend does not use this field.
      },
      data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* ============================================================
   DELETE /api/compare/[id] — archive (soft-delete) a session.
   STEP 11.35: requires auth + ownership (or admin).
   ============================================================ */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authorizeMutation(id);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    await db.comparisonSession.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* ============================================================
   PATCH /api/compare/[id] — rename a session or refresh share token.
   Body: { name?: string, refreshShareToken?: boolean, shareExpiresAt?: string|null }
   STEP 11.35: requires auth + ownership (or admin). Prevents token
   hijack (refreshShareToken) and unauthorized renames.
   ============================================================ */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await authorizeMutation(id);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const body = await req.json().catch(() => ({}));
    const patch: any = {};

    if (typeof body.name === "string") {
      patch.name = body.name.trim().slice(0, 200) || null;
    }
    if (body.refreshShareToken === true) {
      // 24-char base64url token
      const bytes = new Uint8Array(18);
      crypto.getRandomValues(bytes);
      const b64 = btoa(String.fromCharCode(...bytes));
      patch.shareToken = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    if (body.shareExpiresAt === null) {
      patch.shareExpiresAt = null;
    } else if (typeof body.shareExpiresAt === "string") {
      const d = new Date(body.shareExpiresAt);
      if (!isNaN(d.getTime())) patch.shareExpiresAt = d;
    }

    const updated = await db.comparisonSession.update({
      where: { id },
      data: patch,
      select: {
        id: true,
        name: true,
        status: true,
        shareToken: true,
        shareExpiresAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ session: updated });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
