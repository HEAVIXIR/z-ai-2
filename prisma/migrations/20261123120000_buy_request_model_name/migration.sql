-- Additive and nullable: existing BuyRequest rows remain valid.
-- User-entered model text is independent of the ProductModel catalog.
ALTER TABLE "BuyRequest" ADD COLUMN "modelName" TEXT;
