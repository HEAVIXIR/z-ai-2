/**
 * HEAVIX — Wanted Service Layer (Phase 7 — Wanted/RFQ/Matching)
 * ------------------------------------------------------------
 * Extracted business logic for the "Wanted" marketplace domain
 * (BuyRequest — buyer posts what they're looking for; matching
 * engine surfaces seller listings as candidates).
 *
 * Responsibilities:
 *   - createWanted({ title, description, quantity, budgetMin,
 *       budgetMax, categoryId, brandId, transactionType,
 *       province, city, userId })
 *       Create a BuyRequest with status=PUBLISHED (publish to the
 *       public marketplace immediately). Maps the task-spec
 *       field names (categoryId, brandId, transactionType,
 *       quantity) onto the actual schema fields (category,
 *       brandPref, transaction). The `quantity` field has no
 *       matching schema column — it's preserved in the audit
 *       `after` payload so the record is self-describing.
 *       Audited as `marketplace.wanted.create`.
 *
 *   - listWanted({ status, categoryId, limit, offset })
 *       Paginated list of public wanted requests (newest first).
 *       Filters by status (defaults to ACTIVE — the public feed)
 *       and optionally by categoryId. The schema stores `category`
 *       as a free-text string, so `categoryId` is mapped through
 *       the Category table to its name before filtering.
 *
 *   - getWanted(id)
 *       Single wanted request + a `matchCount` derived from the
 *       matching engine (best-effort — never throws; returns 0 on
 *       failure).
 *
 *   - closeWanted(id, userId)
 *       Flip status → CLOSED. Audited as `marketplace.wanted.close`.
 *
 *   - getWantedMatches(id)
 *       Delegates to matching-service.matchBuyRequest + returns
 *       the candidate list. Thin wrapper so the API route stays
 *       stateless — the service owns the audit + error mapping.
 *
 * Audit convention:
 *   - Action keys: `marketplace.wanted.create` | `marketplace.wanted.close`.
 *   - entityType: `BuyRequest`.
 *   - actorType: `USER` (the buyer) for create; `ADMIN` for close.
 *   - All audits are best-effort: a thrown audit helper NEVER
 *     fails the service mutation (mirrors src/lib/admin/audit.ts).
 *
 * Pattern mirrors src/lib/disputes-service.ts + matching-service.ts.
 * NO .env / schema / migration changes — works against the
 * existing BuyRequest schema (status default ACTIVE, columns:
 * title, description, category, brandPref, transaction, budgetMin,
 * budgetMax, city, province, deadline, status, verified, userId,
 * requesterName, requesterPhone, adminNotes, publishedAt, expiresAt).
 */

import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { matchBuyRequest, BuyRequestMatchResult } from "@/lib/matching-service";
import { normalizeDemandIntent, isValidDemandIntent } from "@/lib/transaction-type-routing";

// ── Service error (maps to HTTP status in route handler) ──
export class WantedServiceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "WantedServiceError";
  }
}

// ── Lifecycle statuses ──────────────────────────────────────
// The BuyRequest schema uses a free-text String status. The moderation
// lifecycle is: PENDING (created, awaiting admin review) → ACTIVE
// (approved + published, visible on the public feed + matchable) →
// CLOSED/FULFILLED (terminal). Terminal states cannot be re-published
// or re-closed without a separate reopen action.
//
// createWanted creates PENDING (status=PENDING, publishedAt=null). The
// public list filters on ACTIVE; public detail rejects status!=ACTIVE;
// matching eligibility (isBuyRequestMatchEligible) rejects non-ACTIVE
// AND non-published AND expired. So a PENDING request is invisible
// everywhere except the owner's ?mine=true list and the admin review
// queue until an admin approves (publishWanted → ACTIVE + publishedAt).
const STATUS_PUBLISHED = "ACTIVE"; // schema-active = publicly visible
const STATUS_PENDING = "PENDING"; // awaiting admin review before publication
const STATUS_CLOSED = "CLOSED";
const STATUS_FULFILLED = "FULFILLED";

// ── State-machine (P0-C, P0-D) ──────────────────────────────────
// A single canonical transition map. Every status mutation in this
// service (publishWanted, closeWanted, fulfillWanted) MUST go through
// the CAS helper and only the transitions listed here are allowed.
// Terminal states (CLOSED, FULFILLED) cannot be re-published or
// re-closed; reopening is intentionally NOT in this matrix (it would
// be a separate action with its own permission + audit).
const TERMINAL_STATUSES = new Set([
  STATUS_CLOSED,
  STATUS_FULFILLED,
  "REJECTED",
  "EXPIRED",
]);

/**
 * The canonical transition matrix. Key = current status, value = the
 * set of statuses that status may transition TO via the named action.
 * Any transition not listed here is rejected with 409.
 */
const ALLOWED_TRANSITIONS: Record<string, Record<string, string>> = {
  PENDING: { approve: STATUS_PUBLISHED, close: STATUS_CLOSED, fulfill: STATUS_FULFILLED },
  ACTIVE: { close: STATUS_CLOSED, fulfill: STATUS_FULFILLED },
  // Terminal states: no outbound transitions.
  CLOSED: {},
  FULFILLED: {},
  REJECTED: {},
  EXPIRED: {},
};

