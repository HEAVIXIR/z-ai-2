import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/authorization";
import { addItem } from "@/lib/compare-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   POST /api/compare/[id]/items — add an item to a session.
   Body: { listingId?, productId?, brandId?, modelId? }
   At least one identifier must be provided. Enforces 5-item cap.
   Returns: { item: { id, sessionId, sortOrder } }

   STEP 11.35 IDOR FIX: if the session has a userId (owned by a
   logged-in user), require auth + ownership. Anonymous-created
   sessions (userId=null) remain accessible via the session-ID
   capability model (needed for the anonymous compare feature).
   ============================================================ */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // STEP 11.35: ownership check for owned sessions.
    const session = await db.comparisonSession.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (session.userId !== null) {
      // Owned session — require auth + ownership (or admin).
      const user = await getCurrentUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const isOwner = session.userId === user.id;
      const is_admin = await isAdmin(user.id);
      if (!isOwner && !is_admin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    // Anonymous session (userId=null) — session ID is the capability.

    const body = await req.json().catch(() => ({}));

    const listingId = typeof body.listingId === "string" ? body.listingId : undefined;
    const productId = typeof body.productId === "string" ? body.productId : undefined;
    const brandId = typeof body.brandId === "string" ? body.brandId : undefined;
    const modelId = typeof body.modelId === "string" ? body.modelId : undefined;

    if (!listingId && !productId && !brandId && !modelId) {
      return NextResponse.json(
        { error: "حداقل یکی از listingId/productId/brandId/modelId لازم است" },
        { status: 400 },
      );
    }

    const item = await addItem(id, { listingId, productId, brandId, modelId });
    return NextResponse.json({ item });
  } catch (err: any) {
    const msg = err?.message ?? "Server error";
    const status = msg.includes("حداکثر") ? 400 : msg.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
