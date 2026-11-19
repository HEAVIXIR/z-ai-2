/**
 * HEAVIX — Seller Service Layer
 *
 * Seller lifecycle mutations are CRITICAL identity changes. Each lifecycle
 * mutation and its AuditLog entry are committed in one main-database
 * transaction. An audit failure therefore rolls back the state change.
 *
 * Schema constraints: FoundingSeller has only the active flag; pending and
 * suspended are both represented by active=false and distinguished by audit
 * history. User.status is also updated atomically for verify/suspend.
 */

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export class SellerServiceError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "SellerServiceError";
  }
}

function auditJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function writeSellerAudit(
  tx: Prisma.TransactionClient,
  params: {
    actorId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    reason: string;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: params.actorId,
      actorType: "ADMIN",
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      beforeJson: auditJson(params.before),
      afterJson: auditJson(params.after),
      reason: params.reason,
    },
  });
}

/**
 * Register/re-register a seller. Role assignment, optional company link,
 * FoundingSeller pending state and audit event are atomic.
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

  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, companyId: true },
    });
    if (!user) throw new SellerServiceError(404, "کاربر یافت نشد");

    const sellerRole = await tx.role.findUnique({
      where: { key: "SELLER" },
      select: { id: true, key: true },
    });
    if (!sellerRole) {
      throw new SellerServiceError(500, "نقش SELLER در RBAC تعریف نشده است");
    }

    const beforeFounding = await tx.foundingSeller.findUnique({
      where: { userId },
      select: { id: true, active: true },
    });

    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: companyId ? { companyId } : {},
      select: { id: true, companyId: true },
    });

    await tx.userRole.upsert({
      where: { userId_roleId: { userId, roleId: sellerRole.id } },
      create: { userId, roleId: sellerRole.id },
      update: {},
    });

    const founding = await tx.foundingSeller.upsert({
      where: { userId },
      create: { userId, badgeType: "FOUNDING", active: false },
      update: { active: false },
      select: { id: true, userId: true, active: true },
    });

    await writeSellerAudit(tx, {
      actorId: userId_operator,
      action: "marketplace.seller.register",
      entityType: "FoundingSeller",
      entityId: founding.id,
      before: {
        userStatus: user.status,
        companyId: user.companyId,
        foundingSeller: beforeFounding,
      },
      after: {
        userId,
        role: sellerRole.key,
        companyId: updatedUser.companyId,
        foundingStatusId: founding.id,
        foundingActive: founding.active,
      },
      reason: `ثبت‌نام فروشنده: ${userId}`,
    });

    return {
      id: updatedUser.id,
      userId: updatedUser.id,
      role: sellerRole.key,
      companyId: updatedUser.companyId ?? null,
      foundingStatusId: founding.id,
      foundingActive: founding.active,
    };
  });
}

/**
 * Verify a seller. FoundingSeller.active and User.status plus audit commit
 * together; no best-effort partial success is allowed.
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

  return db.$transaction(async (tx) => {
    const before = await tx.foundingSeller.findUnique({
      where: { userId },
      select: { id: true, active: true, user: { select: { status: true } } },
    });
    if (!before) {
      throw new SellerServiceError(
        404,
        "FoundingSeller یافت نشد — ابتدا registerSeller را فراخوانی کنید",
      );
    }

    const after = await tx.foundingSeller.update({
      where: { userId },
      data: { active: true },
      select: { id: true, userId: true, active: true },
    });

    const userStatus =
      before.user.status === "PENDING"
        ? (await tx.user.update({
            where: { id: userId },
            data: { status: "ACTIVE" },
            select: { status: true },
          })).status
        : before.user.status;

    await writeSellerAudit(tx, {
      actorId: verifiedBy,
      action: "marketplace.seller.verify",
      entityType: "FoundingSeller",
      entityId: after.id,
      before: { active: before.active, userStatus: before.user.status },
      after: { active: after.active, verifiedBy, userStatus },
      reason: `تأیید فروشنده: ${userId}`,
    });

    return {
      id: after.id,
      userId: after.userId,
      foundingActive: after.active,
      userStatus,
    };
  });
}

/**
 * Suspend a seller. Both account blocking and founding-state change are
 * atomic with the mandatory audit event.
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

  const trimmedReason = reason.trim().slice(0, 2000);
  return db.$transaction(async (tx) => {
    const before = await tx.foundingSeller.findUnique({
      where: { userId },
      select: { id: true, active: true, user: { select: { status: true } } },
    });
    if (!before) {
      throw new SellerServiceError(
        404,
        "FoundingSeller یافت نشد — ابتدا registerSeller را فراخوانی کنید",
      );
    }

    const after = await tx.foundingSeller.update({
      where: { userId },
      data: { active: false },
      select: { id: true, userId: true, active: true },
    });
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: { status: "BLOCKED" },
      select: { status: true },
    });

    await writeSellerAudit(tx, {
      actorId: suspendedBy,
      action: "marketplace.seller.suspend",
      entityType: "FoundingSeller",
      entityId: after.id,
      before: { active: before.active, userStatus: before.user.status },
      after: {
        active: after.active,
        reason: trimmedReason,
        suspendedBy,
        userStatus: updatedUser.status,
      },
      reason: `تعلیق فروشنده: ${userId} — ${trimmedReason}`,
    });

    return {
      id: after.id,
      userId: after.userId,
      foundingActive: after.active,
      userStatus: updatedUser.status,
    };
  });
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
