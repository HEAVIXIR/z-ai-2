/**
 * HEAVIX — Disputes Service Layer (Wave 2D / Phase Marketplace-Deep)
 * ------------------------------------------------------------
 * Extracted dispute lifecycle logic for the marketplace domain.
 *
 * Disputes are MAIN-DB entities (Dispute model in prisma/schema.prisma).
 * The legacy store WalletTransaction lives in store-schema.prisma
 * (per Wave 2D constraint: NO store-schema.prisma changes). When a
 * marketplace Dispute is resolved with a refund, the refund may
 * optionally credit a store Customer's wallet — we make this a
 * best-effort side-effect that LOOKS UP a matching store Customer by
 * phone (the User.mobile field) and writes a CREDIT WalletTransaction
 * only when one is found. If no store Customer matches, the refund is
 * recorded as audit-only (the admin can manually adjust the wallet
 * via the store payments route).
 *
 * Responsibilities:
 *   - createDispute({ orderId?, dealId?, subject, description, openedBy,
 *       userId })
 *       Open a new Dispute on a Deal or Order. Subject goes into
 *       `reason`, description into `description`. If a Deal is
 *       specified, the Deal.status is flipped to DISPUTED (best-effort).
 *       Audited as `marketplace.dispute.create`.
 *
 *   - addEvidence(disputeId, evidenceType, evidenceUrl, description,
 *       userId)
 *       Append a DisputeEvidence row (typed: SCREENSHOT | DOCUMENT |
 *       MESSAGE | OTHER). The URL must point to an already-uploaded
 *       attachment (we never accept raw bytes here). Audited as
 *       `marketplace.dispute.evidence.add`.
 *
 *   - reviewDispute(disputeId, reviewNotes, userId)
 *       Flip status OPEN → UNDER_REVIEW. The reviewNotes go into the
 *       audit `after` field (the Dispute schema has no dedicated
 *       reviewNotes column — we keep them in the audit trail only, so
 *       the schema stays additive and backward compat). Audited as
 *       `marketplace.dispute.review`.
 *
 *   - resolveDispute(disputeId, resolution, refundAmount, userId)
 *       Flip status → RESOLVED. If refundAmount > 0, best-effort
 *       create a WalletTransaction (CREDIT) on the store Customer
 *       whose phone matches the dispute opener's User.mobile. Audited
 *       as `marketplace.dispute.resolve` (entityType: Dispute), plus
 *       a side-effect audit (entityType: WalletTransaction) when a
 *       wallet txn was created.
 *
 * Audit convention:
 *   - Action keys: `marketplace.dispute.{create, evidence.add, review,
 *     resolve}`.
 *   - entityType: `Dispute` (primary) | `WalletTransaction` (refund
 *     side-effect) | `Customer` (wallet-balance side-effect).
 *   - actorType: ADMIN (the human resolver).
 *   - All audits are best-effort: a thrown audit helper NEVER fails
 *     the service mutation (mirrors src/lib/admin/audit.ts).
 *
 * Pattern mirrors src/lib/store-{inventory,returns,shipments,
 * procurement}-service.ts.
 */

import { db } from "@/lib/db";
import { storeDb } from "@/lib/store-db";
import { logAudit } from "@/lib/audit";

// ── Service error (maps to HTTP status in route handler) ──
export class DisputesServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "DisputesServiceError";
  }
}

// ── Evidence-type vocabulary ────────────────────────────────
const ALLOWED_EVIDENCE_TYPES = [
  "SCREENSHOT",
  "DOCUMENT",
  "MESSAGE",
  "OTHER",
] as const;
type EvidenceType = (typeof ALLOWED_EVIDENCE_TYPES)[number];

function isEvidenceType(s: string): s is EvidenceType {
  return (ALLOWED_EVIDENCE_TYPES as readonly string[]).includes(s);
}

