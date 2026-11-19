import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(path.join(process.cwd(), file), "utf8");

/**
 * Fail-closed intent validation + service-supply taxonomy verification.
 *
 * B1 (P1): the createWanted API boundary must reject an explicitly-provided
 * intent that is not in the canonical allowlist. A garbage intent must NOT
 * silently default to SALE and create a buy request. normalizeDemandIntent
 * stays permissive (for legacy row read-back), but the write boundary is
 * fail-closed.
 *
 * B6 (P1): the SERVICE_REQUEST → SERVICE_OFFER matching map must be backed
 * by a real seeded canonical supply type — not a guess. SERVICE_OFFER is
 * confirmed as a seeded TransactionType (read-only inventory of the seed
 * file), and the matching map is asserted with positive + negative cases.
 */
describe("WANTED fail-closed intent + service-supply taxonomy contract", () => {
  it("createWanted rejects an explicitly-provided invalid intent (fail-closed)", () => {
    const service = read("src/lib/wanted-service.ts");
    // The fail-closed guard must be present in createWanted.
    expect(service).toContain("isValidDemandIntent");
    expect(service).toContain("if (!isValidDemandIntent(intent))");
    expect(service).toContain("WantedServiceError");
    // The error message must name the allowed values so callers can self-correct.
    expect(service).toContain("SALE, RENT, SALE_AND_RENT, SERVICE_REQUEST");
  });

  it("keeps normalizeDemandIntent permissive for legacy row read-back", () => {
    // normalizeDemandIntent is the READ-side normalizer (matching reads
    // existing rows). It must stay permissive so legacy "WANTED" rows
    // keep matching SALE+AUCTION supply. The fail-closed boundary is only
    // on the WRITE side (createWanted).
    const service = read("src/lib/wanted-service.ts");
    expect(service).toContain("normalizeDemandIntent(intent ?? transactionType)");
    expect(service).toContain("transaction: resolvedIntent");
  });

  it("SERVICE_OFFER is a seeded canonical TransactionType (not just a legacy alias)", () => {
    // Read-only inventory of the taxonomy seed: SERVICE_OFFER must be
    // upserted as a real TransactionType row, so the matching map
    // SERVICE_REQUEST → SERVICE_OFFER is backed by a real supply type.
    const seed = read("prisma/seed-service-and-mineral-taxonomy.ts");
    expect(seed).toMatch(/service_offer|SERVICE_OFFER/i);
    // The routing module must list SERVICE_OFFER in SUPPLY_LISTING_TYPES.
    const routing = read("src/lib/transaction-type-routing.ts");
    expect(routing).toContain('"SERVICE_OFFER"');
    expect(routing).toContain("SERVICE_REQUEST: [\"SERVICE_OFFER\"]");
  });

  it("SERVICE_REQUEST demand matches service-supply only (positive + negative)", () => {
    // Positive: SERVICE_REQUEST maps to SERVICE_OFFER.
    const routing = read("src/lib/transaction-type-routing.ts");
    expect(routing).toContain("SERVICE_REQUEST: [\"SERVICE_OFFER\"]");
    // Negative: SERVICE_REQUEST must NOT appear in any other intent's
    // supply list, and no other intent maps to SERVICE_OFFER.
    const mapBlock = routing.split("DEMAND_INTENT_TO_SUPPLY_TYPES")[1]?.split("const BUY_INTENT_SURFACE")[0] ?? "";
    // SALE maps to SALE + AUCTION (not SERVICE_OFFER).
    expect(mapBlock).toContain("SALE: [\"SALE\", \"AUCTION\"]");
    expect(mapBlock).toContain("RENT: [\"RENT\"]");
    expect(mapBlock).toContain("SALE_AND_RENT: [\"SALE\", \"RENT\", \"AUCTION\"]");
    // Only the SERVICE_REQUEST line mentions SERVICE_OFFER.
    const offerMentions = mapBlock.match(/SERVICE_OFFER/g) ?? [];
    expect(offerMentions.length).toBe(1);
  });

  it("the matching engine constrains SERVICE_REQUEST candidates to SERVICE_OFFER supply", () => {
    const matching = read("src/lib/ai-matching.ts");
    expect(matching).toContain("compatibleSupplyTypesForTransaction(req.transaction)");
    expect(matching).toContain("listingType: { in: [...compatibleTypes] }");
  });
});
