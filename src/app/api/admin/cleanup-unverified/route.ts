import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* POST /api/admin/cleanup-unverified  (FIX 7)
   Admin-only endpoint. Deletes (or, if `deactivate=true` query
   param is passed, deactivates) users where:
       verificationDeadline < now  AND  emailVerified = false

   Admin access requires the `security.manage` permission,
   enforced via `requirePermission(user.id, "security.manage")`.
   (PR-6B removed the legacy role-string fallback.)
*/
export async function POST(req: Request) {
  try {
    // ── Auth gate ──
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "دسترسی غیرمجاز" }, { status: 401 });
    }
    await requirePermission(user.id, "security.manage");

    // ── Parse mode: delete (default) or deactivate ──
    const url = new URL(req.url);
    const mode = (url.searchParams.get("mode") ?? "delete").toLowerCase();
    const deactivate = mode === "deactivate";

    const now = new Date();
    const where = {
      verificationDeadline: { lt: now },
      emailVerified: false,
    };

    // Fetch candidates first (so we can report counts + IDs)
    const candidates = await db.user.findMany({
      where,
      select: { id: true, firstName: true, lastName: true, email: true, mobile: true, verificationDeadline: true },
    });

    if (candidates.length === 0) {
      return NextResponse.json({
        ok: true,
        mode: deactivate ? "deactivate" : "delete",
        affected: 0,
        message: "هیچ کاربر تأییدنشده‌ای بیش از مهلت نبود.",
      });
    }

    if (deactivate) {
      // Mark BLOCKED and clear the deadline so they aren't picked up
      // again on the next run. Records preserved for audit.
      await db.user.updateMany({
        where: { id: { in: candidates.map((c) => c.id) } },
        data: { status: "BLOCKED", verificationDeadline: null },
      });
      await logAudit({
        actorId: user.id,
        actorType: "ADMIN",
        action: "admin.users.updateMany",
        entityType: "User",
        entityId: null,
        before: candidates.map((c) => ({ id: c.id, email: c.email, status: "PENDING" })),
        after: { mode: "deactivate", count: candidates.length, status: "BLOCKED" },
        reason: "via admin API",
      });
    } else {
      // Hard delete — cascades to sessions + verificationCodes per schema.
      await db.user.deleteMany({
        where: { id: { in: candidates.map((c) => c.id) } },
      });
      await logAudit({
        actorId: user.id,
        actorType: "ADMIN",
        action: "admin.users.deleteMany",
        entityType: "User",
        entityId: null,
        before: candidates.map((c) => ({ id: c.id, email: c.email })),
        after: { mode: "delete", count: candidates.length },
        reason: "via admin API",
      });
    }

    return NextResponse.json({
      ok: true,
      mode: deactivate ? "deactivate" : "delete",
      affected: candidates.length,
      users: candidates.map((c) => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`,
        email: c.email,
        mobile: c.mobile,
        verificationDeadline: c.verificationDeadline?.toISOString() ?? null,
      })),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}

/* GET — preview: list candidates without touching them. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "دسترسی غیرمجاز" }, { status: 401 });
    }
    await requirePermission(user.id, "security.manage");

    const now = new Date();
    const candidates = await db.user.findMany({
      where: { verificationDeadline: { lt: now }, emailVerified: false },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        mobile: true,
        verificationDeadline: true,
        createdAt: true,
      },
      orderBy: { verificationDeadline: "asc" },
      take: 200,
    });

    return NextResponse.json({
      ok: true,
      count: candidates.length,
      users: candidates.map((c) => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`,
        email: c.email,
        mobile: c.mobile,
        verificationDeadline: c.verificationDeadline?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
