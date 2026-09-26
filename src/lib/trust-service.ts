/**
 * HEAVIX — Trust & Verification Service Layer (Phase 5)
 * ------------------------------------------------------------
 * Extracted verification lifecycle logic for the trust domain.
 *
 * This service is the canonical implementation behind the
 * /api/admin/verifications/* routes and the public
 * /api/trust/[entityType]/[entityId] route. It writes audit entries
 * to the MAIN PostgreSQL AuditLog table via `logAudit` (same as
 * src/lib/admin/audit.ts).
 *
 * The CompanyVerification schema (prisma/schema.prisma) defines the
 * PENDING | UNDER_REVIEW | VERIFIED | REJECTED | EXPIRED | REVOKED
 * status vocabulary and the evidence/expiresAt/revokedAt/revokedBy/
 * revokeReason columns. This service drives those transitions.
 *
 * Responsibilities:
 *   - submitVerification({ entityType, entityId, verificationType,
 *       evidence, submittedBy })
 *       Create a CompanyVerification row in PENDING status. The
 *       `entityType` discriminator is currently 'COMPANY' (the only
 *       verification-bearing entity in the schema) but the param is
 *       accepted to keep the API forward-compatible with future
 *       USER/SELLER verifications. Audited as
 *       `trust.verification.submit`.
 *
 *   - reviewVerification(verificationId, { status, reviewNotes,
 *       reviewedBy, expiresAt? })
 *       Transition PENDING → UNDER_REVIEW → VERIFIED | REJECTED.
 *       When status=VERIFIED, the parent Company.verified flag is
 *       flipped to true. When status=REJECTED, the flag is left
 *       alone unless this was the company's only verification. The
 *       optional `expiresAt` is honoured on VERIFIED transitions.
 *       Audited as `trust.verification.review`.
 *
 *   - revokeVerification(verificationId, reason, revokedBy)
 *       Transition VERIFIED → REVOKED. Stamps revokedAt, revokedBy,
 *       revokeReason. The parent Company.verified flag is flipped
 *       back to false IF no other VERIFIED verification exists for
 *       that company. Audited as `trust.verification.revoke`.
 *
 *   - getTrustProfile(entityType, entityId)
 *       Return the *current* verification status for an entity:
 *       status, verificationType, verifiedAt (=reviewedAt),
 *       expiresAt, reviewedBy, evidence (raw JSON string), plus
 *       the full history of every verification row for that entity.
 *
 *   - checkVerificationExpiry()
 *       Find every VERIFIED verification whose expiresAt < now and
 *       flip it to EXPIRED. The parent Company.verified flag is
 *       flipped back to false IF no other VERIFIED verification
 *       exists for that company. Each expiration is audited as
 *       `trust.verification.expired` (best-effort).
 *
 *   - getVerificationHistory(entityId)
 *       Return all CompanyVerification rows for a given entityId
 *       ordered by submittedAt desc.
 *
 * Audit convention:
 *   - Action keys: `trust.verification.{submit,review,revoke,expired}`.
 *   - entityType: `CompanyVerification` for the primary record.
 *   - actorType: 'ADMIN' (the human reviewer) on submit/review/revoke
 *     and 'SYSTEM' on the expiry sweep (no human actor).
 *   - All audits are best-effort: a thrown audit helper NEVER fails
 *     the service mutation (mirrors src/lib/admin/audit.ts).
 *
 * Pattern mirrors src/lib/disputes-service.ts and
 * src/lib/store-{inventory,returns,shipments,procurement}-service.ts.
 */

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// ── Service error (maps to HTTP status in route handler) ──
export class TrustServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "TrustServiceError";
  }
}

// ── Entity types ──────────────────────────────────────────
/**
 * The schema currently only models company verifications
 * (CompanyVerification.companyId → Company). We accept a wider
 * vocabulary so future USER/SELLER verifications don't need an API
 * rename — the service will refuse non-COMPANY with 400 today.
 */
const ALLOWED_ENTITY_TYPES = ["COMPANY"] as const;
type EntityType = (typeof ALLOWED_ENTITY_TYPES)[number];

function isEntityType(s: string): s is EntityType {
  return (ALLOWED_ENTITY_TYPES as readonly string[]).includes(s);
}