// ── Dispute lifecycle statuses (mirror schema comment + page) ──
const STATUS_OPEN = "OPEN";
const STATUS_UNDER_REVIEW = "UNDER_REVIEW";
const STATUS_RESOLVED = "RESOLVED";
const STATUS_CANCELLED = "CANCELLED";

// ── createDispute ───────────────────────────────────────────
/**
 * Open a new Dispute on a Deal or Order. Exactly one of
 * {dealId, orderId} should be provided (both is allowed but unusual;
 * neither is allowed — the dispute must attach to something).
 *
 * `subject` goes into the Dispute.reason column (the schema's primary
 * short-text field). `description` goes into Dispute.description
 * (longer prose). `openedBy` is the userId who initiated the
 * dispute (must be a non-empty string).
 *
 * If the dispute is on a Deal, the Deal.status is flipped to
 * `DISPUTED` (best-effort — failure here is non-fatal; the audit
 * trail records the intent).
 *
 * @throws DisputesServiceError(400) on validation failure.
 */
export async function createDispute(params: {
  orderId?: string | null;
  dealId?: string | null;
  subject: string;
  description?: string | null;
  openedBy: string;
  userId?: string | null;
}): Promise<{
  id: string;
  status: string;
  reason: string;
  description: string | null;
}> {
  const {
    orderId = null,
    dealId = null,
    subject,
    description = null,
    openedBy,
    userId = null,
  } = params;

  // ── Validate ──
  if (!subject || subject.trim().length < 3) {
    throw new DisputesServiceError(400, "موضوع اختلاف الزامی است (حداقل ۳ حرف)");
  }
  if (subject.length > 200) {
    throw new DisputesServiceError(400, "موضوع اختلاف نباید بیش از ۲۰۰ حرف باشد");
  }
  if (!openedBy) {
    throw new DisputesServiceError(400, "openedBy الزامی است");
  }
  if (!orderId && !dealId) {
    throw new DisputesServiceError(
      400,
      "حداقل یکی از orderId یا dealId باید مشخص باشد",
    );
  }

  // ── Persist (subject → reason; description → description) ──
  const dispute = await db.dispute.create({
    data: {
      dealId: dealId ?? null,
      orderId: orderId ?? null,
      status: STATUS_OPEN,
      reason: subject.trim().slice(0, 200),
      description: description ? description.slice(0, 5000) : null,
      openedBy,
    },
    select: {
      id: true,
      status: true,
      reason: true,
      description: true,
      dealId: true,
    },
  });

  // ── If dispute is on a Deal, flip Deal.status → DISPUTED ──
  if (dispute.dealId) {
    try {
      await db.deal.update({
        where: { id: dispute.dealId },
        data: { status: "DISPUTED" },
      });
    } catch {
      /* non-fatal — recorded as audit below */
    }
  }

  // ── Audit ──
  await logAudit({
    actorId: userId ?? openedBy,
    actorType: "ADMIN",
    action: "marketplace.dispute.create",
    entityType: "Dispute",
    entityId: dispute.id,
    after: {
      status: dispute.status,
      reason: dispute.reason,
      dealId: dispute.dealId,
      orderId: orderId ?? null,
      openedBy,
    },
    reason: `گشودن اختلاف جدید: ${dispute.reason}`,
  });

  return dispute;
}

// ── addEvidence ─────────────────────────────────────────────
/**
 * Append a typed DisputeEvidence row to a dispute.
 *
 * The `evidenceUrl` must point to an already-uploaded attachment
 * (uploaded via /api/admin/attachments — see upload-security.ts). We
 * NEVER accept raw file bytes here — the route handler is expected
 * to have already done the upload + virus-scan + size-check before
 * calling this service.
 *
 * @throws DisputesServiceError(404) when the dispute does not exist.
 * @throws DisputesServiceError(400) on validation failure.
 */
