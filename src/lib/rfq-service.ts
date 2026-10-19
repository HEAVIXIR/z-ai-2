/**
 * HEAVIX — RFQ Service Layer (Phase 7 — Wanted/RFQ/Matching)
 * ------------------------------------------------------------
 * Extracted business logic for the RFQ (Request For Quote)
 * B2B procurement domain.
 *
 * Responsibilities:
 *   - createRFQ({ title, description, buyerId, sellerId?,
 *       deadline, categoryId?, brandId?, specs, userId })
 *       Create an RFQ. Maps task-spec field names onto the actual
 *       RFQ schema: categoryId → (lookup Category.name) → no
 *       direct column → preserved in specJson; brandId →
 *       Brand.name → brandPref; specs → specJson (JSON encoded);
 *       sellerId → no direct column on RFQ → preserved in specJson.
 *       Audited as `marketplace.rfq.create`.
 *
 *   - submitQuote(rfqId, sellerId, { price, deliveryTime,
 *       validity, notes, userId })
 *       Create an RFQQuote with status=PENDING. The schema
 *       requires sellerName + sellerPhone (non-null) + unitPrice
 *       + totalPrice (BigInt). The task-spec passes a single
 *       `price` — we use it for BOTH unitPrice AND totalPrice when
 *       totalPrice can't be computed (or compute totalPrice =
 *       price * rfq.quantity when quantity > 1). The seller's
 *       name/phone are best-effort resolved from the User record.
 *       Audited as `marketplace.rfq.quote.submit`.
 *
 *   - acceptQuote(quoteId, userId)
 *       Flip quote status → ACCEPTED. Audited as
 *       `marketplace.rfq.quote.accept`.
 *
 *   - rejectQuote(quoteId, reason, userId)
 *       Flip quote status → REJECTED. The reason is captured in
 *       the audit trail (no dedicated schema column). Audited as
 *       `marketplace.rfq.quote.reject`.
 *
 *   - listRFQs({ status, buyerId, sellerId, limit, offset })
 *       Paginated RFQ list. Filters by status, buyerId, and
 *       sellerId (the seller filter matches RFQQuote.sellerId —
 *       RFQs the seller has quoted on).
 *
 *   - getRFQ(id)
 *       Single RFQ with all its quotes (newest first).
 *
 * Audit convention:
 *   - Action keys: `marketplace.rfq.create` |
 *     `marketplace.rfq.quote.{submit, accept, reject}`.
 *   - entityType: `RFQ` (primary) | `RFQQuote` (quote lifecycle).
 *   - actorType: `USER` for create/submit; `ADMIN` for accept/
 *     reject (the buyer accepts/rejects quotes — recorded as
 *     ADMIN because they're managing the procurement lifecycle).
 *
 * Pattern mirrors src/lib/disputes-service.ts + wanted-service.ts.
 * NO .env / schema / migration changes — works against the
 * existing RFQ + RFQQuote schema.
 */

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// ── Service error (maps to HTTP status in route handler) ──
export class RFQServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "RFQServiceError";
  }
}

// ── RFQ lifecycle statuses ──────────────────────────────────
const STATUS_OPEN = "OPEN"; // schema default
const STATUS_QUOTING = "QUOTING"; // first quote received
const STATUS_AWARDED = "AWARDED"; // a quote was accepted
const STATUS_CLOSED = "CLOSED";

// ── RFQQuote lifecycle statuses ──────────────────────────────
const QUOTE_PENDING = "PENDING"; // schema default
const QUOTE_ACCEPTED = "ACCEPTED";
const QUOTE_REJECTED = "REJECTED";

// ── Helpers ──────────────────────────────────────────────────
function toBigInt(v: unknown): bigint | null {
  if (v === null || v === undefined || v === "") return null;
  try {
    if (typeof v === "bigint") return v;
    if (typeof v === "number") return BigInt(Math.trunc(v));
    const s = String(v).replace(/[^\d-]/g, "");
    if (s === "" || s === "-") return null;
    return BigInt(s);
  } catch {
    return null;
  }
}