/**
 * Resolve the target status for an action given the current status.
 * Returns the target status string if the transition is allowed, or
 * null if it is not. This is the single source of truth for "can this
 * action be applied to this row".
 */
function resolveTransitionTarget(currentStatus: string, action: "approve" | "close" | "fulfill"): string | null {
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowed) return null;
  return allowed[action] ?? null;
}

// ── Helpers ──────────────────────────────────────────────────
/**
 * Coerce a budget value (string | number | bigint) into a BigInt
 * suitable for the BuyRequest.budgetMin/Max column. Returns null
 * for empty/invalid input. Mirrors src/lib/api-helpers.parseBig
 * but is local to keep the service self-contained.
 */
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
 * Look up a Category name by its id (best-effort — returns null
 * when the category doesn't exist or the table is unavailable).
 * The BuyRequest schema stores category as a free-text string,
 * so we resolve the id → name before persisting.
 */
async function category_idToName(categoryId: string | null | undefined): Promise<string | null> {
  if (!categoryId) return null;
  try {
    const c = await db.category.findUnique({
      where: { id: categoryId },
      select: { name: true, slug: true },
    });
    return c?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Look up a Brand name by its id (best-effort). The BuyRequest
 * schema stores brandPref as a free-text string.
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
 * Parse the free-text `deadline` string into a concrete `expiresAt`
 * Date so the matching eligibility helper (isBuyRequestMatchEligible)
 * can actually enforce expiration. The deadline column is a plain
 * String (no schema migration involved), so we accept any value
 * that Date can parse into a valid timestamp — ISO 8601 dates
 * ("2026-12-31"), full date-times ("2026-12-31T23:59:59Z"), etc.
 * Anything that fails to parse (relative text, Persian dates without
 * a converter, garbage) leaves expiresAt null, so the request stays
 * matchable until it is explicitly closed.
 */
function parseDeadlineToExpiresAt(
  deadline: string | null | undefined,
): Date | null {
  if (!deadline) return null;
  const s = String(deadline).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// ── createWanted ────────────────────────────────────────────
/**
 * Create a new wanted request (BuyRequest) and publish it to the
 * public marketplace feed immediately (status=ACTIVE in the
 * schema, recorded as PUBLISHED in the audit so the intent is
 * preserved). Returns the new record id + status.
 *
 * Field mapping (task-spec → schema):
 *   - title             → BuyRequest.title (required)
 *   - description       → BuyRequest.description (optional)
 *   - quantity          → no schema column; recorded in audit
 *                         `after` payload only (preserves intent
 *                         without a schema migration)
 *   - budgetMin/Max     → BuyRequest.budgetMin/Max (BigInt?)
 *   - categoryId        → resolved to Category.name → BuyRequest.category
 *   - brandId           → resolved to Brand.name → BuyRequest.brandPref
 *   - transactionType   → BuyRequest.transaction (default SALE)
 *   - province/city     → BuyRequest.province/city
 *   - userId            → BuyRequest.userId (owner)
 *
 * @throws WantedServiceError(400) when title or userId missing.
 */
export async function createWanted(params: {
  title: string;
  description?: string | null;
  quantity?: number | null;
  budgetMin?: bigint | number | string | null;
  budgetMax?: bigint | number | string | null;
  categoryId?: string | null;
  category?: string | null;
  brandId?: string | null;
  brandPref?: string | null;
  /**
   * Demand intent (BUY/RENT/SERVICE). When provided, this is the
   * canonical value stored in BuyRequest.transaction and is what the
   * matching engine uses to narrow the supply candidate pool. Accepts
   * the demand-intent vocabulary (SALE/RENT/SALE_AND_RENT/
   * SERVICE_REQUEST); legacy callers may still pass the listing-type
   * label ("WANTED"), which normalizes to the buy intent (SALE).
   */
  intent?: string | null;
  transactionType?: string | null;
  province?: string | null;
  city?: string | null;
  deadline?: string | null;
  requesterName?: string | null;
  requesterPhone?: string | null;
  modelId?: string | null;
  serviceTypeId?: string | null;
  attributeValues?: unknown[] | null;
  userId: string;
}): Promise<{ id: string; status: string }> {
  const {
    title,
    description = null,
    quantity = null,
    budgetMin,
    budgetMax,
    categoryId = null,
    category = null,
    brandId = null,
    brandPref = null,
    intent = null,
    transactionType = null,
    province = null,
    city = null,
    deadline = null,
    requesterName = null,
    requesterPhone = null,
    modelId = null,
    serviceTypeId = null,
    attributeValues = null,
    userId,
  } = params;

  // ── Validate ──
  if (!title || title.trim().length < 3) {
    throw new WantedServiceError(400, "عنوان درخواست الزامی است (حداقل ۳ حرف)");
  }
  if (title.length > 200) {
    throw new WantedServiceError(400, "عنوان نباید بیش از ۲۰۰ حرف باشد");
  }
  if (!userId) {
    throw new WantedServiceError(400, "userId الزامی است");
  }
  // Fail-closed intent validation: an explicitly-provided `intent` that
  // is NOT in the canonical allowlist is rejected with 400 — a garbage
  // intent must never silently create a buy request (the historical
  // fail-open default of SALE masked bad input). When `intent` is not
  // provided (null/empty), we fall back to the legacy `transactionType`
  // alias, which normalizeDemandIntent collapses onto the buy intent for
  // legacy "WANTED" rows. This keeps the explicit-API boundary fail-closed
  // while preserving read-back compatibility for existing rows + the
  // legacy /api/requests caller.
  if (intent !== null && intent !== undefined && String(intent).trim() !== "") {
    if (!isValidDemandIntent(intent)) {
      throw new WantedServiceError(
        400,
        "نوع تقاضا معتبر نیست. مقادیر مجاز: SALE, RENT, SALE_AND_RENT, SERVICE_REQUEST.",
      );
    }
  }

  // ── Resolve categoryId/brandId → category/brandPref names ──
  // (best-effort — null when the lookup fails; we still create
  // the request, just without the resolved name.)
  const [categoryName, brandName] = await Promise.all([
    category_idToName(categoryId),
    brand_idToName(brandId),
  ]);

  // ── Lifecycle timestamps ──
  // MODERATION LIFECYCLE: a new wanted request is created in PENDING
  // review state — it is NOT immediately public or matchable. The
  // wizard's success message promises "published after expert review",
  // and this makes that promise true: status=PENDING, publishedAt=null
  // until an admin approves (publishWanted). The public feed filters
  // status=ACTIVE, public detail rejects status!=ACTIVE, and the
  // matching eligibility helper rejects PENDING — so a PENDING request
  // is invisible everywhere except the owner's own ?mine=true list and
  // the admin review queue. expiresAt is still derived from deadline
  // at create time so it takes effect the moment the request is
  // approved (publishedAt=now); it is not re-derived on approval.
  const publishedAt: Date | null = null;
  const expiresAt = parseDeadlineToExpiresAt(deadline);

  // ── Demand intent ──
  // `intent` is the canonical demand-side signal (BUY/RENT/SERVICE).
  // It is stored in BuyRequest.transaction (no schema migration — the
  // column is a free-text String) and is what the matching engine
  // reads to narrow the supply candidate pool to compatible types.
  // Prefer the explicit `intent` param; fall back to the legacy
  // `transactionType` alias (which carried the listing-type label,
  // e.g. "WANTED"). normalizeDemandIntent collapses legacy/unknown
  // values onto the buy intent (SALE) so existing callers keep working
  // and existing rows keep matching SALE + AUCTION supply.
  const resolvedIntent = normalizeDemandIntent(intent ?? transactionType);

  // ── Persist ──
  const request = await db.buyRequest.create({
    data: {
      title: title.trim().slice(0, 200),
      description: description ? String(description).slice(0, 2000) : null,
      category: categoryName ?? (category ? String(category).trim().slice(0, 120) : null),
      brandPref: brandName ?? (brandPref ? String(brandPref).trim().slice(0, 120) : null),
      transaction: resolvedIntent,
      budgetMin: toBigInt(budgetMin),
      budgetMax: toBigInt(budgetMax),
      city: city ? String(city).slice(0, 120) : null,
      province: province ? String(province).slice(0, 120) : null,
      deadline: deadline ? String(deadline).slice(0, 120) : null,
      publishedAt,
      expiresAt,
      requesterName: requesterName ? String(requesterName).slice(0, 120) : null,
      requesterPhone: requesterPhone ? String(requesterPhone).slice(0, 40) : null,
      status: STATUS_PENDING, // moderation gate — admin must approve before publication
      verified: false,
      userId,
    },
    select: {
      id: true,
      title: true,
      status: true,
      category: true,
      brandPref: true,
    },
  });

  // ── Audit (best-effort) ──
  await logAudit({
    actorId: userId,
    actorType: "USER",
    action: "marketplace.wanted.create",
    entityType: "BuyRequest",
    entityId: request.id,
    after: {
      title: request.title,
      status: "PENDING_REVIEW", // the task-spec semantic status (awaiting moderation)
      schemaStatus: request.status, // what we actually wrote (PENDING)
      description: description ? String(description).slice(0, 500) : null,
      // DECISION (quantity): BuyRequest has no `quantity` column, and
      // schema migrations are locked pending a fresh backup. Quantity
      // is therefore preserved in the audit `after` payload ONLY (the
      // record stays self-describing) until a migration that adds the
      // column is approved. See worklog + follow-up issue.
      quantity: quantity ?? null, // preserved (no schema column — audit-only)
      budgetMin:
        toBigInt(budgetMin) !== null ? toBigInt(budgetMin)!.toString() : null,
      budgetMax:
        toBigInt(budgetMax) !== null ? toBigInt(budgetMax)!.toString() : null,
      categoryId: categoryId ?? null,
      brandId: brandId ?? null,
      category: categoryName ?? category ?? null,
      brandPref: brandName ?? brandPref ?? null,
      modelId: modelId ?? null,
      serviceTypeId: serviceTypeId ?? null, // audit-only until schema migration
      // Structured attribute snapshots are audit-only until the BuyRequest
      // schema has a dedicated specification relation (migration gated).
      attributeValues: Array.isArray(attributeValues) ? attributeValues.slice(0, 100) : [],
      // Demand intent: the canonical value stored in BuyRequest.transaction
      // (resolvedIntent), plus the raw inputs the caller sent (intent /
      // transactionType) so the audit trail records what was requested
      // before normalization. The matching engine reads `resolvedIntent`
      // to narrow supply candidates to compatible types.
      intent: resolvedIntent,
      intentRequested: intent ?? transactionType ?? null,
      transactionType: resolvedIntent,
      province: province ?? null,
      city: city ?? null,
      // Lifecycle timestamps — recorded so the audit trail proves
      // expiration was wired (expiresAt derived from deadline). For a
      // PENDING request publishedAt is null until admin approval.
      publishedAt: null,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      deadlineRaw: deadline ? String(deadline).slice(0, 120) : null,
    },
    reason: `ثبت درخواست خرید: ${request.title}`,
  });

  return { id: request.id, status: request.status };
}

// ── listWanted ───────────────────────────────────────────────
/**
 * Paginated list of public wanted requests, newest first.
 *
 * Filters:
 *   - status (default ACTIVE — the public feed)
 *   - categoryId (resolved to Category.name → matched against
 *     BuyRequest.category; null = no category filter)
 *
 * Returns `{ items, total }` where `total` is the unfiltered
 * count for the same status/category so the caller can render
 * pagination metadata.
 */
export async function listWanted(params: {
  status?: string | null;
  categoryId?: string | null;
  limit?: number | null;
  offset?: number | null;
}): Promise<{
  items: Array<{
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    brandPref: string | null;
    transaction: string;
    budgetMin: string | null;
    budgetMax: string | null;
    city: string | null;
    province: string | null;
    status: string;
    verified: boolean;
    createdAt: Date;
  }>;
  total: number;
}> {
  const {
    status = "ACTIVE",
    categoryId = null,
    limit = 20,
    offset = 0,
  } = params;

  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const safeOffset = Math.max(0, Number(offset) || 0);

  // Resolve categoryId → category name (best-effort).
  let categoryName: string | null = null;
  if (categoryId) {
    categoryName = await category_idToName(categoryId);
    // If the lookup failed, fall back to the raw id — best-effort
    // text match against BuyRequest.category. This keeps the
    // filter usable even when the Category table is empty.
    if (!categoryName) categoryName = categoryId;
  }

  // Build the where clause.
  const now = new Date();
  const where: {
    status?: string;
    category?: string;
    publishedAt?: { lte: Date };
    OR?: Array<{ expiresAt: null } | { expiresAt: { gt: Date } }>;
  } = {};
  if (status) where.status = status;
  if (categoryName) where.category = categoryName;
  if (status === STATUS_PUBLISHED) {
    // Public ACTIVE feed must not surface unpublished or expired requests.
    where.publishedAt = { lte: now };
    where.OR = [{ expiresAt: null }, { expiresAt: { gt: now } }];
  }

  const [items, total] = await Promise.all([
    db.buyRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: safeLimit,
      skip: safeOffset,
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        brandPref: true,
        transaction: true,
        budgetMin: true,
        budgetMax: true,
        city: true,
        province: true,
        status: true,
        verified: true,
        createdAt: true,
      },
    }),
    db.buyRequest.count({ where }),
  ]);

  return {
    items: items.map((r) => ({
      ...r,
      budgetMin: r.budgetMin ? r.budgetMin.toString() : null,
      budgetMax: r.budgetMax ? r.budgetMax.toString() : null,
    })),
    total,
  };
}

// ── getWanted ────────────────────────────────────────────────
/**
 * Return a single wanted request + a best-effort `matchCount`
 * (the number of candidate listings the matching engine would
 * surface for this request).
 *
 * @throws WantedServiceError(404) when the request does not exist.
 */
export async function getWanted(id: string): Promise<{
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  brandPref: string | null;
  transaction: string;
  budgetMin: string | null;
  budgetMax: string | null;
  city: string | null;
  province: string | null;
  deadline: string | null;
  status: string;
  verified: boolean;
  publishedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  userId: string | null;
  matchCount: number;
}> {
  if (!id) {
    throw new WantedServiceError(400, "id الزامی است");
  }

  const request = await db.buyRequest.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      brandPref: true,
      transaction: true,
      budgetMin: true,
      budgetMax: true,
      city: true,
      province: true,
      deadline: true,
      status: true,
      verified: true,
      publishedAt: true,
      expiresAt: true,
      createdAt: true,
      userId: true,
    },
  });
  if (!request) {
    throw new WantedServiceError(404, "درخواست خرید یافت نشد");
  }

  // Best-effort match count — never throws. If the matching
  // engine errors (e.g. BuyRequest is not ACTIVE), matchCount=0.
  let matchCount = 0;
  try {
    const matches = await matchBuyRequest(id, null).catch(() => null);
    if (matches && Array.isArray(matches.candidates)) {
      matchCount = matches.candidates.length;
    }
  } catch {
    matchCount = 0;
  }

  return {
    ...request,
    budgetMin: request.budgetMin ? request.budgetMin.toString() : null,
    budgetMax: request.budgetMax ? request.budgetMax.toString() : null,
    matchCount,
  };
}

