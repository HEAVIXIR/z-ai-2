/**
 * Canonical HEAVIX V1.1 transaction-to-category routing.
 *
 * Category identifies the underlying catalog subject; transaction intent is
 * a separate dimension. SALE, RENT, AUCTION and QUOTE asset flows therefore
 * select CATALOG leaves. WANTED requests are handled by /api/wanted and use
 * CATALOG for buy/rent intent or SERVICE for service intent. Only service
 * supply/request transaction types use SERVICE categories.
 *
 * NOTE on SERVICE_OFFER: SERVICE_OFFER is now in the base-7 V1.1
 * TransactionType seed (prisma/seed-taxonomy-v11.ts). It was
 * previously seeded only by the supplemental seed
 * (prisma/seed-service-and-mineral-taxonomy.ts) but has been
 * promoted to the base seed to ensure it's always present.
 * It is the supply-side counterpart to SERVICE_REQUEST demand.
 */
export type ListingCategoryLayer = "CATALOG" | "MARKETPLACE" | "SERVICE" | "FALLBACK";

const TRANSACTION_CATEGORY_LAYER: Record<string, ListingCategoryLayer> = {
  SALE: "CATALOG",
  RENT: "CATALOG",
  // WANTED is persisted as BuyRequest through /api/wanted, not Listing.
  // Its category layer depends on BuyRequest.intent and is validated there.
  WANTED: "CATALOG",
  QUOTE: "CATALOG",
  AUCTION: "CATALOG",
  SERVICE_REQUEST: "SERVICE",
  // Canonical service-supply type. Now in the base-7 V1.1 seed.
  SERVICE_OFFER: "SERVICE",
};

export function categoryLayerForTransactionType(key: string): ListingCategoryLayer {
  return TRANSACTION_CATEGORY_LAYER[String(key ?? "").trim().toUpperCase()] ?? "CATALOG";
}

const MARKETPLACE_TRANSACTION_TYPES = new Set(["RENT", "WANTED", "QUOTE", "AUCTION"]);

/** Transaction intent classification is intentionally independent from Category.layer. */
export function isMarketplaceTransactionType(key: string): boolean {
  return MARKETPLACE_TRANSACTION_TYPES.has(String(key ?? "").trim().toUpperCase());
}

export function isServiceTransactionType(key: string): boolean {
  return categoryLayerForTransactionType(key) === "SERVICE";
}

export function isRequestTransactionType(key: string): boolean {
  const normalized = String(key ?? "").trim().toUpperCase();
  return normalized === "WANTED" || normalized === "QUOTE" || normalized === "SERVICE_REQUEST";
}

/**
 * The set of Listing.listingType values that represent SUPPLY — i.e.
 * someone offering an asset/service for sale, rent, or auction. The
 * matching engine only considers supply listings as match candidates
 * for a BuyRequest (demand). Demand-side listing types (WANTED,
 * QUOTE, SERVICE_REQUEST) must never be returned as candidates,
 * otherwise a demand post could be "matched" against another demand
 * post (demand/supply contamination).
 */
export const SUPPLY_LISTING_TYPES = [
  "SALE",
  "RENT",
  "AUCTION",
  // Legacy alias — someone offering a service. Retained for back-compat.
  "SERVICE_OFFER",
] as const;

export function isSupplyListingType(key: string): boolean {
  const normalized = String(key ?? "").trim().toUpperCase();
  return (SUPPLY_LISTING_TYPES as readonly string[]).includes(normalized);
}

// ── Demand intent (WANTED / BuyRequest side) ────────────────────
/**
 * A demand-side request (BuyRequest) expresses an *intent*: what the
 * buyer wants to do — buy, rent, both, or procure a service. The
 * intent is stored in `BuyRequest.transaction` (a free-text String
 * column, so NO schema migration is required) and is what the matching
 * engine uses to narrow the supply candidate pool to *compatible*
 * listing types only.
 *
 * Vocabulary is deliberately the existing demand-intent vocabulary the
 * frontend already understands (see TRANSACTION_LABELS in
 * RequestsClient.tsx and ActiveRequestsSection.tsx):
 *   - "SALE"            → buy intent   (خرید)
 *   - "RENT"            → rent intent  (اجاره)
 *   - "SALE_AND_RENT"   → flexible     (خرید/اجاره)
 *   - "SERVICE_REQUEST" → service demand (خدمات)
 *
 * Legacy rows created before the intent wiring stored "WANTED" (the
 * listing-type label) in `transaction`. `normalizeDemandIntent`
 * collapses those onto the buy intent so existing demand keeps
 * matching SALE + AUCTION supply — the same surface it had before.
 */
