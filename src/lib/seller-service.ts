/**
 * HEAVIX — Seller Service Layer (Wave 2A / Phase Marketplace-Deep)
 * ------------------------------------------------------------
 * Extracted seller lifecycle logic for the marketplace domain.
 *
 * Sellers are MAIN-DB entities (User with role=SELLER + the
 * FoundingSeller optional record — see prisma/schema.prisma).
 *
 * Schema reality (do NOT change the schema per Wave 2A constraints):
 *   model FoundingSeller {
 *     id        String   @id @default(cuid())
 *     userId    String   @unique
 *     badgeType String   @default("FOUNDING")
 *     benefits  String?
 *     active    Boolean  @default(true)
 *     createdAt DateTime @default(now())
 *   }
 *
 *   The task brief names `appliedAt/approvedAt/approvedBy` columns
 *   that do NOT exist on FoundingSeller. We preserve those
 *   semantics ENTIRELY in the audit trail (before/after + reason)
 *   rather than mutating the schema. The `active` flag encodes
 *   lifecycle state:
 *     active=false → PENDING (registered, awaiting verification)
 *     active=true  → VERIFIED (admin has approved)
 *     active=false → SUSPENDED (admin has suspended — only
 *                   distinguishable from PENDING via the audit
 *                   log; the route layer surfaces the audit
 *                   history so the operator can tell them apart)
 *
 *   To make the distinction observable to the admin UI, we
 *   additionally flip User.status to BLOCKED on suspend and
 *   back to ACTIVE on verify (the User model has its own
 *   `status` column independent of FoundingSeller.active).
 *
 * Responsibilities:
 *   - registerSeller({ userId, companyId?, userId_operator })
 *       Set User.role=SELLER + upsert FoundingSeller (active=false
 *       to mark PENDING). Optionally link the User to a Company
 *       (companyId). Audit: marketplace.seller.register.
 *
 *   - verifySeller(userId, verifiedBy)
 *       Flip FoundingSeller.active=true + User.status=ACTIVE (if
 *       currently PENDING). The verifiedBy userId is recorded in
 *       the audit `after.verifiedBy` field (no dedicated schema
 *       column exists). Audit: marketplace.seller.verify.
 *
 *   - suspendSeller(userId, reason, suspendedBy)
 *       Flip FoundingSeller.active=false + User.status=BLOCKED.
 *       The reason + suspendedBy are recorded in the audit
 *       `after` payload. Audit: marketplace.seller.suspend.
 *
 *   - getSellerProfile(userId)
 *       Return the seller's User row with company + foundingStatus
 *       + _count.listings (the marketplace-depth detail view).
 *
 * Audit convention:
 *   - Action keys: marketplace.seller.{register, verify, suspend}.
 *   - entityType: FoundingSeller (primary) for verify/suspend,
 *     and User for register (because the role mutation lives on
 *     the User row; the founding row is created in the same call).
 *   - actorType: ADMIN.
 *   - All audits are best-effort: logAudit never throws.
 *
 * Pattern mirrors src/lib/disputes-service.ts + the
 * store-*-service.ts files.
 */

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// ── Service error (maps to HTTP status in route handler) ──
export class SellerServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "SellerServiceError";
  }
}

// ── registerSeller ───────────────────────────────────────
/**
 * Register a user as a seller. Sets User.role=SELLER + upserts a
 * FoundingSeller row in the PENDING state (active=false). Optionally
 * links the user to a Company (companyId).
 *
 * Idempotent: re-calling registerSeller on an already-SELLER user
 * resets FoundingSeller.active=false (re-pending), which is the
 * documented admin workflow for re-verification.
 *
 * @throws SellerServiceError(400) when userId is empty.
 * @throws SellerServiceError(404) when the User does not exist.
 */