// ── closeWanted ──────────────────────────────────────────────
/**
 * Close a wanted request (status → CLOSED). Audited as
 * `marketplace.wanted.close`. The actor (userId) is recorded as
 * the closer. Closing an already-CLOSED request is idempotent
 * (no-op — returns the current state without re-auditing).
 *
 * P0-D: uses the canonical state machine (ALLOWED_TRANSITIONS) + CAS
 * (updateMany constrained by { id, status: before.status }) so a
 * concurrent transition cannot be clobbered. Terminal states (CLOSED/
 * FULFILLED) are rejected with 409 — they cannot be re-closed.
 *
 * @throws WantedServiceError(404) when the request doesn't exist.
 * @throws WantedServiceError(403) when the caller is not the owner.
 * @throws WantedServiceError(409) when the request is in a terminal
 *   state that cannot transition to CLOSED.
 */
export async function closeWanted(
  id: string,
  userId: string,
): Promise<{ id: string; status: string }> {
  if (!id) {
    throw new WantedServiceError(400, "id الزامی است");
  }
  if (!userId) {
    throw new WantedServiceError(400, "userId الزامی است");
  }

  const before = await db.buyRequest.findUnique({
    where: { id },
    select: { id: true, status: true, title: true, userId: true },
  });
  if (!before) {
    throw new WantedServiceError(404, "درخواست خرید یافت نشد");
  }
  // Owner check.
  if (before.userId !== userId) {
    throw new WantedServiceError(403, "اجازه بستن این درخواست را ندارید");
  }
  // Idempotent — already closed.
  if (before.status === STATUS_CLOSED) {
    return { id: before.id, status: before.status };
  }

  // P0-D: state machine — resolve the target via the transition matrix.
  const targetStatus = resolveTransitionTarget(before.status, "close");
  if (!targetStatus) {
    throw new WantedServiceError(
      409,
      `درخواست در وضعیت نهایی «${before.status}» است و قابل بستن نیست.`,
    );
  }

  // P0-C: compare-and-set — only update if the status hasn't changed
  // since our read. A concurrent transition (e.g. admin approved it)
  // results in 0 affected rows → re-read + respond correctly.
  const casResult = await db.buyRequest.updateMany({
    where: { id, status: before.status },
    data: { status: targetStatus },
  });
  if (casResult.count === 0) {
    const current = await db.buyRequest.findUnique({
      where: { id },
      select: { status: true },
    });
    if (current && current.status === STATUS_CLOSED) {
      return { id, status: current.status };
    }
    throw new WantedServiceError(
      409,
      `وضعیت درخواست در حین بستن به «${current?.status ?? "?"}» تغییر کرد. دوباره تلاش کنید.`,
    );
  }

  await logAudit({
    actorId: userId,
    actorType: "USER",
    action: "marketplace.wanted.close",
    entityType: "BuyRequest",
    entityId: id,
    before: { status: before.status },
    after: { status: targetStatus },
    reason: `بستن درخواست خرید ${id} — ${before.title ?? ""}`,
  });

  return { id, status: targetStatus };
}

