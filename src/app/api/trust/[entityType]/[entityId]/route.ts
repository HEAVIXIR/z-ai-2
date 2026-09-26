import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getTrustProfile,
  TrustServiceError,
} from "@/lib/trust-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET /api/trust/[entityType]/[entityId]
 *
 * PUBLIC trust profile endpoint (no auth). Returns the slimmed-
 * down trust profile for an entity:
 *   - entityType, entityId
 *   - verified: boolean         (true iff current.status === 'VERIFIED')
 *   - status: string            (current.status — VERIFIED | PENDING | ...)
 *   - verificationType: string  (PHONE | EMAIL | BUSINESS | DOCUMENT | INSPECTION)
 *   - verifiedAt: string|null   (current.reviewedAt when status=VERIFIED)
 *   - expiresAt: string|null    (current.expiresAt)
 *   - verifiedBy: string|null   (reviewer NAME — never the userId)
 *
 * DOES NOT EXPOSE:
 *   - evidence URLs
 *   - reviewNotes
 *   - rejectionReason
 *   - revokeReason
 *   - revokedBy / revokedAt  (these leak trust-state internals)
 *   - full history
 *
 * These admin-only fields are returned by the canonical admin
 * routes /api/admin/verifications/* instead.
 *
 * The "verifiedBy name" resolution: the service layer stores the
 * reviewer's identifier (admin userId or 'ADMIN' sentinel) in
 * `reviewedBy`. The public endpoint maps this to a human name:
 *   - 'ADMIN' → 'HEAVIX Admin'
 *   - userId  → User.firstName + lastName (best-effort; null on miss)
 *   - other   → returned as-is (rare; legacy data)
 *
 * When no verification exists for the entity, we return
 * { verified: false, status: null, ... } with HTTP 200.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ entityType: string; entityId: string }> },
) {
  try {
    const { entityType, entityId } = await params;

    let profile;
    try {
      profile = await getTrustProfile({ entityType, entityId });
    } catch (err) {
      if (err instanceof TrustServiceError) {
        return NextResponse.json(
          { error: err.message },
          { status: err.status },
        );
      }
      throw err;
    }

    if (!profile.current) {
      return NextResponse.json({
        entityType: String(entityType).toUpperCase(),
        entityId,
        verified: false,
        status: null,
        verificationType: null,
        verifiedAt: null,
        expiresAt: null,
        verifiedBy: null,
      });
    }

    const c = profile.current;
    const verified = c.status === "VERIFIED";

    // Resolve reviewer name (best-effort; never expose the userId).
    let verifiedBy: string | null = null;
    if (c.reviewedBy) {
      if (c.reviewedBy === "ADMIN") {
        verifiedBy = "HEAVIX Admin";
      } else {
        try {
          const reviewer = await db.user.findUnique({
            where: { id: c.reviewedBy },
            select: { firstName: true, lastName: true },
          });
          if (reviewer) {
            const parts = [reviewer.firstName, reviewer.lastName].filter(Boolean);
            verifiedBy = parts.length > 0 ? parts.join(" ") : null;
          } else {
            // User row missing — fall back to a non-identifying label.
            verifiedBy = "HEAVIX Reviewer";
          }
        } catch {
          verifiedBy = "HEAVIX Reviewer";
        }
      }
    }

    return NextResponse.json({
      entityType: profile.entityType,
      entityId: profile.entityId,
      verified,
      status: c.status,
      verificationType: c.verificationType,
      verifiedAt: verified ? c.reviewedAt : null,
      expiresAt: c.expiresAt,
      verifiedBy: verified ? verifiedBy : null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error)?.message ?? "Server error" },
      { status: 500 },
    );
  }
}