export async function addEvidence(params: {
  disputeId: string;
  evidenceType: string;
  evidenceUrl: string;
  description?: string | null;
  uploadedBy: string;
  userId?: string | null;
}): Promise<{
  id: string;
  disputeId: string;
  type: string;
  url: string;
  description: string | null;
}> {
  const {
    disputeId,
    evidenceType,
    evidenceUrl,
    description = null,
    uploadedBy,
    userId = null,
  } = params;

  // ── Validate ──
  if (!disputeId) {
    throw new DisputesServiceError(400, "disputeId الزامی است");
  }
  const type = String(evidenceType ?? "").toUpperCase();
  if (!isEvidenceType(type)) {
    throw new DisputesServiceError(
      400,
      `نوع مدرک نامعتبر (مجاز: ${ALLOWED_EVIDENCE_TYPES.join(" | ")})`,
    );
  }
  if (!evidenceUrl || evidenceUrl.trim().length === 0) {
    throw new DisputesServiceError(400, "آدرس مدرک الزامی است");
  }
  if (!uploadedBy) {
    throw new DisputesServiceError(400, "uploadedBy الزامی است");
  }

  // ── Verify the dispute exists ──
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    select: { id: true, reason: true, status: true },
  });
  if (!dispute) {
    throw new DisputesServiceError(404, "اختلاف یافت نشد");
  }
  // Refuse evidence on resolved/cancelled disputes (the lifecycle is
  // closed — admins should re-open or open a new dispute).
  if (dispute.status === STATUS_RESOLVED || dispute.status === STATUS_CANCELLED) {
    throw new DisputesServiceError(
      400,
      `اختلاف در وضعیت ${dispute.status} است — امکان افزودن مدرک وجود ندارد`,
    );
  }

  // ── Persist ──
  const evidence = await db.disputeEvidence.create({
    data: {
      disputeId,
      type,
      url: evidenceUrl.trim(),
      description: description ? description.slice(0, 1000) : null,
      uploadedBy,
    },
    select: {
      id: true,
      disputeId: true,
      type: true,
      url: true,
      description: true,
      createdAt: true,
    },
  });

  // ── Audit ──
  await logAudit({
    actorId: userId ?? uploadedBy,
    actorType: "ADMIN",
    action: "marketplace.dispute.evidence.add",
    entityType: "DisputeEvidence",
    entityId: evidence.id,
    after: {
      disputeId,
      type,
      url: evidence.url,
      description: evidence.description,
      uploadedBy,
    },
    reason: `افزودن مدرک (${type}) به اختلاف ${disputeId}`,
  });

  return evidence;
}

// ── listEvidence ────────────────────────────────────────────
/**
 * Return all DisputeEvidence rows for a dispute (newest first).
 *
 * @throws DisputesServiceError(404) when the dispute does not exist.
 */
export async function listEvidence(
  disputeId: string,
): Promise<
  Array<{
    id: string;
    type: string;
    url: string;
    description: string | null;
    uploadedBy: string;
    createdAt: Date;
  }>
> {
  if (!disputeId) {
    throw new DisputesServiceError(400, "disputeId الزامی است");
  }
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    select: { id: true },
  });
  if (!dispute) {
    throw new DisputesServiceError(404, "اختلاف یافت نشد");
  }
  return db.disputeEvidence.findMany({
    where: { disputeId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      url: true,
      description: true,
      uploadedBy: true,
      createdAt: true,
    },
  });
}

// ── reviewDispute ────────────────────────────────────────────
/**
 * Flip a dispute's status OPEN → UNDER_REVIEW. The reviewNotes are
 * captured in the audit trail (the schema has no dedicated column
 * — this is intentional, so the schema stays additive and backward
 * compat). Re-review is idempotent: a dispute already in
 * UNDER_REVIEW is a no-op (returns the dispute as-is).
 *
 * @throws DisputesServiceError(404) when the dispute does not exist.
 * @throws DisputesServiceError(400) when the dispute is already
 *   RESOLVED or CANCELLED (terminal — can't re-review).
 */
