-- Transactional outbox rows commit atomically with Store mutations.
CREATE TABLE "AuditOutbox" (
    "id" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuditOutbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditOutbox_status_idx" ON "AuditOutbox"("status");
CREATE INDEX "AuditOutbox_createdAt_idx" ON "AuditOutbox"("createdAt");
CREATE INDEX "AuditOutbox_status_lockedAt_idx" ON "AuditOutbox"("status", "lockedAt");
