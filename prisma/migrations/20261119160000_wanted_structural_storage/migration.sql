-- H.3: WANTED structural specification storage (Issue #345).
--
-- This migration is INDEPENDENT of PR #347's migration
-- (20261118152000_link_listing_service_rfq). It MUST be applied via its OWN
-- guarded workflow (.github/workflows/app-preview-wanted-structural-migration.yml)
-- which asserts exactly 7 applied migrations pre-apply (i.e. #347's migration
-- has already run) and exactly 8 post-apply.
--
-- All new columns are nullable; existing rows are unaffected. The parent/child
-- attribute design (BuyRequestAttributeValue + BuyRequestAttributeOption)
-- avoids the partial-index / ON DELETE SET NULL collision flaw identified in
-- the H.2-rev2 senior-manager audit.

-- ── BuyRequest structured-spec columns ──
ALTER TABLE "BuyRequest" ADD COLUMN "quantity"      INTEGER;
ALTER TABLE "BuyRequest" ADD COLUMN "categoryId"    TEXT;
ALTER TABLE "BuyRequest" ADD COLUMN "brandId"       TEXT;
ALTER TABLE "BuyRequest" ADD COLUMN "modelId"       TEXT;
ALTER TABLE "BuyRequest" ADD COLUMN "serviceTypeId" TEXT;
ALTER TABLE "BuyRequest" ADD COLUMN "intent"        TEXT;
ALTER TABLE "BuyRequest" ADD COLUMN "idempotencyKey" TEXT;

-- Foreign keys (SetNull → taxonomy deletion nulls the FK; the request survives
-- with its free-text category/brandPref display name).
ALTER TABLE "BuyRequest"
  ADD CONSTRAINT "BuyRequest_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BuyRequest"
  ADD CONSTRAINT "BuyRequest_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BuyRequest"
  ADD CONSTRAINT "BuyRequest_modelId_fkey"
  FOREIGN KEY ("modelId") REFERENCES "ProductModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BuyRequest"
  ADD CONSTRAINT "BuyRequest_serviceTypeId_fkey"
  FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DB-enforced idempotency (closes the concurrent double-submit gap).
CREATE UNIQUE INDEX "BuyRequest_userId_idempotencyKey_key" ON "BuyRequest"("userId", "idempotencyKey");

-- Supporting indexes for structured search/filter/matching.
CREATE INDEX "BuyRequest_categoryId_idx"      ON "BuyRequest"("categoryId");
CREATE INDEX "BuyRequest_brandId_idx"         ON "BuyRequest"("brandId");
CREATE INDEX "BuyRequest_modelId_idx"         ON "BuyRequest"("modelId");
CREATE INDEX "BuyRequest_status_expiresAt_idx" ON "BuyRequest"("status", "expiresAt");
CREATE INDEX "BuyRequest_userId_status_idx"   ON "BuyRequest"("userId", "status");
CREATE INDEX "BuyRequest_intent_idx"          ON "BuyRequest"("intent");

-- ── Parent attribute-value table (one row per request + attribute) ──
CREATE TABLE "BuyRequestAttributeValue" (
  "id"              TEXT NOT NULL,
  "buyRequestId"    TEXT NOT NULL,
  "attributeId"     TEXT NOT NULL,
  "optionId"        TEXT,
  "textValue"       TEXT,
  "numberValue"     DOUBLE PRECISION,
  "booleanValue"    BOOLEAN,
  "dateValue"       TIMESTAMP(3),
  "unit"            TEXT,
  "sourceType"      TEXT,
  "confidence"      DOUBLE PRECISION,
  "sourceReference" TEXT,
  "verifiedAt"      TIMESTAMP(3),
  "verifiedBy"      TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BuyRequestAttributeValue_pkey" PRIMARY KEY ("id")
);

-- One parent row per (request, attribute). SELECT uses optionId; MULTI_SELECT
-- uses the child table, so there is no partial-index incompatibility.
CREATE UNIQUE INDEX "BuyRequestAttributeValue_buyRequestId_attributeId_key"
  ON "BuyRequestAttributeValue"("buyRequestId", "attributeId");
CREATE INDEX "BuyRequestAttributeValue_buyRequestId_idx"
  ON "BuyRequestAttributeValue"("buyRequestId");
CREATE INDEX "BuyRequestAttributeValue_attributeId_idx"
  ON "BuyRequestAttributeValue"("attributeId");

ALTER TABLE "BuyRequestAttributeValue"
  ADD CONSTRAINT "BuyRequestAttributeValue_buyRequestId_fkey"
  FOREIGN KEY ("buyRequestId") REFERENCES "BuyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuyRequestAttributeValue"
  ADD CONSTRAINT "BuyRequestAttributeValue_attributeId_fkey"
  FOREIGN KEY ("attributeId") REFERENCES "AttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuyRequestAttributeValue"
  ADD CONSTRAINT "BuyRequestAttributeValue_optionId_fkey"
  FOREIGN KEY ("optionId") REFERENCES "AttributeOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Child option-selection table (one row per selected option for MULTI_SELECT) ──
CREATE TABLE "BuyRequestAttributeOption" (
  "id"               TEXT NOT NULL,
  "attributeValueId" TEXT NOT NULL,
  "optionId"         TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BuyRequestAttributeOption_pkey" PRIMARY KEY ("id")
);

-- One child row per (parent value, option). Cascade on both: deleting the
-- parent value removes its selections; deleting the option removes the
-- selection (the parent survives, reflecting "no longer selected").
CREATE UNIQUE INDEX "BuyRequestAttributeOption_attributeValueId_optionId_key"
  ON "BuyRequestAttributeOption"("attributeValueId", "optionId");
CREATE INDEX "BuyRequestAttributeOption_attributeValueId_idx"
  ON "BuyRequestAttributeOption"("attributeValueId");
CREATE INDEX "BuyRequestAttributeOption_optionId_idx"
  ON "BuyRequestAttributeOption"("optionId");

ALTER TABLE "BuyRequestAttributeOption"
  ADD CONSTRAINT "BuyRequestAttributeOption_attributeValueId_fkey"
  FOREIGN KEY ("attributeValueId") REFERENCES "BuyRequestAttributeValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuyRequestAttributeOption"
  ADD CONSTRAINT "BuyRequestAttributeOption_optionId_fkey"
  FOREIGN KEY ("optionId") REFERENCES "AttributeOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