// ── Verification types (mirror schema comment) ────────────
const ALLOWED_VERIFICATION_TYPES = [
  "PHONE",
  "EMAIL",
  "BUSINESS",
  "DOCUMENT",
  "INSPECTION",
] as const;
type VerificationType = (typeof ALLOWED_VERIFICATION_TYPES)[number];

function isVerificationType(s: string): s is VerificationType {
  return (ALLOWED_VERIFICATION_TYPES as readonly string[]).includes(s);
}

// ── Status vocabulary (mirror schema comment) ─────────────
export const VERIFICATION_STATUS = {
  PENDING: "PENDING",
  UNDER_REVIEW: "UNDER_REVIEW",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
} as const;

// ── Review target statuses (the values `reviewVerification`
//    is allowed to move a verification to) ──────────────────
const ALLOWED_REVIEW_STATUSES = [
  VERIFICATION_STATUS.UNDER_REVIEW,
  VERIFICATION_STATUS.VERIFIED,
  VERIFICATION_STATUS.REJECTED,
] as const;
type ReviewStatus = (typeof ALLOWED_REVIEW_STATUSES)[number];

function isReviewStatus(s: string): s is ReviewStatus {
  return (ALLOWED_REVIEW_STATUSES as readonly string[]).includes(s);
}

// ── Evidence sanitiser ──────────────────────────────────────
/**
 * The evidence column is a JSON-string column. The admin page
 * extracts `[{ type, url, description }]` from it. We accept
 * either an array or an object and serialise; everything else
 * is rejected with 400 to keep the column data shape predictable.
 */
function serializeEvidence(evidence: unknown): string | null {
  if (evidence === null || evidence === undefined) return null;
  if (typeof evidence === "string") {
    // Already serialised — verify it parses (best-effort).
    try {
      JSON.parse(evidence);
      return evidence;
    } catch {
      // Treat as opaque string note (rare).
      return JSON.stringify({ note: evidence });
    }
  }
  if (Array.isArray(evidence) || typeof evidence === "object") {
    return JSON.stringify(evidence);
  }
  throw new TrustServiceError(400, "evidence باید آرایه یا شیء باشد");
}

// ── submitVerification ─────────────────────────────────────
/**
 * Create a new CompanyVerification row in PENDING status.
 *
 * @throws TrustServiceError(400) on validation failure.
 * @throws TrustServiceError(404) when the referenced Company does
 *   not exist (only for entityType=COMPANY).
 */
export async function submitVerification(params: {
  entityType: string;
  entityId: string;
  verificationType?: string;
  evidence?: unknown;
  submittedBy: string;
  notes?: string | null;
}): Promise<{
  id: string;
  status: string;
  verificationType: string;
  entityId: string;
  entityType: string;
}> {
  const {
    entityType,
    entityId,
    verificationType = "BUSINESS",
    evidence = null,
    submittedBy,
    notes = null,
  } = params;

  // ── Validate ──
  if (!submittedBy) {
    throw new TrustServiceError(400, "submittedBy الزامی است");
  }
  if (!entityId) {
    throw new TrustServiceError(400, "entityId الزامی است");
  }
  if (!isEntityType(String(entityType).toUpperCase())) {
    throw new TrustServiceError(
      400,
      `entityType نامعتبر (مجاز: ${ALLOWED_ENTITY_TYPES.join(" | ")})`,
    );
  }
  const vType = String(verificationType).toUpperCase();
  if (!isVerificationType(vType)) {
    throw new TrustServiceError(
      400,
      `verificationType نامعتبر (مجاز: ${ALLOWED_VERIFICATION_TYPES.join(" | ")})`,
    );
  }

  // For COMPANY, verify the parent Company row exists.
  if (entityType === "COMPANY") {
    const company = await db.company.findUnique({
      where: { id: entityId },
      select: { id: true, name: true, slug: true },
    });
    if (!company) {
      throw new TrustServiceError(404, "شرکت یافت نشد");
    }
  }

  // ── Persist ──
  const verif = await db.companyVerification.create({
    data: {
      companyId: entityId,
      verificationType: vType,
      status: VERIFICATION_STATUS.PENDING,
      evidence: serializeEvidence(evidence),
      notes: notes ? String(notes).slice(0, 2000) : null,
    },
    select: {
      id: true,
      status: true,
      verificationType: true,
      companyId: true,
    },
  });

  // ── Audit ──
  await logAudit({
    actorId: submittedBy,
    actorType: "ADMIN",
    action: "trust.verification.submit",
    entityType: "CompanyVerification",
    entityId: verif.id,
    after: {
      entityType,
      entityId: verif.companyId,
      verificationType: verif.verificationType,
      status: verif.status,
    },
    reason: `ثبت درخواست تأیید (${verif.verificationType}) برای ${entityType}:${entityId}`,
  });

  return {
    id: verif.id,
    status: verif.status,
    verificationType: verif.verificationType,
    entityId: verif.companyId,
    entityType,
  };
}