export async function registerSeller(params: {
  userId: string;
  companyId?: string | null;
  userId_operator?: string | null;
}): Promise<{
  id: string;
  userId: string;
  role: string;
  companyId: string | null;
  foundingStatusId: string;
  foundingActive: boolean;
}> {
  const { userId, companyId = null, userId_operator = null } = params;

  if (!userId || !userId.trim()) {
    throw new SellerServiceError(400, "userId الزامی است");
  }

  // ── Verify user exists ──
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true, companyId: true },
  });
  if (!user) {
    throw new SellerServiceError(404, "کاربر یافت نشد");
  }

  // ── 1. Assign canonical SELLER UserRole (+ optional companyId link) ──
  const sellerRole = await db.role.findUnique({
    where: { key: "SELLER" },
    select: { id: true, key: true },
  });
  if (!sellerRole) {
    throw new SellerServiceError(500, "نقش SELLER در RBAC تعریف نشده است");
  }

  const updatedUser = await db.user.update({
    where: { id: userId },
    data: companyId ? { companyId } : {},
    select: { id: companyId ? true : true, companyId: true },
  });

  await db.userRole.upsert({
    where: { userId_roleId: { userId, roleId: sellerRole.id } },
    create: { userId, roleId: sellerRole.id },
    update: {},
  });

  // ── 2. Upsert FoundingSeller in PENDING state (active=false) ──
  // active=false means "awaiting admin verification" per the
  // Wave 2A active-flag encoding (see file header).
  const founding = await db.foundingSeller.upsert({
    where: { userId },
    create: {
      userId,
      badgeType: "FOUNDING",
      active: false,
    },
    update: { active: false },
    select: { id: true, userId: true, active: true },
  });

  // ── 3. Audit ──
  await logAudit({
    actorId: userId_operator ?? null,
    actorType: "ADMIN",
    action: "marketplace.seller.register",
    entityType: "FoundingSeller",
    entityId: founding.id,
    after: {
      userId,
      role: sellerRole.key,
      companyId: companyId ?? null,
      foundingStatusId: founding.id,
      foundingActive: false,
    },
    reason: `ثبت‌نام فروشنده جدید: ${userId}`,
  });

  return {
    id: updatedUser.id,
    userId: updatedUser.id,
    role: sellerRole.key,
    companyId: updatedUser.companyId ?? null,
    foundingStatusId: founding.id,
    foundingActive: founding.active,
  };
}

// ── verifySeller ─────────────────────────────────────────
/**
 * Verify a seller — flip FoundingSeller.active=true (VERIFIED).
 * If the user's User.status is PENDING, also flip it to ACTIVE
 * (the public-facing status field).
 *
 * The `verifiedBy` actor is captured in the audit `after`
 * payload — there is no dedicated schema column on
 * FoundingSeller for it (per Wave 2A "no schema changes"
 * constraint).
 *
 * @throws SellerServiceError(400) when userId is empty.
 * @throws SellerServiceError(404) when the user has no
 *   FoundingSeller row (registerSeller must be called first).
 */
export async function verifySeller(
  userId: string,
  verifiedBy: string | null,
): Promise<{
  id: string;
  userId: string;
  foundingActive: boolean;
  userStatus: string;
}> {
  if (!userId || !userId.trim()) {
    throw new SellerServiceError(400, "userId الزامی است");
  }

  // ── 1. Load current FoundingSeller for the before snapshot ──
  const before = await db.foundingSeller.findUnique({
    where: { userId },
    select: { id: true, active: true },
  });
  if (!before) {
    throw new SellerServiceError(
      404,
      "FoundingSeller یافت نشد — ابتدا registerSeller را فراخوانی کنید",
    );
  }

  // ── 2. Flip FoundingSeller.active=true ──
  const after = await db.foundingSeller.update({
    where: { userId },
    data: { active: true },
    select: { id: true, userId: true, active: true },
  });

  // ── 3. Best-effort: flip User.status PENDING → ACTIVE ──
  // Mirrors the public-facing "verified" semantics so the
  // admin UI's status badge reflects the verification.
  let userStatus = "UNKNOWN";
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (user) {
      if (user.status === "PENDING" || user.status === "BLOCKED") {
        const updated = await db.user.update({
          where: { id: userId },
          data: { status: "ACTIVE" },
          select: { status: true },
        });
        userStatus = updated.status;
      } else {
        userStatus = user.status;
      }
    }
  } catch (err) {
    // Non-fatal — the founding flag is the source of truth.
    console.error("[seller-service] User.status flip failed:", err);
  }

  // ── 4. Audit ──
  await logAudit({
    actorId: verifiedBy ?? null,
    actorType: "ADMIN",
    action: "marketplace.seller.verify",
    entityType: "FoundingSeller",
    entityId: after.id,
    before: { active: before.active },
    after: {
      active: true,
      verifiedBy,
      userStatus,
    },
    reason: `تأیید فروشنده: ${userId}`,
  });

  return {
    id: after.id,
    userId: after.userId,
    foundingActive: after.active,
    userStatus,
  };
}