// ── fulfillWanted (P0-D) ───────────────────────────────────────
/**
 * Mark a wanted request as fulfilled (status → FULFILLED). Audited as
 * `marketplace.wanted.fulfill` (actorType: ADMIN). Idempotent on
 * already-FULFILLED. Uses the canonical state machine + CAS (same
 * pattern as publishWanted/closeWanted). Terminal states (CLOSED/
 * FULFILLED) are rejected with 409.
 *
 * @throws WantedServiceError(404) when the request doesn't exist.
 * @throws WantedServiceError(400) when id or adminUserId is empty.
 * @throws WantedServiceError(409) when the request is in a terminal
 *   state that cannot transition to FULFILLED.
 */
export async function fulfillWanted(
  id: string,
  adminUserId: string,
): Promise<{ id: string; status: string }> {
  if (!id) {
    throw new WantedServiceError(400, "id الزامی است");
  }
  if (!adminUserId) {
    throw new WantedServiceError(400, "adminUserId الزامی است");
  }

  const before = await db.buyRequest.findUnique({
    where: { id },
    select: { id: true, status: true, title: true },
  });
  if (!before) {
    throw new WantedServiceError(404, "درخواست خرید یافت نشد");
  }
  if (before.status === STATUS_FULFILLED) {
    return { id: before.id, status: before.status };
  }

  const targetStatus = resolveTransitionTarget(before.status, "fulfill");
  if (!targetStatus) {
    throw new WantedServiceError(
      409,
      `درخواست در وضعیت نهایی «${before.status}» است و قابل تکمیل نیست.`,
    );
  }

  const casResult = await db.buyRequest.updateMany({
    where: { id, status: before.status },
    data: { status: targetStatus },
  });
  if (casResult.count === 0) {
    const current = await db.buyRequest.findUnique({
      where: { id },
      select: { status: true },
    });
    if (current && current.status === STATUS_FULFILLED) {
      return { id, status: current.status };
    }
    throw new WantedServiceError(
      409,
      `وضعیت درخواست در حین تکمیل به «${current?.status ?? "?"}» تغییر کرد. دوباره تلاش کنید.`,
    );
  }

  await logAudit({
    actorId: adminUserId,
    actorType: "ADMIN",
    action: "marketplace.wanted.fulfill",
    entityType: "BuyRequest",
    entityId: id,
    before: { status: before.status },
    after: { status: targetStatus },
    reason: `تکمیل درخواست خرید ${id} — ${before.title ?? ""}`,
  });

  return { id, status: targetStatus };
}