// ── reviewVerification ────────────────────────────────────
/**
 * Transition a verification through the review pipeline.
 *
 * Allowed status values: UNDER_REVIEW, VERIFIED, REJECTED.
 * The transition is permissive: an admin can move directly from
 * PENDING → VERIFIED, or PENDING → UNDER_REVIEW → VERIFIED.
 *
 * - VERIFIED: stamps reviewedAt + reviewedBy, optionally sets
 *   expiresAt (when provided), and flips Company.verified=true.
 * - REJECTED: stamps reviewedAt + reviewedBy.
 * - UNDER_REVIEW: stamps reviewedAt + reviewedBy (informational).
 *
 * @throws TrustServiceError(404) when the verification does not exist.
 * @throws TrustServiceError(400) on validation failure or illegal
 *   transition (e.g. trying to review a REVOKED row).
 */
export async function reviewVerification(params: {
  verificationId: string;
  status: string;
  reviewNotes?: string | null;
  reviewedBy: string;
  expiresAt?: string | Date | null;
}): Promise<{
  id: string;
  status: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  expiresAt: string | null;
}> {
  const {
    verificationId,
    status,
    reviewNotes = null,
    reviewedBy,
    expiresAt = null,
  } = params;

  // ── Validate ──
  if (!verificationId) {
    throw new TrustServiceError(400, "verificationId الزامی است");
  }
  if (!reviewedBy) {
    throw new TrustServiceError(400, "reviewedBy الزامی است");
  }
  const newStatus = String(status).toUpperCase();
  if (!isReviewStatus(newStatus)) {
    throw new TrustServiceError(
      400,
      `status نامعتبر (مجاز: ${ALLOWED_REVIEW_STATUSES.join(" | ")})`,
    );
  }

  // ── Load existing ──
  const existing = await db.companyVerification.findUnique({
    where: { id: verificationId },
    include: { company: { select: { id: true, verified: true } } },
  });
  if (!existing) {
    throw new TrustServiceError(404, "تأیید یافت نشد");
  }

  // Refuse review on closed lifecycle rows.
  if (
    existing.status === VERIFICATION_STATUS.REVOKED ||
    existing.status === VERIFICATION_STATUS.EXPIRED
  ) {
    throw new TrustServiceError(
      400,
      `تأیید در وضعیت ${existing.status} است — امکان بررسی وجود ندارد`,
    );
  }

  // ── Update row ──
  const updateData: {
    status: string;
    reviewedAt: Date;
    reviewedBy: string;
    notes?: string | null;
    expiresAt?: Date | null;
  } = {
    status: newStatus,
    reviewedAt: new Date(),
    reviewedBy,
    notes: reviewNotes ? String(reviewNotes).slice(0, 2000) : existing.notes,
  };

  if (newStatus === VERIFICATION_STATUS.VERIFIED && expiresAt) {
    const d = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
    if (!isNaN(d.getTime())) {
      updateData.expiresAt = d;
    }
  }

  const updated = await db.companyVerification.update({
    where: { id: verificationId },
    data: updateData,
    select: {
      id: true,
      status: true,
      reviewedAt: true,
      reviewedBy: true,
      expiresAt: true,
      companyId: true,
    },
  });

  // ── Side-effect: Company.verified flag ──
  if (newStatus === VERIFICATION_STATUS.VERIFIED) {
    try {
      await db.company.update({
        where: { id: existing.companyId },
        data: { verified: true },
      });
    } catch {
      /* non-fatal — audit trail records the intent */
    }
  } else if (newStatus === VERIFICATION_STATUS.REJECTED) {
    // Only unverify if no other VERIFIED verification exists.
    const other = await db.companyVerification.count({
      where: {
        companyId: existing.companyId,
        status: VERIFICATION_STATUS.VERIFIED,
        id: { not: verificationId },
      },
    });
    if (other === 0) {
      try {
        await db.company.update({
          where: { id: existing.companyId },
          data: { verified: false },
        });
      } catch {
        /* non-fatal */
      }
    }
  }

  // ── Audit ──
  await logAudit({
    actorId: reviewedBy,
    actorType: "ADMIN",
    action: "trust.verification.review",
    entityType: "CompanyVerification",
    entityId: verificationId,
    before: { status: existing.status },
    after: {
      status: newStatus,
      reviewedBy,
      expiresAt: updateData.expiresAt ?? null,
    },
    reason: `بررسی تأیید: ${existing.status} → ${newStatus}`,
  });

  return {
    id: updated.id,
    status: updated.status,
    reviewedAt: updated.reviewedAt ? updated.reviewedAt.toISOString() : null,
    reviewedBy: updated.reviewedBy,
    expiresAt: updated.expiresAt ? updated.expiresAt.toISOString() : null,
  };
}

