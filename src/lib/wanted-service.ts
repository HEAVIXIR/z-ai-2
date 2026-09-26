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
// The BuyRequest schema uses a free-text String status. The
// public marketplace feed uses ACTIVE; the task spec for
// createWanted mandates PUBLISHED. Both coexist (the public
// list route filters on ACTIVE; we publish to ACTIVE so the
// public list shows the new request immediately, and the audit
// records `status: PUBLISHED` so the intent — "this is a
// published wanted request" — is preserved in the trail).
const STATUS_PUBLISHED = "ACTIVE"; // schema-active = publicly visible
const STATUS_CLOSED = "CLOSED";

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
  brandId?: string | null;
  transactionType?: string | null;
  province?: string | null;
  city?: string | null;
  userId: string;
}): Promise<{ id: string; status: string }> {
  const {
    title,
    description = null,
    quantity = null,
    budgetMin,
    budgetMax,
    categoryId = null,
    brandId = null,
    transactionType = null,
    province = null,
    city = null,
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

  // ── Resolve categoryId/brandId → category/brandPref names ──
  // (best-effort — null when the lookup fails; we still create
  // the request, just without the resolved name.)
  const [categoryName, brandName] = await Promise.all([
    category_idToName(categoryId),
    brand_idToName(brandId),
  ]);

  // ── Persist ──
  const request = await db.buyRequest.create({
    data: {
      title: title.trim().slice(0, 200),
      description: description ? String(description).slice(0, 2000) : null,
      category: categoryName,
      brandPref: brandName,
      transaction: transactionType || "SALE",
      budgetMin: toBigInt(budgetMin),
      budgetMax: toBigInt(budgetMax),
      city: city ? String(city) : null,
      province: province ? String(province) : null,
      status: STATUS_PUBLISHED, // schema-active = publicly visible
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
      status: "PUBLISHED", // the task-spec semantic status
      schemaStatus: request.status, // what we actually wrote
      description: description ? String(description).slice(0, 500) : null,
      quantity: quantity ?? null, // preserved (no schema column)
      budgetMin:
        toBigInt(budgetMin) !== null ? toBigInt(budgetMin)!.toString() : null,
      budgetMax:
        toBigInt(budgetMax) !== null ? toBigInt(budgetMax)!.toString() : null,
      categoryId: categoryId ?? null,
      brandId: brandId ?? null,
      category: categoryName,
      brandPref: brandName,
      transactionType: transactionType || "SALE",
      province: province ?? null,
      city: city ?? null,
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
    userId: string | null;
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
  const where: {
    status?: string;
    category?: string;
  } = {};
  if (status) where.status = status;
  if (categoryName) where.category = categoryName;

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
        userId: true,
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
 * @throws WantedServiceError(404) when the request doesn't exist.
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
  // Idempotent — already closed.
  if (before.status === STATUS_CLOSED) {
    return { id: before.id, status: before.status };
  }

  const after = await db.buyRequest.update({
    where: { id },
    data: { status: STATUS_CLOSED },
    select: { id: true, status: true },
  });

  await logAudit({
    actorId: userId,
    actorType: "ADMIN",
    action: "marketplace.wanted.close",
    entityType: "BuyRequest",
    entityId: id,
    before: { status: before.status },
    after: { status: after.status },
    reason: `بستن درخواست خرید ${id} — ${before.title ?? ""}`,
  });

  return { id: after.id, status: after.status };
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