/**
 * Admin-initiated close (P0-D). Mirrors closeWanted but with ADMIN
 * actorType + no owner check (the admin can close any request).
 * Uses the same state machine + CAS as closeWanted.
 */
export async function closeWantedByAdmin(
  id: string,
  adminUserId: string,
): Promise<{ id: string; status: string }> {
  if (!id) {
    throw new WantedServiceError(400, "id الزامی است");
  }
  if (!adminUserId) {
    throw new WantedServiceError(400, "adminUserId الزامی است");
  }

  const before = await db.buyRequest.findUnique({
    where: { id },
    select: { id: true, status: true, title: true },
  });
  if (!before) {
    throw new WantedServiceError(404, "درخواست خرید یافت نشد");
  }
  if (before.status === STATUS_CLOSED) {
    return { id: before.id, status: before.status };
  }

  const targetStatus = resolveTransitionTarget(before.status, "close");
  if (!targetStatus) {
    throw new WantedServiceError(
      409,
      `درخواست در وضعیت نهایی «${before.status}» است و قابل بستن نیست.`,
    );
  }

  const casResult = await db.buyRequest.updateMany({
    where: { id, status: before.status },
    data: { status: targetStatus },
  });
  if (casResult.count === 0) {
    const current = await db.buyRequest.findUnique({
      where: { id },
      select: { status: true },
    });
    if (current && current.status === STATUS_CLOSED) {
      return { id, status: current.status };
    }
    throw new WantedServiceError(
      409,
      `وضعیت درخواست در حین بستن به «${current?.status ?? "?"}» تغییر کرد. دوباره تلاش کنید.`,
    );
  }

  await logAudit({
    actorId: adminUserId,
    actorType: "ADMIN",
    action: "marketplace.wanted.close",
    entityType: "BuyRequest",
    entityId: id,
    before: { status: before.status },
    after: { status: targetStatus },
    reason: `بستن درخواست خرید ${id} توسط مدیر — ${before.title ?? ""}`,
  });

  return { id, status: targetStatus };
}