// ── suspendSeller ─────────────────────────────────────────
/**
 * Suspend a seller — flip FoundingSeller.active=false + User.status
 * =BLOCKED. The reason + suspendedBy are captured in the audit
 * trail.
 *
 * @throws SellerServiceError(400) when userId or reason is empty.
 * @throws SellerServiceError(404) when the user has no
 *   FoundingSeller row.
 */
export async function suspendSeller(
  userId: string,
  reason: string,
  suspendedBy: string | null,
): Promise<{
  id: string;
  userId: string;
  foundingActive: boolean;
  userStatus: string;
}> {
  if (!userId || !userId.trim()) {
    throw new SellerServiceError(400, "userId الزامی است");
  }
  if (!reason || !reason.trim()) {
    throw new SellerServiceError(400, "دلیل تعلیق الزامی است");
  }

  // ── 1. Load current FoundingSeller for the before snapshot ──
  const before = await db.foundingSeller.findUnique({
    where: { userId },
    select: { id: true, active: true },
  });
  if (!before) {
    throw new SellerServiceError(
      404,
      "FoundingSeller یافت نشد — ابتدا registerSeller را فراخوانی کنید",
    );
  }

  // ── 2. Flip FoundingSeller.active=false ──
  const after = await db.foundingSeller.update({
    where: { userId },
    data: { active: false },
    select: { id: true, userId: true, active: true },
  });

  // ── 3. Best-effort: flip User.status → BLOCKED ──
  // The user can no longer log in once blocked (auth.ts checks
  // session validity, but User.status is the public signal for
  // admin views + downstream services).
  let userStatus = "UNKNOWN";
  try {
    const updated = await db.user.update({
      where: { id: userId },
      data: { status: "BLOCKED" },
      select: { status: true },
    });
    userStatus = updated.status;
  } catch (err) {
    console.error("[seller-service] User.status flip failed:", err);
  }

  // ── 4. Audit ──
  const trimmedReason = reason.trim().slice(0, 2000);
  await logAudit({
    actorId: suspendedBy ?? null,
    actorType: "ADMIN",
    action: "marketplace.seller.suspend",
    entityType: "FoundingSeller",
    entityId: after.id,
    before: { active: before.active },
    after: {
      active: false,
      reason: trimmedReason,
      suspendedBy,
      userStatus,
    },
    reason: `تعلیق فروشنده: ${userId} — ${trimmedReason}`,
  });

  return {
    id: after.id,
    userId: after.userId,
    foundingActive: after.active,
    userStatus,
  };
}

// ── getSellerProfile ─────────────────────────────────────
/**
 * Return the seller profile: the User row (must have role=SELLER)
 * with company + foundingStatus + _count.listings for the
 * admin detail page.
 *
 * @throws SellerServiceError(400) when userId is empty.
 * @throws SellerServiceError(404) when the user does not exist
 *   or is not a seller.
 */
export async function getSellerProfile(userId: string): Promise<{
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  role: string;
  status: string;
  userType: string;
  companyName: string | null;
  companyId: string | null;
  emailVerified: boolean;
  mobileVerified: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  company: {
    id: string;
    name: string;
    slug: string;
    verified: boolean;
    status: string;
  } | null;
  foundingStatus: {
    id: string;
    badgeType: string;
    benefits: string | null;
    active: boolean;
    createdAt: Date;
  } | null;
  listingsCount: number;
}> {
  if (!userId || !userId.trim()) {
    throw new SellerServiceError(400, "userId الزامی است");
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      foundingStatus: true,
      company: {
        select: {
          id: true,
          name: true,
          slug: true,
          verified: true,
          status: true,
        },
      },
      _count: { select: { listings: true } },
    },
  });

  if (!user) {
    throw new SellerServiceError(404, "کاربر یافت نشد");
  }

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    mobile: user.mobile,
    role: user.role,
    status: user.status,
    userType: user.userType,
    companyName: user.companyName,
    companyId: user.companyId,
    emailVerified: user.emailVerified,
    mobileVerified: user.mobileVerified,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    company: user.company,
    foundingStatus: user.foundingStatus,
    listingsCount: user._count.listings,
  };
}