export async function reviewDispute(
  disputeId: string,
  reviewNotes: string | null,
  userId?: string | null,
): Promise<{
  id: string;
  status: string;
  reason: string;
}> {
  if (!disputeId) {
    throw new DisputesServiceError(400, "disputeId الزامی است");
  }
  const before = await db.dispute.findUnique({
    where: { id: disputeId },
    select: { id: true, status: true, reason: true },
  });
  if (!before) {
    throw new DisputesServiceError(404, "اختلاف یافت نشد");
  }
  if (before.status === STATUS_RESOLVED || before.status === STATUS_CANCELLED) {
    throw new DisputesServiceError(
      400,
      `اختلاف در وضعیت پایانی ${before.status} است — قابل بررسی مجدد نیست`,
    );
  }
  // No-op if already under review
  if (before.status === STATUS_UNDER_REVIEW) {
    return { id: before.id, status: before.status, reason: before.reason };
  }

  const after = await db.dispute.update({
    where: { id: disputeId },
    data: { status: STATUS_UNDER_REVIEW },
    select: { id: true, status: true, reason: true },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: "ADMIN",
    action: "marketplace.dispute.review",
    entityType: "Dispute",
    entityId: disputeId,
    before: { status: before.status },
    after: {
      status: after.status,
      reviewNotes: reviewNotes ? reviewNotes.slice(0, 2000) : null,
    },
    reason: `شروع بررسی اختلاف ${disputeId}`,
  });

  return after;
}

// ── resolveDispute ──────────────────────────────────────────
/**
 * Resolve a dispute (flip status → RESOLVED). If `refundAmount` > 0
 * AND the dispute opener has a phone matching a store Customer's
 * phone, write a CREDIT WalletTransaction in the store DB + bump
 * Customer.walletBalanceIrr.
 *
 * The refund side-effect is best-effort: if no store Customer matches
 * (which is the normal case for marketplace-only disputes — the
 * marketplace User has no store account), the refund is recorded as
 * audit-only. The admin can then manually adjust the wallet via the
 * store payments route.
 *
 * @throws DisputesServiceError(404) when the dispute does not exist.
 * @throws DisputesServiceError(400) when the dispute is already
 *   RESOLVED or CANCELLED (terminal — can't re-resolve).
 */