/**
 * Bulk transition wanted requests with a compare-and-set that is
 * concurrency-safe per-row. Used by the admin bulk approve/close/fulfill
 * actions. Returns the approved (transitioned) count + the rejected ids
 * (with their current status) so the admin sees which rows were skipped.
 *
 * P0-B: the rejected computation reads the eligible set BEFORE the
 * update (not after), so just-transitioned rows are NOT misclassified
 * as rejected.
 *
 * P0-D: the action is validated against the transition matrix; only
 * rows whose current status allows the transition are affected.
 *
 * @param action — "approve" | "close" | "fulfill"
 * @param ids — deduplicated, validated, capped at 100.
 */
export async function bulkTransitionWanted(
  action: "approve" | "close" | "fulfill",
  rawIds: string[],
  adminUserId: string,
): Promise<{
  approved: number;
  rejected: Array<{ id: string; status: string }>;
  requested: number;
}> {
  if (!adminUserId) {
    throw new WantedServiceError(400, "adminUserId الزامی است");
  }
  // P0-B: deduplicate + validate + cap at 100.
  const uniqueIds = Array.from(new Set(rawIds.map((id) => String(id).trim()).filter(Boolean)));
  if (uniqueIds.length === 0) {
    return { approved: 0, rejected: [], requested: 0 };
  }
  if (uniqueIds.length > 100) {
    throw new WantedServiceError(400, "حداکثر ۱۰۰ درخواست در هر عملیات گروهی مجاز است.");
  }

  // P0-B: read the eligible set BEFORE the update. For "approve", the
  // eligible rows are PENDING + unexpired. For close/fulfill, the
  // eligible rows are those whose status allows the transition.
  const now = new Date();
  const rows = await db.buyRequest.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, status: true, expiresAt: true },
  });
  const rowById = new Map(rows.map((r) => [r.id, r]));

  const eligibleIds: string[] = [];
  const rejected: Array<{ id: string; status: string }> = [];

  for (const id of uniqueIds) {
    const row = rowById.get(id);
    if (!row) {
      // P0-B: nonexistent id — rejected with status "NOT_FOUND".
      rejected.push({ id, status: "NOT_FOUND" });
      continue;
    }
    const target = resolveTransitionTarget(row.status, action);
    if (!target) {
      // Transition not allowed from this status.
      rejected.push({ id, status: row.status });
      continue;
    }
    // For approve, also check expiry.
    if (action === "approve") {
      const isExpired =
        row.expiresAt instanceof Date &&
        Number.isFinite(row.expiresAt.getTime()) &&
        row.expiresAt.getTime() <= now.getTime();
      if (isExpired) {
        rejected.push({ id, status: row.status });
        continue;
      }
    }
    eligibleIds.push(id);
  }

  if (eligibleIds.length === 0) {
    return { approved: 0, rejected, requested: uniqueIds.length };
  }

  // P0-C: compare-and-set bulk update. Constrain by the set of
  // (id, currentStatus) pairs we just read. We group eligible ids by
  // their current status so the CAS where-clause matches exactly.
  // For approve, also constrain by expiry.
  let approvedCount = 0;
  const targetStatus = resolveTransitionTarget("PENDING", action); // same target for all eligible
  const publishedAt = action === "approve" ? now : undefined;

  // Group eligible ids by their current status for an accurate CAS.
  const idsByStatus = new Map<string, string[]>();
  for (const id of eligibleIds) {
    const row = rowById.get(id)!;
    const list = idsByStatus.get(row.status) ?? [];
    list.push(id);
    idsByStatus.set(row.status, list);
  }

  for (const [currentStatus, ids] of idsByStatus) {
    const target = resolveTransitionTarget(currentStatus, action);
    if (!target) continue; // shouldn't happen (we checked above)
    const where: Record<string, unknown> = {
      id: { in: ids },
      status: currentStatus,
    };
    if (action === "approve") {
      where.OR = [{ expiresAt: null }, { expiresAt: { gt: now } }];
    }
    const data: Record<string, unknown> = { status: target };
    if (publishedAt) data.publishedAt = publishedAt;
    const result = await db.buyRequest.updateMany({ where, data });
    approvedCount += result.count;
  }

  // P0-B: the rejected list is already accurate (computed before the
  // update from the pre-read state). Rows that were eligible but whose
  // CAS matched 0 (concurrent transition) are NOT in rejected — they
  // simply don't count as approved. We don't re-read them here; the
  // admin can re-run to see the new state.
  await logAudit({
    actorId: adminUserId,
    actorType: "ADMIN",
    action: action === "approve"
      ? "marketplace.wanted.publishMany"
      : action === "close"
        ? "marketplace.wanted.closeMany"
        : "marketplace.wanted.fulfillMany",
    entityType: "BuyRequest",
    entityId: null,
    before: { requestedAction: action, requestedCount: uniqueIds.length },
    after: {
      approvedCount,
      rejectedCount: rejected.length,
      rejectedIds: rejected,
    },
    reason: `Bulk ${action} of wanted requests via admin API`,
  });

  return { approved: approvedCount, rejected, requested: uniqueIds.length };
}

