import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { hashPassword } from "@/lib/password";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Args {
  params: Promise<{ id: string }>;
}

/* ============================================================
   /api/admin/users/[id] — admin single-user management.

   GET    (admin) → full user profile + listings + offers + requests
   PATCH  (admin) → update role / status / verified / companyName
   DELETE (admin) → delete user (DOES NOT touch their listings — they
                    remain with sellerId pointing to a deleted user;
                    the relation uses onDelete: SetNull on Listing.seller
                    so listings survive with sellerId=null)
   ============================================================ */

function serializeUser(u: any) {
  return {
    ...u,
    passwordHash: undefined,
  };
}

/* GET /api/admin/users/[id] */
export async function GET(_req: Request, { params }: Args) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "user.read"))) {
    return NextResponse.json(
      { error: "Forbidden: missing permission 'user.read'" },
      { status: 403 },
    );
  }
  try {
    const { id } = await params;
    const user = await db.user.findUnique({
      where: { id },
      include: {
        listings: {
          orderBy: { createdAt: "desc" },
          take: 100,
          include: {
            brand: { select: { name: true } },
            category: { select: { name: true, icon: true } },
            _count: { select: { favorites: true, leads: true } },
          },
        },
        requests: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        offers: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            listing: { select: { id: true, title: true, slug: true } },
          },
        },
        notifications: {
          orderBy: { createdAt: "desc" },
          take: 30,
        },
        sessions: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, createdAt: true, expiresAt: true },
        },
        _count: {
          select: {
            listings: true,
            offers: true,
            requests: true,
            favorites: true,
            follows: true,
            notifications: true,
          },
        },
      },
    });
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Serialize BigInt prices in listings.
    const serialized = {
      ...user,
      passwordHash: undefined,
      listings: user.listings.map((l: any) => ({
        ...l,
        price: l.price ? l.price.toString() : null,
      })),
      offers: user.offers.map((o: any) => ({
        ...o,
        offerAmount: o.offerAmount ? o.offerAmount.toString() : null,
        counterAmount: o.counterAmount ? o.counterAmount.toString() : null,
      })),
    };

    return NextResponse.json({ success: true, data: serialized });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}

/* PATCH /api/admin/users/[id] — update role/status/verified/companyName
   (P0-RBAC: requires user.suspend — covers role/status lifecycle operations) */
