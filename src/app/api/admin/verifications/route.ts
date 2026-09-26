import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/admin/verifications?status=PENDING
 * Returns verification queue for admin trust center.
 * Permission: company.verify
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, "company.verify");
  } catch {
    return NextResponse.json(
      { error: "Forbidden: requires company.verify" },
      { status: 403 },
    );
  }

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status")?.trim() || "PENDING";
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));

    const verifs = await db.companyVerification.findMany({
      where: status === "ALL" ? {} : { status },
      include: {
        company: { select: { id: true, name: true, slug: true, verified: true } },
      },
      orderBy: { submittedAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ verifications: verifs, count: verifs.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}

/* POST /api/admin/verifications — create a new verification request
 * Body: { companyId, verificationType, evidence?, notes? }
 * Permission: company.verify
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requirePermission(user.id, "company.verify");
  } catch {
    return NextResponse.json(
      { error: "Forbidden: requires company.verify" },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const { companyId, verificationType, evidence, notes } = body;

    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }

    const verif = await db.companyVerification.create({
      data: {
        companyId,
        verificationType: verificationType || "BUSINESS",
        status: "PENDING",
        evidence: evidence ? JSON.stringify(evidence) : null,
        notes: notes || null,
      },
    });

    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "company.verification.create",
      entityType: "CompanyVerification",
      entityId: verif.id,
      after: { companyId, verificationType, status: "PENDING" },
      ip: getClientIp(req),
    }).catch(() => {});

    return NextResponse.json({ ok: true, id: verif.id });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
