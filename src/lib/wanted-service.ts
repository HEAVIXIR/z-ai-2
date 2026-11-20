/**
 * HEAVIX — Wanted Service Layer (Phase 7 — Wanted/RFQ/Matching)
 * ------------------------------------------------------------
 * Canonical WANTED request service.
 *
 * createWanted validates demand intent, taxonomy ownership, typed
 * attributes and required fields, then atomically writes BuyRequest
 * structured columns plus parent/child attribute rows. Database
 * idempotency is scoped to the authenticated owner; audit remains a
 * separate best-effort trail after the canonical transaction commits.
 *
 * listWanted/getWanted expose canonical taxonomy references and typed
 * attribute values. Public listing remains limited to published,
 * active, non-expired requests; owner and moderation reads are separately
 * access-controlled by their API/page boundaries.
 *
 * Lifecycle transitions use the existing state machine and compare-and-
 * set updates. Audit failures do not roll back canonical mutations.
 */
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { matchBuyRequest, BuyRequestMatchResult } from "@/lib/matching-service";
import { normalizeDemandIntent, isValidDemandIntent } from "@/lib/transaction-type-routing";
import { validateBuyRequestAttributeValues, type NormalizedBuyRequestAttributeValue } from "@/lib/buy-request-attributes";
import { Prisma } from "@prisma/client";

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
const STATUS_REJECTED = "REJECTED"; // H.2.6: moderation rejection (admin)

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
  PENDING: { approve: STATUS_PUBLISHED, close: STATUS_CLOSED, fulfill: STATUS_FULFILLED, reject: STATUS_REJECTED },
  ACTIVE: { close: STATUS_CLOSED, fulfill: STATUS_FULFILLED, reject: STATUS_REJECTED },
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
function resolveTransitionTarget(currentStatus: string, action: "approve" | "close" | "fulfill" | "reject"): string | null {
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
 * Field mapping:
 *   - title/description/budget/location → canonical BuyRequest scalar fields
 *   - quantity/categoryId/brandId/modelId/serviceTypeId/intent → canonical
 *     BuyRequest columns + taxonomy foreign keys (migration H.3)
 *   - attributeValues → typed BuyRequestAttributeValue parents and
 *     BuyRequestAttributeOption children for MULTI_SELECT
 *   - legacy category/brand display strings remain populated for older readers
 *   - userId → BuyRequest.userId (owner); idempotency is owner-scoped
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
  countryId?: string | null;
  provinceId?: string | null;
  cityId?: string | null;
  deadline?: string | null;
  requesterName?: string | null;
  requesterPhone?: string | null;
  modelId?: string | null;
  serviceTypeId?: string | null;
  attributeValues?: unknown[] | null;
  images?: Array<{ assetId: string; url: string; alt?: string | null }>;
  userId: string;
  /**
   * Optional stable delivery key. It is written to BuyRequest's owner-scoped
   * composite unique key and the audit trail. The API route handles sequential
   * replay; the DB constraint closes concurrent create races without
   * cross-user key collisions.
   */
  idempotencyKey?: string | null;
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
    countryId = null,
    provinceId = null,
    cityId = null,
    deadline = null,
    requesterName = null,
    requesterPhone = null,
    modelId = null,
    serviceTypeId = null,
    attributeValues = null,
    images = [],
    userId,
    idempotencyKey = null,
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
  // It is stored in both BuyRequest.transaction (legacy compatibility) and
  // BuyRequest.intent (canonical structured field) for matching/filtering.
  // Prefer the explicit `intent` param; fall back to the legacy
  // `transactionType` alias (which carried the listing-type label,
  // e.g. "WANTED"). normalizeDemandIntent collapses legacy/unknown
  // values onto the buy intent (SALE) so existing callers keep working
  // and existing rows keep matching SALE + AUCTION supply.
  const resolvedIntent = normalizeDemandIntent(intent ?? transactionType);

  // ── H.3: validate attribute values (fail-closed type + category/model membership) ──
  // Mirrors validateListingAttributeValues but for the BuyRequest parent/child
  // attribute tables. Runs BEFORE the create so a bad payload never reaches the
  // transaction. The validated values are written inside the same $transaction
  // as the BuyRequest row (atomic — an attribute write failure rolls back the
  // whole request, no orphan BuyRequest without its spec).
  let validatedAttributes: NormalizedBuyRequestAttributeValue[] = [];
  if (attributeValues !== null && attributeValues !== undefined && !Array.isArray(attributeValues)) {
    throw new WantedServiceError(400, "attributeValues باید یک آرایه باشد.");
  }
  // Always run server-side validation, including when the client submits no
  // attributes: required CategoryAttribute/ProductModelAttribute values must
  // not be bypassable by calling the API directly or omitting the payload.
  const validation = await validateBuyRequestAttributeValues(
    db,
    { categoryId, modelId },
    Array.isArray(attributeValues) ? attributeValues : [],
    false, // isAdmin — sellers cannot self-assert ADMIN_VERIFIED
    true,  // enforceRequired — server is authoritative for required attributes
  );
  if (!validation.ok) {
    throw new WantedServiceError(400, validation.error);
  }
  validatedAttributes = validation.values;

  // ── H.3: Persist (atomic — BuyRequest + structured FKs + attribute parent/child) ──
  // All structured fields now have real columns (migration
  // 20261119160000_wanted_structural_storage). The create + attribute writes
  // commit together inside a $transaction so a failure in any part rolls back
  // the whole request (no orphan BuyRequest, no orphan attribute rows).
  //
  // DB-level idempotency: idempotencyKey is written to BuyRequest.idempotencyKey
  // (composite unique on userId + idempotencyKey). A truly concurrent double-submit (race before either request
  // audits) is caught by the P2002 unique violation — we fetch the existing
  // row and return it idempotently. This closes the gap the audit-log-backed
  // idempotency leaves open (sequential retries were already handled in the
  // API route via findIdempotentResult).
  let request: { id: string; title: string; status: string; category: string | null; brandPref: string | null };
  try {
    request = await db.$transaction(async (tx) => {
      const created = await tx.buyRequest.create({
        data: {
          title: title.trim().slice(0, 200),
          description: description ? String(description).slice(0, 2000) : null,
          // Free-text display names are KEPT for back-compat (search/display
          // that reads the string columns). The canonical FKs below are what
          // the matching engine + structured filters use.
          category: categoryName ?? (category ? String(category).trim().slice(0, 120) : null),
          brandPref: brandName ?? (brandPref ? String(brandPref).trim().slice(0, 120) : null),
          transaction: resolvedIntent,
          budgetMin: toBigInt(budgetMin),
          budgetMax: toBigInt(budgetMax),
          city: city ? String(city).slice(0, 120) : null,
          province: province ? String(province).slice(0, 120) : null,
          countryId: countryId ?? null,
          provinceId: provinceId ?? null,
          cityId: cityId ?? null,
          deadline: deadline ? String(deadline).slice(0, 120) : null,
          publishedAt,
          expiresAt,
          requesterName: requesterName ? String(requesterName).slice(0, 120) : null,
          requesterPhone: requesterPhone ? String(requesterPhone).slice(0, 40) : null,
          status: STATUS_PENDING, // moderation gate — admin must approve before publication
          verified: false,
          userId,
          // ── H.3 structured-spec columns (canonical FKs) ──
          quantity: quantity ?? null,
          categoryId: categoryId ?? null,
          brandId: brandId ?? null,
          modelId: modelId ?? null,
          serviceTypeId: serviceTypeId ?? null,
          intent: resolvedIntent,
          idempotencyKey: idempotencyKey ?? null,
          // ── H.3 attribute parent/child rows (nested create, same transaction) ──
          ...(images.length
            ? {
                images: {
                  create: images.map((image, index) => ({
                    assetId: image.assetId,
                    url: image.url,
                    alt: image.alt ?? null,
                    isPrimary: index === 0,
                    sortOrder: index,
                  })),
                },
              }
            : {}),
          ...(validatedAttributes.length
            ? {
                attributeValues: {
                  create: validatedAttributes.map((av) => ({
                    attributeId: av.attributeId,
                    textValue: av.textValue,
                    numberValue: av.numberValue,
                    booleanValue: av.booleanValue,
                    dateValue: av.dateValue,
                    optionId: av.optionId,
                    unit: av.unit,
                    sourceType: av.sourceType,
                    confidence: av.confidence,
                    sourceReference: av.sourceReference,
                    verifiedAt: av.verifiedAt,
                    verifiedBy: av.verifiedBy,
                    // MULTI_SELECT child rows (one per selected option).
                    ...(av.selectedOptionIds.length
                      ? {
                          selectedOptions: {
                            create: av.selectedOptionIds.map((oid) => ({ optionId: oid })),
                          },
                        }
                      : {}),
                  })),
                },
              }
            : {}),
        },
        select: {
          id: true,
          title: true,
          status: true,
          category: true,
          brandPref: true,
        },
      });
      return created;
    });
  } catch (err: unknown) {
    // H.3: DB-enforced idempotency — a truly concurrent double-submit with the
    // same idempotencyKey hits the @unique constraint (P2002). Fetch the
    // existing row and return it idempotently instead of erroring.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && idempotencyKey) {
      const existing = await db.buyRequest.findFirst({
        where: { idempotencyKey, userId },
        select: { id: true, title: true, status: true, category: true, brandPref: true },
      });
      if (existing) {
        return { id: existing.id, status: existing.status };
      }
    }
    throw err;
  }

  // ── Audit (best-effort) ──
  await logAudit({
    actorId: userId,
    actorType: "USER",
    action: "marketplace.wanted.create",
    entityType: "BuyRequest",
    entityId: request.id,
    idempotencyKey: idempotencyKey ?? null,
    after: {
      title: request.title,
      status: "PENDING_REVIEW", // the task-spec semantic status (awaiting moderation)
      schemaStatus: request.status, // what we actually wrote (PENDING)
      description: description ? String(description).slice(0, 500) : null,
      // H.3: quantity is now a real BuyRequest column (migration
      // 20261119160000). The audit `after` payload mirrors it for the
      // audit trail; the canonical value lives in BuyRequest.quantity.
      quantity: quantity ?? null,
      budgetMin:
        toBigInt(budgetMin) !== null ? toBigInt(budgetMin)!.toString() : null,
      budgetMax:
        toBigInt(budgetMax) !== null ? toBigInt(budgetMax)!.toString() : null,
      categoryId: categoryId ?? null,
      brandId: brandId ?? null,
      category: categoryName ?? category ?? null,
      brandPref: brandName ?? brandPref ?? null,
      modelId: modelId ?? null,
      serviceTypeId: serviceTypeId ?? null, // H.3: now a real FK column
      // H.3: structured attribute snapshots are now persisted canonically in
      // BuyRequestAttributeValue (parent) + BuyRequestAttributeOption (child).
      // The audit payload records the count for the trail; the values live in
      // the typed relation.
      attributeValuesPersisted: validatedAttributes.length,
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
      countryId: countryId ?? null,
      provinceId: provinceId ?? null,
      cityId: cityId ?? null,
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
  brandId?: string | null;
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
    // H.3 structured-spec fields (canonical, for structured filtering/matching).
    quantity: number | null;
    categoryId: string | null;
    brandId: string | null;
    modelId: string | null;
    serviceTypeId: string | null;
    intent: string | null;
    // H.3 resolved taxonomy names (single round-trip).
    categoryName: string | null;
    brandName: string | null;
    modelName: string | null;
    serviceTypeName: string | null;
  }>;
  total: number;
}> {
  const {
    status = "ACTIVE",
    categoryId = null,
    brandId = null,
    limit = 20,
    offset = 0,
  } = params;

  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const safeOffset = Math.max(0, Number(offset) || 0);

  // H.3: filter by the canonical categoryId FK (no more name-resolution).
  // Legacy rows with categoryId=null are excluded by an exact-id filter; the
  // free-text `category` column is kept for display only.
  const now = new Date();
  const where: {
    status?: string;
    categoryId?: string;
    brandId?: string;
    publishedAt?: { lte: Date };
    OR?: Array<{ expiresAt: null } | { expiresAt: { gt: Date } }>;
  } = {};
  if (status) where.status = status;
  if (categoryId) where.categoryId = categoryId;
  if (brandId) where.brandId = brandId;
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
        // H.3 structured-spec columns.
        quantity: true,
        categoryId: true,
        brandId: true,
        modelId: true,
        serviceTypeId: true,
        intent: true,
        // H.3 resolved taxonomy names.
        categoryRef: { select: { name: true } },
        brandRef: { select: { name: true } },
        modelRef: { select: { name: true } },
        serviceTypeRef: { select: { nameFa: true } },
        images: { orderBy: { sortOrder: "asc" }, select: { id: true, url: true, alt: true, isPrimary: true, sortOrder: true } },
      },
    }),
    db.buyRequest.count({ where }),
  ]);

  return {
    items: items.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      category: r.category,
      brandPref: r.brandPref,
      transaction: r.transaction,
      budgetMin: r.budgetMin ? r.budgetMin.toString() : null,
      budgetMax: r.budgetMax ? r.budgetMax.toString() : null,
      city: r.city,
      province: r.province,
      status: r.status,
      verified: r.verified,
      createdAt: r.createdAt,
      // H.3 structured-spec fields.
      quantity: r.quantity,
      categoryId: r.categoryId,
      brandId: r.brandId,
      modelId: r.modelId,
      serviceTypeId: r.serviceTypeId,
      intent: r.intent,
      categoryName: r.categoryRef?.name ?? null,
      brandName: r.brandRef?.name ?? null,
      modelName: r.modelRef?.name ?? null,
      serviceTypeName: r.serviceTypeRef?.nameFa ?? null,
      images: r.images,
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
  // H.3 structured-spec fields (canonical).
  quantity: number | null;
  categoryId: string | null;
  brandId: string | null;
  modelId: string | null;
  serviceTypeId: string | null;
  intent: string | null;
  // H.3 resolved taxonomy names (for display without a second round-trip).
  categoryName: string | null;
  brandName: string | null;
  modelName: string | null;
  serviceTypeName: string | null;
  images: Array<{ id: string; url: string; alt: string | null; isPrimary: boolean; sortOrder: number }>;
  // H.3 typed attribute values (parent + child MULTI_SELECT options).
  attributeValues: Array<{
    id: string;
    attributeId: string;
    textValue: string | null;
    numberValue: number | null;
    booleanValue: boolean | null;
    dateValue: Date | null;
    optionId: string | null;
    unit: string | null;
    sourceType: string | null;
    selectedOptions: Array<{ optionId: string }>;
  }>;
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
      // H.3 structured-spec columns.
      quantity: true,
      categoryId: true,
      brandId: true,
      modelId: true,
      serviceTypeId: true,
      intent: true,
      // H.3 resolved taxonomy names (single round-trip via the FK relations).
      categoryRef: { select: { name: true } },
      brandRef: { select: { name: true } },
      modelRef: { select: { name: true } },
      serviceTypeRef: { select: { nameFa: true } },
      images: { orderBy: { sortOrder: "asc" }, select: { id: true, url: true, alt: true, isPrimary: true, sortOrder: true } },
      // H.3 typed attribute values (parent rows + child MULTI_SELECT options).
      attributeValues: {
        select: {
          id: true,
          attributeId: true,
          textValue: true,
          numberValue: true,
          booleanValue: true,
          dateValue: true,
          optionId: true,
          unit: true,
          sourceType: true,
          selectedOptions: { select: { optionId: true } },
        },
      },
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
    id: request.id,
    title: request.title,
    description: request.description,
    category: request.category,
    brandPref: request.brandPref,
    transaction: request.transaction,
    budgetMin: request.budgetMin ? request.budgetMin.toString() : null,
    budgetMax: request.budgetMax ? request.budgetMax.toString() : null,
    city: request.city,
    province: request.province,
    deadline: request.deadline,
    status: request.status,
    verified: request.verified,
    publishedAt: request.publishedAt,
    expiresAt: request.expiresAt,
    createdAt: request.createdAt,
    userId: request.userId,
    // H.3 structured-spec fields.
    quantity: request.quantity,
    categoryId: request.categoryId,
    brandId: request.brandId,
    modelId: request.modelId,
    serviceTypeId: request.serviceTypeId,
    intent: request.intent,
    categoryName: request.categoryRef?.name ?? null,
    brandName: request.brandRef?.name ?? null,
    modelName: request.modelRef?.name ?? null,
    serviceTypeName: request.serviceTypeRef?.nameFa ?? null,
    images: request.images,
    attributeValues: request.attributeValues.map((av) => ({
      id: av.id,
      attributeId: av.attributeId,
      textValue: av.textValue,
      numberValue: av.numberValue,
      booleanValue: av.booleanValue,
      dateValue: av.dateValue,
      optionId: av.optionId,
      unit: av.unit,
      sourceType: av.sourceType,
      selectedOptions: av.selectedOptions.map((so) => ({ optionId: so.optionId })),
    })),
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

// ── rejectWanted (H.2.6) ───────────────────────────────────────
/**
 * Reject a wanted request (status → REJECTED). Moderation action owned
 * by admins. Audited as `marketplace.wanted.reject` (actorType: ADMIN).
 * Idempotent on already-REJECTED. Uses the canonical state machine +
 * CAS (same pattern as closeWantedByAdmin). Terminal states (CLOSED,
 * FULFILLED, EXPIRED, REJECTED) are rejected with 409.
 *
 * Previously REJECTED was a recognized terminal status but had NO
 * inbound transition and NO service function — admin could not put a
 * request into REJECTED via any API. This completes the moderation
 * lifecycle so a reviewer can reject (not just close) a request.
 *
 * @throws WantedServiceError(404) when the request doesn't exist.
 * @throws WantedServiceError(400) when id or adminUserId is empty.
 * @throws WantedServiceError(409) when the request is in a terminal
 *   state that cannot transition to REJECTED.
 */
export async function rejectWanted(
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
  // Idempotent — already rejected.
  if (before.status === STATUS_REJECTED) {
    return { id: before.id, status: before.status };
  }

  const targetStatus = resolveTransitionTarget(before.status, "reject");
  if (!targetStatus) {
    throw new WantedServiceError(
      409,
      `درخواست در وضعیت نهایی «${before.status}» است و قابل رد کردن نیست.`,
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
    if (current && current.status === STATUS_REJECTED) {
      return { id, status: current.status };
    }
    throw new WantedServiceError(
      409,
      `وضعیت درخواست در حین رد کردن به «${current?.status ?? "?"}» تغییر کرد. دوباره تلاش کنید.`,
    );
  }

  await logAudit({
    actorId: adminUserId,
    actorType: "ADMIN",
    action: "marketplace.wanted.reject",
    entityType: "BuyRequest",
    entityId: id,
    before: { status: before.status },
    after: { status: targetStatus },
    reason: `رد درخواست خرید ${id} توسط مدیر — ${before.title ?? ""}`,
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
  action: "approve" | "close" | "fulfill" | "reject",
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