export async function PATCH(req: Request, { params }: Args) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "user.suspend"))) {
    return NextResponse.json(
      { error: "Forbidden: missing permission 'user.suspend'" },
      { status: 403 },
    );
  }
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: any = {};
    const allowedFields = [
      "firstName",
      "lastName",
      "email",
      "mobile",
      "userType",
      "status",
      "companyName",
      "emailVerified",
      "mobileVerified",
    ];
    for (const f of allowedFields) {
      if (f in body) {
        if (typeof body[f] === "boolean") {
          data[f] = body[f];
        } else {
          data[f] = body[f] === null ? null : String(body[f]);
        }
      }
    }

    // NOTE: "role" is deliberately EXCLUDED from allowedFields.
    // Role changes require the `user.role.manage` permission and a
    // transactional dual-write (User.role + UserRole) per STEP 15.40
    // Phase B BLOCKER-1.
    let roleChange: { key: string; roleId: string } | null = null;
    if (body.role !== undefined) {
      if (!(await hasPermission(sessionUser.id, "user.role.manage"))) {
        return NextResponse.json(
          { error: "Forbidden: missing permission 'user.role.manage' to change user role" },
          { status: 403 },
        );
      }
      const allowedRoles = ["ADMIN", "SELLER", "BUYER"];
      const r = String(body.role).toUpperCase();
      if (!allowedRoles.includes(r)) {
        return NextResponse.json(
          { error: "نقش نامعتبر است" },
          { status: 400 },
        );
      }
      // Resolve Role row BEFORE the transaction (fail fast if catalog missing)
      const newRole = await db.role.findUnique({ where: { key: r }, select: { id: true } });
      if (!newRole) {
        return NextResponse.json(
          { error: `Role '${r}' not found in RBAC catalog` },
          { status: 500 },
        );
      }
      roleChange = { key: r, roleId: newRole.id };
      data.role = r;
    }

    // Email/mobile uniqueness check on change
    if (data.email && data.email !== existing.email) {
      const dup = await db.user.findFirst({
        where: { email: data.email, NOT: { id } },
      });
      if (dup) {
        return NextResponse.json({ error: "ایمیل قبلاً ثبت شده" }, { status: 409 });
      }
    }
    if (data.mobile && data.mobile !== existing.mobile) {
      const dup = await db.user.findFirst({
        where: { mobile: data.mobile, NOT: { id } },
      });
      if (dup) {
        return NextResponse.json({ error: "موبایل قبلاً ثبت شده" }, { status: 409 });
      }
    }

    // Optional password reset (P0-1: bcrypt-hash the new password).
    if (body.password && String(body.password).length >= 6) {
      data.passwordHash = await hashPassword(String(body.password));
    }

    // Update lastLoginAt if requested (e.g. admin marking last known login)
    if (body.lastLoginAt !== undefined) {
      data.lastLoginAt = body.lastLoginAt === null ? null : new Date(body.lastLoginAt);
    }

    // ── STEP 15.40 Phase B (BLOCKER-1): Transactional dual-write ──
    // When role is being changed, wrap the legacy column update +
    // UserRole deleteMany + UserRole upsert in a single $transaction.
    // If ANY of these throw, ALL roll back — no partial state.
    // Audit log remains OUTSIDE the transaction (best-effort, never
    // blocks the mutation per REVISION-6).
    let updated: any;
    if (roleChange) {
      const replaceableKeys = ["ADMIN", "SELLER", "BUYER"];
      updated = await db.$transaction(async (tx) => {
        // 1. Update legacy User.role column (+ any other fields in `data`)
        const u = await tx.user.update({
          where: { id },
          data,
          include: {
            _count: { select: { listings: true, offers: true, requests: true } },
          },
        });

        // 2. Delete existing replaceable UserRoles (ADMIN/SELLER/BUYER)
        const existingUserRoles = await tx.userRole.findMany({
          where: { userId: id, role: { key: { in: replaceableKeys } } },
          select: { id: true },
        });
        if (existingUserRoles.length > 0) {
          await tx.userRole.deleteMany({
            where: { id: { in: existingUserRoles.map((e) => e.id) } },
          });
        }

        // 3. Upsert the new UserRole (idempotent via @@unique([userId, roleId]))
        await tx.userRole.upsert({
          where: { userId_roleId: { userId: id, roleId: roleChange.roleId } },
          create: { userId: id, roleId: roleChange.roleId },
          update: {},
        });

        return u;
      });
      // ── End transaction ──
      // If we reach here, ALL three ops succeeded atomically.
    } else {
      // No role change — single non-transactional update (same as Phase A)
      updated = await db.user.update({
        where: { id },
        data,
        include: {
          _count: { select: { listings: true, offers: true, requests: true } },
        },
      });
    }

    // Audit log OUTSIDE transaction (best-effort, never blocks mutation).
    // Per REVISION-6: during Phase B, `role` in the audit payload is still
    // the legacy column value (dual-write keeps it in sync), so the audit
    // log content is unchanged. Phase D cutover will switch this to the
    // canonical UserRole key.
    await logAudit({
      actorId: sessionUser.id,
      actorType: "ADMIN",
      action: "admin.users.update",
      entityType: "User",
      entityId: updated.id,
      before: { firstName: existing.firstName, lastName: existing.lastName, email: existing.email, role: existing.role, status: existing.status, companyName: existing.companyName },
      after: { firstName: updated.firstName, lastName: updated.lastName, email: updated.email, role: updated.role, status: updated.status, companyName: updated.companyName },
      reason: "via admin API",
    }).catch(() => {
      /* audit failure does not roll back the mutation */
    });

    return NextResponse.json({ success: true, data: serializeUser(updated) });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}

/* DELETE /api/admin/users/[id] — delete user.
   Listings remain (onDelete: SetNull on Listing.seller relation),
   so historical data is preserved.
   (P0-RBAC: requires security.manage — destructive user deletion is reserved
    for security administrators; user.suspend covers the non-destructive case.)
*/
export async function DELETE(_req: Request, { params }: Args) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasPermission(sessionUser.id, "security.manage"))) {
    return NextResponse.json(
      { error: "Forbidden: missing permission 'security.manage'" },
      { status: 403 },
    );
  }
  try {
    const { id } = await params;
    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Delete the user. Cascade rules in the schema will handle:
    // - Session: onDelete: Cascade → sessions deleted
    // - VerificationCode: onDelete: Cascade → codes deleted
    // - Listing.seller: onDelete: SetNull → listings survive with sellerId=null
    // - BuyRequest.user: check schema (cascade) → may delete or set null
    // - Favorite.user: check schema
    // Most user-related tables use Cascade; the listing uses SetNull to preserve ad data.
    await db.user.delete({ where: { id } });
    await logAudit({
      actorId: sessionUser.id,
      actorType: "ADMIN",
      action: "admin.users.delete",
      entityType: "User",
      entityId: id,
      before: { firstName: existing.firstName, lastName: existing.lastName, email: existing.email, role: existing.role, status: existing.status },
      reason: "via admin API",
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
