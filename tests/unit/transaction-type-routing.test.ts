import { describe, expect, it } from "vitest";
import {
  categoryLayerForTransactionType,
  compatibleSupplyTypesForTransaction,
  DEMAND_INTENTS,
  isMarketplaceTransactionType,
  isRequestTransactionType,
  isServiceTransactionType,
  isValidDemandIntent,
  normalizeDemandIntent,
  requiresListingImage,
  requiresListingPrice,
} from "@/lib/transaction-type-routing";

describe("HEAVIX V1.1 transaction routing", () => {
  it.each([
    ["SALE", "CATALOG"],
    ["RENT", "CATALOG"],
    ["WANTED", "CATALOG"],
    ["QUOTE", "CATALOG"],
    ["AUCTION", "CATALOG"],
    ["SERVICE_REQUEST", "SERVICE"],
    ["SERVICE_OFFER", "SERVICE"],
  ] as const)("routes %s to %s", (key, layer) => {
    expect(categoryLayerForTransactionType(key)).toBe(layer);
  });

  it("keeps transaction intent separate from the underlying category layer", () => {
    expect(isMarketplaceTransactionType("WANTED")).toBe(true);
    expect(isMarketplaceTransactionType("RENT")).toBe(true);
    expect(isMarketplaceTransactionType("AUCTION")).toBe(true);
    expect(isMarketplaceTransactionType("QUOTE")).toBe(true);
    expect(isMarketplaceTransactionType("SALE")).toBe(false);
    expect(isServiceTransactionType("SERVICE_REQUEST")).toBe(true);
    expect(isRequestTransactionType("QUOTE")).toBe(true);
    expect(isRequestTransactionType("SERVICE_REQUEST")).toBe(true);
    expect(isRequestTransactionType("RENT")).toBe(false);
  });

  it("does not require price or images for wanted and quote requests", () => {
    for (const key of ["WANTED", "QUOTE", "SERVICE_REQUEST", "SERVICE_OFFER"]) {
      expect(requiresListingImage(key)).toBe(false);
      expect(requiresListingPrice(key)).toBe(false);
    }
    expect(requiresListingImage("SALE")).toBe(true);
    expect(requiresListingPrice("SALE")).toBe(true);
    expect(requiresListingImage("RENT")).toBe(true);
    expect(requiresListingPrice("RENT")).toBe(true);
    expect(requiresListingImage("AUCTION")).toBe(true);
    expect(requiresListingPrice("AUCTION")).toBe(false);
  });
});

describe("demand intent normalization and supply compatibility", () => {
  it("normalizes the canonical demand-intent vocabulary unchanged", () => {
    expect(normalizeDemandIntent("SALE")).toBe("SALE");
    expect(normalizeDemandIntent("RENT")).toBe("RENT");
    expect(normalizeDemandIntent("SALE_AND_RENT")).toBe("SALE_AND_RENT");
    expect(normalizeDemandIntent("SERVICE_REQUEST")).toBe("SERVICE_REQUEST");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(normalizeDemandIntent("rent")).toBe("RENT");
    expect(normalizeDemandIntent(" Sale_And_Rent ")).toBe("SALE_AND_RENT");
    expect(normalizeDemandIntent("service")).toBe("SERVICE_REQUEST");
  });

  it("collapses the legacy WANTED listing-type label onto the buy intent", () => {
    // The pre-intent wizard stored "WANTED" in BuyRequest.transaction.
    // Those rows must keep matching SALE + AUCTION supply (buy intent),
    // not be dropped or misrouted to rent/service candidates.
    expect(normalizeDemandIntent("WANTED")).toBe("SALE");
    expect(normalizeDemandIntent("QUOTE")).toBe("SALE");
  });

  it("defaults null / empty / unknown onto the buy intent (safest surface)", () => {
    expect(normalizeDemandIntent(null)).toBe("SALE");
    expect(normalizeDemandIntent(undefined)).toBe("SALE");
    expect(normalizeDemandIntent("")).toBe("SALE");
    expect(normalizeDemandIntent("GARBAGE")).toBe("SALE");
    expect(normalizeDemandIntent("BUY")).toBe("SALE");
  });

  it("maps each intent to the supply types that can satisfy it", () => {
    // Buy demand matches sale + auction (auctions are a sale mechanism).
    expect(compatibleSupplyTypesForTransaction("SALE")).toEqual(["SALE", "AUCTION"]);
    // Rent demand matches rent supply only — never sale or auction.
    expect(compatibleSupplyTypesForTransaction("RENT")).toEqual(["RENT"]);
    // Flexible demand matches sale, rent, and auction.
    expect(compatibleSupplyTypesForTransaction("SALE_AND_RENT")).toEqual([
      "SALE",
      "RENT",
      "AUCTION",
    ]);
    // Service demand matches service offers only.
    expect(compatibleSupplyTypesForTransaction("SERVICE_REQUEST")).toEqual([
      "SERVICE_OFFER",
    ]);
  });

  it("never lets a rent-demand match a sale-supply (the core defect it fixes)", () => {
    const rentCandidates = compatibleSupplyTypesForTransaction("RENT");
    expect(rentCandidates).not.toContain("SALE");
    expect(rentCandidates).not.toContain("AUCTION");
    const saleCandidates = compatibleSupplyTypesForTransaction("SALE");
    expect(saleCandidates).not.toContain("RENT");
  });

  it("treats the legacy WANTED transaction as buy-demand for matching", () => {
    // Legacy rows stored "WANTED"; matching must still surface SALE + AUCTION.
    expect(compatibleSupplyTypesForTransaction("WANTED")).toEqual(["SALE", "AUCTION"]);
  });
});

describe("fail-closed demand-intent validation (API boundary)", () => {
  it("exposes a 4-value canonical allowlist", () => {
    expect(DEMAND_INTENTS).toEqual([
      "SALE",
      "RENT",
      "SALE_AND_RENT",
      "SERVICE_REQUEST",
    ]);
  });

  it("accepts the canonical intents (case- and whitespace-insensitive)", () => {
    expect(isValidDemandIntent("SALE")).toBe(true);
    expect(isValidDemandIntent("rent")).toBe(true);
    expect(isValidDemandIntent(" Sale_And_Rent ")).toBe(true);
    expect(isValidDemandIntent("SERVICE_REQUEST")).toBe(true);
  });

  it("rejects garbage, empty, null, and non-string values", () => {
    expect(isValidDemandIntent("GARBAGE")).toBe(false);
    expect(isValidDemandIntent("BUY")).toBe(false);
    expect(isValidDemandIntent("WANTED")).toBe(false); // listing-type label, not an intent
    expect(isValidDemandIntent("")).toBe(false);
    expect(isValidDemandIntent(null)).toBe(false);
    expect(isValidDemandIntent(undefined)).toBe(false);
    expect(isValidDemandIntent(123)).toBe(false);
    expect(isValidDemandIntent({})).toBe(false);
  });

  it("does NOT accept the legacy listing-type labels as valid intents", () => {
    // The fail-closed boundary must distinguish a real intent (SALE)
    // from the listing-type label (WANTED) that legacy callers stored
    // in BuyRequest.transaction. normalizeDemandIntent handles legacy
    // read-back; isValidDemandIntent guards new writes.
    for (const legacy of ["WANTED", "QUOTE", "AUCTION", "SERVICE_OFFER"]) {
      expect(isValidDemandIntent(legacy)).toBe(false);
    }
  });
});
