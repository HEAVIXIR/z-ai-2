import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/authorization";
import { removeItem } from "@/lib/compare-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================
   DELETE /api/compare/[id]/items/[itemId] — remove a single
   item from a session. Re-computes sortOrder lazily on the
   next getComparisonData call (sortOrder is a hint, not enforced).

   STEP 11.35 IDOR FIX: same ownership model as POST items —
   owned sessions require auth + ownership; anonymous sessions
   (userId=null) use the session-ID capability model.
   ============================================================ */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const { id, itemId } = await params;

    // STEP 11.35: ownership check for owned sessions.
    const session = await db.comparisonSession.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (session.userId !== null) {
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

    await removeItem(id, itemId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
