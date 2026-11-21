-- Additive only: stable source identifiers for first-party province/city catalogs.
-- Existing rows remain valid with NULL sourceCode until a reviewed seed is approved.
ALTER TABLE "Province" ADD COLUMN "sourceCode" TEXT;
ALTER TABLE "City" ADD COLUMN "sourceCode" TEXT;

CREATE UNIQUE INDEX "Province_sourceCode_key" ON "Province"("sourceCode");
CREATE UNIQUE INDEX "City_sourceCode_key" ON "City"("sourceCode");
