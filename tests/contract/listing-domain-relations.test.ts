import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("Listing domain relations", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20261118152000_link_listing_service_rfq/migration.sql");

  it("links service listings to the canonical ServiceType while keeping the FK nullable", () => {
    expect(schema).toContain("listings    Listing[]");
    expect(schema).toContain("serviceTypeId     String?");
    expect(schema).toContain("serviceType        ServiceType? @relation(fields: [serviceTypeId], references: [id], onDelete: SetNull)");
    expect(migration).toContain('ADD COLUMN "serviceTypeId" TEXT');
    expect(migration).toContain("ON DELETE SET NULL ON UPDATE CASCADE");
  });

  it("links one RFQ to at most one Listing and preserves standalone RFQs", () => {
    expect(schema).toContain("rfq                RFQ?");
    expect(schema).toContain("listingId   String?  @unique");
    expect(schema).toContain("listing     Listing? @relation(fields: [listingId], references: [id], onDelete: SetNull)");
    expect(migration).toContain('ADD COLUMN "listingId" TEXT');
    expect(migration).toContain('CREATE UNIQUE INDEX "RFQ_listingId_key"');
  });

  it("reuses the existing Listing-to-Auction relation without duplicating schema", () => {
    expect(schema).toContain("auctions     Auction[]");
    expect(schema).toContain("listingId     String");
    expect(schema).toContain("listing       Listing   @relation(fields: [listingId], references: [id], onDelete: Cascade)");
    expect(migration).not.toMatch(/ALTER TABLE "Auction"|CREATE TABLE "Auction"/);
  });

  it("contains no backfill, destructive DDL or data writes", () => {
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN|DELETE FROM|UPDATE\s+"(Listing|RFQ)"/i);
  });
});
