-- Additive and nullable: existing listings remain valid.
-- Sellers can type a model name even when no canonical ProductModel exists.
ALTER TABLE "Listing" ADD COLUMN "modelName" TEXT;