// ── revokeVerification ─────────────────────────────────────
/**
 * Transition a VERIFIED verification → REVOKED. Stamps revokedAt,
 * revokedBy, revokeReason. Flips Company.verified=false if no
 * other VERIFIED verification exists for that company.
 *
 * @throws TrustServiceError(404) when the verification does not exist.
 * @throws TrustServiceError(400) when the row is not in VERIFIED
 *   status (you can only revoke an active verification).
 */
export async function revokeVerification(params: {
  verificationId: string;
  reason: string;
  revokedBy: string;
}): Promise<{
  id: string;
  status: string;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
}> {
  const { verificationId, reason, revokedBy } = params;

  // ── Validate ──
  if (!verificationId) {
    throw new TrustServiceError(400, "verificationId الزامی است");
  }
  if (!revokedBy) {
    throw new TrustServiceError(400, "revokedBy الزامی است");
  }
  if (!reason || reason.trim().length < 3) {
    throw new TrustServiceError(
      400,
      "دلیل ابطال الزامی است (حداقل ۳ حرف)",
    );
  }

  // ── Load existing ──
  const existing = await db.companyVerification.findUnique({
    where: { id: verificationId },
    include: { company: { select: { id: true, verified: true } } },
  });
  if (!existing) {
    throw new TrustServiceError(404, "تأیید یافت نشد");
  }
  if (existing.status !== VERIFICATION_STATUS.VERIFIED) {
    throw new TrustServiceError(
      400,
      `فقط تأیید در وضعیت VERIFIED قابل ابطال است (وضعیت فعلی: ${existing.status})`,
    );
  }

  // ── Update row ──
  const updated = await db.companyVerification.update({
    where: { id: verificationId },
    data: {
      status: VERIFICATION_STATUS.REVOKED,
      revokedAt: new Date(),
      revokedBy,
      revokeReason: reason.trim().slice(0, 1000),
    },
    select: {
      id: true,
      status: true,
      revokedAt: true,
      revokedBy: true,
      revokeReason: true,
      companyId: true,
    },
  });

  // ── Side-effect: Company.verified flag ──
  const other = await db.companyVerification.count({
    where: {
      companyId: existing.companyId,
      status: VERIFICATION_STATUS.VERIFIED,
      id: { not: verificationId },
    },
  });
  if (other === 0) {
    try {
      await db.company.update({
        where: { id: existing.companyId },
        data: { verified: false },
      });
    } catch {
      /* non-fatal */
    }
  }

  // ── Audit ──
  await logAudit({
    actorId: revokedBy,
    actorType: "ADMIN",
    action: "trust.verification.revoke",
    entityType: "CompanyVerification",
    entityId: verificationId,
    before: { status: existing.status },
    after: {
      status: VERIFICATION_STATUS.REVOKED,
      revokedBy,
      revokeReason: reason,
    },
    reason: `ابطال تأیید: ${reason}`,
  });

  return {
    id: updated.id,
    status: updated.status,
    revokedAt: updated.revokedAt ? updated.revokedAt.toISOString() : null,
    revokedBy: updated.revokedBy,
    revokeReason: updated.revokeReason,
  };
}