// ── publishWanted ─────────────────────────────────────────────
/**
 * Approve + publish a PENDING wanted request (status PENDING → ACTIVE,
 * publishedAt → now). This is the moderation gate: an admin reviews the
 * submitted request and publishes it so it becomes visible on the public
 * feed and eligible for matching. Audited as `marketplace.wanted.publish`
 * (actorType: ADMIN).
 *
 * COMPARE-AND-SET (P0-C): the read-then-update race is closed. The
 * transition is performed with updateMany constrained by
 * { id, status: PENDING, OR: [expiresAt null, expiresAt > now] } —
 * if a concurrent request closes/fulfills/expires the row between the
 * read and the write, the updateMany affects 0 rows and we re-read to
 * determine the correct response (409 terminal, 409 expired, or
 * idempotent ACTIVE). A terminal state is NEVER overwritten.
 *
 * STATE MACHINE (P0-D): the transition matrix (ALLOWED_TRANSITIONS)
 * is the single source of truth. Only PENDING→ACTIVE(approve) is
 * valid here. Terminal states (CLOSED/FULFILLED/REJECTED/EXPIRED) are
 * rejected with 409.
 *
 * EXPIRY (P0-5): an expired PENDING request in the moderation queue is
 * rejected with 409 (publishing it would make it immediately un-matchable).
 *
 * REPAIR (P0-6): if a request is ACTIVE but publishedAt is null (legacy
 * inconsistency), the function REPAIRS the record via a CAS update
 * constrained by { id, status: ACTIVE, publishedAt: null } — persisting
 * publishedAt=now rather than returning a fake timestamp. Audited as
 * `marketplace.wanted.publish.repair`.
 *
 * @throws WantedServiceError(404) when the request doesn't exist.
 * @throws WantedServiceError(400) when id or adminUserId is empty.
 * @throws WantedServiceError(409) when the request is in a terminal state
 *   (CLOSED/FULFILLED/REJECTED/EXPIRED) or has already expired.
 */