export type DemandIntent =
  | "SALE"
  | "RENT"
  | "SALE_AND_RENT"
  | "SERVICE_REQUEST";

/**
 * The canonical allowlist of demand intents. Used by the fail-closed
 * validation at the createWanted API boundary: an explicitly-provided
 * intent not in this set is rejected with 400 (a garbage intent must
 * never silently create a buy request). normalizeDemandIntent stays
 * permissive for read-back compatibility with legacy rows.
 */
export const DEMAND_INTENTS: readonly DemandIntent[] = [
  "SALE",
  "RENT",
  "SALE_AND_RENT",
  "SERVICE_REQUEST",
];

/**
 * Type guard: is `value` a canonical demand intent (case-insensitive)?
 * Used by createWanted's fail-closed validation.
 */
export function isValidDemandIntent(value: unknown): value is DemandIntent {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toUpperCase();
  return (DEMAND_INTENTS as readonly string[]).includes(normalized);
}

/**
 * Map a demand intent → the supply listing types that can satisfy it.
 * This is the contract the matching engine enforces so that, e.g., a
 * rent-demand never matches a sale-supply (and vice versa).
 *
 *   - SALE (buy)            → SALE, AUCTION   (auctions are a sale mechanism)
 *   - RENT                  → RENT
 *   - SALE_AND_RENT         → SALE, RENT, AUCTION (flexible demand)
 *   - SERVICE_REQUEST       → SERVICE_OFFER
 *
 * Unknown/legacy intents fall back to the buy-intent surface so the
 * engine never silently drops an otherwise-eligible request.
 */
export const DEMAND_INTENT_TO_SUPPLY_TYPES: Record<
  DemandIntent,
  readonly string[]
> = {
  SALE: ["SALE", "AUCTION"],
  RENT: ["RENT"],
  SALE_AND_RENT: ["SALE", "RENT", "AUCTION"],
  SERVICE_REQUEST: ["SERVICE_OFFER"],
};

const BUY_INTENT_SURFACE = DEMAND_INTENT_TO_SUPPLY_TYPES.SALE;

/**
 * Normalize the raw `BuyRequest.transaction` value into a canonical
 * demand intent. Anything unrecognized (incl. the legacy "WANTED"
 * listing-type label, null, empty, or garbage) collapses onto the
 * buy intent "SALE" — the safest default and the historical behavior
 * (every prior WANTED row was, by construction, a buy-demand since the
 * form never captured rent/service intent).
 */
export function normalizeDemandIntent(
  transaction: string | null | undefined,
): DemandIntent {
  const normalized = String(transaction ?? "").trim().toUpperCase();
  if (normalized === "RENT") return "RENT";
  if (normalized === "SALE_AND_RENT") return "SALE_AND_RENT";
  if (
    normalized === "SERVICE_REQUEST" ||
    normalized === "SERVICE" ||
    normalized === "SERVICE_OFFER"
  ) {
    return "SERVICE_REQUEST";
  }
  // "SALE", "BUY", "WANTED", "", null, unknown → buy intent.
  return "SALE";
}

/**
 * Return the supply listing types that can satisfy the demand encoded
 * in `transaction` (a raw BuyRequest.transaction value). Used by the
 * matching engine to constrain the candidate query.
 */
export function compatibleSupplyTypesForTransaction(
  transaction: string | null | undefined,
): readonly string[] {
  return DEMAND_INTENT_TO_SUPPLY_TYPES[normalizeDemandIntent(transaction)];
}

export function requiresListingImage(key: string): boolean {
  const normalized = String(key ?? "").trim().toUpperCase();
  return !["WANTED", "QUOTE", "SERVICE_REQUEST", "SERVICE_OFFER"].includes(normalized);
}

export function requiresListingPrice(key: string): boolean {
  const normalized = String(key ?? "").trim().toUpperCase();
  return normalized === "SALE" || normalized === "RENT";
}
