-- HEAVIX first-party geospatial foundation (additive only).
-- No extension installation, data backfill, or external service dependency.
ALTER TABLE "Listing"
  ADD COLUMN "locationLatitude" DOUBLE PRECISION,
  ADD COLUMN "locationLongitude" DOUBLE PRECISION,
  ADD COLUMN "locationAccuracyMeters" DOUBLE PRECISION,
  ADD COLUMN "locationUpdatedAt" TIMESTAMP(3);

ALTER TABLE "BuyRequest"
  ADD COLUMN "countryId" TEXT,
  ADD COLUMN "provinceId" TEXT,
  ADD COLUMN "cityId" TEXT,
  ADD COLUMN "locationLatitude" DOUBLE PRECISION,
  ADD COLUMN "locationLongitude" DOUBLE PRECISION,
  ADD COLUMN "locationAccuracyMeters" DOUBLE PRECISION,
  ADD COLUMN "locationUpdatedAt" TIMESTAMP(3);

ALTER TABLE "BuyRequest"
  ADD CONSTRAINT "BuyRequest_countryId_fkey"
    FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "BuyRequest_provinceId_fkey"
    FOREIGN KEY ("provinceId") REFERENCES "Province"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "BuyRequest_cityId_fkey"
    FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "GeoZone" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "boundaryGeoJson" TEXT NOT NULL,
  "centerLatitude" DOUBLE PRECISION,
  "centerLongitude" DOUBLE PRECISION,
  "countryId" TEXT,
  "provinceId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GeoZone_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GeoZone_countryId_fkey"
    FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "GeoZone_provinceId_fkey"
    FOREIGN KEY ("provinceId") REFERENCES "Province"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GeoZone_slug_key" ON "GeoZone"("slug");
CREATE INDEX "GeoZone_level_isActive_idx" ON "GeoZone"("level", "isActive");
CREATE INDEX "GeoZone_countryId_isActive_idx" ON "GeoZone"("countryId", "isActive");
CREATE INDEX "GeoZone_provinceId_isActive_idx" ON "GeoZone"("provinceId", "isActive");
CREATE INDEX "Listing_countryId_provinceId_cityId_idx" ON "Listing"("countryId", "provinceId", "cityId");
CREATE INDEX "Listing_locationLatitude_locationLongitude_idx" ON "Listing"("locationLatitude", "locationLongitude");
CREATE INDEX "BuyRequest_countryId_provinceId_cityId_idx" ON "BuyRequest"("countryId", "provinceId", "cityId");
CREATE INDEX "BuyRequest_locationLatitude_locationLongitude_idx" ON "BuyRequest"("locationLatitude", "locationLongitude");