// ── getTrustProfile ────────────────────────────────────────
/**
 * Return the *current* verification status for an entity, plus the
 * full history of every verification row for that entity.
 *
 * The shape returned here is the FULL profile (admin context). The
 * public /api/trust/[entityType]/[entityId] route redacts evidence
 * and reviewNotes/revokeReason before returning its slimmed-down
 * shape.
 *
 * @throws TrustServiceError(400) on bad entityType.
 */
export async function getTrustProfile(params: {
  entityType: string;
  entityId: string;
}): Promise<{
  entityType: string;
  entityId: string;
  current: {
    id: string;
    status: string;
    verificationType: string;
    submittedAt: string;
    reviewedAt: string | null;
    reviewedBy: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
    revokedBy: string | null;
    revokeReason: string | null;
    evidence: string | null;
    notes: string | null;
  } | null;
  history: Array<{
    id: string;
    status: string;
    verificationType: string;
    submittedAt: string;
    reviewedAt: string | null;
    reviewedBy: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
    revokedBy: string | null;
    revokeReason: string | null;
    notes: string | null;
  }>;
}> {
  const { entityType, entityId } = params;

  if (!entityId) {
    throw new TrustServiceError(400, "entityId الزامی است");
  }
  if (!isEntityType(String(entityType).toUpperCase())) {
    throw new TrustServiceError(
      400,
      `entityType نامعتبر (مجاز: ${ALLOWED_ENTITY_TYPES.join(" | ")})`,
    );
  }

  // History (all rows for this entity).
  const rows = await db.companyVerification.findMany({
    where: { companyId: entityId },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      status: true,
      verificationType: true,
      submittedAt: true,
      reviewedAt: true,
      reviewedBy: true,
      expiresAt: true,
      revokedAt: true,
      revokedBy: true,
      revokeReason: true,
      evidence: true,
      notes: true,
    },
  });

  // "Current" = the most recent non-REVOKED, non-EXPIRED row, or
  // if none qualify, the most recent row overall (so admins can
  // see the revoked/expired state on the trust profile too).
  const current =
    rows.find(
      (r) =>
        r.status !== VERIFICATION_STATUS.REVOKED &&
        r.status !== VERIFICATION_STATUS.EXPIRED,
    ) ?? rows[0] ?? null;

  const toISO = (d: Date | null | undefined): string | null =>
    d ? d.toISOString() : null;

  return {
    entityType: String(entityType).toUpperCase(),
    entityId,
    current: current
      ? {
          id: current.id,
          status: current.status,
          verificationType: current.verificationType,
          submittedAt: current.submittedAt.toISOString(),
          reviewedAt: toISO(current.reviewedAt),
          reviewedBy: current.reviewedBy,
          expiresAt: toISO(current.expiresAt),
          revokedAt: toISO(current.revokedAt),
          revokedBy: current.revokedBy,
          revokeReason: current.revokeReason,
          evidence: current.evidence,
          notes: current.notes,
        }
      : null,
    history: rows.map((r) => ({
      id: r.id,
      status: r.status,
      verificationType: r.verificationType,
      submittedAt: r.submittedAt.toISOString(),
      reviewedAt: toISO(r.reviewedAt),
      reviewedBy: r.reviewedBy,
      expiresAt: toISO(r.expiresAt),
      revokedAt: toISO(r.revokedAt),
      revokedBy: r.revokedBy,
      revokeReason: r.revokeReason,
      notes: r.notes,
    })),
  };
}

// ── checkVerificationExpiry ───────────────────────────────
/**
 * Find every VERIFIED verification whose expiresAt < now and flip
 * it to EXPIRED. Each expiration is audited as
 * `trust.verification.expired`. The parent Company.verified flag
 * is flipped back to false IF no other VERIFIED verification
 * exists for that company.
 *
 * This function is idempotent: re-running it on the same state
 * produces no further transitions.
 *
 * @returns number of verifications transitioned to EXPIRED.
 */
