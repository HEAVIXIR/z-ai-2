/**
 * Canonical HEAVIX V1.1 transaction-to-category routing.
 *
 * CATALOG: product/machine listings (SALE)
 * MARKETPLACE: rental, trading/request, and auction flows
 * SERVICE: service requests (SERVICE_OFFER is retained only as a legacy alias)
 */
export type ListingCategoryLayer = "CATALOG" | "MARKETPLACE" | "SERVICE" | "FALLBACK";

const TRANSACTION_CATEGORY_LAYER: Record<string, ListingCategoryLayer> = {
  SALE: "CATALOG",
  RENT: "MARKETPLACE",
  WANTED: "MARKETPLACE",
  QUOTE: "MARKETPLACE",
  AUCTION: "MARKETPLACE",
  SERVICE_REQUEST: "SERVICE",
  // Legacy compatibility only; not part of the canonical V1.1 seed list.
  SERVICE_OFFER: "SERVICE",
};

export function categoryLayerForTransactionType(key: string): ListingCategoryLayer {
  return TRANSACTION_CATEGORY_LAYER[String(key ?? "").trim().toUpperCase()] ?? "CATALOG";
}

export function isMarketplaceTransactionType(key: string): boolean {
  return categoryLayerForTransactionType(key) === "MARKETPLACE";
}

export function isServiceTransactionType(key: string): boolean {
  return categoryLayerForTransactionType(key) === "SERVICE";
}

export function isRequestTransactionType(key: string): boolean {
  const normalized = String(key ?? "").trim().toUpperCase();
  return normalized === "WANTED" || normalized === "QUOTE";
}

export function requiresListingImage(key: string): boolean {
  const normalized = String(key ?? "").trim().toUpperCase();
  return !["WANTED", "QUOTE", "SERVICE_REQUEST", "SERVICE_OFFER"].includes(normalized);
}

export function requiresListingPrice(key: string): boolean {
  const normalized = String(key ?? "").trim().toUpperCase();
  return normalized === "SALE" || normalized === "RENT";
}
