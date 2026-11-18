import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("Listing transaction-specific domain persistence", () => {
  const api = read("src/app/api/listings/route.ts");
  const wizard = read("src/app/listings/new/page.tsx");

  it("requires an active ServiceType for service transactions and persists its FK", () => {
    expect(api).toContain('["SERVICE_REQUEST", "SERVICE_OFFER"].includes(transactionType.key)');
    expect(api).toContain("db.serviceType.findFirst");
    expect(api).toContain("serviceTypeId: selectedServiceType?.id ?? null");
    expect(wizard).toContain("serviceTypes.map");
    expect(wizard).toContain("serviceTypeId: isServiceFlow ? serviceTypeId : undefined");
  });

  it("validates and atomically creates the required Auction record", () => {
    expect(api).toContain("transactionType.key === \"AUCTION\"");
    expect(api).toContain("startPrice === null || startPrice <= 0n");
    expect(api).toContain("endDate <= startDate");
    expect(api).toContain("auctions: { create: auctionData }");
    expect(wizard).toContain("body.auction =");
    expect(wizard).toContain("type=\"datetime-local\"");
  });

  it("validates and atomically links a QUOTE RFQ to its Listing", () => {
    expect(api).toContain("transactionType.key === \"QUOTE\"");
    expect(api).toContain("buyerPhone: buyer.mobile");
    expect(api).toContain("rfq: { create: rfqData }");
    expect(api).toContain("action: \"marketplace.rfq.create\"");
    expect(wizard).toContain("body.rfq =");
    expect(wizard).toContain("quantity: Number(rfq.quantity)");
  });


  it("does not expose auctions whose parent Listing is still pending moderation", () => {
    const publicList = read("src/app/api/auctions/route.ts");
    const publicDetail = read("src/app/api/auctions/[id]/route.ts");
    expect(publicList).toContain('listing: { status: "PUBLISHED" }');
    expect(publicDetail).toContain('where: { id, listing: { status: "PUBLISHED" } }');
  });

  it("does not collapse WANTED into the RFQ domain", () => {
    expect(api).toContain("transactionType.key === \"QUOTE\"");
    expect(api).not.toContain("transactionType.key === \"WANTED\"");
    expect(read("src/lib/wanted-service.ts")).toContain("BuyRequest");
  });
});
