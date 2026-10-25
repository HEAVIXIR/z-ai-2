-- Add the idempotency key used by cross-database Store AuditOutbox delivery.
ALTER TABLE "AuditLog" ADD COLUMN "idempotencyKey" TEXT;

-- Nullable keys preserve legacy audit writers; non-null delivery keys are unique.
CREATE UNIQUE INDEX "AuditLog_idempotencyKey_key" ON "AuditLog"("idempotencyKey");