export async function publishWanted(
  id: string,
  adminUserId: string,
): Promise<{ id: string; status: string; publishedAt: string }> {
  if (!id) {
    throw new WantedServiceError(400, "id الزامی است");
  }
  if (!adminUserId) {
    throw new WantedServiceError(400, "adminUserId الزامی است");
  }

  const before = await db.buyRequest.findUnique({
    where: { id },
    select: { id: true, status: true, title: true, publishedAt: true, expiresAt: true },
  });
  if (!before) {
    throw new WantedServiceError(404, "درخواست خرید یافت نشد");
  }

  const now = new Date();
  const isExpired =
    before.expiresAt instanceof Date &&
    Number.isFinite(before.expiresAt.getTime()) &&
    before.expiresAt.getTime() <= now.getTime();

  // P0-5: expired requests cannot be published, even if still PENDING.
  if (isExpired) {
    throw new WantedServiceError(
      409,
      "این درخواست منقضی شده است و قابل انتشار نیست. برای بازگشایی باید اکشن مستقل بازگشایی استفاده شود.",
    );
  }

  // P0-D: state machine — terminal states are rejected (no CAS needed).
  if (TERMINAL_STATUSES.has(before.status)) {
    throw new WantedServiceError(
      409,
      `درخواست در وضعیت نهایی «${before.status}» است و قابل انتشار نیست. بازگشایی نیازمند اکشن مستقل است.`,
    );
  }

  // Idempotent — already published (ACTIVE with a real publishedAt).
  if (
    before.status === STATUS_PUBLISHED &&
    before.publishedAt instanceof Date &&
    Number.isFinite(before.publishedAt.getTime())
  ) {
    return {
      id: before.id,
      status: before.status,
      publishedAt: before.publishedAt.toISOString(),
    };
  }

  // P0-6: repair — ACTIVE with null/invalid publishedAt. CAS update
  // constrained by { id, status: ACTIVE, publishedAt: null } so a
  // concurrent transition cannot be clobbered.
  if (before.status === STATUS_PUBLISHED) {
    const repairedAt = new Date();
    const repairResult = await db.buyRequest.updateMany({
      where: { id, status: STATUS_PUBLISHED, publishedAt: null },
      data: { publishedAt: repairedAt },
    });
    if (repairResult.count === 0) {
      // A concurrent transition changed the row between our read and
      // the CAS write. Re-read to determine the correct response —
      // do NOT blindly overwrite the new state.
      const current = await db.buyRequest.findUnique({
        where: { id },
        select: { status: true, publishedAt: true },
      });
      if (current && current.status === STATUS_PUBLISHED && current.publishedAt instanceof Date) {
        return { id, status: current.status, publishedAt: current.publishedAt.toISOString() };
      }
      throw new WantedServiceError(409, "وضعیت درخواست در حین انتشار تغییر کرد. دوباره تلاش کنید.");
    }
    await logAudit({
      actorId: adminUserId,
      actorType: "ADMIN",
      action: "marketplace.wanted.publish.repair",
      entityType: "BuyRequest",
      entityId: id,
      before: { status: before.status, publishedAt: null },
      after: { status: STATUS_PUBLISHED, publishedAt: repairedAt.toISOString() },
      reason: `تعمیر تاریخ انتشار درخواست ${id} — ${before.title ?? ""}`,
    });
    return { id, status: STATUS_PUBLISHED, publishedAt: repairedAt.toISOString() };
  }

  // P0-D + P0-C: state machine + compare-and-set. The transition is
  // valid (PENDING→ACTIVE per ALLOWED_TRANSITIONS); the updateMany is
  // constrained by { id, status: PENDING, unexpired } so a concurrent
  // close/fulfill/expire that changes the row between our read and
  // write results in 0 affected rows. We then re-read and respond
  // correctly (409 / idempotent) — the terminal state is NEVER overwritten.
  const targetStatus = resolveTransitionTarget(before.status, "approve");
  if (!targetStatus) {
    throw new WantedServiceError(
      409,
      `وضعیت «${before.status}» قابل انتشار نیست. فقط درخواست‌های در انتظار بررسی (PENDING) قابل تأیید هستند.`,
    );
  }

  const publishedAt = new Date();
  const casResult = await db.buyRequest.updateMany({
    where: {
      id,
      status: before.status,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    data: { status: targetStatus, publishedAt },
  });

  if (casResult.count === 0) {
    // P0-C: the row changed between our read and the CAS write.
    // Re-read to determine the correct response — do NOT overwrite.
    const current = await db.buyRequest.findUnique({
      where: { id },
      select: { status: true, publishedAt: true, expiresAt: true },
    });
    if (!current) {
      throw new WantedServiceError(404, "درخواست خرید یافت نشد");
    }
    // Idempotent: another admin already published it.
    if (current.status === STATUS_PUBLISHED && current.publishedAt instanceof Date) {
      return { id, status: current.status, publishedAt: current.publishedAt.toISOString() };
    }
    // Terminal or expired now — 409 with the actual current state.
    throw new WantedServiceError(
      409,
      `وضعیت درخواست در حین انتشار به «${current.status}» تغییر کرد. دوباره تلاش کنید.`,
    );
  }

  await logAudit({
    actorId: adminUserId,
    actorType: "ADMIN",
    action: "marketplace.wanted.publish",
    entityType: "BuyRequest",
    entityId: id,
    before: { status: before.status },
    after: { status: targetStatus, publishedAt: publishedAt.toISOString() },
    reason: `انتشار درخواست خرید ${id} — ${before.title ?? ""}`,
  });

  return { id, status: targetStatus, publishedAt: publishedAt.toISOString() };
}

// ── getWantedMatches ─────────────────────────────────────────
/**
 * Return the matching-engine candidates for a wanted request.
 *
 * Thin wrapper over matching-service.matchBuyRequest so the API
 * route stays stateless: the service owns the audit + 404/error
 * mapping. Returns the full BuyRequestMatchResult (request +
 * candidates with hydrated display fields).
 *
 * @throws WantedServiceError(404) when the request doesn't exist.
 * @throws WantedServiceError(400) when id is empty.
 */
export async function getWantedMatches(
  id: string,
  userId?: string | null,
): Promise<BuyRequestMatchResult> {
  if (!id) {
    throw new WantedServiceError(400, "id الزامی است");
  }
  // Verify existence first so we can return a clean 404 (the
  // matching-service throws a MatchingServiceError(404) too, but
  // we wrap it so the route handler only needs to catch one
  // service-error class).
  const request = await db.buyRequest.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!request) {
    throw new WantedServiceError(404, "درخواست خرید یافت نشد");
  }

  try {
    return await matchBuyRequest(id, userId ?? null);
  } catch (err: unknown) {
    // Re-throw service errors as-is; wrap anything else.
    if (err instanceof WantedServiceError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new WantedServiceError(500, `خطای موتور تطابق: ${msg}`);
  }
}
