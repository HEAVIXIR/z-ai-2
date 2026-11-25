-- HEAVIX listing domain relations — additive PostgreSQL migration.
-- Owner-approved preparation on Integration only.
-- Existing Listing and RFQ rows remain valid: both new foreign keys are nullable.
-- No backfill, seed, delete, or existing-row mutation is performed.

ALTER TABLE "Listing"
  ADD COLUMN "serviceTypeId" TEXT;

ALTER TABLE "RFQ"
  ADD COLUMN "listingId" TEXT;

CREATE INDEX "Listing_serviceTypeId_idx"
  ON "Listing"("serviceTypeId");

CREATE UNIQUE INDEX "RFQ_listingId_key"
  ON "RFQ"("listingId");

ALTER TABLE "Listing"
  ADD CONSTRAINT "Listing_serviceTypeId_fkey"
  FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RFQ"
  ADD CONSTRAINT "RFQ_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
