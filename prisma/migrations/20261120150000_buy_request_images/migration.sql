-- Durable relational image associations for HEAVIX Wanted requests.
-- Staged B2 assets remain private until the application attaches their sidecars.
-- The row is committed atomically with BuyRequest creation; assetId uniqueness
-- prevents a staged upload from being associated with multiple requests.
CREATE TABLE "BuyRequestImage" (
  "id" TEXT NOT NULL,
  "buyRequestId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "alt" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BuyRequestImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BuyRequestImage_assetId_key"
  ON "BuyRequestImage"("assetId");
CREATE UNIQUE INDEX "BuyRequestImage_buyRequestId_sortOrder_key"
  ON "BuyRequestImage"("buyRequestId", "sortOrder");
CREATE INDEX "BuyRequestImage_buyRequestId_idx"
  ON "BuyRequestImage"("buyRequestId");

ALTER TABLE "BuyRequestImage"
  ADD CONSTRAINT "BuyRequestImage_buyRequestId_fkey"
  FOREIGN KEY ("buyRequestId") REFERENCES "BuyRequest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