export async function checkVerificationExpiry(): Promise<{
  expiredCount: number;
  expiredIds: string[];
}> {
  const now = new Date();
  const expired = await db.companyVerification.findMany({
    where: {
      status: VERIFICATION_STATUS.VERIFIED,
      expiresAt: { lt: now },
    },
    select: {
      id: true,
      companyId: true,
      verificationType: true,
      expiresAt: true,
    },
  });

  if (expired.length === 0) {
    return { expiredCount: 0, expiredIds: [] };
  }

  const expiredIds: string[] = [];
  for (const v of expired) {
    try {
      await db.companyVerification.update({
        where: { id: v.id },
        data: { status: VERIFICATION_STATUS.EXPIRED },
      });
      expiredIds.push(v.id);

      // Side-effect: maybe unverify the company.
      const other = await db.companyVerification.count({
        where: {
          companyId: v.companyId,
          status: VERIFICATION_STATUS.VERIFIED,
          id: { not: v.id },
        },
      });
      if (other === 0) {
        try {
          await db.company.update({
            where: { id: v.companyId },
            data: { verified: false },
          });
        } catch {
          /* non-fatal */
        }
      }

      // ── Audit (SYSTEM actor — no human trigger) ──
      await logAudit({
        actorId: null,
        actorType: "SYSTEM",
        action: "trust.verification.expired",
        entityType: "CompanyVerification",
        entityId: v.id,
        before: { status: VERIFICATION_STATUS.VERIFIED },
        after: { status: VERIFICATION_STATUS.EXPIRED, expiresAt: v.expiresAt },
        reason: `انقضای خودکار تأیید (${v.verificationType}) در ${v.expiresAt?.toISOString()}`,
      });
    } catch (err) {
      // Non-fatal: a failed single-row transition must not abort
      // the rest of the sweep.
      console.error(
        "[trust-service] checkVerificationExpiry: failed to expire",
        v.id,
        err,
      );
    }
  }

  return { expiredCount: expiredIds.length, expiredIds };
}

// ── getVerificationHistory ─────────────────────────────────
/**
 * Return all CompanyVerification rows for a given entityId ordered
 * by submittedAt desc. This is the same data as the `history`
 * field of `getTrustProfile` but exposed as a standalone query for
 * the admin detail page's "history" section.
 *
 * @throws TrustServiceError(400) on empty entityId.
 */
export async function getVerificationHistory(entityId: string): Promise<
  Array<{
    id: string;
    status: string;
    verificationType: string;
    submittedAt: string;
    reviewedAt: string | null;
    reviewedBy: string | null;
    expiresAt: string | null;
    revokedAt: string | null;
    revokedBy: string | null;
    revokeReason: string | null;
    notes: string | null;
  }>
> {
  if (!entityId) {
    throw new TrustServiceError(400, "entityId الزامی است");
  }

  const rows = await db.companyVerification.findMany({
    where: { companyId: entityId },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      status: true,
      verificationType: true,
      submittedAt: true,
      reviewedAt: true,
      reviewedBy: true,
      expiresAt: true,
      revokedAt: true,
      revokedBy: true,
      revokeReason: true,
      notes: true,
    },
  });

  const toISO = (d: Date | null | undefined): string | null =>
    d ? d.toISOString() : null;

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    verificationType: r.verificationType,
    submittedAt: r.submittedAt.toISOString(),
    reviewedAt: toISO(r.reviewedAt),
    reviewedBy: r.reviewedBy,
    expiresAt: toISO(r.expiresAt),
    revokedAt: toISO(r.revokedAt),
    revokedBy: r.revokedBy,
    revokeReason: r.revokeReason,
    notes: r.notes,
  }));
}

// ── Re-exports for downstream consumers ───────────────────
export {
  ALLOWED_ENTITY_TYPES,
  ALLOWED_VERIFICATION_TYPES,
  ALLOWED_REVIEW_STATUSES,
};
export type {
  EntityType,
  VerificationType,
  ReviewStatus,
};