export async function resolveDispute(
  disputeId: string,
  resolution: string,
  refundAmount: number | null | undefined,
  userId?: string | null,
): Promise<{
  id: string;
  status: string;
  resolution: string;
  refundAmount: number;
  walletTxnId: string | null;
  storeCustomerId: string | null;
}> {
  if (!disputeId) {
    throw new DisputesServiceError(400, "disputeId الزامی است");
  }
  if (!resolution || resolution.trim().length < 3) {
    throw new DisputesServiceError(
      400,
      "متن تصمیم الزامی است (حداقل ۳ حرف)",
    );
  }
  const refund =
    typeof refundAmount === "number" && Number.isFinite(refundAmount) && refundAmount > 0
      ? Math.round(refundAmount * 100) / 100
      : 0;

  const before = await db.dispute.findUnique({
    where: { id: disputeId },
    select: {
      id: true,
      status: true,
      reason: true,
      openedBy: true,
      dealId: true,
      orderId: true,
    },
  });
  if (!before) {
    throw new DisputesServiceError(404, "اختلاف یافت نشد");
  }
  if (before.status === STATUS_RESOLVED) {
    throw new DisputesServiceError(400, "اختلاف قبلاً حل‌وفصل شده است");
  }
  if (before.status === STATUS_CANCELLED) {
    throw new DisputesServiceError(
      400,
      "اختلاف لغوشده است و قابل حل‌وفصل نیست",
    );
  }

  // ── 1. Update the dispute row (status → RESOLVED + resolution) ──
  const after = await db.dispute.update({
    where: { id: disputeId },
    data: {
      status: STATUS_RESOLVED,
      resolution: resolution.trim().slice(0, 2000),
      resolvedBy: userId ?? null,
      resolvedAt: new Date(),
    },
    select: {
      id: true,
      status: true,
      resolution: true,
      resolvedBy: true,
      resolvedAt: true,
    },
  });

  // ── 2. Best-effort refund (store Customer by phone) ──
  let walletTxnId: string | null = null;
  let storeCustomerId: string | null = null;
  if (refund > 0 && before.openedBy) {
    try {
      // Look up the User.mobile (best-effort — column may not exist
      // on all User variants; we use the field name from auth.ts).
      const opener = await db.user.findUnique({
        where: { id: before.openedBy },
        select: { id: true, mobile: true, firstName: true, lastName: true },
      });
      const phone = opener?.mobile ?? null;
      if (phone) {
        // Find the store Customer with this phone.
        const storeCustomer = await storeDb.customer.findUnique({
          where: { phone },
          select: { id: true, walletBalanceIrr: true, name: true, family: true },
        });
        if (storeCustomer) {
          // Create the wallet transaction.
          const txn = await storeDb.walletTransaction.create({
            data: {
              customerId: storeCustomer.id,
              amount: refund,
              type: "CREDIT",
              description: `بازگشت وجه اختلاف ${disputeId} — ${before.reason}`,
            },
          });
          walletTxnId = txn.id;
          storeCustomerId = storeCustomer.id;
          // Bump the customer's wallet balance.
          const updatedCustomer = await storeDb.customer.update({
            where: { id: storeCustomer.id },
            data: { walletBalanceIrr: { increment: refund } },
            select: { id: true, walletBalanceIrr: true },
          });
          // Side-effect audit: Customer.walletBalanceIrr changed by refund.
          await logAudit({
            actorId: userId ?? null,
            actorType: "ADMIN",
            action: "marketplace.dispute.resolve",
            entityType: "Customer",
            entityId: storeCustomer.id,
            before: { walletBalanceIrr: storeCustomer.walletBalanceIrr },
            after: {
              walletBalanceIrr: updatedCustomer.walletBalanceIrr,
              refundAmount: refund,
            },
            reason: `اعتبار بازگشت وجه اختلاف ${disputeId} به کیف پول مشتری`,
          });
        }
      }
    } catch (err) {
      // Non-fatal — the dispute is already RESOLVED. Record the
      // failure as a console error so the operator sees it.
      console.error("[disputes-service] refund side-effect failed:", err);
    }
  }

  // ── 3. Primary audit (entityType: Dispute) ──
  await logAudit({
    actorId: userId ?? null,
    actorType: "ADMIN",
    action: "marketplace.dispute.resolve",
    entityType: "Dispute",
    entityId: disputeId,
    before: { status: before.status, resolution: null },
    after: {
      status: after.status,
      resolution: after.resolution,
      refundAmount: refund,
      walletTxnId,
      storeCustomerId,
    },
    reason: `حل اختلاف ${disputeId}${refund > 0 ? ` با بازگشت ${refund} تومان` : ""}`,
  });

  // ── 4. Side-effect audit: WalletTransaction (if created) ──
  if (walletTxnId) {
    await logAudit({
      actorId: userId ?? null,
      actorType: "ADMIN",
      action: "marketplace.dispute.resolve",
      entityType: "WalletTransaction",
      entityId: walletTxnId,
      after: {
        disputeId,
        customerId: storeCustomerId,
        amount: refund,
        type: "CREDIT",
      },
      reason: `ایجاد تراکنش کیف پول برای بازگشت وجه اختلاف ${disputeId}`,
    }).catch(() => {
      /* non-fatal */
    });
  }

  return {
    id: after.id,
    status: after.status,
    resolution: after.resolution ?? "",
    refundAmount: refund,
    walletTxnId,
    storeCustomerId,
  };
}
