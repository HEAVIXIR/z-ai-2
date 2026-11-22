-- Preserve seller-entered model text when it is not yet in the canonical ProductModel catalog.
-- Existing listings remain unchanged; modelId continues to reference curated models.
ALTER TABLE "Listing" ADD COLUMN "modelName" TEXT;
