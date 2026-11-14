-- Model-specific technical specification overrides.
-- This migration is additive and must only be applied to the verified Preview DB
-- after its branch/connection target has been independently confirmed.

CREATE TABLE "ProductModelAttribute" (
  "id" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "attributeId" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "filterable" BOOLEAN NOT NULL DEFAULT false,
  "searchable" BOOLEAN NOT NULL DEFAULT false,
  "sortable" BOOLEAN NOT NULL DEFAULT false,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductModelAttribute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductModelAttribute_modelId_categoryId_attributeId_key"
  ON "ProductModelAttribute"("modelId", "categoryId", "attributeId");

CREATE INDEX "ProductModelAttribute_modelId_categoryId_idx"
  ON "ProductModelAttribute"("modelId", "categoryId");

CREATE INDEX "ProductModelAttribute_attributeId_idx"
  ON "ProductModelAttribute"("attributeId");

ALTER TABLE "ProductModelAttribute"
  ADD CONSTRAINT "ProductModelAttribute_modelId_fkey"
  FOREIGN KEY ("modelId") REFERENCES "ProductModel"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductModelAttribute"
  ADD CONSTRAINT "ProductModelAttribute_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductModelAttribute"
  ADD CONSTRAINT "ProductModelAttribute_attributeId_fkey"
  FOREIGN KEY ("attributeId") REFERENCES "AttributeDefinition"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
