import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { trackError } from "@/lib/error-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/account/identity
 * Authenticated, self-scoped identity snapshot. This is intentionally
 * read-only: users cannot self-assign commercial personas, company roles,
 * verification state, or platform RBAC through this endpoint.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "_not_authenticated" }, { status: 401 });
    }

    const [personas, memberships, platformRoles] = await Promise.all([
      db.userCommercialPersona.findMany({
        where: { userId: user.id, status: "ACTIVE" },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: { personaKey: true, isPrimary: true, status: true, createdAt: true },
      }),
      db.companyMembership.findMany({
        where: { userId: user.id, status: { in: ["ACTIVE", "INVITED"] } },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: {
          roleKey: true,
          status: true,
          isPrimary: true,
          company: {
            select: { id: true, name: true, slug: true, businessType: true, verified: true, status: true },
          },
        },
      }),
      db.userRole.findMany({
        where: { userId: user.id },
        select: { role: { select: { key: true } } },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      identity: {
        userId: user.id,
        accountStatus: user.status,
        contact: {
          emailVerified: user.emailVerified,
          mobileVerified: user.mobileVerified,
        },
        commercialPersonas: personas,
        companyMemberships: memberships,
        platformRoles: platformRoles.map((entry) => entry.role.key),
      },
    });
  } catch (error) {
    trackError(error, { endpoint: "GET /api/account/identity" });
    return NextResponse.json({ ok: false, error: "identity_unavailable" }, { status: 500 });
  }
}