/**
 * Look up a Category name by its id (best-effort).
 * RFQ stores `machineType` (free-text) — we use the category
 * name as the machineType hint when categoryId is supplied.
 */
async function category_idToName(categoryId: string | null | undefined): Promise<string | null> {
  if (!categoryId) return null;
  try {
    const c = await db.category.findUnique({
      where: { id: categoryId },
      select: { name: true },
    });
    return c?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Look up a Brand name by its id (best-effort). The RFQ schema
 * stores `brandPref` as a free-text string.
 */
async function brand_idToName(brandId: string | null | undefined): Promise<string | null> {
  if (!brandId) return null;
  try {
    const b = await db.brand.findUnique({
      where: { id: brandId },
      select: { name: true },
    });
    return b?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve a User id into the sellerName + sellerPhone we need
 * to persist on RFQQuote (the schema requires both as non-null
 * strings). Best-effort: returns placeholder values when the
 * User record is missing or the mobile field is absent.
 */
async function resolveSellerIdentity(
  sellerId: string,
): Promise<{ sellerName: string; sellerPhone: string; sellerEmail: string | null }> {
  try {
    const u = await db.user.findUnique({
      where: { id: sellerId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        mobile: true,
        email: true,
      },
    });
    if (u) {
      const name =
        [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
        `کاربر ${u.id.slice(-6)}`;
      return {
        sellerName: name,
        sellerPhone: u.mobile ?? "0000000000",
        sellerEmail: u.email ?? null,
      };
    }
  } catch {
    /* fall through to placeholder */
  }
  return {
    sellerName: `فروشنده ${sellerId.slice(-6)}`,
    sellerPhone: "0000000000",
    sellerEmail: null,
  };
}

// ── createRFQ ────────────────────────────────────────────────
/**
 * Create a new RFQ. The `buyerId` is required (the User who
 * opened the procurement). `sellerId` is optional — when
 * provided, the RFQ is addressed to a specific seller; we have
 * no schema column for this, so we preserve it in specJson
 * (along with the specs + categoryId for provenance).
 *
 * Field mapping:
 *   - title        → RFQ.title (required)
 *   - description  → RFQ.description
 *   - buyerId      → RFQ.buyerId (User FK)
 *   - sellerId?    → preserved in specJson.sellerId (no column)
 *   - deadline    → RFQ.deadline (DateTime)
 *   - categoryId? → resolved to Category.name → RFQ.machineType
 *                   (best-effort; also stored in specJson.categoryId)
 *   - brandId?    → resolved to Brand.name → RFQ.brandPref
 *   - specs?      → JSON-stringified → RFQ.specJson
 *   - userId      → audit actorId (defaults to buyerId)
 *
 * @throws RFQServiceError(400) when title or buyerId missing.
 */
export async function createRFQ(params: {
  title: string;
  description?: string | null;
  buyerId?: string | null;
  sellerId?: string | null;
  deadline?: Date | string | null;
  categoryId?: string | null;
  brandId?: string | null;
  specs?: unknown;
  userId: string;
}): Promise<{ id: string; status: string }> {
  const {
    title,
    description = null,
    buyerId = null,
    sellerId = null,
    deadline = null,
    categoryId = null,
    brandId = null,
    specs = null,
    userId,
  } = params;

  // ── Validate ──
  if (!title || title.trim().length < 3) {
    throw new RFQServiceError(400, "عنوان استعلام الزامی است (حداقل ۳ حرف)");
  }
  if (title.length > 200) {
    throw new RFQServiceError(400, "عنوان نباید بیش از ۲۰۰ حرف باشد");
  }
  if (!buyerId) {
    throw new RFQServiceError(400, "buyerId الزامی است");
  }
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new RFQServiceError(403, "هویت کاربر برای ثبت استعلام الزامی است");
  }
  if (buyerId !== userId) {
    throw new RFQServiceError(403, "شما مجاز به ثبت استعلام به نام کاربر دیگری نیستید");
  }

  // ── Resolve categoryId/brandId ──
  const [categoryName, brandName] = await Promise.all([
    category_idToName(categoryId),
    brand_idToName(brandId),
  ]);

  // ── Parse deadline (Date | ISO string | null) ──
  let deadlineDate: Date | null = null;
  if (deadline) {
    if (deadline instanceof Date) {
      deadlineDate = isNaN(deadline.getTime()) ? null : deadline;
    } else if (typeof deadline === "string") {
      const d = new Date(deadline);
      deadlineDate = isNaN(d.getTime()) ? null : d;
    }
  }

  // ── Build specJson (specs + sellerId + categoryId provenance) ──
  const specPayload: Record<string, unknown> = {};
  if (specs !== null && specs !== undefined) specPayload.specs = specs;
  if (sellerId) specPayload.sellerId = sellerId;
  if (categoryId) specPayload.categoryId = categoryId;
  if (categoryName) specPayload.categoryName = categoryName;
  const specJson =
    Object.keys(specPayload).length > 0 ? JSON.stringify(specPayload) : null;

  // ── Resolve buyer identity (best-effort — for buyerName/Phone/Email) ──
  // The RFQ schema requires buyerPhone (non-null). Best-effort lookup
  // from the User record; placeholder when missing.
  let buyerName: string | null = null;
  let buyerPhone = "0000000000";
  let buyerEmail: string | null = null;
  try {
    const u = await db.user.findUnique({
      where: { id: buyerId },
      select: { firstName: true, lastName: true, mobile: true, email: true },
    });
    if (u) {
      buyerName =
        [u.firstName, u.lastName].filter(Boolean).join(" ").trim() ||
        `کاربر ${buyerId.slice(-6)}`;
      buyerPhone = u.mobile ?? buyerPhone;
      buyerEmail = u.email ?? null;
    }
  } catch {
    /* fall through to placeholders */
  }

  // ── Persist ──
  const rfq = await db.rFQ.create({
    data: {
      title: title.trim().slice(0, 200),
      description: description ? String(description).slice(0, 5000) : null,
      machineType: categoryName,
      brandPref: brandName,
      quantity: 1, // schema default; task-spec doesn't pass quantity for RFQ
      specJson,
      location: null,
      deadline: deadlineDate,
      terms: null,
      status: STATUS_OPEN,
      buyerName,
      buyerPhone,
      buyerEmail,
      buyerId,
    },
    select: {
      id: true,
      title: true,
      status: true,
      specJson: true,
      machineType: true,
      brandPref: true,
      deadline: true,
    },
  });

  // ── Audit ──
  await logAudit({
    actorId: userId ?? buyerId,
    actorType: "USER",
    action: "marketplace.rfq.create",
    entityType: "RFQ",
    entityId: rfq.id,
    after: {
      title: rfq.title,
      status: rfq.status,
      buyerId,
      sellerId: sellerId ?? null, // preserved (no schema column)
      deadline: deadlineDate ? deadlineDate.toISOString() : null,
      categoryId: categoryId ?? null, // preserved
      categoryName: categoryName,
      brandId: brandId ?? null, // preserved
      brandPref: brandName,
      specs: specs ?? null, // preserved (raw — specJson stores the JSON)
      specJson,
    },
    reason: `ثبت استعلام قیمت: ${rfq.title}`,
  });

  return { id: rfq.id, status: rfq.status };
}

// ── submitQuote ───────────────────────────────────────────────
/**
 * Submit a quote (RFQQuote) on an RFQ. The seller's identity is
 * resolved from the User record (firstName/lastName/mobile).
 * The `price` is used for BOTH unitPrice AND totalPrice when
 * `quantity == 1` (the schema default) — when quantity > 1,
 * totalPrice = price * quantity.
 *
 * Status flow: RFQQuote.status=PENDING. If the RFQ was OPEN,
 * we flip it to QUOTING (matches the existing route behavior).
 *
 * @throws RFQServiceError(404) when the RFQ doesn't exist.
 * @throws RFQServiceError(400) on validation failure.
 * @throws RFQServiceError(409) when the RFQ is CLOSED/CANCELLED.
 */
export async function submitQuote(
  rfqId: string,
  sellerId: string,
  params: {
    price: bigint | number | string;
    deliveryTime?: string | null;
    validity?: string | null;
    notes?: string | null;
    userId: string;
  },
): Promise<{ id: string; status: string }> {
  if (!rfqId) {
    throw new RFQServiceError(400, "rfqId الزامی است");
  }
  if (!sellerId) {
    throw new RFQServiceError(400, "sellerId الزامی است");
  }
  const { price, deliveryTime = null, validity = null, notes = null, userId = null } = params;

  const unitPrice = toBigInt(price);
  if (unitPrice === null) {
    throw new RFQServiceError(400, "price الزامی است (عدد صحیح مثبت)");
  }

  // ── Verify RFQ exists + is open for quotes ──
  const rfq = await db.rFQ.findUnique({
    where: { id: rfqId },
    select: { id: true, status: true, quantity: true, title: true },
  });
  if (!rfq) {
    throw new RFQServiceError(404, "استعلام قیمت یافت نشد");
  }
  if (rfq.status === STATUS_CLOSED || rfq.status === "CANCELLED") {
    throw new RFQServiceError(409, "استعلام قیمت دیگر پیشنهاد نمی‌پذیرد");
  }

  // ── Resolve seller identity (schema requires non-null name+phone) ──
  const { sellerName, sellerPhone, sellerEmail } =
    await resolveSellerIdentity(sellerId);

  // ── Compute totalPrice = unitPrice * quantity (schema requires both) ──
  const qty = rfq.quantity && rfq.quantity > 0 ? rfq.quantity : 1;
  const totalPrice = unitPrice * BigInt(qty);

  // ── Persist the quote ──
  const quote = await db.rFQQuote.create({
    data: {
      rfqId,
      sellerName,
      sellerPhone,
      sellerEmail,
      sellerId,
      unitPrice,
      totalPrice,
      deliveryTime: deliveryTime ? String(deliveryTime).slice(0, 200) : null,
      notes: notes ? String(notes).slice(0, 2000) : null,
      status: QUOTE_PENDING,
    },
    select: {
      id: true,
      status: true,
      unitPrice: true,
      totalPrice: true,
      rfqId: true,
    },
  });

  // ── Flip RFQ OPEN → QUOTING on first quote (best-effort) ──
  if (rfq.status === STATUS_OPEN) {
    try {
      await db.rFQ.update({
        where: { id: rfqId },
        data: { status: STATUS_QUOTING },
      });
    } catch {
      /* non-fatal — recorded as audit failure */
    }
  }

  // ── Audit ──
  await logAudit({
    actorId: userId ?? sellerId,
    actorType: "USER",
    action: "marketplace.rfq.quote.submit",
    entityType: "RFQQuote",
    entityId: quote.id,
    after: {
      rfqId,
      rfqTitle: rfq.title,
      sellerId,
      sellerName,
      unitPrice: unitPrice.toString(),
      totalPrice: totalPrice.toString(),
      deliveryTime: deliveryTime ?? null,
      validity: validity ?? null, // preserved (no schema column)
      notes: notes ? String(notes).slice(0, 500) : null,
      status: quote.status,
    },
    reason: `ثبت پیشنهاد برای استعلام ${rfqId} — ${rfq.title}`,
  });

  return { id: quote.id, status: quote.status };
}

// ── acceptQuote ───────────────────────────────────────────────
/**
 * Accept a quote (status → ACCEPTED). The accepting actor is
 * typically the buyer (rfq.buyerId). Accepting a quote also
 * flips the RFQ status → AWARDED (the procurement is locked to
 * the accepted seller). Best-effort on the RFQ update — the
 * quote status change is the source of truth.
 *
 * @throws RFQServiceError(404) when the quote doesn't exist.
 * @throws RFQServiceError(409) when the quote is already
 *   ACCEPTED or REJECTED (terminal — can't re-accept).
 */
export async function acceptQuote(
  quoteId: string,
  userId?: string | null,
): Promise<{ id: string; status: string }> {
  if (!quoteId) {
    throw new RFQServiceError(400, "quoteId الزامی است");
  }

  // STEP 13.41 P3-A FIX (fail-closed): verify buyer ownership before any mutation.
  // Null userId → reject (not bypass). Null buyerId → reject (fail-closed).
  // Admin access must go through a separate RBAC-checked route, not null userId.
  const before = await db.rFQQuote.findUnique({
    where: { id: quoteId },
    select: { id: true, status: true, rfqId: true, sellerId: true },
  });
  if (!before) {
    throw new RFQServiceError(404, "پیشنهاد یافت نشد");
  }

  // Fail-closed: require userId
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new RFQServiceError(403, "هویت کاربر برای این عملیات الزامی است");
  }

  // Verify buyer ownership
  if (!before.rfqId) {
    throw new RFQServiceError(404, "استعلام قیمت مرتبط یافت نشد");
  }
  const rfq = await db.rFQ.findUnique({
    where: { id: before.rfqId },
    select: { buyerId: true },
  });
  if (!rfq) {
    throw new RFQServiceError(404, "استعلام قیمت یافت نشد");
  }
  if (!rfq.buyerId) {
    // Fail-closed: RFQ has no buyer — cannot authorize
    throw new RFQServiceError(403, "استعلام قیمت فاقد خریدار است");
  }
  if (userId !== rfq.buyerId) {
    throw new RFQServiceError(
      403,
      "شما مجاز به پذیرش پیشنهادهای این استعلام نیستید",
    );
  }

  if (before.status === QUOTE_ACCEPTED) {
    // Idempotent — already accepted.
    return { id: before.id, status: before.status };
  }
  if (before.status === QUOTE_REJECTED) {
    throw new RFQServiceError(409, "پیشنهاد رد شده است — قابل پذیرش نیست");
  }

  const after = await db.rFQQuote.update({
    where: { id: quoteId },
    data: { status: QUOTE_ACCEPTED },
    select: { id: true, status: true, rfqId: true },
  });

  // ── Flip RFQ status → AWARDED (best-effort) ──
  if (before.rfqId) {
    try {
      await db.rFQ.update({
        where: { id: before.rfqId },
        data: { status: STATUS_AWARDED },
      });
    } catch {
      /* non-fatal — recorded in audit below */
    }
  }

  await logAudit({
    actorId: userId ?? null,
    actorType: "USER",
    action: "marketplace.rfq.quote.accept",
    entityType: "RFQQuote",
    entityId: quoteId,
    before: { status: before.status },
    after: {
      status: after.status,
      rfqId: after.rfqId,
      rfqStatus: STATUS_AWARDED,
      sellerId: before.sellerId,
    },
    reason: `پذیرش پیشنهاد ${quoteId} برای استعلام ${before.rfqId ?? "—"}`,
  });

  return { id: after.id, status: after.status };
}

// ── rejectQuote ───────────────────────────────────────────────
/**
 * Reject a quote (status → REJECTED). The reason is captured
 * in the audit `after` payload (no schema column on RFQQuote).
 * Rejecting an already-REJECTED quote is idempotent. Rejecting
 * an already-ACCEPTED quote is forbidden (terminal — the
 * procurement is locked to the accepted seller).
 *
 * @throws RFQServiceError(404) when the quote doesn't exist.
 * @throws RFQServiceError(409) when the quote is already ACCEPTED.
 */
export async function rejectQuote(
  quoteId: string,
  reason?: string | null,
  userId?: string | null,
): Promise<{ id: string; status: string }> {
  if (!quoteId) {
    throw new RFQServiceError(400, "quoteId الزامی است");
  }

  // STEP 13.41 P3-A FIX (fail-closed): verify buyer ownership before any mutation.
  if (!quoteId) {
    throw new RFQServiceError(400, "quoteId الزامی است");
  }

  const before = await db.rFQQuote.findUnique({
    where: { id: quoteId },
    select: { id: true, status: true, rfqId: true, sellerId: true },
  });
  if (!before) {
    throw new RFQServiceError(404, "پیشنهاد یافت نشد");
  }

  // Fail-closed: require userId
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new RFQServiceError(403, "هویت کاربر برای این عملیات الزامی است");
  }

  // Verify buyer ownership
  if (!before.rfqId) {
    throw new RFQServiceError(404, "استعلام قیمت مرتبط یافت نشد");
  }
  const rfq = await db.rFQ.findUnique({
    where: { id: before.rfqId },
    select: { buyerId: true },
  });
  if (!rfq) {
    throw new RFQServiceError(404, "استعلام قیمت یافت نشد");
  }
  if (!rfq.buyerId) {
    throw new RFQServiceError(403, "استعلام قیمت فاقد خریدار است");
  }
  if (userId !== rfq.buyerId) {
    throw new RFQServiceError(
      403,
      "شما مجاز به رد پیشنهادهای این استعلام نیستید",
    );
  }

  if (before.status === QUOTE_REJECTED) {
    // Idempotent — already rejected.
    return { id: before.id, status: before.status };
  }
  if (before.status === QUOTE_ACCEPTED) {
    throw new RFQServiceError(409, "پیشنهاد قبلاً پذیرفته شده است — قابل رد نیست");
  }

  const after = await db.rFQQuote.update({
    where: { id: quoteId },
    data: { status: QUOTE_REJECTED },
    select: { id: true, status: true, rfqId: true },
  });

  await logAudit({
    actorId: userId ?? null,
    actorType: "USER",
    action: "marketplace.rfq.quote.reject",
    entityType: "RFQQuote",
    entityId: quoteId,
    before: { status: before.status },
    after: {
      status: after.status,
      rfqId: after.rfqId,
      sellerId: before.sellerId,
      reason: reason ? String(reason).slice(0, 2000) : null,
    },
    reason: `رد پیشنهاد ${quoteId}${reason ? ` — ${String(reason).slice(0, 200)}` : ""}`,
  });

  return { id: after.id, status: after.status };
}

// ── listRFQs ──────────────────────────────────────────────────
/**
 * Paginated RFQ list. Filters by status, buyerId, and sellerId.
 * The sellerId filter matches RFQQuote.sellerId — i.e., RFQs
 * the seller has quoted on (the marketplace "leads" view).
 *
 * Returns `{ items, total }` where items include a `quoteCount`
 * for each RFQ (handy for the admin table).
 *
 * STEP 13.28 P1-A FIX: The list is a PUBLIC marketplace catalog
 * (the `/rfq` page renders it to anonymous visitors). Buyer
 * contact info (phone/email) and the internal buyerId are NEVER
 * needed in the list view — they are only relevant on the detail
 * page (`getRFQ`), where viewer-aware redaction already applies.
 *
 * Previously `listRFQs` returned `buyerPhone`, `buyerEmail`, and
 * `buyerId` to ANY caller (including anonymous), which was the
 * same PII-leak class as P0-2 but on the sibling list endpoint.
 * This fix removes those three fields from the list DTO entirely.
 * `buyerName` is kept as a public trust signal (consistent with
 * the detail page + `/rfq` list page rendering).
 *
 * If a future admin "leads" view needs seller-side PII, it must
 * go through a separate authenticated, RBAC-checked endpoint —
 * not this public catalog function.
 */
export async function listRFQs(params: {
  status?: string | null;
  buyerId?: string | null;
  sellerId?: string | null;
  limit?: number | null;
  offset?: number | null;
}): Promise<{
  items: Array<{
    id: string;
    title: string;
    description: string | null;
    machineType: string | null;
    brandPref: string | null;
    quantity: number;
    budgetMin: string | null;
    budgetMax: string | null;
    location: string | null;
    deadline: Date | null;
    status: string;
    // buyerName kept (public trust signal); phone/email/id removed.
    buyerName: string | null;
    quoteCount: number;
    createdAt: Date;
  }>;
  total: number;
}> {
  const {
    status = null,
    buyerId = null,
    sellerId = null,
    limit = 20,
    offset = 0,
  } = params;

  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const safeOffset = Math.max(0, Number(offset) || 0);

  // Build the where clause.
  const where: {
    status?: string;
    buyerId?: string;
    quotes?: { some: { sellerId: string } };
  } = {};
  if (status) where.status = status;
  if (buyerId) where.buyerId = buyerId;
  if (sellerId) where.quotes = { some: { sellerId } };

  const [rows, total] = await Promise.all([
    db.rFQ.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: safeLimit,
      skip: safeOffset,
      include: {
        _count: { select: { quotes: true } },
      },
    }),
    db.rFQ.count({ where }),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      machineType: r.machineType,
      brandPref: r.brandPref,
      quantity: r.quantity,
      budgetMin: r.budgetMin ? r.budgetMin.toString() : null,
      budgetMax: r.budgetMax ? r.budgetMax.toString() : null,
      location: r.location,
      deadline: r.deadline,
      status: r.status,
      // STEP 13.28 P1-A FIX: buyerName kept (trust signal);
      // buyerPhone/buyerEmail/buyerId REMOVED from list DTO.
      buyerName: r.buyerName,
      quoteCount: r._count?.quotes ?? 0,
      createdAt: r.createdAt,
    })),
    total,
  };
}

