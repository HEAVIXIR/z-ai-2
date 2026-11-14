import { describe, expect, it } from "vitest";
import {
  categoryLayerForTransactionType,
  isMarketplaceTransactionType,
  isRequestTransactionType,
  isServiceTransactionType,
  requiresListingImage,
  requiresListingPrice,
} from "@/lib/transaction-type-routing";

describe("HEAVIX V1.1 transaction routing", () => {
  it.each([
    ["SALE", "CATALOG"],
    ["RENT", "MARKETPLACE"],
    ["WANTED", "MARKETPLACE"],
    ["QUOTE", "MARKETPLACE"],
    ["AUCTION", "MARKETPLACE"],
    ["SERVICE_REQUEST", "SERVICE"],
    ["SERVICE_OFFER", "SERVICE"],
  ] as const)("routes %s to %s", (key, layer) => {
    expect(categoryLayerForTransactionType(key)).toBe(layer);
  });

  it("routes marketplace and service flows from the same canonical mapping", () => {
    expect(isMarketplaceTransactionType("WANTED")).toBe(true);
    expect(isMarketplaceTransactionType("SALE")).toBe(false);
    expect(isServiceTransactionType("SERVICE_REQUEST")).toBe(true);
    expect(isRequestTransactionType("QUOTE")).toBe(true);
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
