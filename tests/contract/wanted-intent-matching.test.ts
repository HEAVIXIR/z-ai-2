import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(path.join(process.cwd(), file), "utf8");

/**
 * Intent-aware matching contract.
 *
 * The matching engine must constrain its supply candidate pool to the
 * listing types that can actually satisfy the demand request's intent —
 * a rent-demand must never be matched against a sale-supply (and vice
 * versa). This locks that behavior in so a future refactor cannot
 * silently widen the candidate query back to "all supply types".
 */
describe("WANTED demand-intent matching contract", () => {
  const matching = read("src/lib/ai-matching.ts");
  const routing = read("src/lib/transaction-type-routing.ts");
  const service = read("src/lib/wanted-service.ts");

  it("defines a demand-intent → compatible-supply-types map in routing", () => {
    expect(routing).toContain("DEMAND_INTENT_TO_SUPPLY_TYPES");
    expect(routing).toContain("normalizeDemandIntent");
    expect(routing).toContain("compatibleSupplyTypesForTransaction");
  });

  it("buys match sale + auction only, rents match rent only", () => {
    expect(routing).toContain("SALE: [\"SALE\", \"AUCTION\"]");
    expect(routing).toContain("RENT: [\"RENT\"]");
    expect(routing).toContain("SERVICE_REQUEST: [\"SERVICE_OFFER\"]");
  });

  it("matching reads the request's transaction and filters by compatible types", () => {
    // The candidate query must be driven by the request's intent, not a
    // blanket "all supply types" filter.
    expect(matching).toContain("transaction: true");
    expect(matching).toContain("compatibleSupplyTypesForTransaction(req.transaction)");
    expect(matching).toContain("listingType: { in: [...compatibleTypes] }");
  });

  it("matching no longer uses a blanket SUPPLY_LISTING_TYPES candidate filter", () => {
    // The old behavior loaded every supply listing regardless of intent.
    // The candidate query must now be intent-scoped.
    expect(matching).not.toContain(
      "listingType: { in: [...SUPPLY_LISTING_TYPES] }",
    );
  });

  it("createWanted stores the normalized demand intent in BuyRequest.transaction", () => {
    expect(service).toContain("intent");
    expect(service).toContain("normalizeDemandIntent(intent ?? transactionType)");
    expect(service).toContain("transaction: resolvedIntent");
  });
});
