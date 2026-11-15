-- Record who submitted a purchase order so approval can enforce separation of duties.
-- Nullable for compatibility with purchase orders created before this migration.
ALTER TABLE "PurchaseOrder"
ADD COLUMN "submittedBy" TEXT;
