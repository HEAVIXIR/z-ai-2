-- HEAVIX Company Invitation Lifecycle V1 — additive only.
-- Invitations are separate from CompanyMembership until a verified user accepts.
-- No existing rows are updated or deleted.

CREATE TABLE "CompanyInvitation" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "emailNormalized" TEXT NOT NULL,
  "roleKey" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "activeKey" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "invitedById" TEXT,
  "acceptedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyInvitation_tokenHash_key"
  ON "CompanyInvitation"("tokenHash");
CREATE UNIQUE INDEX "CompanyInvitation_activeKey_key"
  ON "CompanyInvitation"("activeKey");
CREATE INDEX "CompanyInvitation_companyId_status_expiresAt_idx"
  ON "CompanyInvitation"("companyId", "status", "expiresAt");
CREATE INDEX "CompanyInvitation_emailNormalized_status_idx"
  ON "CompanyInvitation"("emailNormalized", "status");
CREATE INDEX "CompanyInvitation_invitedById_idx"
  ON "CompanyInvitation"("invitedById");
CREATE INDEX "CompanyInvitation_acceptedById_idx"
  ON "CompanyInvitation"("acceptedById");

ALTER TABLE "CompanyInvitation"
  ADD CONSTRAINT "CompanyInvitation_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyInvitation"
  ADD CONSTRAINT "CompanyInvitation_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyInvitation"
  ADD CONSTRAINT "CompanyInvitation_acceptedById_fkey"
  FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