// ── getRFQ ────────────────────────────────────────────────────
/**
 * Return a single RFQ with all its quotes (newest first).
 *
 * @throws RFQServiceError(404) when the RFQ doesn't exist.
 */
export async function getRFQ(
  id: string,
  // STEP 13.01-R1 P0-2 FIX v2: viewerUserId is now REQUIRED (was optional).
  // The service contract enforces that every caller must identify the
  // viewer. A missing viewerUserId means PII is redacted for everyone
  // (treated as anonymous) — but the type-level requirement forces
  // callers to be explicit about who is viewing.
  viewerUserId: string,
): Promise<{
  id: string;
  title: string;
  description: string | null;
  machineType: string | null;
  brandPref: string | null;
  quantity: number;
  specJson: string | null;
  budgetMin: string | null;
  budgetMax: string | null;
  location: string | null;
  deadline: Date | null;
  terms: string | null;
  status: string;
  buyerName: string | null;
  buyerPhone: string | null;
  buyerEmail: string | null;
  buyerId: string | null;
  createdAt: Date;
  quoteCount: number;
  quotes: Array<{
    id: string;
    sellerId: string | null;
    sellerName: string;
    sellerPhone: string | null;
    sellerEmail: string | null;
    unitPrice: string;
    totalPrice: string;
    deliveryTime: string | null;
    notes: string | null;
    status: string;
    createdAt: Date;
  }>;
}> {
  if (!id) {
    throw new RFQServiceError(400, "id الزامی است");
  }

  const rfq = await db.rFQ.findUnique({
    where: { id },
    include: {
      quotes: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          sellerId: true,
          sellerName: true,
          sellerPhone: true,
          sellerEmail: true,
          unitPrice: true,
          totalPrice: true,
          deliveryTime: true,
          notes: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });
  if (!rfq) {
    throw new RFQServiceError(404, "استعلام قیمت یافت نشد");
  }

  // STEP 13.01 P0-2 FIX: PII redaction based on viewer identity.
  // Only the buyer themselves sees buyer PII (phone/email/id) and
  // seller PII (phone/email) in quotes. All other viewers (anonymous,
  // other sellers, etc.) see only non-PII fields (names are kept for
  // trust; phone/email/internal ids are redacted). This prevents the
  // public PII harvest chain that existed when getRFQ was called
  // without a viewer context.
  //
  // STEP 13.02 P0-2 FIX v3: Quote visibility filtering.
  // Senior manager directive: 'فروشنده‌ای که پیشنهاد داده فقط
  // پیشنهاد خودش را می‌بیند'. v2 only redacted PII but returned ALL
  // quotes to every viewer. v3 filters the quotes array:
  //   - buyer: sees ALL quotes (with full PII) — needs to compare
  //   - seller who quoted: sees ONLY their own quote (no competitor data)
  //   - other sellers / anonymous: see NO quotes (only quoteCount)
  const isBuyer = !!viewerUserId && !!rfq.buyerId && viewerUserId === rfq.buyerId;
  // Check if the viewer is one of the sellers who quoted on this RFQ.
  const viewerQuote = viewerUserId
    ? rfq.quotes.find((q) => q.sellerId === viewerUserId)
    : undefined;
  const isSellerWhoQuoted = !!viewerQuote;

  // Determine which quotes to return based on viewer role.
  let visibleQuotes: typeof rfq.quotes;
  if (isBuyer) {
    // Buyer sees all quotes with full PII (to contact sellers).
    visibleQuotes = rfq.quotes;
  } else if (isSellerWhoQuoted && viewerQuote) {
    // Seller who quoted sees ONLY their own quote.
    visibleQuotes = [viewerQuote];
  } else {
    // Other sellers / anonymous: see NO quotes (only count).
    visibleQuotes = [];
  }

  return {
    id: rfq.id,
    title: rfq.title,
    description: rfq.description,
    machineType: rfq.machineType,
    brandPref: rfq.brandPref,
    quantity: rfq.quantity,
    specJson: rfq.specJson,
    budgetMin: rfq.budgetMin ? rfq.budgetMin.toString() : null,
    budgetMax: rfq.budgetMax ? rfq.budgetMax.toString() : null,
    location: rfq.location,
    deadline: rfq.deadline,
    terms: rfq.terms,
    status: rfq.status,
    // buyerName is kept (trust signal); phone/email/id are PII.
    buyerName: rfq.buyerName,
    buyerPhone: isBuyer ? rfq.buyerPhone : null,
    buyerEmail: isBuyer ? rfq.buyerEmail : null,
    buyerId: isBuyer ? rfq.buyerId : null,
    createdAt: rfq.createdAt,
    // STEP 13.02 P0-2 FIX v3: quoteCount is always visible (trust signal).
    // The quotes array is filtered based on viewer role (see above).
    quoteCount: rfq.quotes.length,
    quotes: visibleQuotes.map((q) => ({
      id: q.id,
      // sellerName is kept; phone/email/id are PII (only buyer sees them).
      sellerId: isBuyer ? q.sellerId : null,
      sellerName: q.sellerName,
      sellerPhone: isBuyer ? q.sellerPhone : null,
      sellerEmail: isBuyer ? q.sellerEmail : null,
      unitPrice: q.unitPrice.toString(),
      totalPrice: q.totalPrice.toString(),
      deliveryTime: q.deliveryTime,
      notes: q.notes,
      status: q.status,
      createdAt: q.createdAt,
    })),
  };
}
