import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/authorization";
import { getClientIp } from "@/lib/request-context";
import { logAudit } from "@/lib/audit";
import { checkVerificationExpiry } from "@/lib/trust-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* POST /api/admin/verifications/check-expiry
 *
 * Sweep every VERIFIED verification whose expiresAt < now and
 * flip it to EXPIRED. The service writes one
 * `trust.verification.expired` audit entry per transitioned row
 * (best-effort). The Company.verified flag is flipped back to
 * false when the company has no other VERIFIED verification.
 *
 * Idempotent: re-running on the same state is a no-op.
 *
 * Permission: company.verify
 *
 * Returns: { ok, expiredCount, expiredIds }
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
    const result = await checkVerificationExpiry();

    // Access audit (best-effort) — records who triggered the sweep
    // and how many rows it expired. The canonical per-row audit
    // entries are written by the service layer.
    await logAudit({
      actorId: user.id,
      actorType: "ADMIN",
      action: "trust.verification.expiry_sweep",
      entityType: "CompanyVerification",
      ip: getClientIp(req),
      reason: `POST /api/admin/verifications/check-expiry → expired=${result.expiredCount}`,
    }).catch(() => {});

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error)?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
